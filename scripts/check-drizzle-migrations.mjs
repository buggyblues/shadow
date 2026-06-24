#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()

const schemaDir = 'apps/server/src/db/schema/'
const migrationsDir = 'apps/server/src/db/migrations/'
const journalFile = 'apps/server/src/db/migrations/meta/_journal.json'

function readGitNameStatus(args) {
  try {
    return execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    return ''
  }
}

function parseNameStatus(output) {
  return output
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('\t')
      const status = parts[0] ?? ''
      return {
        status,
        path: status.startsWith('R') || status.startsWith('C') ? parts[2] : parts[1],
        oldPath: status.startsWith('R') || status.startsWith('C') ? parts[1] : undefined,
      }
    })
    .filter((entry) => entry.path)
}

function getStagedChanges() {
  return parseNameStatus(
    readGitNameStatus(['diff', '--cached', '--name-status', '--diff-filter=ACMRD']),
  )
}

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

function getBranchChanges() {
  const baseRefs = unique([
    process.env.SHADOWOB_MIGRATION_BASE_REF,
    process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : undefined,
    'origin/main',
  ])

  for (const baseRef of baseRefs) {
    const output = readGitNameStatus([
      'diff',
      '--name-status',
      '--diff-filter=ACMRD',
      `${baseRef}...HEAD`,
    ])
    const changes = parseNameStatus(output)
    if (changes.length > 0) return changes
  }

  return []
}

function getChangedFiles() {
  const byPath = new Map()

  for (const change of [...getBranchChanges(), ...getStagedChanges()]) {
    byPath.set(change.path, change)
  }

  return [...byPath.values()]
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
  const tags = new Map()
  const idxs = new Map()
  const errors = []
  let previousEntry = null

  for (const entry of entries) {
    const tag = entry?.tag
    const idx = entry?.idx
    const when = entry?.when

    if (typeof tag !== 'string' || !/^\d{4}_.+/.test(tag)) {
      errors.push(`invalid journal tag: ${JSON.stringify(tag)}`)
      continue
    }

    if (typeof idx !== 'number') {
      errors.push(`${tag}: missing numeric idx`)
      continue
    }

    if (!Number.isInteger(when)) {
      errors.push(`${tag}: missing integer when timestamp`)
      continue
    }

    const prefix = Number(tag.slice(0, 4))
    if (idx !== prefix) {
      errors.push(`${tag}: journal idx ${idx} does not match migration prefix ${prefix}`)
    }

    if (previousEntry) {
      if (idx <= previousEntry.idx) {
        errors.push(
          `${tag}: journal idx ${idx} must be greater than ${previousEntry.tag} idx ${previousEntry.idx}`,
        )
      }
      if (prefix <= previousEntry.prefix) {
        errors.push(
          `${tag}: migration prefix ${prefix} must be greater than ${previousEntry.tag} prefix ${previousEntry.prefix}`,
        )
      }
      if (when <= previousEntry.when) {
        errors.push(
          `${tag}: journal when ${when} (${new Date(when).toISOString()}) must be greater than ` +
            `${previousEntry.tag} when ${previousEntry.when} (${new Date(previousEntry.when).toISOString()})`,
        )
      }
    }

    const prevTag = tags.get(tag)
    if (prevTag) errors.push(`${tag}: duplicate journal tag`)
    tags.set(tag, entry)

    const prevIdx = idxs.get(idx)
    if (prevIdx) errors.push(`${tag}: duplicate journal idx ${idx} also used by ${prevIdx}`)
    idxs.set(idx, tag)

    previousEntry = { idx, prefix, tag, when }
  }

  const migrationTags = new Set(migrationFiles.map((f) => f.replace(/\.sql$/, '')))
  const migrationTagsInOrder = migrationFiles.map((f) => f.replace(/\.sql$/, ''))
  const journalTagsInOrder = entries.map((e) => e?.tag).filter((tag) => typeof tag === 'string')

  for (let i = 0; i < Math.max(migrationTagsInOrder.length, journalTagsInOrder.length); i += 1) {
    const expected = migrationTagsInOrder[i]
    const actual = journalTagsInOrder[i]
    if (expected !== actual) {
      errors.push(
        `journal entry ${i} is ${actual ?? '<missing>'}, expected ${expected ?? '<none>'} from sorted migration files`,
      )
      break
    }
  }

  const missingInJournal = migrationFiles
    .map((f) => f.replace(/\.sql$/, ''))
    .filter((tag) => !tags.has(tag))

  const missingSqlFiles = entries
    .map((e) => e?.tag)
    .filter((tag) => typeof tag === 'string' && !migrationTags.has(tag))

  if (missingInJournal.length > 0) {
    console.error('\n❌ Migration file exists but is not registered in _journal.json:')
    for (const tag of missingInJournal) {
      console.error(`  - ${tag}`)
    }
    console.error('\nPlease run drizzle generate/migrate flow and commit updated journal.')
    process.exit(1)
  }

  if (missingSqlFiles.length > 0) {
    console.error('\n❌ Migration journal references missing .sql files:')
    for (const tag of missingSqlFiles) {
      console.error(`  - ${tag}.sql`)
    }
    console.error('\nMigrations are append-only; keep the SQL file and journal entry in sync.')
    process.exit(1)
  }

  if (errors.length > 0) {
    console.error('\n❌ Invalid migration journal:')
    for (const error of errors) {
      console.error(`  - ${error}`)
    }
    process.exit(1)
  }
}

