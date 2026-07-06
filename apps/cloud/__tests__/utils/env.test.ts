import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadEnvFiles } from '../../src/utils/env.js'

describe('loadEnvFiles', () => {
  let tempDir: string
  let originalCwd: string
  const savedEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'shadowob-cloud-env-'))
    originalCwd = process.cwd()
    process.chdir(tempDir)
  })

  afterEach(() => {
    process.chdir(originalCwd)
    rmSync(tempDir, { recursive: true, force: true })
    // Restore any env vars we set
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = val
      }
    }
  })

  function trackEnv(key: string) {
    if (!(key in savedEnv)) {
      savedEnv[key] = process.env[key]
    }
  }

  it('auto-loads .env from CWD', async () => {
    trackEnv('SHADOWOB_TEST_AUTO')
    writeFileSync(join(tempDir, '.env'), 'SHADOWOB_TEST_AUTO=auto_value\n')

    const loaded = await loadEnvFiles()

    expect(loaded).toHaveLength(1)
    expect(loaded[0]).toContain('.env')
    expect(process.env.SHADOWOB_TEST_AUTO).toBe('auto_value')
  })

  it('returns empty array when no .env exists and no paths given', async () => {
    const loaded = await loadEnvFiles()
    expect(loaded).toEqual([])
  })

  it('loads explicit env file path', async () => {
    trackEnv('SHADOWOB_TEST_EXPLICIT')
    const envPath = join(tempDir, 'custom.env')
    writeFileSync(envPath, 'SHADOWOB_TEST_EXPLICIT=explicit_value\n')

    const loaded = await loadEnvFiles([envPath])

    expect(loaded).toEqual([envPath])
    expect(process.env.SHADOWOB_TEST_EXPLICIT).toBe('explicit_value')
  })

  it('loads multiple env files, earlier takes precedence for same key', async () => {
    trackEnv('SHADOWOB_TEST_MULTI')
    trackEnv('SHADOWOB_TEST_ONLY_FIRST')
    trackEnv('SHADOWOB_TEST_ONLY_SECOND')

    const first = join(tempDir, 'first.env')
    const second = join(tempDir, 'second.env')
    writeFileSync(first, 'SHADOWOB_TEST_MULTI=first\nSHADOWOB_TEST_ONLY_FIRST=yes\n')
    writeFileSync(second, 'SHADOWOB_TEST_MULTI=second\nSHADOWOB_TEST_ONLY_SECOND=yes\n')

    const loaded = await loadEnvFiles([first, second])

    expect(loaded).toHaveLength(2)
    // Node's loadEnvFile does NOT override existing vars — first wins
    expect(process.env.SHADOWOB_TEST_MULTI).toBe('first')
    expect(process.env.SHADOWOB_TEST_ONLY_FIRST).toBe('yes')
    expect(process.env.SHADOWOB_TEST_ONLY_SECOND).toBe('yes')
  })

  it('throws when explicit env file does not exist', async () => {
    await expect(loadEnvFiles(['/nonexistent/.env'])).rejects.toThrow('Env file not found')
  })

  it('handles KEY=VALUE with quotes', async () => {
    trackEnv('SHADOWOB_TEST_QUOTED')
    writeFileSync(join(tempDir, '.env'), 'SHADOWOB_TEST_QUOTED="hello world"\n')

    await loadEnvFiles()

    // Node's loadEnvFile preserves surrounding quotes in the value
    expect(process.env.SHADOWOB_TEST_QUOTED).toBeDefined()
  })

  it('skips comments and empty lines', async () => {
    trackEnv('SHADOWOB_TEST_COMMENT')
    writeFileSync(join(tempDir, '.env'), '# This is a comment\n\nSHADOWOB_TEST_COMMENT=works\n')

    await loadEnvFiles()

    expect(process.env.SHADOWOB_TEST_COMMENT).toBe('works')
  })
})
