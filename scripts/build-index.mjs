#!/usr/bin/env node
// Writes index.json from the archives in packs/ (see repo.mjs › buildIndex).
import { buildIndex } from './repo.mjs'

const { count, warnings } = buildIndex()
for (const w of warnings) console.warn(`Note: ${w}.`)
console.log(`Wrote index.json with ${count} pack${count === 1 ? '' : 's'}.`)
