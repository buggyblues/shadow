import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
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

  const builtCli = join(packageDir, 'dist/cli.js')
  const command = existsSync(builtCli) ? process.execPath : 'pnpm'
  const commandArgs = existsSync(builtCli)
    ? [builtCli, ...args]
    : ['exec', 'tsx', 'src/cli.ts', ...args]

  return spawnSync(command, commandArgs, {
    cwd: packageDir,
    env: nextEnv,
    encoding: 'utf8',
  })
}

describe('connector CLI', () => {
  it('keeps runtime scan alive when PATH contains invalid entries', () => {
    const badPathRoot = mkdtempSync(join(tmpdir(), 'shadow-connector-bad-path-'))
    const badPathEntry = join(badPathRoot, 'not-a-directory')
    writeFileSync(badPathEntry, 'x')

    const result = runConnector(['runtime-scan', '--json'], {
      PATH: `${join(badPathEntry, 'bin')}:${process.env.PATH ?? ''}`,
      SHADOW_CONNECTOR_SKIP_LOGIN_SHELL: '1',
    })

    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toHaveProperty('runtimes')
  })

  it('fails cc-connect install preflight before writing local profiles for a bad binary override', () => {
    const home = mkdtempSync(join(tmpdir(), 'shadow-connector-home-'))

    const result = runConnector(
      [
        'connect',
        '--target',
        'cc-connect',
        '--server-url',
        'https://shadow.example.com',
        '--token',
        'tok',
        '--project-name',
        'smoke',
        '--work-dir',
        '/tmp/work',
        '--install',
      ],
      {
        HOME: home,
        SHADOW_CC_CONNECT_BIN: tmpdir(),
        SHADOW_CONNECTOR_ALLOW_TEMP_HOME: '1',
        SHADOW_CONNECTOR_SKIP_LOGIN_SHELL: '1',
      },
    )

    expect(result.status).toBe(1)
    expect(result.stderr).toContain(
      'SHADOW_CC_CONNECT_BIN is not a usable Shadow cc-connect binary',
    )
    expect(result.stdout).not.toContain('Applying: Configure Shadow CLI profile')
    expect(existsSync(join(home, '.shadowob/shadowob.config.json'))).toBe(false)
    expect(existsSync(join(home, '.cc-connect/config.toml'))).toBe(false)
  })

  it('warns when cc-connect install home is configured under system temp', () => {
    const ccConnectHome = mkdtempSync(join(tmpdir(), 'shadow-cc-connect-home-'))

    const result = runConnector(['doctor', '--target', 'cc-connect', '--json'], {
      SHADOW_CC_CONNECT_HOME: ccConnectHome,
      SHADOW_CONNECTOR_SKIP_LOGIN_SHELL: '1',
    })
    const parsed = JSON.parse(result.stdout)
    const labels = parsed.checks.map((item: { label: string }) => item.label)

    expect(result.status).toBe(1)
    expect(labels).toContain('cc-connect install home')
    expect(labels).toContain('cc-connect binary location')
  })

  it('fails cc-connect install preflight before downloads for a temp connector home', () => {
    const home = mkdtempSync(join(tmpdir(), 'shadow-connector-home-'))
    const connectorHome = mkdtempSync(join(tmpdir(), 'shadow-connector-install-home-'))

    const result = runConnector(
      [
        'connect',
        '--target',
        'cc-connect',
        '--server-url',
        'https://shadow.example.com',
        '--token',
        'tok',
        '--project-name',
        'smoke',
        '--work-dir',
        '/tmp/work',
        '--install',
      ],
      {
        HOME: home,
        SHADOW_CONNECTOR_HOME: connectorHome,
        SHADOW_CONNECTOR_SKIP_LOGIN_SHELL: '1',
      },
    )

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('is under a system temporary directory')
    expect(result.stdout).not.toContain('[cc-connect] Trying fork release asset')
    expect(result.stdout).not.toContain('Applying: Configure Shadow CLI profile')
    expect(existsSync(join(home, '.shadowob/shadowob.config.json'))).toBe(false)
    expect(existsSync(join(home, '.cc-connect/config.toml'))).toBe(false)
  })

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
