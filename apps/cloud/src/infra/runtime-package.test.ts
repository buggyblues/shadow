import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse as parseToml } from 'smol-toml'
import { beforeEach, describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'
import type { AgentDeployment, AgentRuntime, CloudConfig } from '../config/schema.js'
import agentPackPlugin from '../plugins/agent-pack/index.js'
import { getPluginRegistry, resetPluginRegistry } from '../plugins/registry.js'
import shadowobPlugin from '../plugins/shadowob/index.js'
import { buildAgentRuntimePackage } from './runtime-package.js'

const SHADOW_SERVER_URL = 'https://shadow.example.com'
const SHADOW_TOKEN = 'shadow-secret-token'

function registerShadowobOnly(): void {
  resetPluginRegistry()
  getPluginRegistry().register(shadowobPlugin)
}

function baseAgent(runtime: AgentRuntime): AgentDeployment {
  return {
    id: `${runtime}-agent`,
    runtime,
    configuration: {},
    identity: {
      name: `${runtime} Buddy`,
      systemPrompt: `You are the ${runtime} test buddy.`,
    },
  }
}

function cloudConfig(agent: AgentDeployment): CloudConfig {
  return {
    version: '1.0',
    plugins: {
      shadowob: {
        config: {
          buddies: [{ id: 'buddy-1', name: 'Buddy One' }],
          bindings: [{ agentId: agent.id, targetId: 'buddy-1' }],
        },
      },
    },
    deployments: { agents: [agent] },
  }
}

function runtimePackageFor(runtime: AgentRuntime) {
  const agent = baseAgent(runtime)
  return buildAgentRuntimePackage({
    agent,
    config: cloudConfig(agent),
    extraEnv: {
      SHADOW_SERVER_URL,
      SHADOW_TOKEN_BUDDY_1: SHADOW_TOKEN,
    },
  })
}

function runtimeFiles(pkg: ReturnType<typeof buildAgentRuntimePackage>): Record<string, string> {
  const raw = pkg.configData['runtime-files.json']
  expect(raw).toBeTypeOf('string')
  return JSON.parse(raw ?? '{}') as Record<string, string>
}

function shadowobCliSkill(): string {
  return readFileSync(resolve(process.cwd(), '../../skills/shadowob-cli/SKILL.md'), 'utf8')
}

describe('buildAgentRuntimePackage OpenClaw compatibility', () => {
  beforeEach(registerShadowobOnly)

  it('keeps OpenClaw runner on native OpenClaw config and ShadowOB plugin wiring', () => {
    const pkg = runtimePackageFor('openclaw')

    expect(pkg.runtimeKind).toBe('openclaw')
    expect(pkg.configData['config.json']).toBeTypeOf('string')
    expect(pkg.configData['cc-connect-config.toml']).toBeUndefined()
    expect(pkg.openclawConfig).toBeTruthy()

    const openclawConfig = JSON.parse(pkg.configData['config.json'] ?? '{}') as any
    expect(openclawConfig.channels.shadowob.enabled).toBe(true)
    expect(openclawConfig.channels.shadowob.accounts['buddy-1'].token).toBe(
      '${env:SHADOW_TOKEN_BUDDY_1}',
    )
    expect(openclawConfig.plugins.entries['openclaw-shadowob'].enabled).toBe(true)
    expect(openclawConfig.skills.load.extraDirs).toContain('/home/shadow/.openclaw/skills')
    expect(runtimeFiles(pkg)['/home/shadow/.openclaw/skills/shadowob/SKILL.md']).toBe(
      shadowobCliSkill(),
    )
    expect(JSON.stringify(pkg.configData)).not.toContain(SHADOW_TOKEN)
    expect(pkg.secretData.SHADOW_TOKEN_BUDDY_1).toBe(SHADOW_TOKEN)
  })
})

describe('buildAgentRuntimePackage native runner adapters', () => {
  beforeEach(registerShadowobOnly)

  it.each([
    ['claude-code', 'claudecode', '/workspace/.claude/settings.json'],
    ['codex', 'codex', '/home/shadow/.codex/config.toml'],
    ['opencode', 'opencode', '/workspace/opencode.json'],
    ['gemini', 'gemini', '/workspace/.gemini/settings.json'],
  ] as const)('emits cc-connect native package for %s without OpenClaw artifacts', (runtime, agentType, nativeConfigPath) => {
    const pkg = runtimePackageFor(runtime)

    expect(pkg.runtimeKind).toBe('cc-connect')
    expect(pkg.configData['config.json']).toBeUndefined()
    expect(pkg.openclawConfig).toBeUndefined()

    const ccConnectConfig = pkg.configData['cc-connect-config.toml']
    expect(ccConnectConfig).toBeTypeOf('string')
    expect(ccConnectConfig).toContain(`type = "${agentType}"`)
    expect(ccConnectConfig).toContain('type = "shadowob"')
    expect(ccConnectConfig).toContain('token = "${SHADOW_TOKEN_BUDDY_1}"')
    expect(ccConnectConfig).toContain('server_url = "${SHADOW_SERVER_URL}"')
    expect(ccConnectConfig).toContain('slash_commands_path = "${SHADOW_SLASH_COMMANDS_PATH}"')
    expect(() => parseToml(ccConnectConfig ?? '')).not.toThrow()

    const files = runtimeFiles(pkg)
    expect(files['/workspace/.agents/skills/shadowob/SKILL.md']).toBe(shadowobCliSkill())
    const runtimeExtensions = JSON.parse(pkg.configData['runtime-extensions.json'] ?? '{}')
    expect(runtimeExtensions.openclaw).toBeUndefined()
    expect(files['/home/shadow/.cc-connect/config.toml']).toBe(ccConnectConfig)
    expect(files[nativeConfigPath]).toBeTypeOf('string')
    expect(files['/workspace/AGENTS.md']).toContain(`${runtime} Buddy`)
    expect(files['/workspace/.agents/skills/shadowob/SKILL.md']).toContain('# Shadow CLI')
    expect(JSON.stringify(pkg.configData)).not.toContain(SHADOW_TOKEN)
    expect(pkg.secretData.SHADOW_TOKEN_BUDDY_1).toBe(SHADOW_TOKEN)
    expect(pkg.plainEnv.SHADOW_SERVER_URL).toBe(SHADOW_SERVER_URL)
  })

  it('emits Hermes native package without OpenClaw or cc-connect artifacts', () => {
    const pkg = runtimePackageFor('hermes')

    expect(pkg.runtimeKind).toBe('hermes')
    expect(pkg.configData['config.json']).toBeUndefined()
    expect(pkg.configData['cc-connect-config.toml']).toBeUndefined()
    expect(pkg.openclawConfig).toBeUndefined()

    const files = runtimeFiles(pkg)
    const runtimeExtensions = JSON.parse(pkg.configData['runtime-extensions.json'] ?? '{}')
    expect(runtimeExtensions.openclaw).toBeUndefined()
    const hermesConfig = files['/home/shadow/.hermes/config.yaml']
    expect(hermesConfig).toBeTypeOf('string')
    expect(() => parseYaml(hermesConfig ?? '')).not.toThrow()
    expect(hermesConfig).toContain('shadowob')
    expect(hermesConfig).toContain('${SHADOW_TOKEN_BUDDY_1}')
    expect(files['/home/shadow/.hermes/plugins/shadowob/plugin.yaml']).toContain('shadowob')
    expect(files['/home/shadow/.hermes/skills/shadowob/SKILL.md']).toBe(shadowobCliSkill())
    expect(files['/workspace/.agents/skills/shadowob/SKILL.md']).toContain('# Shadow CLI')
    expect(JSON.stringify(pkg.configData)).not.toContain(SHADOW_TOKEN)
    expect(pkg.secretData.SHADOW_TOKEN_BUDDY_1).toBe(SHADOW_TOKEN)
  })

  it('preserves plugin-provided slash command indexes for native runners', () => {
    getPluginRegistry().register(agentPackPlugin)
    const agent = {
      ...baseAgent('codex'),
      use: [
        {
          plugin: 'agent-pack',
          options: {
            packs: [{ id: 'gstack', url: 'https://github.com/garrytan/gstack' }],
          },
        },
      ],
    } as AgentDeployment
    const pkg = buildAgentRuntimePackage({
      agent,
      config: cloudConfig(agent),
      extraEnv: {
        SHADOW_SERVER_URL,
        SHADOW_TOKEN_BUDDY_1: SHADOW_TOKEN,
      },
    })

    expect(pkg.plainEnv.SHADOW_SLASH_COMMANDS_PATH).toBe('/agent-packs/.shadow/slash-commands.json')
    expect(pkg.configData['cc-connect-config.toml']).toContain(
      'slash_commands_path = "${SHADOW_SLASH_COMMANDS_PATH}"',
    )
  })
})
