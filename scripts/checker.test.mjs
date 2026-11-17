// node --test scripts/
import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { zipSync } from 'fflate'
import { checkIndex } from './checker.mjs'
import { LIMITS, packHash, sha256 } from './lib.mjs'
import { buildIndex, unpack } from './repo.mjs'

// ---- fixtures ----

function newKey() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const der = publicKey.export({ format: 'der', type: 'spki' })
  return { privateKey, der, fingerprint: sha256(der) }
}

/** A signed archive of these files, the way Atelier and pack.mjs write one. */
function archive(files, key) {
  const map = new Map(Object.entries(files).map(([p, d]) => [p, Buffer.from(typeof d === 'string' ? d : JSON.stringify(d))]))
  const hash = packHash(map)
  const entries = Object.fromEntries([...map].map(([p, d]) => [p, new Uint8Array(d)]))
  if (key) {
    const signature = { format: 'atelier-pack-signature', version: 1, hash, keyId: key.fingerprint.slice(0, 16), publicKey: key.der.toString('base64'), signature: sign(null, Buffer.from(hash, 'utf8'), key.privateKey).toString('base64') }
    entries['__atelier/signature.json'] = new Uint8Array(Buffer.from(JSON.stringify(signature)))
  }
  return Buffer.from(zipSync(entries))
}

const manifest = (id, more = {}) => ({ format: 'atelier-pack', manifestVersion: 2, id, name: `Pack ${id}`, version: '1.0.0', description: `What ${id} does.`, author: { name: 'Someone' }, contributes: {}, permissions: {}, ...more })
const skillPack = (id) => ({ 'atelier-pack.json': manifest(id, { contributes: { skills: ['skills/hello'] } }), 'skills/hello/SKILL.md': '---\nname: hello\ndescription: Says hello.\n---\nSay hello.\n' })
const appPack = (id, app = {}, more = {}) => ({ 'atelier-pack.json': manifest(id, { contributes: { apps: [{ id: 'main', name: 'Main', build: 'kit', kind: 'game', ...app }] }, ...more }), 'app/index.html': '<!doctype html><script type="module" src="./main.js"></script>', 'app/main.js': 'console.log("hi")\n' })

/** A repository with these archives in packs/, unpacked, indexed and pinned like a contributor would leave it. */
function repo(items, { category = 'tools' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'atelier-packs-'))
  mkdirSync(join(dir, 'packs'))
  mkdirSync(join(dir, 'sources'))
  const keys = {}
  for (const { files, key, ext = '.atelierpack', pin = true } of items) {
    const m = files['atelier-pack.json']
    const data = archive(files, key)
    writeFileSync(join(dir, 'packs', `${m.id}-${m.version}${ext}`), data)
    unpack(data, dir)
    if (key && pin) keys[m.id] = key.fingerprint
  }
  writeFileSync(join(dir, 'index.json'), JSON.stringify({ format: 'atelier-pack-index', name: 'Test', packs: [] }))
  buildIndex(dir)
  const index = JSON.parse(readJson(dir, 'index.json'))
  for (const p of index.packs) p.category = category
  writeFileSync(join(dir, 'index.json'), JSON.stringify(index, null, 2))
  writeFileSync(join(dir, 'keys.json'), JSON.stringify(keys, null, 2))
  return { dir, index, keys }
}
const readJson = (dir, f) => readFileSync(join(dir, f), 'utf8')
const write = (dir, f, v) => writeFileSync(join(dir, f), JSON.stringify(v, null, 2))
const check = (dir, opts = {}) => checkIndex({ dir, base: null, ...opts })
const problems = async (dir, opts) => (await check(dir, opts)).problems

// ---- tests ----

test('a signed, pinned, unpacked pack passes', async () => {
  const { dir } = repo([{ files: skillPack('hello'), key: newKey() }])
  assert.deepEqual(await problems(dir), [])
})

test('a new pack without a pin is told the exact line to add', async () => {
  const key = newKey()
  const { dir } = repo([{ files: skillPack('hello'), key, pin: false }])
  const p = await problems(dir)
  assert.equal(p.length, 1)
  assert.match(p[0], new RegExp(`add "hello": "${key.fingerprint}"`))
})

