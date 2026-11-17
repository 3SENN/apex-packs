#!/usr/bin/env node
// Unpacks an archive into sources/<id>/ so reviewers can read it on GitHub:
//   npm run unpack -- packs/<id>-<version>.atelierpack
//   npm run unpack -- ~/Downloads/<id>-<version>.atelierapp   (an app hosted elsewhere)
import { readFileSync } from 'node:fs'
import { unpack } from './repo.mjs'

const file = process.argv[2]
if (!file) {
  console.error('Usage: npm run unpack -- <archive>.atelierpack|.atelierapp|.atelierworld')
  process.exit(1)
}
const { root, written, listed } = unpack(readFileSync(file))
console.log(`Unpacked ${written} file${written === 1 ? '' : 's'} into ${root}/${listed ? `, and listed ${listed} built file${listed === 1 ? '' : 's'} in ${root}/__atelier/built.txt` : ''}.`)
