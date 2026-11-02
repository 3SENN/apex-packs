#!/usr/bin/env node
// Unpacks an .apexpack into sources/<id>/ so reviewers can read it on GitHub:
//   npm run unpack -- packs/<id>-<version>.apexpack
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { readArchive } from './lib.mjs'

const file = process.argv[2]
if (!file) {
  console.error('Usage: npm run unpack -- packs/<id>-<version>.apexpack')
  process.exit(1)
}
const { files } = readArchive(readFileSync(file))
const id = JSON.parse(files.get('apex-pack.json').toString('utf8')).id
const root = join('sources', id)
rmSync(root, { recursive: true, force: true })
for (const [p, data] of files) {
  const target = join(root, ...p.split('/'))
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, data)
}
console.log(`Unpacked ${files.size} files into ${root}/.`)
