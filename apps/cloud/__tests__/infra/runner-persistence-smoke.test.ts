import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const cloudRoot = resolve(here, '../..')

describe('runner persistent install smoke', () => {
  it(
    'keeps npm, pip, apt, and home-scoped tool state after a simulated restart',
    () => {
      execFileSync('node', ['scripts/smoke/runner-persistent-installs.mjs'], {
        cwd: cloudRoot,
        stdio: 'pipe',
        encoding: 'utf8',
      })
    },
    120_000,
  )
})
