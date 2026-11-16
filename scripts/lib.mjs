// Shared by the checker, the index builder and the unpacker. It reads an
// archive the way Apex does and holds the rules Apex applies when someone
// installs one (docs/packs.md and docs/apps.md in the Apex repository), so a
// pack that passes here installs there.
import { createHash, createPublicKey, verify } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { unzipSync } from 'fflate'

/** Where archives in this repository are served from. */
export const BASE = 'https://raw.githubusercontent.com/3SENN/apex-packs/main/packs/'

/** The three faces of one format: the bytes are the same signed zip, the extension picks the icon and the review. */
export const EXTENSIONS = { pack: '.apexpack', app: '.apexapp', world: '.apexworld' }
export const ARCHIVE = /\.(apexpack|apexapp|apexworld)$/
export const CATEGORIES = ['games', 'tools', 'worlds', 'creative', 'learning', 'productivity', 'companions', 'other']

const MiB = 1024 * 1024
export const LIMITS = {
  /** A pack without an app or asset set. */
  pack: { files: 200, fileBytes: 2 * MiB, packBytes: 10 * MiB },
  /** A pack with an app or an asset set. */
  big: { files: 5_000, fileBytes: 50 * MiB, packBytes: 300 * MiB },
  /** Scripts, pages and SVG outside a bundled app's folder: the review always shows all of it. */
  codeBytes: MiB,
  minifiedLine: 2_000,
  manifestBytes: 64 * 1024,
  /** Bigger archives are hosted elsewhere (a release asset) and listed by address and hash. */
  inRepoBytes: 20 * MiB,
  imageBytes: 4 * MiB,
  index: { bytes: 2 * MiB, entries: 2_000, name: 80, description: 500, author: 80, reason: 300 },
}

export const ID = /^[a-z0-9][a-z0-9-]{1,31}$/
export const VERSION = /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/
export const COLOR = /^#[0-9a-f]{6}$/i
export const FINGERPRINT = /^[0-9a-f]{64}$/
export const SIGNATURE_FILE = '__apex/signature.json'
/** What Share… adds beside the signed files: a note and a picture, never part of the hash. */
const SHARE_FILES = new Set(['__apex/share.json', '__apex/share.png'])
/** Where the unpacker lists a bundled app's built files instead of copying them. */
export const BUILT_FILE = '__apex/built.txt'

export const sha256 = (data) => createHash('sha256').update(data).digest('hex')

// ---- paths ----