test('a pack signed by a key other than its pin fails', async () => {
  const { dir } = repo([{ files: skillPack('hello'), key: newKey() }])
  write(dir, 'keys.json', { hello: newKey().fingerprint })
  assert.match((await problems(dir)).join('\n'), /is signed by .* but keys.json pins/)
})

test('an unsigned pack fails', async () => {
  const { dir } = repo([{ files: skillPack('hello'), key: null }])
  assert.match((await problems(dir)).join('\n'), /is not signed/)
})

test('a pin never changes and never goes away', async () => {
  const key = newKey()
  const { dir, keys, index } = repo([{ files: skillPack('hello'), key }])
  const other = newKey().fingerprint
  // A pull request that swaps the key and the pack together still fails.
  assert.match((await problems(dir, { base: { keys: { hello: other }, index } })).join('\n'), /changed from/)
  // Removing a pin fails even when the pack leaves too.
  assert.match((await problems(dir, { base: { keys: { ...keys, gone: other }, index } })).join('\n'), /keys.json › gone: was removed/)
  // Moving from the short key id to the full fingerprint is allowed.
  assert.deepEqual(await problems(dir, { base: { keys: { hello: key.fingerprint.slice(0, 16) }, index } }), [])
})

test('pins must be full fingerprints', async () => {
  const key = newKey()
  const { dir } = repo([{ files: skillPack('hello'), key }])
  write(dir, 'keys.json', { hello: key.fingerprint.slice(0, 16) })
  assert.match((await problems(dir)).join('\n'), /full fingerprint/)
})

test('an app may name its assets the way games do, and only inside its folder', async () => {
  const key = newKey()
  const ok = appPack('game')
  ok['app/sounds/bangers & mash (1).ogg'] = 'ogg'
  assert.deepEqual(await problems(repo([{ files: ok, key, ext: '.atelierapp' }]).dir), [])
  const bad = appPack('game2')
  bad['notes/a b.md'] = 'text'
  assert.throws(() => repo([{ files: bad, key, ext: '.atelierapp' }]), /not an allowed file path/)
})

test('an archive must carry the extension of what it holds', async () => {
  const key = newKey()
  const { dir } = repo([{ files: appPack('game'), key, ext: '.atelierpack' }])
  const p = (await problems(dir)).join('\n')
  assert.match(p, /packs\/game-1\.0\.0\.atelierapp is missing/)
  assert.match(p, /packs\/game-1\.0\.0\.atelierpack: is not in index\.json/)
})

test('a bundled app: built code may be minified, its build is listed by hash, and it names its source', async () => {
  const key = newKey()
  const min = `var a=${'1+'.repeat(2_000)}1;\n`
  const withHome = appPack('built', { build: 'bundled' }, { homepage: 'https://example.com/built' })
  withHome['app/main.js'] = min
  const { dir } = repo([{ files: withHome, key, ext: '.atelierapp' }])
  assert.deepEqual(await problems(dir), [])
  assert.match(readFileSync(join(dir, 'sources', 'built', '__atelier', 'built.txt'), 'utf8'), /^[0-9a-f]{64} {2}app\/index\.html$/m)

  const noHome = appPack('built2', { build: 'bundled' })
  assert.match((await problems(repo([{ files: noHome, key, ext: '.atelierapp' }]).dir)).join('\n'), /needs a "homepage"/)

  const kit = appPack('kitapp')
  kit['app/main.js'] = min
  assert.match((await problems(repo([{ files: kit, key, ext: '.atelierapp' }]).dir)).join('\n'), /looks minified/)
})

test('keys are refused and public browser keys are not', async () => {
  const key = newKey()
  const publicKey = skillPack('public')
  publicKey['firebase.js'] = 'export const config = { apiKey: "AIzaSyD-1234567890abcdefghijklmnopqrstuv" }\n'
  assert.deepEqual(await problems(repo([{ files: publicKey, key }]).dir), [])

  const secret = skillPack('secret')
  secret['skills/hello/SKILL.md'] += `Use sk-ant-api03-${'x'.repeat(40)}\n`
  assert.match((await problems(repo([{ files: secret, key }]).dir)).join('\n'), /holds an Anthropic API key/)

  const env = skillPack('env')
  env['.env'] = 'A=1\n'
  assert.match((await problems(repo([{ files: env, key }]).dir)).join('\n'), /\.env is a \.env file/)
})

