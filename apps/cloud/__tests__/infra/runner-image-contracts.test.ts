import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const cloudRoot = resolve(here, '../..')

describe('runner image contracts', () => {
  it('keeps every runner image aligned with the persistent install contract', () => {
    execFileSync('node', ['scripts/smoke/runner-image-contracts.mjs'], {
      cwd: cloudRoot,
      stdio: 'pipe',
      encoding: 'utf8',
    })
  })
})
