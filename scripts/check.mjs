#!/usr/bin/env node
// Checks the index before anything merges; CI runs it on every pull request,
// every push to main and once a week. See checker.mjs for what it checks.
//
//   BASE_REF        the branch or commit this change goes into, to compare
//                   keys.json and index.json with (default: origin/main)
//   CHECK_EXTERNAL  which apps hosted elsewhere to download: changed (default),
//                   all or none
import { execFileSync } from 'node:child_process'
import { checkIndex } from './checker.mjs'

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
const explicit = process.env.BASE_REF?.trim() ?? ''
let ref = explicit
if (!ref) {
  try {
    git('rev-parse', '--verify', '--quiet', 'origin/main')
    ref = 'origin/main'
  } catch {
    ref = ''
  }
}

let base = null
if (ref && !/^0+$/.test(ref)) {
  try {
    base = { keys: JSON.parse(git('show', `${ref}:keys.json`)), index: JSON.parse(git('show', `${ref}:index.json`)) }
  } catch {
    if (explicit) {
      console.error(`Can't read keys.json and index.json at ${ref}, so pin changes can't be checked.`)
      process.exit(1)
    }
  }
}

const external = process.env.CHECK_EXTERNAL || 'changed'
if (!['changed', 'all', 'none'].includes(external)) {
  console.error('CHECK_EXTERNAL is changed, all or none.')
  process.exit(1)
}

const { problems, notes, count } = await checkIndex({ base, external })
for (const n of notes) console.log(`Note: ${n}.`)
if (problems.length > 0) {
  console.error(`${problems.length} problem${problems.length === 1 ? '' : 's'}:`)
  for (const p of problems) console.error(`  ${p}`)
  process.exit(1)
}
console.log(`index.json is consistent: ${count} pack${count === 1 ? '' : 's'}, each signed with its pinned key${base ? `, no pin changed since ${ref}` : ''}.`)
