// Everything `npm run check` verifies, as a function the tests can call.
//
//   - index.json is well formed, one version per pack, with every field Browse
//     shows (kind, shelf, size, colour, picture) in range;
//   - each archive's SHA-256 and size match its entry, and the entry matches
//     the manifest inside;
//   - each archive is signed, and by the key keys.json pins for its id; a pin,
//     once merged, never changes and never goes away;
//   - each archive follows Atelier's file rules: safe paths, size limits, readable
//     code outside a bundled app, no .env files and nothing shaped like a key;
//   - sources/<id>/ holds exactly the archive's files, so reviewers read what
//     people install (a bundled app's build output is listed by hash instead);
//   - apps too big for this repository are downloaded from where they are
//     hosted and checked the same way.
// Atelier runs its own full validation again when someone installs a pack.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  ARCHIVE,
  BASE,
  CATEGORIES,
  COLOR,
  EXTENSIONS,
  FINGERPRINT,
  ID,
  LIMITS,
  VERSION,
  bundledRoots,
  hashOfHashes,
  isBig,
  isCode,
  isEnvFile,
  isText,
  keyIn,
  kindOf,
  packHash,
  readArchive,
  sha256,
  signerOf,
  sourceHashes,
  under,
} from './lib.mjs'

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const MiB = 1024 * 1024
const mb = (n) => `${Math.round(n / MiB)} MB`

/** Downloads an archive hosted elsewhere, refusing anything bigger than an app may be. */
export async function download(url, maxBytes) {
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(180_000) })
  if (!res.ok) throw new Error(`the server answered ${res.status}`)
  if (Number(res.headers.get('content-length') ?? 0) > maxBytes) throw new Error(`it is larger than ${mb(maxBytes)}`)
  const data = Buffer.from(await res.arrayBuffer())
  if (data.length > maxBytes) throw new Error(`it is larger than ${mb(maxBytes)}`)
  return data
}

/**
 * Checks the index in `dir`.
 * - `base`: { keys, index } as they are on the branch this change goes into, or null.
 * - `external`: which archives hosted elsewhere to download: 'changed' (new or
 *   changed since `base`), 'all' or 'none'.
 */
