import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
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
const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT_SKILL_PATH = resolve(HERE, '../../../../skills/shadowob-cli/SKILL.md')

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
  return readFileSync(ROOT_SKILL_PATH, 'utf8')
}

function expectShadowCliAuth(files: Record<string, string>): void {
  const raw = files['/home/shadow/.shadowob/shadowob.config.json']
  expect(raw).toBeTypeOf('string')
  const config = JSON.parse(raw ?? '{}') as {
    profiles?: Record<string, { serverUrl?: string; token?: string }>
    currentProfile?: string
  }
  expect(config.currentProfile).toBe('buddy-1')
  expect(config.profiles?.['buddy-1']).toEqual({
    serverUrl: '${SHADOW_SERVER_URL}',
    token: '${SHADOW_TOKEN_BUDDY_1}',
  })
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
    const files = runtimeFiles(pkg)
    expect(files['/home/shadow/.openclaw/skills/shadowob/SKILL.md']).toBe(shadowobCliSkill())
    expectShadowCliAuth(files)
    expect(JSON.parse(files['/etc/shadowob/slash-commands.json'] ?? '[]')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'help',
          dispatch: 'passthrough',
          sourcePath: 'https://docs.openclaw.ai/tools/slash-commands',
        }),
        expect.objectContaining({
          name: 'model',
          dispatch: 'passthrough',
        }),
      ]),
    )
    expect(pkg.plainEnv.SHADOW_SLASH_COMMANDS_PATH).toBe('/etc/shadowob/slash-commands.json')
    expect(JSON.stringify(pkg.configData)).not.toContain(SHADOW_TOKEN)
    expect(pkg.secretData.SHADOW_TOKEN_BUDDY_1).toBe(SHADOW_TOKEN)
  })
})

