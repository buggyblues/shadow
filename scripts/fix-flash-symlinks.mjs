#!/usr/bin/env node
/**
 * Workaround for a pnpm symlink depth bug affecting scoped packages
 * (e.g. @types/*, @webgpu/*) installed in workspace packages located
 * at depth > 2 from the workspace root (apps/flash/packages/*).
 *
 * pnpm generates relative symlinks 4 levels deep when they should be
 * 6 levels deep for packages at apps/flash/packages/*\/node_modules/@scope/pkg.
 *
 * This script detects and corrects those broken symlinks after `pnpm install`.
 */

import { existsSync, lstatSync, readlinkSync, rmSync, symlinkSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(import.meta.url), '../..')
const FLASH_PACKAGES = join(ROOT, 'apps/flash/packages')

async function fixBrokenSymlinks(dir, depth = 0) {
  if (depth > 4) return

  let entries
  try {
    entries = await readdir(dir)
  } catch {
    return
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry)
    let stat
    try {
      stat = lstatSync(fullPath)
    } catch {
      continue
    }

    if (stat.isSymbolicLink()) {
      const target = readlinkSync(fullPath)
      // Check if broken: only correct 4-level relative pnpm symlinks
      if (target.startsWith('../../../../node_modules/.pnpm/')) {
        const resolved = resolve(dirname(fullPath), target)
        if (!existsSync(resolved)) {
          const fixedTarget = `../../${target}` // 4 → 6 levels
          const fixedResolved = resolve(dirname(fullPath), fixedTarget)
          if (existsSync(fixedResolved)) {
            rmSync(fullPath)
            symlinkSync(fixedTarget, fullPath)
            console.log(`  fixed: ${fullPath.replace(ROOT + '/', '')}`)
          }
        }
      }
    } else if (stat.isDirectory() && entry !== '.pnpm') {
      await fixBrokenSymlinks(fullPath, depth + 1)
    }
  }
}

console.log('Fixing pnpm symlink depth issue in apps/flash/packages...')
await fixBrokenSymlinks(FLASH_PACKAGES)
console.log('Done.')
