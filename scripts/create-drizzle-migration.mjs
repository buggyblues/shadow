#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const migrationsDir = 'apps/server/src/db/migrations'
const journalFile = 'apps/server/src/db/migrations/meta/_journal.json'

function usage() {
  console.error('Usage: pnpm db:migration:new <migration_name>')
  console.error('Example: pnpm db:migration:new add_cloud_template_review_note')
  process.exit(1)
}

function normalizeName(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
}

const rawName = process.argv.slice(2).join('_')
if (!rawName) usage()

const name = normalizeName(rawName)
if (!name) usage()

const absMigrationsDir = path.join(repoRoot, migrationsDir)
const absJournalFile = path.join(repoRoot, journalFile)

if (!fs.existsSync(absMigrationsDir)) {
  throw new Error(`Migrations directory not found: ${migrationsDir}`)
}
if (!fs.existsSync(absJournalFile)) {
  throw new Error(`Migration journal not found: ${journalFile}`)
}

const migrationFiles = fs
  .readdirSync(absMigrationsDir)
  .filter((file) => /^\d{4}_.+\.sql$/.test(file))
  .sort()

const journal = JSON.parse(fs.readFileSync(absJournalFile, 'utf8'))
const entries = Array.isArray(journal.entries) ? journal.entries : []

const lastFileIdx = migrationFiles.reduce(
  (max, file) => Math.max(max, Number(file.slice(0, 4))),
  -1,
)
const lastJournalIdx = entries.reduce(
  (max, entry) => Math.max(max, Number.isInteger(entry?.idx) ? entry.idx : -1),
  -1,
)
const nextIdx = Math.max(lastFileIdx, lastJournalIdx) + 1
const prefix = String(nextIdx).padStart(4, '0')
const tag = `${prefix}_${name}`
const sqlFile = `${tag}.sql`
const absSqlFile = path.join(absMigrationsDir, sqlFile)

if (fs.existsSync(absSqlFile)) {
  throw new Error(`Migration already exists: ${path.join(migrationsDir, sqlFile)}`)
}

const lastWhen = entries.reduce(
  (max, entry) => Math.max(max, Number.isInteger(entry?.when) ? entry.when : 0),
  0,
)
const when = Math.max(Date.now(), lastWhen + 1)

fs.writeFileSync(absSqlFile, `-- ${name.replace(/_/g, ' ')}\n\n`, 'utf8')

entries.push({
  idx: nextIdx,
  version: journal.version ?? '7',
  when,
  tag,
  breakpoints: true,
})
journal.entries = entries

fs.writeFileSync(absJournalFile, `${JSON.stringify(journal, null, 2)}\n`, 'utf8')

console.log(`Created ${path.join(migrationsDir, sqlFile)}`)
console.log(`Registered ${tag} with monotonic journal timestamp ${when}`)
