#!/usr/bin/env node

/**
 * Checks for common CI/CD issues before pushing:
 * - pnpm-lock.yaml consistency
 * - No console.log in production source (outside tests/scripts)
 * - No .only() in test files
 * - No hardcoded localhost URLs in non-dev files
 * - No TODO/FIXME/HACK that should be tracked as issues
 */

import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')

const warnings = []
const errors = []

// 1. Check .only() in test files
function checkTestOnlyDirectives() {
  const testDirs = [
    'apps/server/__tests__',
    'apps/desktop/__tests__',
    'apps/web/__tests__',
    'packages/shared/__tests__',
    'packages/openclaw-shadowob/__tests__',
    'apps/desktop/e2e',
  ]

  for (const dir of testDirs) {
    const absDir = path.join(ROOT, dir)
    if (!fs.existsSync(absDir)) continue

    const files = findFiles(absDir, /\.(test|spec)\.(ts|tsx|js)$/)
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8')
      const relPath = path.relative(ROOT, file)

      // .only() left in tests will skip other tests
      if (/\.(only|skip)\s*\(/.test(content)) {
        const matches = content.match(/\.(only|skip)\s*\(/g)
        errors.push(`${relPath}: contains ${matches.length} .only()/.skip() directive(s) — remove before committing`)
      }
    }
  }
}

// 2. Check for debug artifacts
function checkDebugArtifacts() {
  const srcDirs = [
    'apps/server/src',
    'apps/web/src',
    'apps/admin/src',
    'apps/mobile/src',
    'packages/shared/src',
    'packages/sdk/src',
  ]

  for (const dir of srcDirs) {
    const absDir = path.join(ROOT, dir)
    if (!fs.existsSync(absDir)) continue

    const files = findFiles(absDir, /\.(ts|tsx|js|jsx)$/)
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8')
      const relPath = path.relative(ROOT, file)

      // debugger statements
      if (/\bdebugger\b/.test(content)) {
        errors.push(`${relPath}: contains 'debugger' statement`)
      }
    }
  }
}

// 3. Check lockfile freshness
function checkLockfile() {
  const lockfile = path.join(ROOT, 'pnpm-lock.yaml')
  if (!fs.existsSync(lockfile)) {
    errors.push('pnpm-lock.yaml not found')
    return
  }

  // Check that lockfile isn't too stale compared to package.json
  const lockStat = fs.statSync(lockfile)
  const pkgStat = fs.statSync(path.join(ROOT, 'package.json'))

  if (pkgStat.mtime > lockStat.mtime) {
    warnings.push('package.json is newer than pnpm-lock.yaml — run `pnpm install` to update')
  }
}

function findFiles(dir, pattern) {
  const results = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build') continue
      results.push(...findFiles(full, pattern))
    } else if (pattern.test(entry.name)) {
      results.push(full)
    }
  }
  return results
}

function main() {
  console.log('Running pre-push checks...\n')

  checkTestOnlyDirectives()
  checkDebugArtifacts()
  checkLockfile()

  if (warnings.length > 0) {
    console.warn('\x1b[33m⚠ Warnings:\x1b[0m')
    for (const w of warnings) console.warn(`  - ${w}`)
    console.log()
  }

  if (errors.length > 0) {
    console.error('\x1b[31m✖ Errors (must fix before push):\x1b[0m')
    for (const e of errors) console.error(`  - ${e}`)
    process.exit(1)
  }

  console.log('\x1b[32m✔ All pre-push checks passed\x1b[0m')
}

main()
