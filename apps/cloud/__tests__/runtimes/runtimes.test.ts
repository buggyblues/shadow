import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import '../../src/runtimes/loader.js'
import { getAllRuntimes, getRuntime, getRuntimeIds } from '../../src/runtimes/index.js'

const EXPECTED_RUNTIMES = ['openclaw', 'claude-code', 'codex', 'gemini', 'opencode', 'hermes']
const RUNNER_DOCKERFILES = [
  'openclaw-runner',
  'claude-runner',
  'codex-runner',
  'gemini-runner',
  'opencode-runner',
  'hermes-runner',
]

describe('Runtime registry', () => {
  it('registers all phase-1 runtimes', () => {
    expect(getRuntimeIds()).toEqual(expect.arrayContaining(EXPECTED_RUNTIMES))
  })

  it('returns runtime adapters by ID', () => {
    const adapter = getRuntime('claude-code')
    expect(adapter).toMatchObject({
      id: 'claude-code',
      name: expect.stringContaining('Claude'),
      runtimeKind: 'cc-connect',
      defaultImage: 'ghcr.io/buggyblues/claude-runner:latest',
    })
  })

  it('throws for unknown runtime IDs', () => {
    expect(() => getRuntime('unknown-runtime')).toThrow('Unknown runtime "unknown-runtime"')
  })

  it('does not expose no-op OpenClaw adapter hooks on native runtimes', () => {
    for (const adapter of getAllRuntimes()) {
      const shape = adapter as unknown as Record<string, unknown>
      expect(shape.acpRuntime).toBeUndefined()
      expect(shape.applyConfig).toBeUndefined()
      expect(shape.extraEnv).toBeUndefined()
      expect(shape.packages).toBeUndefined()
      expect(shape.requiresGit).toBeUndefined()
      expect(typeof adapter.buildPackage).toBe('function')
    }
  })
})

describe('Runtime container layout', () => {
  it('keeps OpenClaw on its gateway health port and state path', () => {
    const adapter = getRuntime('openclaw')
    expect(adapter.runtimeKind).toBe('openclaw')
    expect(adapter.defaultImage).toBe('ghcr.io/buggyblues/openclaw-runner:latest')
    expect(adapter.container.healthPort).toBe(3102)
    expect(adapter.container.statePath).toBe('/home/shadow/.openclaw')
    expect(adapter.container.logPath).toBe('/var/log/openclaw')
    expect(adapter.container.env).toEqual(
      expect.arrayContaining([
        { name: 'OPENCLAW_HEALTH_PORT', value: '3102' },
        { name: 'OPENCLAW_GATEWAY_PORT', value: '3101' },
      ]),
    )
  })

  it.each([
    ['claude-code', 'cc-connect', '/home/shadow/.cc-connect'],
    ['codex', 'cc-connect', '/home/shadow/.cc-connect'],
    ['gemini', 'cc-connect', '/home/shadow/.cc-connect'],
    ['opencode', 'cc-connect', '/home/shadow/.cc-connect'],
    ['hermes', 'hermes', '/home/shadow/.hermes'],
  ] as const)('defines native container layout for %s', (id, kind, statePath) => {
    const adapter = getRuntime(id)
    expect(adapter.runtimeKind).toBe(kind)
    expect(adapter.container.healthPort).toBe(3100)
    expect(adapter.container.statePath).toBe(statePath)
    expect(adapter.container.logPath).toBe('/var/log/shadowob')
    expect(adapter.container.env).toEqual(
      expect.arrayContaining([
        { name: 'SHADOW_RUNNER_HEALTH_PORT', value: '3100' },
        { name: 'SHADOW_RUNNER_CONFIG_MOUNT', value: '/etc/openclaw' },
        { name: 'SHADOW_RUNNER_LOG_DIR', value: '/var/log/shadowob' },
      ]),
    )
  })
})

describe('Runner Dockerfile layout', () => {
  it.each(
    RUNNER_DOCKERFILES,
  )('%s runtime stage keeps /workspace writable for materialized runtime files', (runnerDir) => {
    const dockerfile = readFileSync(
      resolve(process.cwd(), `images/${runnerDir}/Dockerfile`),
      'utf8',
    )
    const runnerStageMatch = /\nFROM [^\n]+ AS runner\n/.exec(`\n${dockerfile}`)
    const runnerStage = dockerfile.slice(Math.max((runnerStageMatch?.index ?? 0) - 1, 0))

    expect(runnerStage).toMatch(/mkdir -p[\s\S]*\/workspace/)
    expect(runnerStage).toMatch(/chown -R [^\n]*[\s\S]*\/workspace/)
    expect(runnerStage).toMatch(/USER shadow/)
  })
})