test('sources must match the archive exactly', async () => {
  const { dir } = repo([{ files: skillPack('hello'), key: newKey() }])
  writeFileSync(join(dir, 'sources', 'hello', 'skills', 'hello', 'SKILL.md'), 'changed\n')
  assert.match((await problems(dir)).join('\n'), /sources\/hello\/ differs from the archive \(skills\/hello\/SKILL\.md\)/)
})

test('every entry is on a shelf, and its fields are in range', async () => {
  const { dir, index } = repo([{ files: skillPack('hello'), key: newKey() }])
  index.packs[0].category = 'misc'
  index.packs[0].color = 'purple'
  write(dir, 'index.json', index)
  const p = (await problems(dir)).join('\n')
  assert.match(p, /category must be one of/)
  assert.match(p, /color must be #rrggbb/)
})

test('a picture beside the archive becomes its image, and must be a PNG', async () => {
  const key = newKey()
  const { dir } = repo([{ files: skillPack('hello'), key }])
  writeFileSync(join(dir, 'packs', 'hello-1.0.0.png'), Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]))
  buildIndex(dir)
  assert.deepEqual(await problems(dir), [])
  writeFileSync(join(dir, 'packs', 'hello-1.0.0.png'), 'not a png')
  assert.match((await problems(dir)).join('\n'), /is not a PNG/)
})

test('an archive too big for the repository must be hosted elsewhere', async () => {
  const { dir } = repo([{ files: appPack('game'), key: newKey(), ext: '.atelierapp' }])
  assert.match((await problems(dir, { limits: { ...LIMITS, inRepoBytes: 100 } })).join('\n'), /Host it as a release asset/)
})

test('an app hosted elsewhere is downloaded when it is new or changed, and must match its hash', async () => {
  const key = newKey()
  const data = archive(appPack('far'), key)
  const { dir } = repo([{ files: skillPack('near'), key }])
  unpack(data, dir)
  const index = JSON.parse(readJson(dir, 'index.json'))
  const entry = { id: 'far', name: 'Pack far', description: 'What far does.', version: '1.0.0', url: 'https://downloads.example.com/far-1.0.0.atelierapp', sha256: sha256(data), author: 'Someone', kind: 'app', size: data.length, category: 'games' }
  index.packs.push(entry)
  write(dir, 'index.json', index)
  write(dir, 'keys.json', { near: key.fingerprint, far: key.fingerprint })

  let fetched = 0
  const fetchArchive = async () => {
    fetched++
    return data
  }
  assert.deepEqual(await problems(dir, { fetchArchive }), [])
  assert.equal(fetched, 1)

  // Unchanged since the base: not downloaded again.
  const base = { keys: { near: key.fingerprint, far: key.fingerprint }, index }
  assert.deepEqual(await problems(dir, { base, fetchArchive: async () => assert.fail('downloaded an unchanged app') }), [])

  // Changed bytes behind the same address fail.
  const swapped = archive({ ...appPack('far'), 'app/main.js': 'steal()\n' }, key)
  assert.match((await problems(dir, { fetchArchive: async () => swapped })).join('\n'), /sha256 does not match/)

  // Only apps live elsewhere.
  index.packs.find((p) => p.id === 'far').kind = 'pack'
  write(dir, 'index.json', index)
  assert.match((await problems(dir, { fetchArchive })).join('\n'), /only apps are hosted outside/)
})

test('withdrawn entries need an id and a reason', async () => {
  const { dir, index } = repo([{ files: skillPack('hello'), key: newKey() }])
  index.withdrawn = [{ id: 'old', reason: 'Replaced by hello.' }, { id: 'Bad Id' }]
  write(dir, 'index.json', index)
  const p = await problems(dir)
  assert.equal(p.length, 2)
  assert.match(p.join('\n'), /"Bad Id" is not a pack id/)
})
