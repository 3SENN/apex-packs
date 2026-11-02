// Shared by the checker, the index builder and the unpacker: reading an
// .apexpack the way Apex does (docs/packs.md in the Apex repository), its
// content hash and its signature.
import { createHash, createPublicKey, verify } from 'node:crypto'
import { lstatSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { unzipSync } from 'fflate'

export const LIMITS = { files: 200, fileBytes: 2 * 1024 * 1024, packBytes: 10 * 1024 * 1024, codeBytes: 1024 * 1024, minifiedLine: 2000 }
export const ID = /^[a-z0-9][a-z0-9-]{1,31}$/
export const VERSION = /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/
export const SIGNATURE_FILE = '__apex/signature.json'
const SEGMENT = /^[A-Za-z0-9._-]{1,100}$/
const IGNORED = new Set(['.DS_Store', 'Thumbs.db', '__MACOSX', '.git'])

export const sha256 = (data) => createHash('sha256').update(data).digest('hex')

export function isPackPath(p) {
  if (typeof p !== 'string' || !p || p.length > 300) return false
  const parts = p.split('/')
  return parts[0] !== '__apex' && parts.every((s) => SEGMENT.test(s) && !/^\.+$/.test(s))
}

/** The content hash Apex signs: SHA-256 over the sorted "path NUL sha256(file)" lines. */
export function packHash(files) {
  return sha256([...files.keys()].sort().map((p) => `${p}\u0000${sha256(files.get(p))}\n`).join(''))
}

/** An .apexpack's files (without Apex's own) and its signature. Throws on paths Apex would refuse. */
export function readArchive(buffer) {
  const raw = unzipSync(new Uint8Array(buffer))
  const files = new Map()
  let signature = null
  for (const [name, data] of Object.entries(raw)) {
    if (name.endsWith('/')) continue
    if (name === SIGNATURE_FILE) {
      signature = JSON.parse(Buffer.from(data).toString('utf8'))
      continue
    }
    if (!isPackPath(name)) throw new Error(`${name} is not an allowed file path`)
    files.set(name, Buffer.from(data))
  }
  return { files, signature }
}

/** A source folder's files, as a pack would hold them. */
export function readFolder(root) {
  const files = new Map()
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      if (IGNORED.has(name)) continue
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

/** Whether a signature is a valid Ed25519 signature of this hash by the key it names. */
export function verifySignature(hash, s) {
  if (!s || s.format !== 'apex-pack-signature' || s.version !== 1 || s.hash !== hash) return false
  try {
    const der = Buffer.from(s.publicKey, 'base64')
    if (sha256(der).slice(0, 16) !== s.keyId) return false
    return verify(null, Buffer.from(hash, 'utf8'), createPublicKey({ key: der, format: 'der', type: 'spki' }), Buffer.from(s.signature, 'base64'))
  } catch {
    return false
  }
}
