// What the index builder and the unpacker do to this repository, as functions
// the tests can call on a folder of their own.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { ARCHIVE, BASE, BUILT_FILE, builtListing, bundledRoots, kindOf, readArchive, sha256, under } from './lib.mjs'

/**
 * index.json from the archives in packs/. Kind, size, address, hash and the
 * manifest's words come from each archive; a picture beside it
 * (<id>-<version>.png) becomes its image. What a maintainer set by hand stays:
 * each entry's category and colour, entries hosted elsewhere, and the
 * withdrawn list.
 */
export function buildIndex(dir = '.') {
  const path = join(dir, 'index.json')
  const old = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { packs: [] }
  const before = new Map((old.packs ?? []).map((p) => [p.id, p]))
  const packs = []
  const warnings = []
  for (const file of readdirSync(join(dir, 'packs')).filter((f) => ARCHIVE.test(f)).sort()) {
    const data = readFileSync(join(dir, 'packs', file))
    const { manifest: m } = readArchive(data)
    if (packs.some((p) => p.id === m.id)) {
      warnings.push(`${file}: ${m.id} is already listed (keep one version per pack)`)
      continue
    }
    const prev = before.get(m.id)
    const picture = file.replace(ARCHIVE, '.png')
    packs.push({
      id: m.id,
      name: m.name,
      description: m.description ?? '',
      version: m.version,
      url: BASE + encodeURIComponent(file),
      sha256: sha256(data),
      ...(m.author?.name ? { author: m.author.name } : {}),
      kind: kindOf(m),
      size: data.length,
      ...(prev?.category ? { category: prev.category } : {}),
      ...(prev?.color ? { color: prev.color } : {}),
      ...(existsSync(join(dir, 'packs', picture)) ? { image: BASE + encodeURIComponent(picture) } : {}),
    })
  }
  for (const p of old.packs ?? []) if (!packs.some((q) => q.id === p.id) && typeof p.url === 'string' && !p.url.startsWith(BASE)) packs.push(p)
  packs.sort((a, b) => a.id.localeCompare(b.id))
  const index = { format: 'apex-pack-index', name: old.name ?? 'Apex community', packs, ...(old.withdrawn?.length ? { withdrawn: old.withdrawn } : {}) }
  writeFileSync(path, `${JSON.stringify(index, null, 2)}\n`)
  const shelfless = packs.filter((p) => !p.category).map((p) => p.id)
  if (shelfless.length) warnings.push(`give ${shelfless.join(', ')} a "category" in index.json (games, tools, worlds, creative, learning, productivity, companions or other)`)
  return { count: packs.length, warnings }
}

/**
 * Writes an archive's files into sources/<id>/ so reviewers can read them on
 * GitHub. A bundled app's build output is listed by hash in __apex/built.txt
 * instead: its readable source is at the manifest's homepage.
 */
export function unpack(data, dir = '.') {
  const { files, manifest } = readArchive(data)
  const root = join(dir, 'sources', manifest.id)
  rmSync(root, { recursive: true, force: true })
  const bundled = bundledRoots(manifest)
  const built = new Map()
  for (const [p, d] of files) {
    if (under(p, bundled)) {
      built.set(p, d)
      continue
    }
    const target = join(root, ...p.split('/'))
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, d)
  }
  if (built.size > 0) {
    const target = join(root, ...BUILT_FILE.split('/'))
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, builtListing(built))
  }
  return { id: manifest.id, root, written: files.size - built.size, listed: built.size }
}
