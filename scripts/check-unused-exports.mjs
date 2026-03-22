#!/usr/bin/env node

/**
 * Detects potentially unused exports across the workspace.
 * Scans source directories for exported symbols and checks if they are imported elsewhere.
 * This is a lightweight static analysis — not a replacement for tree-shaking,
 * but useful for catching dead code in shared packages.
 */

import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')

const SOURCE_DIRS = [
  'packages/shared/src',
  'packages/sdk/src',
]

const CONSUMER_DIRS = [
  'apps/server/src',
  'apps/web/src',
  'apps/admin/src',
  'apps/desktop/src',
  'apps/mobile/src',
  'apps/mobile/app',
  'packages/sdk/src',
  'packages/openclaw/src',
  'packages/shared/src',
]

function findFiles(dir, pattern) {
  const results = []
  if (!fs.existsSync(dir)) return results
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue
      results.push(...findFiles(full, pattern))
    } else if (pattern.test(entry.name)) {
      results.push(full)
    }
  }
  return results
}

function extractExports(filePath) {
  const content = fs.readFileSync(filePath, 'utf8')
  const names = []

  // export const/let/var/function/class Name
  const declMatches = content.matchAll(
    /export\s+(?:const|let|var|function|class|enum)\s+(\w+)/g,
  )
  for (const m of declMatches) names.push(m[1])

  // export type/interface Name
  const typeMatches = content.matchAll(
    /export\s+(?:type|interface)\s+(\w+)/g,
  )
  for (const m of typeMatches) names.push(m[1])

  return names
}

function main() {
  // Collect all exported names from source packages
  const allExports = new Map()

  for (const dir of SOURCE_DIRS) {
    const absDir = path.join(ROOT, dir)
    const files = findFiles(absDir, /\.(ts|tsx)$/)
    for (const file of files) {
      // Skip index.ts (re-export files)
      if (path.basename(file) === 'index.ts') continue
      const exports = extractExports(file)
      const relPath = path.relative(ROOT, file)
      for (const name of exports) {
        if (!allExports.has(name)) {
          allExports.set(name, { source: relPath, usages: 0 })
        }
      }
    }
  }

  // Scan consumer directories for import references
  for (const dir of CONSUMER_DIRS) {
    const absDir = path.join(ROOT, dir)
    const files = findFiles(absDir, /\.(ts|tsx|js|jsx)$/)
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8')
      for (const [name, data] of allExports) {
        // Simple heuristic: check if the name appears in import statements or usage
        if (content.includes(name)) {
          data.usages++
        }
      }
    }
  }

  // Report potentially unused exports
  const unused = [...allExports.entries()]
    .filter(([, data]) => data.usages <= 1) // 1 = only the definition itself
    .sort(([, a], [, b]) => a.usages - b.usages)

  if (unused.length > 0) {
    console.log(`\x1b[33m⚠ Potentially unused exports (${unused.length}):\x1b[0m`)
    for (const [name, data] of unused) {
      console.log(`  ${name} — ${data.source} (${data.usages} reference${data.usages === 1 ? '' : 's'})`)
    }
    console.log('\n  Note: This is a heuristic check. Some exports may be used dynamically or in tests.')
  } else {
    console.log('✔ No obviously unused exports detected')
  }
}

main()