const SEGMENT = /^[A-Za-z0-9._-]{1,100}$/
/** Inside an app's folder, files may be named the way games and build tools name them. */
const ASSET_SEGMENT = /^[A-Za-z0-9._\-+=,!@&'()[\]~ ]{1,120}$/
const WINDOWS_DEVICE = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i

export function isPackPath(p) {
  if (typeof p !== 'string' || !p || p.length > 300) return false
  const parts = p.split('/')
  return parts[0] !== '__apex' && parts.every((s) => SEGMENT.test(s) && !/^\.+$/.test(s))
}

function isAssetPath(p) {
  if (typeof p !== 'string' || !p || p.length > 400) return false
  const parts = p.split('/')
  if (parts[0] === '__apex') return false
  return parts.every((s) => ASSET_SEGMENT.test(s) && !/^\.+$/.test(s) && s.trim() === s && !s.endsWith('.') && !WINDOWS_DEVICE.test(s))
}

/** Whether a file may be at this path: a manifest-style path, or an asset path inside one of these folders. */
export function isPackFilePath(p, roots = []) {
  return isPackPath(p) || (roots.some((r) => p.startsWith(`${r}/`)) && isAssetPath(p))
}

const under = (p, roots) => roots.some((r) => p.startsWith(`${r}/`))

// ---- the manifest ----

const list = (v) => (Array.isArray(v) ? v : [])
const appsOf = (m) => list(m?.contributes?.apps)
const rootOf = (a) => (typeof a?.root === 'string' ? a.root : 'app')

/** The folders whose files may use asset names: every app's root and every asset set's root. */
export function assetRoots(m) {
  return [...appsOf(m).map(rootOf), ...list(m?.contributes?.assets).flatMap((a) => (typeof a?.root === 'string' ? [a.root] : []))]
}

/** The folders that hold a build tool's output, which the review can't show line by line. */
export function bundledRoots(m) {
  return appsOf(m).filter((a) => a?.build === 'bundled').map(rootOf)
}

/** Whether the bigger limits apply: the pack holds an app or an asset set. */
export function isBig(m) {
  return appsOf(m).length > 0 || list(m?.contributes?.assets).length > 0
}

/** app, world or pack, worked out the way Apex's own tools work it out. */
export function kindOf(m) {
  const c = m?.contributes ?? {}
  if (appsOf(m).length > 0) return 'app'
  const onlyWorlds = list(c.worlds).length > 0 && Object.keys(c).every((k) => k === 'worlds' || list(c[k]).length === 0)
  return onlyWorlds ? 'world' : 'pack'
}

// ---- archives and folders ----

/** An archive's files (without Apex's own), its manifest and its signature. Throws on what Apex would refuse to open. */
export function readArchive(buffer) {
  const raw = unzipSync(new Uint8Array(buffer))
  const entries = new Map()
  let signature = null
  for (const [name, data] of Object.entries(raw)) {
    if (name.endsWith('/') || SHARE_FILES.has(name)) continue
    if (name === SIGNATURE_FILE) {
      signature = JSON.parse(Buffer.from(data).toString('utf8'))
      continue
    }
    entries.set(name, Buffer.from(data))
  }
  const manifestFile = entries.get('apex-pack.json')
  if (!manifestFile) throw new Error('it has no apex-pack.json at its root')
  if (manifestFile.length > LIMITS.manifestBytes) throw new Error('apex-pack.json is larger than 64 KB')
  const manifest = JSON.parse(manifestFile.toString('utf8'))
  const roots = assetRoots(manifest)
  for (const name of entries.keys()) if (!isPackFilePath(name, roots)) throw new Error(`${name} is not an allowed file path`)
  return { files: entries, manifest, signature }
}

/** A folder's files, as a pack would hold them. */
export function readFolder(root) {
  const files = new Map()
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      if (name === '.DS_Store' || name === 'Thumbs.db' || name === '__MACOSX' || name === '.git') continue
      const full = join(dir, name)
      const st = lstatSync(full)
      if (st.isSymbolicLink()) continue
      if (st.isDirectory()) walk(full)
      else if (st.isFile()) files.set(relative(root, full).split(sep).join('/'), readFileSync(full))
    }
  }
  walk(root)
  return files
}

/** The SHA-256 of each file a pack's sources stand for: the files themselves, and the built files listed in __apex/built.txt. */
export function sourceHashes(root) {
  const files = readFolder(root)
  const hashes = new Map()
  for (const [p, data] of files) if (p !== BUILT_FILE) hashes.set(p, sha256(data))
  const built = join(root, ...BUILT_FILE.split('/'))
  if (existsSync(built)) {
    for (const line of readFileSync(built, 'utf8').split('\n')) {
      const m = /^([0-9a-f]{64}) {2}(.+)$/.exec(line)
      if (m) hashes.set(m[2], m[1])
    }
  }
  return hashes
}

/** The listing the unpacker writes for a bundled app's built files: "sha256  path", sorted by path. */
export function builtListing(files) {
  return [...files.keys()].sort().map((p) => `${sha256(files.get(p))}  ${p}`).join('\n') + '\n'
}

/** The content hash Apex signs: SHA-256 over the sorted "path NUL sha256(file)" lines. */
export function hashOfHashes(hashes) {
  return sha256([...hashes.keys()].sort().map((p) => `${p}\u0000${hashes.get(p)}\n`).join(''))
}

export function packHash(files) {
  return hashOfHashes(new Map([...files].map(([p, d]) => [p, sha256(d)])))
}