export async function checkIndex({ dir = '.', base = null, external = 'changed', fetchArchive = download, limits = LIMITS } = {}) {
  const problems = []
  const notes = []
  const fail = (where, what) => problems.push(`${where}: ${what}`)
  const json = (file) => {
    try {
      return JSON.parse(readFileSync(join(dir, file), 'utf8'))
    } catch (err) {
      fail(file, `can't be read: ${err.message}`)
      return null
    }
  }

  const index = json('index.json')
  const keys = json('keys.json') ?? {}
  if (!index) return { problems, notes, count: 0 }
  if (readFileSync(join(dir, 'index.json')).length > limits.index.bytes) fail('index.json', `is larger than ${mb(limits.index.bytes)}`)
  if (index.format !== 'atelier-pack-index' || !Array.isArray(index.packs)) fail('index.json', 'needs "format": "atelier-pack-index" and a "packs" list')
  if (typeof index.name !== 'string' || !index.name.trim() || index.name.length > limits.index.name) fail('index.json', `needs a "name" of 1 to ${limits.index.name} characters`)
  const packs = Array.isArray(index.packs) ? index.packs : []
  if (packs.length > limits.index.entries) fail('index.json', `lists more than ${limits.index.entries} packs`)

  // ---- keys.json: full fingerprints, and pins never change ----
  for (const [id, fp] of Object.entries(keys)) {
    if (!ID.test(id)) fail(`keys.json › ${id}`, 'is not a pack id')
    if (typeof fp !== 'string' || !FINGERPRINT.test(fp)) fail(`keys.json › ${id}`, "must be the signing key's full fingerprint: 64 hex characters")
  }
  if (base?.keys) {
    for (const [id, was] of Object.entries(base.keys)) {
      const now = keys[id]
      if (now === undefined) fail(`keys.json › ${id}`, 'was removed. A pin stays for good, even after its pack leaves the index, so the id can never move to another key.')
      else if (now !== was && !(typeof was === 'string' && was.length === 16 && typeof now === 'string' && now.startsWith(was)))
        fail(`keys.json › ${id}`, `changed from ${String(was).slice(0, 16)} to ${String(now).slice(0, 16)}. A pin never changes: Atelier on people's computers refuses updates signed by another key anyway. Publish under a new id instead.`)
    }
  } else {
    notes.push('no earlier keys.json to compare with, so pin changes were not checked')
  }

  // ---- withdrawn ----
  const withdrawn = index.withdrawn ?? []
  if (!Array.isArray(withdrawn)) fail('index.json', '"withdrawn" must be a list')
  else {
    const seen = new Set()
    for (const w of withdrawn) {
      if (!ID.test(w?.id ?? '')) fail('index.json › withdrawn', `${JSON.stringify(w?.id)} is not a pack id`)
      else if (seen.has(w.id)) fail('index.json › withdrawn', `${w.id} is listed twice`)
      else seen.add(w.id)
      if (typeof w?.reason !== 'string' || !w.reason.trim() || w.reason.length > limits.index.reason) fail(`index.json › withdrawn › ${w?.id}`, `needs a reason of 1 to ${limits.index.reason} characters`)
    }
  }

  // ---- entries ----
  const before = new Map((base?.index?.packs ?? []).map((e) => [e?.id, e]))
  const listed = new Set()
  const ids = new Set()
  for (const entry of packs) {
    const where = `index.json › ${entry?.id}`
    if (!entry || typeof entry !== 'object' || !ID.test(entry.id ?? '')) {
      fail('index.json', `${JSON.stringify(entry?.id)} is not a pack id`)
      continue
    }
    if (ids.has(entry.id)) fail(where, 'is listed twice (keep one version per pack)')
    ids.add(entry.id)
    if (!VERSION.test(entry.version ?? '')) fail(where, 'version is not major.minor.patch')
    if (typeof entry.name !== 'string' || !entry.name.trim() || entry.name.length > limits.index.name) fail(where, `name must be 1 to ${limits.index.name} characters`)
    if (entry.description !== undefined && (typeof entry.description !== 'string' || entry.description.length > limits.index.description)) fail(where, `description must be at most ${limits.index.description} characters`)
    if (entry.author !== undefined && (typeof entry.author !== 'string' || entry.author.length > limits.index.author)) fail(where, `author must be at most ${limits.index.author} characters`)
    if (!EXTENSIONS[entry.kind]) fail(where, 'kind must be pack, app or world (run npm run index)')
    if (!CATEGORIES.includes(entry.category)) fail(where, `category must be one of ${CATEGORIES.join(', ')}: the shelf Browse puts it on`)
    if (entry.color !== undefined && !COLOR.test(entry.color ?? '')) fail(where, 'color must be #rrggbb')
    if (!/^[0-9a-f]{64}$/.test(entry.sha256 ?? '')) fail(where, 'sha256 must be 64 hex characters (run npm run index)')
    if (!Number.isInteger(entry.size) || entry.size <= 0) fail(where, "size must be the archive's size in bytes (run npm run index)")

    const file = `${entry.id}-${entry.version}${EXTENSIONS[entry.kind] ?? '.atelierpack'}`
    const inRepo = typeof entry.url === 'string' && entry.url.startsWith(BASE)
    let data
    if (inRepo) {
      if (entry.url !== BASE + encodeURIComponent(file)) fail(where, `url must be ${BASE + file}`)
      if (!existsSync(join(dir, 'packs', file))) {
        fail(where, `packs/${file} is missing`)
        continue
      }
      listed.add(file)
      data = readFileSync(join(dir, 'packs', file))
      if (data.length > limits.inRepoBytes) fail(where, `packs/${file} is larger than ${mb(limits.inRepoBytes)}. Host it as a release asset and list its address instead (see the README).`)
    } else {
      if (typeof entry.url !== 'string' || !entry.url.startsWith('https://')) {
        fail(where, 'url must be an https address')
        continue
      }
      if (entry.kind !== 'app') fail(where, 'only apps are hosted outside this repository; put the file in packs/')
      const was = before.get(entry.id)
      const changed = !was || was.url !== entry.url || was.sha256 !== entry.sha256
      if (external === 'none' || (external === 'changed' && !changed)) {
        notes.push(`${entry.id}: hosted at ${entry.url}; not downloaded this time (${external === 'none' ? 'downloads are off' : 'unchanged'})`)
        if (!existsSync(join(dir, 'sources', entry.id))) fail(where, `sources/${entry.id}/ is missing`)
        continue
      }
      try {
        data = await fetchArchive(entry.url, limits.big.packBytes + MiB)
      } catch (err) {
        fail(where, `couldn't be downloaded from ${entry.url}: ${err.message}`)
        continue
      }
    }
    if (entry.sha256 !== sha256(data)) fail(where, 'sha256 does not match the archive (run npm run index)')
    if (entry.size !== data.length) fail(where, 'size does not match the archive (run npm run index)')
    if (entry.image !== undefined) checkImage(where, entry, inRepo)
    checkArchive(where, entry, data)
  }

  for (const f of readdirSync(join(dir, 'packs'))) {
    if (ARCHIVE.test(f)) {
      if (!listed.has(f)) fail(`packs/${f}`, 'is not in index.json (run npm run index)')
    } else if (f.endsWith('.png')) {
      const owner = packs.find((e) => e?.image === BASE + encodeURIComponent(f))
      if (!owner) fail(`packs/${f}`, "is not a listed pack's picture (name it like the archive: <id>-<version>.png)")
    } else if (f !== '.gitkeep') {
      fail(`packs/${f}`, 'is neither an archive nor a picture')
    }
  }
  if (existsSync(join(dir, 'sources'))) for (const d of readdirSync(join(dir, 'sources'))) if (!ids.has(d)) fail(`sources/${d}`, 'has no pack in index.json')
  return { problems, notes, count: ids.size }

  function checkImage(where, entry, inRepo) {
    if (typeof entry.image !== 'string') return fail(where, 'image must be an https address')
    if (!inRepo) {
      if (!entry.image.startsWith('https://')) fail(where, 'image must be an https address')
      return
    }
    const picture = `${entry.id}-${entry.version}.png`
    if (entry.image !== BASE + encodeURIComponent(picture)) return fail(where, `image must be ${BASE + picture} (run npm run index)`)
    const path = join(dir, 'packs', picture)
    if (!existsSync(path)) return fail(where, `packs/${picture} is missing`)
    const data = readFileSync(path)
    if (data.length > limits.imageBytes) fail(where, `packs/${picture} is larger than ${mb(limits.imageBytes)}`)
    if (!data.subarray(0, 8).equals(PNG)) fail(where, `packs/${picture} is not a PNG`)
  }

  function checkArchive(where, entry, data) {
    let archive
    try {
      archive = readArchive(data)
    } catch (err) {
      return fail(where, `can't be opened: ${err.message}`)
    }
    const { files, manifest: m, signature } = archive
    if (m?.format !== 'atelier-pack') return fail(where, 'atelier-pack.json is not an Atelier pack manifest')
    if (m.id !== entry.id || m.version !== entry.version) fail(where, `the manifest says ${m.id} ${m.version}`)
    if (m.name !== entry.name || (m.description ?? '') !== (entry.description ?? '')) fail(where, 'name or description differs from the manifest (run npm run index)')
    if ((m.author?.name ?? undefined) !== entry.author) fail(where, 'author differs from the manifest (run npm run index)')
    const kind = kindOf(m)
    if (kind !== entry.kind) fail(where, `holds ${kind === 'app' ? 'an app' : kind === 'world' ? 'only worlds' : 'neither an app nor only worlds'}, so it is a ${kind}: name the file ${entry.id}-${entry.version}${EXTENSIONS[kind]} and run npm run index`)

    const signer = signerOf(packHash(files), signature)
    if (!signer) fail(where, 'is not signed, or its signature does not match its files')
    else if (!keys[entry.id]) fail(where, `keys.json has no pin for it: add "${entry.id}": "${signer}" for a maintainer to approve`)
    else if (keys[entry.id] !== signer) fail(where, `is signed by ${signer.slice(0, 16)}, but keys.json pins ${String(keys[entry.id]).slice(0, 16)} for ${entry.id}`)

    const lim = isBig(m) ? limits.big : limits.pack
    const bundled = bundledRoots(m)
    if (bundled.length > 0 && !/^https:\/\/\S+$/.test(m.homepage ?? '')) fail(where, 'has a bundled app, so its manifest needs a "homepage": the https address of its source code, for reviewers')
    if (files.size > lim.files) fail(where, `has more than ${lim.files} files`)
    let total = 0
    let code = 0
    const folded = new Set()
    for (const [p, d] of files) {
      total += d.length
      if (d.length > lim.fileBytes) fail(where, `${p} is larger than ${mb(lim.fileBytes)}`)
      const lower = p.toLowerCase()
      if (folded.has(lower)) fail(where, `${p} differs from another path only by case`)
      folded.add(lower)
      if (isEnvFile(p)) fail(where, `${p} is a .env file: keys never ship in a pack`)
      const built = under(p, bundled)
      if (!built && isCode(p)) code += d.length
      if (!built && /\.m?js$/i.test(p) && d.toString('utf8').split('\n').some((l) => l.length > limits.minifiedLine)) fail(where, `${p} looks minified; packs ship readable code (a build tool's output belongs in a bundled app)`)
      if (isText(p) && d.length <= 5 * MiB) {
        const what = keyIn(d.toString('utf8'), !built)
        if (what) fail(where, `${p} holds ${what}`)
      }
    }
    if (total > lim.packBytes) fail(where, `is larger than ${mb(lim.packBytes)}`)
    if (code > limits.codeBytes) fail(where, `scripts, pages and SVG outside a bundled app come to more than ${mb(limits.codeBytes)}`)

    const source = join(dir, 'sources', entry.id)
    if (!existsSync(source)) return fail(where, `sources/${entry.id}/ is missing (run npm run unpack -- <the archive>)`)
    const have = sourceHashes(source)
    const want = new Map([...files].map(([p, d]) => [p, sha256(d)]))
    if (hashOfHashes(have) !== hashOfHashes(want)) {
      const differ = [...new Set([...have.keys(), ...want.keys()])].filter((p) => have.get(p) !== want.get(p)).sort()
      fail(where, `sources/${entry.id}/ differs from the archive (${differ.slice(0, 5).join(', ')}${differ.length > 5 ? ', …' : ''}); run npm run unpack -- <the archive>`)
    }
  }
}