function matchDollarQuoteTag(sql, index) {
  const match = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(sql.slice(index))
  return match?.[0]
}

function countTopLevelStatements(sql) {
  let statements = 0
  let i = 0
  let state = 'normal'
  let dollarTag = ''

  while (i < sql.length) {
    const ch = sql[i]
    const next = sql[i + 1]

    if (state === 'line-comment') {
      if (ch === '\n') state = 'normal'
      i += 1
      continue
    }

    if (state === 'block-comment') {
      if (ch === '*' && next === '/') {
        state = 'normal'
        i += 2
      } else {
        i += 1
      }
      continue
    }

    if (state === 'single-quote') {
      if (ch === "'" && next === "'") {
        i += 2
      } else {
        if (ch === "'") state = 'normal'
        i += 1
      }
      continue
    }

    if (state === 'double-quote') {
      if (ch === '"' && next === '"') {
        i += 2
      } else {
        if (ch === '"') state = 'normal'
        i += 1
      }
      continue
    }

    if (state === 'dollar-quote') {
      if (sql.startsWith(dollarTag, i)) {
        i += dollarTag.length
        dollarTag = ''
        state = 'normal'
      } else {
        i += 1
      }
      continue
    }

    if (ch === '-' && next === '-') {
      state = 'line-comment'
      i += 2
      continue
    }

    if (ch === '/' && next === '*') {
      state = 'block-comment'
      i += 2
      continue
    }

    if (ch === "'") {
      state = 'single-quote'
      i += 1
      continue
    }

    if (ch === '"') {
      state = 'double-quote'
      i += 1
      continue
    }

    if (ch === '$') {
      const tag = matchDollarQuoteTag(sql, i)
      if (tag) {
        dollarTag = tag
        state = 'dollar-quote'
        i += tag.length
        continue
      }
    }

    if (ch === ';') statements += 1
    i += 1
  }

  return statements
}

function validateStatementBreakpoints(migrationFiles) {
  const errors = []
  const legacyBreakpointGuardStart = 66

  for (const file of migrationFiles) {
    const prefix = Number(file.slice(0, 4))
    if (prefix < legacyBreakpointGuardStart) continue

    const abs = path.join(repoRoot, migrationsDir, file)
    const sql = fs.readFileSync(abs, 'utf8')
    const statements = countTopLevelStatements(sql)

    if (statements > 1 && !sql.includes('--> statement-breakpoint')) {
      errors.push(
        `${file}: contains ${statements} SQL statements but no "--> statement-breakpoint" markers`,
      )
    }
  }

  if (errors.length > 0) {
    console.error('\n❌ Invalid Drizzle migration SQL:')
    for (const error of errors) {
      console.error(`  - ${error}`)
    }
    console.error('\nSplit multi-statement migrations with Drizzle statement breakpoints.')
    process.exit(1)
  }
}

function main() {
  const changed = getChangedFiles()
  const schemaChanged = changed.some(
    (f) =>
      f.status !== 'D' &&
      f.path.startsWith(schemaDir) &&
      f.path.endsWith('.ts') &&
      !f.path.endsWith('/index.ts'),
  )

  const changedMigrationSql = changed.filter(
    (f) =>
      f.status !== 'D' &&
      f.path.startsWith(migrationsDir) &&
      /^apps\/server\/src\/db\/migrations\/\d{4}_.+\.sql$/.test(f.path),
  )
  const deletedMigrationSql = changed.filter(
    (f) =>
      f.status === 'D' &&
      f.path.startsWith(migrationsDir) &&
      /^apps\/server\/src\/db\/migrations\/\d{4}_.+\.sql$/.test(f.path),
  )
  const journalChanged = changed.some((f) => f.path === journalFile && f.status !== 'D')

  const allMigrations = getMigrationSqlFiles()
  checkDuplicateMigrationNumbers(allMigrations)
  validateJournal(allMigrations)
  validateStatementBreakpoints(allMigrations)

  if (deletedMigrationSql.length > 0) {
    console.error('\n❌ Migration files are append-only and must not be deleted:')
    for (const file of deletedMigrationSql) {
      console.error(`  - ${file.path}`)
    }
    console.error('\nAdd a follow-up migration instead of editing/removing applied history.')
    process.exit(1)
  }

  if (schemaChanged && (changedMigrationSql.length === 0 || !journalChanged)) {
    console.error('\n❌ Schema changed but migration changes are incomplete in this commit.')
    console.error(`  - Schema changed: ${schemaChanged ? 'yes' : 'no'}`)
    console.error(`  - Changed migration .sql files: ${changedMigrationSql.length}`)
    console.error(`  - Changed _journal.json: ${journalChanged ? 'yes' : 'no'}`)
    console.error('\nExpected when schema changes:')
    console.error('  1) Add at least one migration .sql file under apps/server/src/db/migrations')
    console.error('  2) Update apps/server/src/db/migrations/meta/_journal.json')
    process.exit(1)
  }

  console.log('✅ Drizzle migration guard passed')
}

main()
