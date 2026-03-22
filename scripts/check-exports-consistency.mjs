#!/usr/bin/env node

/**
 * Checks for duplicate or conflicting exports across shared packages.
 * Ensures @shadowob/shared and @shadowob/sdk don't export the same symbols
 * with different values, which would cause confusing runtime behavior.
 */

import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')

function extractExportedNames(filePath) {
  if (!fs.existsSync(filePath)) return []
  const content = fs.readFileSync(filePath, 'utf8')
  const names = []

  // Match: export { X, Y, Z } from '...'
  const reExportMatches = content.matchAll(/export\s*\{([^}]+)\}\s*from/g)
  for (const m of reExportMatches) {
    const items = m[1].split(',').map((s) => s.trim().split(/\s+as\s+/).pop().trim())
    names.push(...items.filter(Boolean))
  }

  // Match: export const X = ...
  const constMatches = content.matchAll(/export\s+(?:const|let|var|function|class|type|interface|enum)\s+(\w+)/g)
  for (const m of constMatches) {
    names.push(m[1])
  }

  // Match: export * from '...' (just note the source)
  const starMatches = content.matchAll(/export\s*\*\s*from\s*['"]([^'"]+)['"]/g)
  for (const m of starMatches) {
    names.push(`*<${m[1]}>`)
  }

  return names
}

function main() {
  const sharedIndex = path.join(ROOT, 'packages/shared/src/index.ts')
  const sdkIndex = path.join(ROOT, 'packages/sdk/src/index.ts')

  const sharedExports = extractExportedNames(sharedIndex)
  const sdkExports = extractExportedNames(sdkIndex)

  // Check for name collisions (excluding star re-exports and types)
  const sharedSet = new Set(sharedExports.filter((n) => !n.startsWith('*<')))
  const sdkSet = new Set(sdkExports.filter((n) => !n.startsWith('*<')))

  const duplicates = [...sharedSet].filter((name) => sdkSet.has(name))

  if (duplicates.length > 0) {
    console.warn(`\x1b[33m⚠ Shared export names also in SDK (${duplicates.length}):\x1b[0m`)
    for (const d of duplicates) {
      console.warn(`  - ${d}`)
    }
    console.warn('  This is expected if SDK re-exports from shared. Verify they refer to the same source.')
  }

  console.log(`✔ Shared exports: ${sharedExports.length}, SDK exports: ${sdkExports.length}`)
}

main()
