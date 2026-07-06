/**
 * Environment file loader — loads .env files into process.env.
 *
 * Uses Node 22+ built-in process.loadEnvFile() — no external dependency needed.
 * Supports:
 * - Auto-loading `.env` from CWD if present
 * - Explicit `--env-file <path>` override
 * - Multiple env files (later files override earlier values)
 */

import { access } from 'node:fs/promises'
import { resolve } from 'node:path'

/**
 * Load environment variables from one or more .env files into process.env.
 * Uses Node 22+ built-in `process.loadEnvFile()`.
 *
 * @param paths - Explicit file paths to load. If empty, tries `.env` in CWD.
 * @returns List of files that were successfully loaded.
 */
async function pathExists(candidate: string): Promise<boolean> {
  try {
    await access(candidate)
    return true
  } catch {
    return false
  }
}

export async function loadEnvFiles(paths?: string[]): Promise<string[]> {
  const loaded: string[] = []

  if (paths && paths.length > 0) {
    // Explicit paths: load each, error if not found
    for (const p of paths) {
      const abs = resolve(p)
      if (!(await pathExists(abs))) {
        throw new Error(`Env file not found: ${abs}`)
      }
      process.loadEnvFile(abs)
      loaded.push(abs)
    }
  } else {
    // Auto-load: try .env from CWD, silently skip if absent
    const defaultPath = resolve('.env')
    if (await pathExists(defaultPath)) {
      process.loadEnvFile(defaultPath)
      loaded.push(defaultPath)
    }
  }

  return loaded
}