describe('buildAgentRuntimePackage native runner adapters', () => {
  beforeEach(registerShadowobOnly)

  it.each([
    ['claude-code', 'claudecode', '/workspace/.claude/settings.json', 'review'],
    ['codex', 'codex', '/home/shadow/.codex/config.toml', 'init'],
    ['opencode', 'opencode', '/workspace/opencode.json', 'connect'],
  ] as const)('emits cc-connect native package for %s without OpenClaw artifacts', (runtime, agentType, nativeConfigPath, commandName) => {
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
    expectShadowCliAuth(files)
    const runtimeExtensions = JSON.parse(pkg.configData['runtime-extensions.json'] ?? '{}')
    expect(runtimeExtensions.openclaw).toBeUndefined()
    expect(files['/home/shadow/.cc-connect/config.toml']).toBe(ccConnectConfig)
    expect(JSON.parse(files['/etc/shadowob/slash-commands.json'] ?? '[]')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: commandName,
          packId: runtime,
        }),
      ]),
    )
    expect(files[nativeConfigPath]).toBeTypeOf('string')
    expect(files['/workspace/AGENTS.md']).toContain(`${runtime} Buddy`)
    expect(files['/workspace/.agents/skills/shadowob/SKILL.md']).toContain('# Shadow CLI')
    expect(JSON.stringify(pkg.configData)).not.toContain(SHADOW_TOKEN)
    expect(pkg.secretData.SHADOW_TOKEN_BUDDY_1).toBe(SHADOW_TOKEN)
    expect(pkg.plainEnv.SHADOW_SERVER_URL).toBe(SHADOW_SERVER_URL)
  })

  it.each([
    [
      'claude-code',
      'claudecode',
      'ANTHROPIC_COMPATIBLE_BASE_URL',
      'ANTHROPIC_COMPATIBLE_API_KEY',
      'ANTHROPIC_COMPATIBLE_MODEL_ID',
    ],
    [
      'opencode',
      'opencode',
      'OPENAI_COMPATIBLE_BASE_URL',
      'OPENAI_COMPATIBLE_API_KEY',
      'OPENAI_COMPATIBLE_MODEL_ID',
    ],
  ] as const)('injects the official provider into %s using the expected API style', (runtime, agentType, expectedBaseUrlEnv, expectedApiKeyEnv, expectedModelEnv) => {
    const agent = baseAgent(runtime)
    const pkg = buildAgentRuntimePackage({
      agent,
      config: cloudConfig(agent),
      extraEnv: {
        SHADOW_SERVER_URL,
        SHADOW_TOKEN_BUDDY_1: SHADOW_TOKEN,
        SHADOW_MODEL_PROVIDER_ID: 'shadow-official',
        OPENAI_COMPATIBLE_BASE_URL: 'https://shadow.example.com/api/ai/v1',
        OPENAI_COMPATIBLE_API_KEY: 'official-openai-token',
        OPENAI_COMPATIBLE_MODEL_ID: 'deepseek-v4-flash',
        ANTHROPIC_COMPATIBLE_BASE_URL: 'https://shadow.example.com/api/ai/anthropic',
        ANTHROPIC_COMPATIBLE_API_KEY: 'official-anthropic-token',
        ANTHROPIC_COMPATIBLE_MODEL_ID: 'deepseek-v4-flash',
      },
    })

    const parsed = parseToml(pkg.configData['cc-connect-config.toml'] ?? '') as any
    const project = parsed.projects[0]
    const expectedModel =
      runtime === 'opencode' ? `shadow-official/\${${expectedModelEnv}}` : `\${${expectedModelEnv}}`
    expect(project.agent.type).toBe(agentType)
    expect(project.agent.options.provider).toBe('shadow-official')
    expect(project.agent.options.model).toBe(expectedModel)
    expect(project.agent.providers[0].name).toBe('shadow-official')
    expect(project.agent.providers[0].base_url).toBe(`\${${expectedBaseUrlEnv}}`)
    expect(project.agent.providers[0].api_key).toBe(`\${${expectedApiKeyEnv}}`)
    expect(project.agent.providers[0].models[0].model).toBe(expectedModel)
    if (runtime === 'opencode') {
      const files = runtimeFiles(pkg)
      const opencodeConfig = JSON.parse(files['/workspace/opencode.json'] ?? '{}')
      expect(opencodeConfig.model).toBe('shadow-official/${OPENAI_COMPATIBLE_MODEL_ID}')
      expect(opencodeConfig.provider['shadow-official']).toEqual({
        npm: '@ai-sdk/openai-compatible',
        name: 'Shadow official LLM proxy',
        options: {
          baseURL: '${OPENAI_COMPATIBLE_BASE_URL}',
          apiKey: '{env:OPENAI_COMPATIBLE_API_KEY}',
        },
        models: {
          '${OPENAI_COMPATIBLE_MODEL_ID}': {
            name: '${OPENAI_COMPATIBLE_MODEL_ID}',
          },
        },
      })
    }
    expect(JSON.stringify(pkg.configData)).not.toContain('official-openai-token')
    expect(JSON.stringify(pkg.configData)).not.toContain('official-anthropic-token')
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
    expect(Object.keys(files).some((path) => path.includes('/plugins/shadowob/'))).toBe(false)
    expect(files['/home/shadow/.hermes/skills/shadowob/SKILL.md']).toBe(shadowobCliSkill())
    expectShadowCliAuth(files)
    expect(JSON.parse(files['/etc/shadowob/slash-commands.json'] ?? '[]')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'commands',
          packId: 'hermes',
          sourcePath:
            'https://github.com/NousResearch/hermes-agent/blob/main/website/docs/reference/slash-commands.md',
        }),
      ]),
    )
    expect(files['/workspace/.agents/skills/shadowob/SKILL.md']).toContain('# Shadow CLI')
    expect(JSON.stringify(pkg.configData)).not.toContain(SHADOW_TOKEN)
    expect(pkg.secretData.SHADOW_TOKEN_BUDDY_1).toBe(SHADOW_TOKEN)
  })

  it('injects the official OpenAI-compatible model proxy into Hermes native config', () => {
    const agent = baseAgent('hermes')
    const pkg = buildAgentRuntimePackage({
      agent,
      config: cloudConfig(agent),
      extraEnv: {
        SHADOW_SERVER_URL,
        SHADOW_TOKEN_BUDDY_1: SHADOW_TOKEN,
        OPENAI_COMPATIBLE_BASE_URL: 'https://shadow.example.com/api/ai/v1',
        OPENAI_COMPATIBLE_API_KEY: 'official-proxy-token',
      },
    })

    const files = runtimeFiles(pkg)
    const hermesConfig = parseYaml(files['/home/shadow/.hermes/config.yaml'] ?? '') as any
    const hermesEnv = files['/home/shadow/.hermes/.env'] ?? ''

    expect(hermesConfig.model).toEqual({ default: 'default', provider: 'shadow-official' })
    expect(hermesConfig.custom_providers).toEqual([
      {
        name: 'shadow-official',
        base_url: '${OPENAI_COMPATIBLE_BASE_URL}',
        key_env: 'OPENAI_COMPATIBLE_API_KEY',
        model: 'default',
      },
    ])
    expect(hermesEnv).toContain('OPENAI_COMPATIBLE_BASE_URL=${OPENAI_COMPATIBLE_BASE_URL}')
    expect(hermesEnv).toContain('OPENAI_COMPATIBLE_API_KEY=${OPENAI_COMPATIBLE_API_KEY}')
    expect(JSON.stringify(pkg.configData)).not.toContain('official-proxy-token')
    expect(pkg.plainEnv.OPENAI_COMPATIBLE_BASE_URL).toBe('https://shadow.example.com/api/ai/v1')
    expect(pkg.secretData.OPENAI_COMPATIBLE_API_KEY).toBe('official-proxy-token')
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

    expect(pkg.plainEnv.SHADOW_SLASH_COMMANDS_PATH).toBe('/etc/shadowob/slash-commands.json')
    const runtimeExtensions = JSON.parse(pkg.configData['runtime-extensions.json'] ?? '{}')
    expect(runtimeExtensions.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'shadow.slashCommands',
          path: '/agent-packs/.shadow/slash-commands.json',
        }),
      ]),
    )
    expect(pkg.configData['cc-connect-config.toml']).toContain(
      'slash_commands_path = "${SHADOW_SLASH_COMMANDS_PATH}"',
    )
  })
})
