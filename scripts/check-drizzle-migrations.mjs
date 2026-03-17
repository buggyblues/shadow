#!/usr/bin/env node

import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()

const schemaDir = 'apps/server/src/db/schema/'
const migrationsDir = 'apps/server/src/db/migrations/'
const journalFile = 'apps/server/src/db/migrations/meta/_journal.json'

function getStagedFiles() {
  const output = execSync('git diff --cached --name-only --diff-filter=ACMR', {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  return output
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
}

function getMigrationSqlFiles() {
  const abs = path.join(repoRoot, migrationsDir)
  if (!fs.existsSync(abs)) return []
  return fs
    .readdirSync(abs)
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort()
}

function checkDuplicateMigrationNumbers(migrationFiles) {
  const seen = new Map()
  const duplicates = []

  for (const file of migrationFiles) {
    const [prefix] = file.split('_')
    const arr = seen.get(prefix) ?? []
    arr.push(file)
    seen.set(prefix, arr)
  }

  for (const files of seen.values()) {
    if (files.length > 1) duplicates.push(files)
  }

  if (duplicates.length > 0) {
    console.error('\n❌ Duplicate migration number detected:')
    for (const group of duplicates) {
      console.error(`  - ${group.join(', ')}`)
    }
    console.error('\nPlease keep migration prefixes unique (e.g. 0014, 0015...).')
    process.exit(1)
  }
}

function validateJournal(migrationFiles) {
  const absJournal = path.join(repoRoot, journalFile)
  if (!fs.existsSync(absJournal)) {
    console.error(`\n❌ Missing migration journal: ${journalFile}`)
    process.exit(1)
  }

  const raw = fs.readFileSync(absJournal, 'utf8')
  const data = JSON.parse(raw)
  const entries = Array.isArray(data.entries) ? data.entries : []
  const tags = new Set(entries.map((e) => e?.tag).filter(Boolean))

  const missingInJournal = migrationFiles
    .map((f) => f.replace(/\.sql$/, ''))
    .filter((tag) => !tags.has(tag))

  if (missingInJournal.length > 0) {
    console.error('\n❌ Migration file exists but is not registered in _journal.json:')
    for (const tag of missingInJournal) {
      console.error(`  - ${tag}`)
    }
    console.error('\nPlease run drizzle generate/migrate flow and commit updated journal.')
    process.exit(1)
  }
}

function main() {
  const staged = getStagedFiles()
  const schemaChanged = staged.some(
    (f) => f.startsWith(schemaDir) && f.endsWith('.ts') && !f.endsWith('/index.ts'),
  )

  const stagedMigrationSql = staged.filter(
    (f) =>
      f.startsWith(migrationsDir) && /^apps\/server\/src\/db\/migrations\/\d{4}_.+\.sql$/.test(f),
  )
  const journalChanged = staged.includes(journalFile)

  const allMigrations = getMigrationSqlFiles()
  checkDuplicateMigrationNumbers(allMigrations)
  validateJournal(allMigrations)

  if (schemaChanged && (stagedMigrationSql.length === 0 || !journalChanged)) {
    console.error('\n❌ Schema changed but migration changes are incomplete in this commit.')
    console.error(`  - Schema changed: ${schemaChanged ? 'yes' : 'no'}`)
    console.error(`  - Staged migration .sql files: ${stagedMigrationSql.length}`)
    console.error(`  - Staged _journal.json: ${journalChanged ? 'yes' : 'no'}`)
    console.error('\nExpected when schema changes:')
    console.error('  1) Add at least one migration .sql file under apps/server/src/db/migrations')
    console.error('  2) Stage apps/server/src/db/migrations/meta/_journal.json')
    process.exit(1)
  }

  console.log('✅ Drizzle migration guard passed')
}

main()
