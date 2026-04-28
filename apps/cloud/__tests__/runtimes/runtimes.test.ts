/**
 * Tests for the runtime adapter registry and all concrete adapters.
 *
 * Covers:
 * - Registry: registerRuntime, getRuntime, getAllRuntimes, getRuntimeIds
 * - OpenClaw baseline adapter (no ACP)
 * - Claude Code, Codex, Gemini, OpenCode adapters (ACP config)
 */

import { describe, expect, it } from 'vitest'
import type {
  AgentDeployment,
  OpenClawAgentConfig,
  OpenClawConfig,
} from '../../src/config/schema.js'
import { getAllRuntimes, getRuntime, getRuntimeIds } from '../../src/runtimes/index.js'

// Side-effect imports to register all adapters
import '../../src/runtimes/loader.js'

// ─── Test Helpers ─────────────────────────────────────────────────────────────

function makeAgent(overrides: Partial<AgentDeployment> = {}): AgentDeployment {
  return {
    id: 'test-agent',
    name: 'Test Agent',
    runtime: 'claude-code',
    model: { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
    providers: [{ id: 'anthropic', apiKey: '${env:ANTHROPIC_API_KEY}' }],
    ...overrides,
  } as AgentDeployment
}

function emptyOpenClawConfig(): OpenClawConfig {
  return {} as OpenClawConfig
}

function emptyAgentEntry(): OpenClawAgentConfig {
  return { id: 'test-agent', name: 'test-agent' } as OpenClawAgentConfig
}

// ─── Registry Tests ───────────────────────────────────────────────────────────

describe('Runtime Registry', () => {
  it('has all 5 runtimes registered after loader import', () => {
    const ids = getRuntimeIds()
    expect(ids).toContain('openclaw')
    expect(ids).toContain('claude-code')
    expect(ids).toContain('codex')
    expect(ids).toContain('gemini')
    expect(ids).toContain('opencode')
    expect(ids.length).toBeGreaterThanOrEqual(5)
  })

  it('getRuntime returns the correct adapter by ID', () => {
    const adapter = getRuntime('claude-code')
    expect(adapter.id).toBe('claude-code')
    expect(adapter.name).toContain('Claude')
  })

  it('getRuntime throws for unknown ID', () => {
    expect(() => getRuntime('unknown-runtime')).toThrow('Unknown runtime "unknown-runtime"')
  })

  it('getAllRuntimes returns at least 5 adapters', () => {
    const all = getAllRuntimes()
    expect(all.length).toBeGreaterThanOrEqual(5)
    expect(all.every((a) => typeof a.id === 'string')).toBe(true)
  })
})

// ─── OpenClaw Baseline ───────────────────────────────────────────────────────

describe('OpenClaw Adapter', () => {
  const adapter = getRuntime('openclaw')

  it('has correct metadata', () => {
    expect(adapter.id).toBe('openclaw')
    expect(adapter.packages).toEqual([])
    expect(adapter.requiresGit).toBe(false)
  })

  it('uses the current Shadow runner image by default', () => {
    expect(adapter.defaultImage).toBe('ghcr.io/buggyblues/openclaw-runner:latest')
  })

  it('acpRuntime returns null (no ACP harness)', () => {
    expect(adapter.acpRuntime(makeAgent())).toBeNull()
  })

  it('extraEnv returns empty object', () => {
    expect(adapter.extraEnv(makeAgent())).toEqual({})
  })

  it('applyConfig does not set acp config', () => {
    const config = emptyOpenClawConfig()
    const entry = emptyAgentEntry()
    adapter.applyConfig(makeAgent(), entry, config)
    expect(config.acp).toBeUndefined()
  })

  it('applyConfig explicitly disables acpx plugin to prevent spurious backend probes', () => {
    const config = emptyOpenClawConfig()
    const entry = emptyAgentEntry()
    adapter.applyConfig(makeAgent(), entry, config)
    expect(config.plugins?.entries?.acpx?.enabled).toBe(false)
  })
})

// ─── Claude Code ──────────────────────────────────────────────────────────────

describe('Claude Code Adapter', () => {
  const adapter = getRuntime('claude-code')

  it('has correct metadata', () => {
    expect(adapter.id).toBe('claude-code')
    expect(adapter.packages).toContain('@anthropic-ai/claude-code')
    expect(adapter.requiresGit).toBe(true)
  })

  it('acpRuntime returns claude ACP config', () => {
    const acp = adapter.acpRuntime(makeAgent())
    expect(acp).not.toBeNull()
    expect(acp!.agent).toBe('claude')
    expect(acp!.backend).toBe('acpx')
    expect(acp!.mode).toBe('persistent')
    expect(acp!.cwd).toBe('/workspace')
  })

  it('applyConfig enables ACP and ACPX plugin', () => {
    const config = emptyOpenClawConfig()
    const entry = emptyAgentEntry()
    adapter.applyConfig(makeAgent({ id: 'my-agent' }), entry, config)

    // ACP is enabled
    expect(config.acp?.enabled).toBe(true)
    expect(config.acp?.backend).toBe('acpx')
    expect(config.acp?.defaultAgent).toBe('my-agent')
    expect(config.acp?.allowedAgents).toContain('my-agent')

    // ACPX plugin is enabled
    expect(config.plugins?.entries?.acpx?.enabled).toBe(true)

    // Agent entry has runtime set
    expect(entry.runtime).toEqual({
      type: 'acp',
      acp: { agent: 'claude', backend: 'acpx', mode: 'persistent', cwd: '/workspace' },
    })
  })

  it('applyConfig preserves existing ACP overrides on agent entry', () => {
    const config = emptyOpenClawConfig()
    const entry = emptyAgentEntry()
    entry.runtime = { acp: { cwd: '/custom' } } as any
    adapter.applyConfig(makeAgent(), entry, config)

    expect(entry.runtime?.acp?.cwd).toBe('/custom')
    expect(entry.runtime?.acp?.agent).toBe('claude')
  })

  it('extraEnv returns empty', () => {
    expect(adapter.extraEnv(makeAgent())).toEqual({})
  })
})

// ─── Codex ────────────────────────────────────────────────────────────────────

describe('Codex Adapter', () => {
  const adapter = getRuntime('codex')

  it('has correct metadata', () => {
    expect(adapter.id).toBe('codex')
    expect(adapter.packages).toContain('@openai/codex')
    expect(adapter.requiresGit).toBe(true)
  })

  it('acpRuntime returns codex ACP config', () => {
    const acp = adapter.acpRuntime(makeAgent())
    expect(acp).not.toBeNull()
    expect(acp!.agent).toBe('codex')
    expect(acp!.backend).toBe('acpx')
  })

  it('applyConfig sets maxConcurrentSessions to 4', () => {
    const config = emptyOpenClawConfig()
    adapter.applyConfig(makeAgent(), emptyAgentEntry(), config)
    expect(config.acp?.maxConcurrentSessions).toBe(4)
  })
})

// ─── Gemini ───────────────────────────────────────────────────────────────────

describe('Gemini Adapter', () => {
  const adapter = getRuntime('gemini')

  it('has correct metadata', () => {
    expect(adapter.id).toBe('gemini')
    expect(adapter.packages).toContain('@google/gemini-cli')
    expect(adapter.requiresGit).toBe(false) // Gemini doesn't require git
  })

  it('acpRuntime returns gemini ACP config', () => {
    const acp = adapter.acpRuntime(makeAgent())
    expect(acp).not.toBeNull()
    expect(acp!.agent).toBe('gemini')
    expect(acp!.backend).toBe('acpx')
  })

  it('applyConfig sets maxConcurrentSessions to 8', () => {
    const config = emptyOpenClawConfig()
    adapter.applyConfig(makeAgent(), emptyAgentEntry(), config)
    expect(config.acp?.maxConcurrentSessions).toBe(8)
  })
})

// ─── OpenCode ─────────────────────────────────────────────────────────────────

describe('OpenCode Adapter', () => {
  const adapter = getRuntime('opencode')

  it('has correct metadata', () => {
    expect(adapter.id).toBe('opencode')
    expect(adapter.packages).toContain('opencode-ai')
    expect(adapter.requiresGit).toBe(true)
  })

  it('acpRuntime returns opencode ACP config', () => {
    const acp = adapter.acpRuntime(makeAgent())
    expect(acp).not.toBeNull()
    expect(acp!.agent).toBe('opencode')
    expect(acp!.backend).toBe('acpx')
  })

  it('applyConfig sets maxConcurrentSessions to 4', () => {
    const config = emptyOpenClawConfig()
    adapter.applyConfig(makeAgent(), emptyAgentEntry(), config)
    expect(config.acp?.maxConcurrentSessions).toBe(4)
  })
})

// ─── Cross-adapter Contracts ──────────────────────────────────────────────────

describe('All ACP Adapters (cross-cutting)', () => {
  const acpIds = ['claude-code', 'codex', 'gemini', 'opencode']

  for (const id of acpIds) {
    describe(`${id}`, () => {
      const adapter = getRuntime(id)
      const agent = makeAgent({ id: 'cross-test', runtime: id as any })

      it('acpRuntime returns non-null with correct shape', () => {
        const acp = adapter.acpRuntime(agent)
        expect(acp).not.toBeNull()
        expect(acp).toHaveProperty('agent')
        expect(acp).toHaveProperty('backend', 'acpx')
        expect(acp).toHaveProperty('mode', 'persistent')
        expect(acp).toHaveProperty('cwd', '/workspace')
      })

      it('applyConfig enables ACP + ACPX plugin', () => {
        const config = emptyOpenClawConfig()
        const entry = emptyAgentEntry()
        adapter.applyConfig(agent, entry, config)

        expect(config.acp?.enabled).toBe(true)
        expect(config.plugins?.entries?.acpx?.enabled).toBe(true)
        expect(entry.runtime?.type).toBe('acp')
      })

      it('defaultImage is a valid image reference', () => {
        expect(adapter.defaultImage).toMatch(/^[\w./-]+:\w+/)
      })
    })
  }
})
