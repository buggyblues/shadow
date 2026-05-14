import { parse as parseToml } from 'smol-toml'
import { beforeEach, describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'
import type { AgentDeployment, AgentRuntime, CloudConfig } from '../../src/config/schema.js'
import { buildAgentRuntimePackage } from '../../src/infra/runtime-package.js'
import githubPlugin from '../../src/plugins/github/index.js'
import { getPluginRegistry, resetPluginRegistry } from '../../src/plugins/registry.js'
import shadowobPlugin from '../../src/plugins/shadowob/index.js'

const SHADOW_SERVER_URL = 'http://shadow.local'
const SHADOW_TOKEN = 'shadow-token-for-smoke'

function registerShadowobOnly(): void {
  resetPluginRegistry()
  getPluginRegistry().register(shadowobPlugin)
}

function registerShadowobAndGithub(): void {
  resetPluginRegistry()
  getPluginRegistry().register(shadowobPlugin)
  getPluginRegistry().register(githubPlugin)
}

function agent(runtime: AgentRuntime): AgentDeployment {
  return {
    id: `${runtime}-smoke`,
    runtime,
    identity: {
      name: `${runtime} smoke`,
      systemPrompt: 'Smoke test prompt.',
    },
    configuration: {},
  }
}

function configFor(subject: AgentDeployment): CloudConfig {
  return {
    version: '1',
    use: [
      {
        plugin: 'shadowob',
        options: {
          buddies: [{ id: 'buddy-1', name: 'Buddy One' }],
          bindings: [{ agentId: subject.id, targetId: 'buddy-1' }],
        },
      },
    ],
    deployments: { agents: [subject] },
  }
}

function runtimeFiles(configData: Record<string, string>): Record<string, string> {
  return JSON.parse(configData['runtime-files.json'] ?? '{}') as Record<string, string>
}

describe('runner runtime package smoke checks', () => {
  beforeEach(registerShadowobOnly)

  it('keeps OpenClaw container config parseable and plugin-scoped', () => {
    const subject = agent('openclaw')
    const pkg = buildAgentRuntimePackage({
      agent: subject,
      config: configFor(subject),
      extraEnv: {
        SHADOW_SERVER_URL,
        SHADOW_TOKEN_BUDDY_1: SHADOW_TOKEN,
      },
    })

    expect(pkg.runtimeKind).toBe('openclaw')
    const openclawConfig = JSON.parse(pkg.configData['config.json'] ?? '{}')
    expect(openclawConfig.channels.shadowob.accounts['buddy-1'].serverUrl).toBe(
      '${env:SHADOW_SERVER_URL}',
    )
    expect(openclawConfig.plugins.entries['openclaw-shadowob'].enabled).toBe(true)
    expect(openclawConfig.skills.load.extraDirs).toContain('/home/shadow/.openclaw/skills')
    expect(
      runtimeFiles(pkg.configData)['/home/shadow/.openclaw/skills/shadowob/SKILL.md'],
    ).toContain('shadowob')
    expect(JSON.stringify(pkg.configData)).not.toContain(SHADOW_TOKEN)
    expect(pkg.secretData.SHADOW_TOKEN_BUDDY_1).toBe(SHADOW_TOKEN)
  })

  it.each([
    ['claude-code', '/workspace/.claude/settings.json', 'json'],
    ['codex', '/home/shadow/.codex/config.toml', 'toml'],
    ['opencode', '/workspace/opencode.json', 'json'],
    ['gemini', '/workspace/.gemini/settings.json', 'json'],
  ] as const)('checks cc-connect container files for %s', (runtime, nativePath, parser) => {
    const subject = agent(runtime)
    const pkg = buildAgentRuntimePackage({
      agent: subject,
      config: configFor(subject),
      extraEnv: {
        SHADOW_SERVER_URL,
        SHADOW_TOKEN_BUDDY_1: SHADOW_TOKEN,
      },
    })
    const files = runtimeFiles(pkg.configData)

    expect(pkg.runtimeKind).toBe('cc-connect')
    expect(pkg.configData['config.json']).toBeUndefined()
    expect(JSON.parse(pkg.configData['runtime-extensions.json'] ?? '{}').openclaw).toBeUndefined()
    expect(() => parseToml(files['/home/shadow/.cc-connect/config.toml'] ?? '')).not.toThrow()
    expect(files['/workspace/AGENTS.md']).toContain(`${runtime} smoke`)
    expect(files['/workspace/.agents/skills/shadowob/SKILL.md']).toContain('shadowob')
    expect(files['/etc/shadowob/slash-commands.json']).toBe('[]\n')
    if (parser === 'toml') {
      expect(() => parseToml(files[nativePath] ?? '')).not.toThrow()
    } else {
      expect(() => JSON.parse(files[nativePath] ?? '')).not.toThrow()
    }
    expect(JSON.stringify(pkg.configData)).not.toContain(SHADOW_TOKEN)
    expect(pkg.secretData.SHADOW_TOKEN_BUDDY_1).toBe(SHADOW_TOKEN)
  })

  it.each([
    ['claude-code', '/workspace/.mcp.json', 'json'],
    ['codex', '/home/shadow/.codex/config.toml', 'toml'],
    ['opencode', '/workspace/opencode.json', 'json'],
    ['gemini', '/workspace/.gemini/settings.json', 'json'],
    ['hermes', '/home/shadow/.hermes/config.yaml', 'yaml'],
  ] as const)('emits plugin MCP config in native format for %s', (runtime, nativePath, parser) => {
    registerShadowobAndGithub()
    const subject = agent(runtime)
    const config = configFor(subject)
    config.use?.push({ plugin: 'github' })
    const pkg = buildAgentRuntimePackage({
      agent: subject,
      config,
      extraEnv: {
        SHADOW_SERVER_URL,
        SHADOW_TOKEN_BUDDY_1: SHADOW_TOKEN,
        GITHUB_PERSONAL_ACCESS_TOKEN: 'github-token-for-smoke',
      },
    })
    const files = runtimeFiles(pkg.configData)
    const serverName = 'modelcontextprotocol-server-github'

    if (parser === 'toml') {
      const parsed = parseToml(files[nativePath] ?? '') as {
        mcp_servers?: Record<string, { env?: Record<string, string> }>
      }
      expect(parsed.mcp_servers?.[serverName]?.env?.GITHUB_PERSONAL_ACCESS_TOKEN).toBe(
        '${GITHUB_PERSONAL_ACCESS_TOKEN}',
      )
    } else if (parser === 'yaml') {
      const parsed = parseYaml(files[nativePath] ?? '') as {
        mcp_servers?: Record<string, { env?: Record<string, string> }>
      }
      expect(parsed.mcp_servers?.[serverName]?.env?.GITHUB_PERSONAL_ACCESS_TOKEN).toBe(
        '${GITHUB_PERSONAL_ACCESS_TOKEN}',
      )
    } else {
      const parsed = JSON.parse(files[nativePath] ?? '{}')
      const servers = parsed.mcpServers ?? parsed.mcp
      expect(servers?.[serverName]).toBeDefined()
      expect(JSON.stringify(servers?.[serverName])).toContain('${GITHUB_PERSONAL_ACCESS_TOKEN}')
    }
    expect(JSON.stringify(pkg.configData)).not.toContain('github-token-for-smoke')
  })

  it('checks Hermes container files and plugin injection', () => {
    const subject = agent('hermes')
    const pkg = buildAgentRuntimePackage({
      agent: subject,
      config: configFor(subject),
      extraEnv: {
        SHADOW_SERVER_URL,
        SHADOW_TOKEN_BUDDY_1: SHADOW_TOKEN,
      },
    })
    const files = runtimeFiles(pkg.configData)

    expect(pkg.runtimeKind).toBe('hermes')
    expect(pkg.configData['config.json']).toBeUndefined()
    expect(JSON.parse(pkg.configData['runtime-extensions.json'] ?? '{}').openclaw).toBeUndefined()
    expect(() => parseYaml(files['/home/shadow/.hermes/config.yaml'] ?? '')).not.toThrow()
    expect(files['/home/shadow/.hermes/plugins/shadowob/adapter.py']).toContain('Shadow')
    expect(files['/home/shadow/.hermes/skills/shadowob/SKILL.md']).toContain('shadowob')
    expect(JSON.stringify(pkg.configData)).not.toContain(SHADOW_TOKEN)
    expect(pkg.secretData.SHADOW_TOKEN_BUDDY_1).toBe(SHADOW_TOKEN)
  })
})