// ---- signatures ----

/**
 * The full fingerprint of the key that signed this hash (SHA-256 of its public
 * key, the value Apex pins on first install), or null when the signature is
 * missing, malformed or doesn't match.
 */
export function signerOf(hash, s) {
  if (!s || s.format !== 'apex-pack-signature' || s.version !== 1 || s.hash !== hash) return null
  try {
    const der = Buffer.from(s.publicKey, 'base64')
    const fingerprint = sha256(der)
    if (fingerprint.slice(0, 16) !== s.keyId) return null
    const ok = verify(null, Buffer.from(hash, 'utf8'), createPublicKey({ key: der, format: 'der', type: 'spki' }), Buffer.from(s.signature, 'base64'))
    return ok ? fingerprint : null
  } catch {
    return null
  }
}

// ---- keys that must never ship in a pack (the same list Apex refuses on export) ----

const KEY_PATTERNS = [
  { re: /sk-ant-[A-Za-z0-9_-]{20,}/, what: 'an Anthropic API key' },
  { re: /\bsk-(?:proj|svcacct|admin)-[A-Za-z0-9_-]{20,}/, what: 'an OpenAI API key' },
  { re: /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----(?:\s|\\n|\\r)*[A-Za-z0-9+/=]{64,}/, what: 'a private key' },
  { re: /\bgh[pousr]_[A-Za-z0-9]{30,}/, what: 'a GitHub token' },
  { re: /\bgithub_pat_[A-Za-z0-9_]{30,}/, what: 'a GitHub token' },
  { re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/, what: 'a Slack token' },
  { re: /\bAKIA[0-9A-Z]{16}\b/, what: 'an AWS access key' },
  { re: /\b(?:sk|rk)_live_[0-9A-Za-z]{20,}/, what: 'a Stripe secret key' },
  { re: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/, what: 'a SendGrid key' },
  { re: /\bGOCSPX-[A-Za-z0-9_-]{20,}/, what: 'a Google OAuth client secret' },
]
const ASSIGNED = /["']?(api[_-]?key|access[_-]?token|client[_-]?secret|password|secret)["']?\s*[:=]\s*["']([^"'\s]{16,})["']/gi
const PLACEHOLDER = /^(your|my|xxx|<|\{|\$\{|example|placeholder|changeme|replace|test|dummy|sample)/i
/** Keys made to be public: a Google browser key (Firebase's apiKey, Maps), Stripe's publishable key, a JWT such as Supabase's anon key. */
const PUBLIC_KEY = /^(AIza|pk_(live|test)_|eyJ)/
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.(eyJ[A-Za-z0-9_-]{8,})\.[A-Za-z0-9_-]{8,}/g

function serviceRoleJwt(text) {
  for (const m of text.matchAll(JWT)) {
    try {
      const payload = JSON.parse(Buffer.from(m[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
      if (payload.role === 'service_role') return true
    } catch {
      // Not a JWT after all.
    }
  }
  return false
}

/** What kind of key a text holds, or null. `written` adds the check for keys assigned in hand-written code. */
export function keyIn(text, written) {
  const hit = KEY_PATTERNS.find((k) => k.re.test(text))
  if (hit) return hit.what
  if (text.includes('eyJ') && serviceRoleJwt(text)) return 'a Supabase service key'
  if (written) {
    for (const m of text.matchAll(ASSIGNED)) {
      const value = m[2]
      if (!PLACEHOLDER.test(value) && !PUBLIC_KEY.test(value) && !/^(.)\1+$/.test(value)) return 'what looks like a password or key'
    }
  }
  return null
}

export const isEnvFile = (p) => /(^|\/)\.env(\.[^/]*)?$/i.test(p)
export const isText = (p) => /\.(m?js|cjs|ts|jsx|tsx|json|html?|css|svg|md|txt|xml|ya?ml|csv|toml|ini)$/i.test(p)
export const isCode = (p) => /\.(m?js|html?|svg)$/i.test(p)
export { under }
