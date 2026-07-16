import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
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
      SHADOWOB_CONNECTOR_SKIP_LOGIN_SHELL: '1',
    })

    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toHaveProperty('runtimes')
  }, 30_000)

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
        SHADOWOB_CC_CONNECT_BIN: tmpdir(),
        SHADOWOB_CONNECTOR_ALLOW_TEMP_HOME: '1',
        SHADOWOB_CONNECTOR_SKIP_LOGIN_SHELL: '1',
      },
    )

    expect(result.status).toBe(1)
    expect(result.stderr).toContain(
      'SHADOWOB_CC_CONNECT_BIN is not a usable Shadow cc-connect binary',
    )
    expect(result.stdout).not.toContain('Applying: Configure Shadow CLI profile')
    expect(existsSync(join(home, '.shadowob/shadowob.config.json'))).toBe(false)
    expect(existsSync(join(home, '.cc-connect/config.toml'))).toBe(false)
  })

  it('warns when cc-connect install home is configured under system temp', () => {
    const ccConnectHome = mkdtempSync(join(tmpdir(), 'shadow-cc-connect-home-'))

    const result = runConnector(['doctor', '--target', 'cc-connect', '--json'], {
      SHADOWOB_CC_CONNECT_HOME: ccConnectHome,
      SHADOWOB_CONNECTOR_SKIP_LOGIN_SHELL: '1',
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
        SHADOWOB_CONNECTOR_HOME: connectorHome,
        SHADOWOB_CONNECTOR_SKIP_LOGIN_SHELL: '1',
      },
    )

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('is under a system temporary directory')
    expect(result.stdout).not.toContain('[cc-connect] Trying fork release asset')
    expect(result.stdout).not.toContain('Applying: Configure Shadow CLI profile')
    expect(existsSync(join(home, '.shadowob/shadowob.config.json'))).toBe(false)
    expect(existsSync(join(home, '.cc-connect/config.toml'))).toBe(false)
  })

  it('configures cc-connect Codex without overriding native Codex config or auth', () => {
    const home = mkdtempSync(join(tmpdir(), 'shadow-connector-home-'))
    const fakeBin = mkdtempSync(join(tmpdir(), 'shadow-connector-bin-'))
    for (const command of ['shadowob', 'shadowob-connector']) {
      const path = join(fakeBin, command)
      writeFileSync(path, '#!/usr/bin/env sh\nexit 0\n')
      chmodSync(path, 0o755)
    }

    const ccConnectDir = join(home, '.cc-connect')
    const codexDir = join(home, '.codex')
    mkdirSync(ccConnectDir, { recursive: true })
    mkdirSync(codexDir, { recursive: true })
    writeFileSync(
      join(ccConnectDir, 'config.toml'),
      [
        '[[projects]]',
        'name = "smoke"',
        '',
        '[projects.agent]',
        'type = "codex"',
        '',
        '[projects.agent.options]',
        'provider = "shadow-official"',
        'model = "deepseek-v4-flash"',
        '',
        '[[projects.agent.providers]]',
        'name = "shadow-official"',
        'api_key = "mp_old"',
        'base_url = "https://old.example.com/v1"',
        'model = "deepseek-v4-flash"',
      ].join('\n'),
    )
    const codexConfig = 'model = "gpt-5"\n'
    const codexAuth = '{"auth_mode":"chatgpt","tokens":{"access_token":"sentinel"}}\n'
    writeFileSync(join(codexDir, 'config.toml'), codexConfig)
    writeFileSync(join(codexDir, 'auth.json'), codexAuth)

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
        '--agent-type',
        'codex',
        '--model-provider-id',
        'shadow-official',
        '--model-provider-base-url',
        'https://shadow.example.com/api/ai/v1',
        '--model-provider-api-key',
        'mp_new',
        '--model-provider-model',
        'deepseek-v4-flash',
        '--no-install',
      ],
      {
        HOME: home,
        PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
        SHADOWOB_CONNECTOR_ALLOW_TEMP_HOME: '1',
        SHADOWOB_CONNECTOR_SKIP_LOGIN_SHELL: '1',
      },
    )

    expect(result.status, result.stderr).toBe(0)
    const ccConnectConfig = readFileSync(join(ccConnectDir, 'config.toml'), 'utf8')
    expect(ccConnectConfig).not.toContain('provider = "shadow-official"')
    expect(ccConnectConfig).not.toContain('model = "deepseek-v4-flash"')
    expect(ccConnectConfig).not.toContain('mp_new')
    expect(ccConnectConfig).not.toContain('https://shadow.example.com/api/ai/v1')
    expect(readFileSync(join(codexDir, 'config.toml'), 'utf8')).toBe(codexConfig)
    expect(readFileSync(join(codexDir, 'auth.json'), 'utf8')).toBe(codexAuth)
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

  it('uses the Hermes venv sibling Python when installing the Hermes plugin', () => {
    const fakeBin = mkdtempSync(join(tmpdir(), 'shadow-hermes-bin-'))
    const fakeHermes = join(fakeBin, 'hermes')
    const fakePython = join(fakeBin, 'python')
    writeFileSync(fakeHermes, '#!/usr/bin/env sh\nexit 0\n')
    writeFileSync(fakePython, '#!/usr/bin/env sh\nexit 0\n')
    chmodSync(fakeHermes, 0o755)
    chmodSync(fakePython, 0o755)

    const result = runConnector(
      [
        'connect',
        '--target',
        'hermes',
        '--server-url',
        'https://shadow.example.com',
        '--token',
        'tok',
        '--dry-run',
      ],
      {
        PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
        SHADOWOB_CONNECTOR_SKIP_LOGIN_SHELL: '1',
      },
    )

    expect(result.status).toBe(0)
    expect(result.stdout).toContain(`${fakePython} -m ensurepip --upgrade`)
    expect(result.stdout).toContain(`${fakePython} -m pip install`)
    expect(result.stdout).not.toContain('SHADOWOB_HERMES_PLUGIN_DIR')
  })
})
