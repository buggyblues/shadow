import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseToml } from 'smol-toml'
import { beforeEach, describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'
import { planRuntimeTopology } from '../application/runtime-topology.js'
import type { AgentDeployment, AgentRuntime, CloudConfig } from '../config/schema.js'
import agentPackPlugin from '../plugins/agent-pack/index.js'
import { getPluginRegistry, resetPluginRegistry } from '../plugins/registry.js'
import shadowobPlugin from '../plugins/shadowob/index.js'
import { buildAgentRuntimePackage, buildExecutionUnitRuntimePackage } from './runtime-package.js'

const SHADOW_SERVER_URL = 'https://shadow.example.com'
const SHADOW_TOKEN = 'shadow-secret-token'
const SHADOW_TOKEN_2 = 'shadow-secret-token-2'
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

function multiBuddyCloudConfig(agent: AgentDeployment): CloudConfig {
  return {
    version: '1.0',
    plugins: {
      shadowob: {
        config: {
          buddies: [
            { id: 'buddy-1', name: 'Buddy One' },
            { id: 'buddy-2', name: 'Buddy Two' },
          ],
          bindings: [
            { agentId: agent.id, targetId: 'buddy-1' },
            { agentId: agent.id, targetId: 'buddy-2' },
          ],
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

function multiBuddyRuntimePackageFor(runtime: AgentRuntime) {
  const agent = baseAgent(runtime)
  return buildAgentRuntimePackage({
    agent,
    config: multiBuddyCloudConfig(agent),
    extraEnv: {
      SHADOW_SERVER_URL,
      SHADOW_TOKEN_BUDDY_1: SHADOW_TOKEN,
      SHADOW_TOKEN_BUDDY_2: SHADOW_TOKEN_2,
    },
  })
}

function sharedRuntimeConfig(runtime: AgentRuntime): CloudConfig {
  return {
    version: '1.0',
    plugins: {
      shadowob: {
        config: {
          buddies: [
            { id: 'buddy-reviewer', name: 'Reviewer Buddy' },
            { id: 'buddy-writer', name: 'Writer Buddy' },
          ],
          bindings: [
            { agentId: 'reviewer', targetId: 'buddy-reviewer' },
            { agentId: 'writer', targetId: 'buddy-writer' },
          ],
        },
      },
    },
    deployments: {
      placement: {
        groups: [{ id: 'editorial-team', agentIds: ['reviewer', 'writer'] }],
      },
      agents: [
        {
          id: 'reviewer',
          runtime,
          configuration: {},
          identity: {
            name: 'Reviewer',
            description: 'Reviews drafts.',
            systemPrompt: 'Review every draft for factual accuracy.',
          },
        },
        {
          id: 'writer',
          runtime,
          configuration: {},
          identity: {
            name: 'Writer',
            description: 'Writes drafts.',
            systemPrompt: 'Write concise drafts from the brief.',
          },
        },
      ],
    },
  }
}

function sharedRuntimePackageFor(runtime: AgentRuntime) {
  const config = sharedRuntimeConfig(runtime)
  const topology = planRuntimeTopology(config)
  const unit = topology.executionUnits[0]!
  expect(unit.packageMode).toBe('multi-agent')
  return buildExecutionUnitRuntimePackage({
    unit,
    config,
    extraEnvByAgentId: {
      reviewer: {
        SHADOW_SERVER_URL,
        SHADOW_TOKEN_BUDDY_REVIEWER: SHADOW_TOKEN,
      },
      writer: {
        SHADOW_SERVER_URL,
        SHADOW_TOKEN_BUDDY_WRITER: SHADOW_TOKEN_2,
      },
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

function expectShadowCliInboxRouting(skill: string): void {
  expect(skill).toContain('shadowob inbox list')
  expect(skill).toContain('shadowob inbox enqueue')
  expect(skill).toContain('requirements')
  expect(skill).toContain('outputContract')
  expect(skill).toContain('privacy')
  expect(skill).toContain('not statically bound to one server')
  expect(skill).toContain('current message, Inbox task, or server App command context')
  expect(skill).toContain('prefer Workspace files for shared context and artifacts')
  expect(skill).toContain('Cache Workspace folder and file ids')
  expect(skill).toContain('Upload final artifacts to Workspace first')
  expect(skill).not.toContain('SHADOWOB_SERVER_ID')
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

function expectShadowCliAuthProfiles(files: Record<string, string>, profileIds: string[]): void {
  const raw = files['/home/shadow/.shadowob/shadowob.config.json']
  expect(raw).toBeTypeOf('string')
  const config = JSON.parse(raw ?? '{}') as {
    profiles?: Record<string, { serverUrl?: string; token?: string }>
    currentProfile?: string
  }
  expect(config.currentProfile).toBe(profileIds[0])
  expect(Object.keys(config.profiles ?? {})).toEqual(profileIds)
  for (const profileId of profileIds) {
    const envSuffix = profileId.toUpperCase().replace(/-/g, '_')
    expect(config.profiles?.[profileId]).toEqual({
      serverUrl: '${SHADOW_SERVER_URL}',
      token: `\${SHADOW_TOKEN_${envSuffix}}`,
    })
  }
}

function readSlashCommands(files: Record<string, string>): any[] {
  return JSON.parse(files['/etc/shadowob/slash-commands.json'] ?? '[]') as any[]
}

function expectShadowAppSlashCommandGuidance(commands: any[]): void {
  expect(commands).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: 'create-app',
        dispatch: 'agent',
        packId: 'shadow-app',
      }),
      expect.objectContaining({
        name: 'update-app',
        dispatch: 'agent',
        packId: 'shadow-app',
      }),
    ]),
  )
  const create = commands.find((command) => command.name === 'create-app')
  const update = commands.find((command) => command.name === 'update-app')
  expect(create?.body).toContain('non-blocking background process')
  expect(create?.body).toContain('pnpm start:background')
  expect(create?.body).toContain('Do not leave a foreground server command')
  expect(update?.body).toContain('non-blocking background process')
  expect(update?.body).toContain('pnpm start:background')
  expect(update?.body).toContain('Do not leave a foreground server command')
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
    expect(pkg.configData['SOUL.md']).toContain('shadowob inbox list')
    expect(pkg.configData['SOUL.md']).toContain('shadowob inbox enqueue')
    expect(pkg.configData['SOUL.md']).toContain('not statically bound to one server')
    expect(pkg.configData['SOUL.md']).toContain('do not create ordinary channels as Inbox routes')
    expect(pkg.configData['SOUL.md']).not.toContain('SHADOWOB_SERVER_ID')
    expect(openclawConfig.plugins.entries['openclaw-shadowob'].enabled).toBe(true)
    expect(openclawConfig.skills.load.extraDirs).toContain('/home/shadow/.openclaw/skills')
    const files = runtimeFiles(pkg)
    expect(files['/home/shadow/.openclaw/skills/shadowob/SKILL.md']).toBe(shadowobCliSkill())
    expectShadowCliInboxRouting(files['/home/shadow/.openclaw/skills/shadowob/SKILL.md'] ?? '')
    expect(files['/home/shadow/.openclaw/skills/shadow-server-app/SKILL.md']).toContain(
      'shadowob app discover',
    )
    expect(files['/workspace/.agents/skills/shadow-server-app/SKILL.md']).toContain(
      'shadowob app call',
    )
    expectShadowCliAuth(files)
    const slashCommands = readSlashCommands(files)
    expectShadowAppSlashCommandGuidance(slashCommands)
    expect(slashCommands).toEqual(
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
    expect(pkg.plainEnv.SHADOW_EXPOSURE_CONFIG).toBe('/run/shadow/exposure/desired.json')
    expect(pkg.plainEnv.SHADOW_EXPOSURE_STATUS).toBe('/run/shadow/exposure/status.json')
    expect(JSON.stringify(pkg.configData)).not.toContain(SHADOW_TOKEN)
    expect(pkg.secretData.SHADOW_TOKEN_BUDDY_1).toBe(SHADOW_TOKEN)
  })

  it('routes multiple Shadow buddies to one OpenClaw logical agent', () => {
    const pkg = multiBuddyRuntimePackageFor('openclaw')
    const openclawConfig = JSON.parse(pkg.configData['config.json'] ?? '{}') as any
    const files = runtimeFiles(pkg)

    expect(Object.keys(openclawConfig.channels.shadowob.accounts)).toEqual(['buddy-1', 'buddy-2'])
    expect(openclawConfig.channels.shadowob.accounts['buddy-1'].token).toBe(
      '${env:SHADOW_TOKEN_BUDDY_1}',
    )
    expect(openclawConfig.channels.shadowob.accounts['buddy-2'].token).toBe(
      '${env:SHADOW_TOKEN_BUDDY_2}',
    )
    expect(openclawConfig.bindings).toEqual([
      {
        agentId: 'openclaw-agent',
        type: 'route',
        match: { channel: 'shadowob', accountId: 'buddy-1' },
      },
      {
        agentId: 'openclaw-agent',
        type: 'route',
        match: { channel: 'shadowob', accountId: 'buddy-2' },
      },
    ])
    expectShadowCliAuthProfiles(files, ['buddy-1', 'buddy-2'])
    expect(JSON.stringify(pkg.configData)).not.toContain(SHADOW_TOKEN)
    expect(JSON.stringify(pkg.configData)).not.toContain(SHADOW_TOKEN_2)
    expect(pkg.secretData.SHADOW_TOKEN_BUDDY_1).toBe(SHADOW_TOKEN)
    expect(pkg.secretData.SHADOW_TOKEN_BUDDY_2).toBe(SHADOW_TOKEN_2)
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
    expect(ccConnectConfig).toContain('shadowob app discover')
    expect(ccConnectConfig).toContain('shadowob app call')
    expect(() => parseToml(ccConnectConfig ?? '')).not.toThrow()

    const files = runtimeFiles(pkg)
    expect(files['/workspace/SOUL.md']).toContain('shadowob app discover')
    expect(files['/workspace/.agents/skills/shadowob/SKILL.md']).toBe(shadowobCliSkill())
    expectShadowCliInboxRouting(files['/workspace/.agents/skills/shadowob/SKILL.md'] ?? '')
    expect(files['/workspace/.agents/skills/shadow-server-app/SKILL.md']).toContain(
      'shadowob app call',
    )
    if (runtime === 'claude-code') {
      expect(files['/workspace/.claude/skills/shadow-server-app/SKILL.md']).toContain(
        'shadowob app discover',
      )
    }
    if (runtime === 'codex') {
      expect(files['/home/shadow/.codex/skills/shadow-server-app/SKILL.md']).toContain(
        'shadowob app discover',
      )
    }
    if (runtime === 'opencode') {
      expect(files['/workspace/.opencode/skills/shadow-server-app/SKILL.md']).toContain(
        'shadowob app discover',
      )
    }
    expectShadowCliAuth(files)
    const runtimeExtensions = JSON.parse(pkg.configData['runtime-extensions.json'] ?? '{}')
    expect(runtimeExtensions.openclaw).toBeUndefined()
    expect(files['/home/shadow/.cc-connect/config.toml']).toBe(ccConnectConfig)
    const slashCommands = readSlashCommands(files)
    expectShadowAppSlashCommandGuidance(slashCommands)
    expect(slashCommands).toEqual(
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
    expect(pkg.plainEnv.SHADOW_EXPOSURE_CONFIG).toBe('/run/shadow/exposure/desired.json')
    expect(pkg.plainEnv.SHADOW_EXPOSURE_STATUS).toBe('/run/shadow/exposure/status.json')
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
    const parsedHermesConfig = parseYaml(hermesConfig ?? '') as {
      approvals?: { mode?: string }
    }
    expect(parsedHermesConfig.approvals?.mode).toBe('off')
    expect(files['/home/shadow/.hermes/.env']).toContain('HERMES_YOLO_MODE=true')
    expect(hermesConfig).toContain('shadowob')
    expect(hermesConfig).toContain('${SHADOW_TOKEN_BUDDY_1}')
    expect(Object.keys(files).some((path) => path.includes('/plugins/shadowob/'))).toBe(false)
    expect(files['/home/shadow/.hermes/skills/shadowob/SKILL.md']).toBe(shadowobCliSkill())
    expectShadowCliInboxRouting(files['/home/shadow/.hermes/skills/shadowob/SKILL.md'] ?? '')
    expect(files['/home/shadow/.hermes/skills/shadow-server-app/SKILL.md']).toContain(
      'shadowob app discover',
    )
    expect(files['/workspace/.agents/skills/shadow-server-app/SKILL.md']).toContain(
      'shadowob app call',
    )
    expect(files['/workspace/SOUL.md']).toContain('shadowob app discover')
    expectShadowCliAuth(files)
    const slashCommands = readSlashCommands(files)
    expectShadowAppSlashCommandGuidance(slashCommands)
    expect(slashCommands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'commands',
          dispatch: 'passthrough',
          packId: 'hermes',
          sourcePath:
            'https://github.com/NousResearch/hermes-agent/blob/main/website/docs/reference/slash-commands.md',
        }),
      ]),
    )
    expect(files['/workspace/.agents/skills/shadowob/SKILL.md']).toContain('# Shadow CLI')
    expect(JSON.stringify(pkg.configData)).not.toContain(SHADOW_TOKEN)
    expect(pkg.secretData.SHADOW_TOKEN_BUDDY_1).toBe(SHADOW_TOKEN)
    expect(pkg.plainEnv.SHADOW_EXPOSURE_CONFIG).toBe('/run/shadow/exposure/desired.json')
    expect(pkg.plainEnv.SHADOW_EXPOSURE_STATUS).toBe('/run/shadow/exposure/status.json')
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

  it.each([
    ['claude-code', 'claudecode'],
    ['codex', 'codex'],
    ['opencode', 'opencode'],
  ] as const)('routes multiple Shadow buddies to one cc-connect %s project', (runtime, agentType) => {
    const pkg = multiBuddyRuntimePackageFor(runtime)
    const parsed = parseToml(pkg.configData['cc-connect-config.toml'] ?? '') as any
    const project = parsed.projects[0]
    const files = runtimeFiles(pkg)
    const runtimeDescriptor = JSON.parse(pkg.configData['shadowob-runtime.json'] ?? '{}') as any

    expect(project.name).toBe(`${runtime}-agent`)
    expect(project.agent.type).toBe(agentType)
    expect(project.platforms).toHaveLength(2)
    expect(project.platforms).toEqual([
      expect.objectContaining({
        type: 'shadowob',
        options: expect.objectContaining({
          token: '${SHADOW_TOKEN_BUDDY_1}',
          server_url: '${SHADOW_SERVER_URL}',
        }),
      }),
      expect.objectContaining({
        type: 'shadowob',
        options: expect.objectContaining({
          token: '${SHADOW_TOKEN_BUDDY_2}',
          server_url: '${SHADOW_SERVER_URL}',
        }),
      }),
    ])
    expect(runtimeDescriptor.shadows).toEqual([
      expect.objectContaining({ buddyId: 'buddy-1', tokenEnvKey: 'SHADOW_TOKEN_BUDDY_1' }),
      expect.objectContaining({ buddyId: 'buddy-2', tokenEnvKey: 'SHADOW_TOKEN_BUDDY_2' }),
    ])
    expectShadowCliAuthProfiles(files, ['buddy-1', 'buddy-2'])
    expect(JSON.stringify(pkg.configData)).not.toContain(SHADOW_TOKEN)
    expect(JSON.stringify(pkg.configData)).not.toContain(SHADOW_TOKEN_2)
    expect(pkg.secretData.SHADOW_TOKEN_BUDDY_1).toBe(SHADOW_TOKEN)
    expect(pkg.secretData.SHADOW_TOKEN_BUDDY_2).toBe(SHADOW_TOKEN_2)
  })

  it('documents the current Hermes multi-buddy runtime package boundary', () => {
    const pkg = multiBuddyRuntimePackageFor('hermes')
    const files = runtimeFiles(pkg)
    const hermesConfig = parseYaml(files['/home/shadow/.hermes/config.yaml'] ?? '') as any
    const hermesEnv = files['/home/shadow/.hermes/.env'] ?? ''
    const runtimeDescriptor = JSON.parse(pkg.configData['shadowob-runtime.json'] ?? '{}') as any

    expect(hermesConfig.platforms.shadowob.token).toBe('${SHADOW_TOKEN_BUDDY_1}')
    expect(JSON.stringify(hermesConfig)).not.toContain('SHADOW_TOKEN_BUDDY_2')
    expect(hermesEnv).toContain('SHADOW_TOKEN=${SHADOW_TOKEN_BUDDY_1}')
    expect(hermesEnv).not.toContain('SHADOW_TOKEN_BUDDY_2')
    expect(runtimeDescriptor.shadow).toEqual(
      expect.objectContaining({ buddyId: 'buddy-1', tokenEnvKey: 'SHADOW_TOKEN_BUDDY_1' }),
    )
    expect(runtimeDescriptor.shadows).toBeUndefined()
    expectShadowCliAuthProfiles(files, ['buddy-1', 'buddy-2'])
    expect(pkg.secretData.SHADOW_TOKEN_BUDDY_1).toBe(SHADOW_TOKEN)
    expect(pkg.secretData.SHADOW_TOKEN_BUDDY_2).toBe(SHADOW_TOKEN_2)
  })

  it('builds one shared OpenClaw package with isolated logical agent identity', () => {
    const pkg = sharedRuntimePackageFor('openclaw')
    const openclawConfig = JSON.parse(pkg.configData['config.json'] ?? '{}') as any
    const files = runtimeFiles(pkg)

    expect(openclawConfig.agents.list).toHaveLength(2)
    expect(openclawConfig.agents.list).toEqual([
      expect.objectContaining({
        id: 'reviewer',
        name: 'Reviewer',
        default: true,
        agentDir: '/workspace/.agents/reviewer',
      }),
      expect.objectContaining({
        id: 'writer',
        name: 'Writer',
        default: false,
        agentDir: '/workspace/.agents/writer',
      }),
    ])
    expect(openclawConfig.channels.shadowob.accounts['buddy-reviewer'].token).toBe(
      '${env:SHADOW_TOKEN_BUDDY_REVIEWER}',
    )
    expect(openclawConfig.channels.shadowob.accounts['buddy-writer'].token).toBe(
      '${env:SHADOW_TOKEN_BUDDY_WRITER}',
    )
    expect(openclawConfig.bindings).toEqual([
      {
        agentId: 'reviewer',
        type: 'route',
        match: { channel: 'shadowob', accountId: 'buddy-reviewer' },
      },
      {
        agentId: 'writer',
        type: 'route',
        match: { channel: 'shadowob', accountId: 'buddy-writer' },
      },
    ])
    expect(files['/workspace/.agents/reviewer/SOUL.md']).toContain(
      'Review every draft for factual accuracy.',
    )
    expect(files['/workspace/.agents/writer/SOUL.md']).toContain(
      'Write concise drafts from the brief.',
    )
    expect(pkg.configData['SOUL.md']).toBeUndefined()
    expect(JSON.stringify(pkg.configData)).not.toContain(SHADOW_TOKEN)
    expect(JSON.stringify(pkg.configData)).not.toContain(SHADOW_TOKEN_2)
    expect(pkg.secretData.SHADOW_TOKEN_BUDDY_REVIEWER).toBe(SHADOW_TOKEN)
    expect(pkg.secretData.SHADOW_TOKEN_BUDDY_WRITER).toBe(SHADOW_TOKEN_2)
  })

  it('builds one shared cc-connect package with one project per logical agent', () => {
    const pkg = sharedRuntimePackageFor('codex')
    const parsed = parseToml(pkg.configData['cc-connect-config.toml'] ?? '') as any
    const files = runtimeFiles(pkg)
    const runtimeDescriptor = JSON.parse(pkg.configData['shadowob-runtime.json'] ?? '{}') as any

    expect(parsed.projects).toHaveLength(2)
    expect(parsed.projects.map((project: any) => project.name)).toEqual(['reviewer', 'writer'])
    expect(parsed.projects[0].agent.options.work_dir).toBe('/workspace/.agents/reviewer')
    expect(parsed.projects[0].agent.options.codex_home).toBe(
      '/home/shadow/.codex/profiles/reviewer',
    )
    expect(parsed.projects[1].agent.options.work_dir).toBe('/workspace/.agents/writer')
    expect(parsed.projects[1].agent.options.codex_home).toBe('/home/shadow/.codex/profiles/writer')
    expect(files['/workspace/.agents/reviewer/SOUL.md']).toContain(
      'Review every draft for factual accuracy.',
    )
    expect(files['/workspace/.agents/writer/SOUL.md']).toContain(
      'Write concise drafts from the brief.',
    )
    expect(files['/home/shadow/.codex/profiles/reviewer/config.toml']).toBeTypeOf('string')
    expect(files['/home/shadow/.codex/profiles/writer/config.toml']).toBeTypeOf('string')
    expect(runtimeDescriptor.agents.map((agent: any) => agent.agentId)).toEqual([
      'reviewer',
      'writer',
    ])
    expectShadowCliAuthProfiles(files, ['buddy-reviewer', 'buddy-writer'])
    expect(JSON.stringify(pkg.configData)).not.toContain(SHADOW_TOKEN)
    expect(JSON.stringify(pkg.configData)).not.toContain(SHADOW_TOKEN_2)
  })

  it('builds one shared Hermes package with one profile gateway per logical agent', () => {
    const pkg = sharedRuntimePackageFor('hermes')
    const files = runtimeFiles(pkg)
    const runtimeDescriptor = JSON.parse(pkg.configData['shadowob-runtime.json'] ?? '{}') as any
    const launchManifest = JSON.parse(files['/etc/shadowob/hermes-gateways.json'] ?? '{}') as any
    const reviewerConfig = parseYaml(
      files['/home/shadow/.hermes/profiles/reviewer/config.yaml'] ?? '',
    ) as any
    const writerConfig = parseYaml(
      files['/home/shadow/.hermes/profiles/writer/config.yaml'] ?? '',
    ) as any

    expect(launchManifest.profiles).toEqual([
      expect.objectContaining({
        agentId: 'reviewer',
        profile: 'reviewer',
        home: '/home/shadow/.hermes/profiles/reviewer',
      }),
      expect.objectContaining({
        agentId: 'writer',
        profile: 'writer',
        home: '/home/shadow/.hermes/profiles/writer',
      }),
    ])
    expect(reviewerConfig.terminal.cwd).toBe('/workspace/.agents/reviewer')
    expect(writerConfig.terminal.cwd).toBe('/workspace/.agents/writer')
    expect(files['/home/shadow/.hermes/profiles/reviewer/SOUL.md']).toContain(
      'Review every draft for factual accuracy.',
    )
    expect(files['/home/shadow/.hermes/profiles/writer/SOUL.md']).toContain(
      'Write concise drafts from the brief.',
    )
    expect(runtimeDescriptor.profiles).toHaveLength(2)
    expect(runtimeDescriptor.agents.map((agent: any) => agent.agentId)).toEqual([
      'reviewer',
      'writer',
    ])
    expectShadowCliAuthProfiles(files, ['buddy-reviewer', 'buddy-writer'])
    expect(JSON.stringify(pkg.configData)).not.toContain(SHADOW_TOKEN)
    expect(JSON.stringify(pkg.configData)).not.toContain(SHADOW_TOKEN_2)
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
