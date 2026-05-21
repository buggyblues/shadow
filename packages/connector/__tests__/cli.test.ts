import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)))

function runConnector(args: string[], env: NodeJS.ProcessEnv = {}) {
  const home = mkdtempSync(join(tmpdir(), 'shadow-connector-'))
  const nextEnv = { ...process.env, HOME: home }
  delete nextEnv.OPENCLAW_CONFIG
  delete nextEnv.OPENCLAW_CONFIG_PATH
  Object.assign(nextEnv, env)

  return spawnSync('pnpm', ['exec', 'tsx', 'src/cli.ts', ...args], {
    cwd: packageDir,
    env: nextEnv,
    encoding: 'utf8',
  })
}

describe('connector CLI', () => {
  it('writes OpenClaw config to the OpenClaw home by default', () => {
    const result = runConnector([
      'connect',
      '--target',
      'openclaw',
      '--server-url',
      'https://shadow.example.com',
      '--token',
      'tok',
      '--dry-run',
      '--no-install',
    ])

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('/.openclaw/openclaw.json')
    expect(result.stdout).not.toContain('/.shadowob/openclaw.json')
  })
})
