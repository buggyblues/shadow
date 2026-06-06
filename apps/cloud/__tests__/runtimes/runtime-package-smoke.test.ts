import { readFileSync } from 'node:fs'
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
    const shadowCliSkill = runtimeFiles(pkg.configData)[
      '/home/shadow/.openclaw/skills/shadowob/SKILL.md'
    ]
    expect(shadowCliSkill).toContain('shadowob')
    expectShadowCliInboxRouting(shadowCliSkill)
    expect(pkg.configData['SOUL.md']).toContain('shadowob inbox list')
    expect(pkg.configData['SOUL.md']).toContain('shadowob inbox enqueue')
    expect(pkg.configData['SOUL.md']).toContain('not statically bound to one server')
    expect(pkg.configData['SOUL.md']).not.toContain('SHADOWOB_SERVER_ID')
    expect(JSON.stringify(pkg.configData)).not.toContain(SHADOW_TOKEN)
    expect(pkg.secretData.SHADOW_TOKEN_BUDDY_1).toBe(SHADOW_TOKEN)
  })

  it.each([
    ['claude-code', '/workspace/.claude/settings.json', 'json', 'add-dir'],
    ['codex', '/home/shadow/.codex/config.toml', 'toml', 'permissions'],
    ['opencode', '/workspace/opencode.json', 'json', 'connect'],
  ] as const)('checks cc-connect container files for %s', (runtime, nativePath, parser, commandName) => {
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
    expectShadowCliInboxRouting(files['/workspace/.agents/skills/shadowob/SKILL.md'])
    const slashCommands = JSON.parse(files['/etc/shadowob/slash-commands.json'] ?? '[]') as Array<{
      name: string
      packId: string
      body?: string
    }>
    expect(slashCommands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: commandName,
          packId: runtime,
        }),
      ]),
    )
    expect(slashCommands.find((command) => command.name === commandName)?.body).toContain(
      `/${commandName}`,
    )
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
    expect(Object.keys(files).some((path) => path.includes('/plugins/shadowob/'))).toBe(false)
    expect(files['/home/shadow/.hermes/skills/shadowob/SKILL.md']).toContain('shadowob')
    expectShadowCliInboxRouting(files['/home/shadow/.hermes/skills/shadowob/SKILL.md'])
    expect(files['/home/shadow/.hermes/skills/shadow-server-app/SKILL.md']).toContain(
      'shadowob app discover',
    )
    expect(files['/workspace/.agents/skills/shadow-server-app/SKILL.md']).toContain(
      'shadowob app call',
    )
    expect(files['/home/shadow/.hermes/.env']).toContain('SHADOWOB_TOKEN=${SHADOW_TOKEN_BUDDY_1}')
    expect(files['/home/shadow/.hermes/.env']).toContain('HERMES_YOLO_MODE=true')
    expect(JSON.stringify(pkg.configData)).not.toContain(SHADOW_TOKEN)
    expect(pkg.secretData.SHADOW_TOKEN_BUDDY_1).toBe(SHADOW_TOKEN)
  })

  it.each([
    ['openclaw', 'openclaw'],
    ['hermes', 'hermes'],
    ['codex', 'cc-connect'],
  ] as const)('emits non-destructive template routine seeds for %s', (runtime, runtimeKind) => {
    const subject = agent(runtime)
    const config = configFor(subject)
    config.routines = [
      {
        id: 'daily-brief',
        agentId: subject.id,
        title: 'Daily brief',
        schedule: { cron: '0 9 * * *', timezone: 'Asia/Shanghai' },
        prompt: 'Summarize overnight activity and post it to the team channel.',
      },
    ]
    const shadowobUse = config.use?.find((entry) => entry.plugin === 'shadowob')
    shadowobUse!.options = {
      ...(shadowobUse!.options ?? {}),
      servers: [
        {
          id: 'office',
          name: 'Office',
          channels: [{ id: 'daily', title: 'daily' }],
        },
      ],
      routines: [{ routineId: 'daily-brief', serverId: 'office', channelId: 'daily' }],
    }

    const pkg = buildAgentRuntimePackage({
      agent: subject,
      config,
      extraEnv: {
        SHADOW_SERVER_URL,
        SHADOW_TOKEN_BUDDY_1: SHADOW_TOKEN,
      },
    })
    const files = runtimeFiles(pkg.configData)
    const seed = JSON.parse(files['/etc/shadowob/template-routines.json'] ?? '{}')

    expect(seed.runtime).toBe(runtimeKind)
    expect(seed.syncPolicy).toBe('preserve-runtime-edits')
    expect(seed.routines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'daily-brief',
          agentId: subject.id,
          deliveries: [
            expect.objectContaining({
              pluginId: 'shadowob',
              kind: 'channel',
              target: expect.objectContaining({
                serverEnvKey: 'SHADOW_SERVER_OFFICE',
                channelEnvKey: 'SHADOW_CHANNEL_DAILY',
              }),
            }),
          ],
          sourceHash: expect.any(String),
        }),
      ]),
    )
    if (runtime === 'hermes') {
      const hermesConfig = parseYaml(files['/home/shadow/.hermes/config.yaml'] ?? '') as {
        platforms?: { shadowob?: { extra?: { home_channel?: string } } }
      }
      expect(hermesConfig.platforms?.shadowob?.extra?.home_channel).toBe('${SHADOW_CHANNEL_DAILY}')
    }
    if (runtimeKind === 'cc-connect') {
      const ccConnectConfig = parseToml(files['/home/shadow/.cc-connect/config.toml'] ?? '') as {
        projects?: Array<{ platforms?: Array<{ options?: { channel_ids?: string[] } }> }>
      }
      expect(ccConnectConfig.projects?.[0]?.platforms?.[0]?.options?.channel_ids).toEqual([
        '${SHADOW_CHANNEL_DAILY}',
      ])
    }
  })

  it('packages Code Trainer buddy routine with Server App metadata', () => {
    const config = JSON.parse(
      readFileSync(new URL('../../templates/code-trainer.template.json', import.meta.url), 'utf-8'),
    ) as CloudConfig
    const subject = config.deployments?.agents.find((item) => item.id === 'code-trainer-buddy')
    if (!subject) throw new Error('code-trainer-buddy agent not found')

    const pkg = buildAgentRuntimePackage({
      agent: subject,
      config,
      extraEnv: {
        SHADOW_SERVER_URL,
        SHADOW_TOKEN_CODE_TRAINER_BUDDY: SHADOW_TOKEN,
      },
    })
    const files = runtimeFiles(pkg.configData)
    const seed = JSON.parse(files['/etc/shadowob/template-routines.json'] ?? '{}')
    const runtimeExtensions = JSON.parse(pkg.configData['runtime-extensions.json'] ?? '{}')

    expect(seed.routines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'sync-submissions',
          agentId: 'code-trainer-buddy',
          deliveries: [
            expect.objectContaining({
              pluginId: 'shadowob',
              target: expect.objectContaining({
                accountId: 'code-trainer-buddy',
                channelConfigId: 'code-review',
                channelEnvKey: 'SHADOW_CHANNEL_CODE_REVIEW',
                serverEnvKey: 'SHADOW_SERVER_CODE_TRAINER_SERVER',
              }),
            }),
          ],
        }),
      ]),
    )
    expect(runtimeExtensions.shadowob.accounts[0].serverApps[0]).toMatchObject({
      id: 'code-trainer-app',
      appKeyEnvKey: 'SHADOW_SERVER_APP_KEY_CODE_TRAINER_APP',
      permissions: expect.arrayContaining([
        'trainer.submissions:analyze',
        'trainer.learning:read',
        'trainer.learning:write',
      ]),
    })
  })
})
