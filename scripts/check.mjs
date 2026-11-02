#!/usr/bin/env node
// Checks the index before anything merges (CI runs it on every pull request):
//   - index.json lists every .apexpack in packs/ and nothing else, one version per pack;
//   - each listed SHA-256 matches its file, and the index entry matches the manifest inside;
//   - each pack is signed, the signature is valid, and its key is the one keys.json pins for
//     that pack id (a new pack adds its key there, for a maintainer to approve);
//   - each pack's files follow Apex's rules: safe paths, size limits, readable (not minified)
//     code under 1 MB, nothing that looks like a secret;
//   - sources/<id>/ holds exactly the pack's files, so reviewers read what people install.
// Apex runs its own full validation again when someone installs a pack.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { ID, LIMITS, VERSION, packHash, readArchive, readFolder, sha256, verifySignature } from './lib.mjs'

const BASE = 'https://raw.githubusercontent.com/3SENN/apex-packs/main/packs/'
const SECRETS = [/sk-ant-[A-Za-z0-9_-]{20,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /\bgh[pousr]_[A-Za-z0-9]{30,}/, /\bgithub_pat_[A-Za-z0-9_]{30,}/, /\bxox[baprs]-[A-Za-z0-9-]{10,}/, /\bAKIA[0-9A-Z]{16}\b/, /\bAIza[0-9A-Za-z_-]{35}\b/]
const problems = []
const fail = (where, what) => problems.push(`${where}: ${what}`)

const index = JSON.parse(readFileSync('index.json', 'utf8'))
const keys = JSON.parse(readFileSync('keys.json', 'utf8'))
if (index.format !== 'apex-pack-index' || !Array.isArray(index.packs)) fail('index.json', 'needs "format": "apex-pack-index" and a "packs" list')

const onDisk = readdirSync('packs').filter((f) => f.endsWith('.apexpack')).sort()
const listed = new Set()
const ids = new Set()
for (const entry of index.packs ?? []) {
  const where = `index.json › ${entry.id}`
  if (!ID.test(entry.id ?? '')) fail(where, 'id is not a pack id')
  if (ids.has(entry.id)) fail(where, 'is listed twice (keep one version per pack)')
  ids.add(entry.id)
  if (!VERSION.test(entry.version ?? '')) fail(where, 'version is not major.minor.patch')
  const file = `${entry.id}-${entry.version}.apexpack`
  if (entry.url !== BASE + file) fail(where, `url must be ${BASE + file}`)
  if (!existsSync(join('packs', file))) {
    fail(where, `packs/${file} is missing`)
    continue
  }
  listed.add(file)
  const data = readFileSync(join('packs', file))
  if (entry.sha256 !== sha256(data)) fail(where, 'sha256 does not match the file (run npm run index)')
  if (data.length > LIMITS.packBytes + 1024 * 1024) fail(where, 'the file is too large')

  let archive
  try {
    archive = readArchive(data)
  } catch (err) {
    fail(where, `can't be read: ${err.message}`)
    continue
  }
  const { files, signature } = archive
  const m = JSON.parse(files.get('apex-pack.json')?.toString('utf8') ?? 'null')
  if (!m || m.format !== 'apex-pack') {
    fail(where, 'has no valid apex-pack.json')
    continue
  }
  if (m.id !== entry.id || m.version !== entry.version) fail(where, `the manifest says ${m.id} ${m.version}`)
  if (m.name !== entry.name || (m.description ?? '') !== entry.description) fail(where, 'name or description differs from the manifest (run npm run index)')

  const hash = packHash(files)
  if (!verifySignature(hash, signature)) fail(where, 'is not signed, or its signature does not match its files')
  else if (!keys[entry.id]) fail(where, `keys.json has no key for it; add "${entry.id}": "${signature.keyId}" for a maintainer to approve`)
  else if (keys[entry.id] !== signature.keyId) fail(where, `is signed by ${signature.keyId}, but keys.json pins ${keys[entry.id]}`)

  if (files.size > LIMITS.files) fail(where, `has more than ${LIMITS.files} files`)
  let total = 0
  let code = 0
  const folded = new Set()
  for (const [p, d] of files) {
    total += d.length
    if (d.length > LIMITS.fileBytes) fail(where, `${p} is larger than 2 MB`)
    if (folded.has(p.toLowerCase())) fail(where, `${p} differs from another path only by case`)
    folded.add(p.toLowerCase())
    if (/\.(m?js|html?|svg)$/i.test(p)) code += d.length
    if (/\.m?js$/i.test(p) && d.toString('utf8').split('\n').some((l) => l.length > LIMITS.minifiedLine)) fail(where, `${p} looks minified; packs ship readable code`)
    if (SECRETS.some((re) => re.test(d.toString('utf8')))) fail(where, `${p} looks like it holds a secret`)
  }
  if (total > LIMITS.packBytes) fail(where, 'is larger than 10 MB')
  if (code > LIMITS.codeBytes) fail(where, 'scripts, pages and SVG come to more than 1 MB')

  const source = join('sources', entry.id)
  if (!existsSync(source)) fail(where, `sources/${entry.id}/ is missing (run npm run unpack -- packs/${file})`)
  else if (packHash(readFolder(source)) !== hash) fail(where, `sources/${entry.id}/ differs from the pack's files (run npm run unpack -- packs/${file})`)
}
for (const file of onDisk) if (!listed.has(file)) fail(`packs/${file}`, 'is not in index.json (run npm run index)')
for (const dir of readdirSync('sources')) if (!ids.has(dir)) fail(`sources/${dir}`, 'has no pack in index.json')

if (problems.length > 0) {
  console.error(`${problems.length} problem${problems.length === 1 ? '' : 's'}:`)
  for (const p of problems) console.error(`  ${p}`)
  process.exit(1)
}
console.log(`index.json is consistent: ${ids.size} pack${ids.size === 1 ? '' : 's'}, all signed with their pinned keys.`)
