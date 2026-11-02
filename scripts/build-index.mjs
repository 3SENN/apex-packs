#!/usr/bin/env node
// Writes index.json from the .apexpack files in packs/: each one's id, name,
// description, version, author and SHA-256, and its raw GitHub address.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { readArchive, sha256 } from './lib.mjs'

const BASE = 'https://raw.githubusercontent.com/3SENN/apex-packs/main/packs/'
const packs = []
for (const file of readdirSync('packs').filter((f) => f.endsWith('.apexpack')).sort()) {
  const data = readFileSync(join('packs', file))
  const m = JSON.parse(readArchive(data).files.get('apex-pack.json').toString('utf8'))
  packs.push({
    id: m.id,
    name: m.name,
    description: m.description ?? '',
    version: m.version,
    url: BASE + encodeURIComponent(file),
    sha256: sha256(data),
    ...(m.author?.name ? { author: m.author.name } : {}),
  })
}
writeFileSync('index.json', `${JSON.stringify({ format: 'apex-pack-index', name: 'Apex community', packs }, null, 2)}\n`)
console.log(`Wrote index.json with ${packs.length} packs.`)
