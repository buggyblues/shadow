/**
 * E2E: shadowob-cloud validate — all templates
 *
 * What this tests (real code paths in apps/cloud):
 *   parseConfigFile()  → JSON parse + typia schema validation
 *   validateCloudConfig() → every field shape, required fields, enum values
 *   expandExtends()    → configuration base-class merging
 *   collectTemplateRefs() → ${env:VAR} / ${secret:X} / ${file:P} extraction
 *   resolve check      → full resolution dry-run (warns on unset vars, not error)
 *
 * How it works:
 *   Runs the packaged `shadowob-cloud` bin target from package.json as a real
 *   child process — exactly what a user does from their terminal. No mocking.
 *
 * Prerequisites: pnpm build:cli  (packaged CLI bin must exist)
 */

import { execFile } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { assertCliBuilt, CLI_BIN, CLOUD_ROOT } from './cli-bin.js'

const execFileAsync = promisify(execFile)

const TEMPLATES_DIR = join(CLOUD_ROOT, 'templates')

const TEMPLATES = readdirSync(TEMPLATES_DIR)
  .filter((f) => f.endsWith('.template.json'))
  .map((f) => f.replace('.template.json', ''))
  .sort()

assertCliBuilt()

describe.each(TEMPLATES)('shadowob-cloud validate: %s', (templateName) => {
  it('exits 0 and prints "Config is valid!"', async () => {
    const templateFile = join(TEMPLATES_DIR, `${templateName}.template.json`)

    let stdout = ''
    let stderr = ''
    let exitCode = 0

    try {
      const result = await execFileAsync(
        process.execPath,
        [CLI_BIN, 'validate', '-f', templateFile],
        {
          timeout: 15_000,
        },
      )
      stdout = result.stdout
      stderr = result.stderr
    } catch (err: unknown) {
      const e = err as { stdout?: string; stderr?: string; code?: number; message?: string }
      stdout = e.stdout ?? ''
      stderr = e.stderr ?? ''
      exitCode = e.code ?? 1
    }

    const combined = stdout + stderr

    expect(exitCode, `CLI exited with code ${exitCode}.\nOutput:\n${combined}`).toBe(0)
    expect(combined).toContain('Config is valid!')
    expect(combined).not.toContain('Config validation failed')
    expect(combined).toContain('Schema valid')
    expect(combined).toContain('Template references valid')
  })
})
