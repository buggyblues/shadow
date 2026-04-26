import { beforeAll, describe, expect, it } from 'vitest'

import {
  buildOpenClawConfig,
  deepMerge,
  expandExtends,
  resolveConfig,
} from '../../src/config/parser.js'
import type { AgentConfiguration, CloudConfig, Configuration } from '../../src/config/schema.js'
import { loadAllPlugins } from '../../src/plugins/loader.js'
import { getPluginRegistry, resetPluginRegistry } from '../../src/plugins/registry.js'

beforeAll(async () => {
  resetPluginRegistry()
  await loadAllPlugins(getPluginRegistry())
})

describe('parser', () => {
  describe('deepMerge', () => {
    it('should merge flat objects', () => {
      const result = deepMerge<Record<string, unknown>>({ a: 1, b: 2 }, { b: 3, c: 4 })
      expect(result).toEqual({ a: 1, b: 3, c: 4 })
    })

    it('should recursively merge nested objects', () => {
      const base: Record<string, unknown> = { nested: { a: 1, b: 2 } }
      const override: Record<string, unknown> = { nested: { b: 3 } }
      const result = deepMerge(base, override)
      expect(result).toEqual({ nested: { a: 1, b: 3 } })
    })

    it('should replace arrays entirely', () => {
      const base = { arr: [1, 2, 3] }
      const override = { arr: [4, 5] }
      const result = deepMerge(base, override)
      expect(result).toEqual({ arr: [4, 5] })
    })

    it('should not modify original objects', () => {
      const base: Record<string, unknown> = { a: 1, nested: { x: 1 } }
      const override: Record<string, unknown> = { nested: { y: 2 } }
      deepMerge(base, override)
      expect(base).toEqual({ a: 1, nested: { x: 1 } })
    })
  })

  describe('expandExtends', () => {
    const configurations: Configuration[] = [
      {
        id: 'base-config',
        openclaw: {
          agents: {
            defaults: { workspace: '/workspace' },
          },
          tools: { allow: ['search'] },
        },
      },
    ]

    it('should return config unchanged if no extends', () => {
      const agentConfig: AgentConfiguration = {
        openclaw: {
          agents: {
            list: [{ id: 'agent-1', systemPrompt: 'Custom prompt' }],
          },
        },
      }
      const result = expandExtends(agentConfig, configurations)
      expect(result).toBe(agentConfig)
    })

    it('should merge with base configuration', () => {
      const agentConfig: AgentConfiguration = {
        extends: 'base-config',
        openclaw: {
          agents: {
            list: [{ id: 'agent-1', systemPrompt: 'Override prompt' }],
          },
        },
      }
      const result = expandExtends(agentConfig, configurations)
      expect(result.openclaw?.agents?.list?.[0]?.systemPrompt).toBe('Override prompt')
      expect(result.openclaw?.tools?.allow).toEqual(['search'])
      expect(result.extends).toBeUndefined()
    })

    it('should throw for missing configuration reference', () => {
      const agentConfig: AgentConfiguration = {
        extends: 'nonexistent',
      }
      expect(() => expandExtends(agentConfig, configurations)).toThrow(
        'Configuration "nonexistent" not found',
      )
    })
  })

  describe('buildOpenClawConfig', () => {
    it('should build config with shadowob channel bindings', () => {
      const config: CloudConfig = {
        version: '1',
        use: [
          {
            plugin: 'shadowob',
            options: {
              servers: [{ id: 'srv1', name: 'Test Server' }],
              buddies: [{ id: 'bot-1', name: 'Bot One' }],
              bindings: [
                {
                  targetId: 'bot-1',
                  targetType: 'buddy',
                  servers: ['srv1'],
                  channels: ['ch1'],
                  agentId: 'agent-1',
                },
              ],
            },
          },
        ],
        deployments: {
          agents: [
            {
              id: 'agent-1',
              runtime: 'openclaw',
              configuration: {
                openclaw: {
                  agents: {
                    list: [{ id: 'agent-1', systemPrompt: 'Hello' }],
                  },
                },
              },
            },
          ],
        },
      }

      const agent = config.deployments!.agents[0]
      const result = buildOpenClawConfig(agent, config)

      // Should have channels.shadowob.accounts
      expect(result.channels?.shadowob?.accounts?.['bot-1']).toBeDefined()

      // Should have agent in agents.list
      expect(result.agents?.list).toBeDefined()
      expect(result.agents!.list![0].id).toBe('agent-1')
      // systemPrompt is stripped from agent entry (OpenClaw strict schema)
      expect(result.agents!.list![0].systemPrompt).toBeUndefined()

      // Should have bindings
      expect(result.bindings).toBeDefined()
      expect(result.bindings![0].agentId).toBe('agent-1')
      expect(result.bindings![0].match.channel).toBe('shadowob')
      expect(result.bindings![0].match.accountId).toBe('bot-1')
    })

    it('should build config with providers from registry', () => {
      const config: CloudConfig = {
        version: '1',
        registry: {
          providers: [
            {
              id: 'openai',
              api: 'openai',
              baseUrl: 'https://api.openai.com/v1',
              apiKey: '${env:OPENAI_KEY}',
              models: [{ id: 'gpt-4o' }],
            },
          ],
        },
        deployments: {
          agents: [
            {
              id: 'agent-1',
              runtime: 'openclaw',
              configuration: {},
            },
          ],
        },
      }

      const agent = config.deployments!.agents[0]
      const result = buildOpenClawConfig(agent, config)
      expect(result.models?.providers?.openai).toBeDefined()
      // API type is normalized: 'openai' → 'openai-completions'
      expect(result.models!.providers!.openai.api).toBe('openai-completions')
    })

    it('should configure ACP for claude-code runtime', () => {
      const config: CloudConfig = {
        version: '1',
        deployments: {
          agents: [
            {
              id: 'claude-agent',
              runtime: 'claude-code',
              configuration: {},
            },
          ],
        },
      }

      const agent = config.deployments!.agents[0]
      const result = buildOpenClawConfig(agent, config)

      // ACP should be enabled
      expect(result.acp?.enabled).toBe(true)
      expect(result.acp?.backend).toBe('acpx')

      // Agent should have ACP runtime
      expect(result.agents?.list?.[0]?.runtime?.type).toBe('acp')
      expect(result.agents?.list?.[0]?.runtime?.acp?.agent).toBe('claude')

      // ACPX plugin should be enabled
      expect(result.plugins?.entries?.acpx?.enabled).toBe(true)
    })

    it('should return empty bindings when no shadowob plugin', () => {
      const config: CloudConfig = {
        version: '1',
        deployments: {
          agents: [
            {
              id: 'agent-1',
              runtime: 'openclaw',
              configuration: {},
            },
          ],
        },
      }

      const result = buildOpenClawConfig(config.deployments!.agents[0], config)
      expect(result.channels).toEqual({ shadowob: { enabled: false } })
      expect(result.bindings).toBeUndefined()
    })

    it('should disable cloud-incompatible bundled plugins by default', () => {
      const config: CloudConfig = {
        version: '1',
        deployments: {
          agents: [
            {
              id: 'agent-1',
              runtime: 'openclaw',
              configuration: {},
            },
          ],
        },
      }

      const result = buildOpenClawConfig(config.deployments!.agents[0], config)
      expect(result.plugins?.entries?.bonjour?.enabled).toBe(false)
    })

    it('should preserve explicit bundled plugin opt-ins', () => {
      const config: CloudConfig = {
        version: '1',
        deployments: {
          agents: [
            {
              id: 'agent-1',
              runtime: 'openclaw',
              configuration: {
                openclaw: {
                  plugins: {
                    entries: {
                      bonjour: { enabled: true },
                    },
                  },
                },
              },
            },
          ],
        },
      }

      const result = buildOpenClawConfig(config.deployments!.agents[0], config)
      expect(result.plugins?.entries?.bonjour?.enabled).toBe(true)
    })

    it('should generate skills config from cloud-level skills registry', () => {
      const config: CloudConfig = {
        version: '1',
        skills: {
          installDir: '/app/skills',
          entries: [
            { name: 'web-search', source: 'bundled', enabled: true },
            { name: 'image-lab', source: 'npm', apiKey: 'sk-gemini', env: { GEMINI_KEY: 'test' } },
          ],
        },
        deployments: {
          agents: [
            {
              id: 'agent-1',
              runtime: 'openclaw',
              configuration: {},
            },
          ],
        },
      }

      const result = buildOpenClawConfig(config.deployments!.agents[0], config)

      expect(result.skills).toBeDefined()
      expect(result.skills!.load!.extraDirs).toContain('/app/skills')
      expect(result.skills!.entries!['web-search'].enabled).toBe(true)
      expect(result.skills!.entries!['image-lab'].apiKey).toBe('sk-gemini')
      expect(result.skills!.entries!['image-lab'].env).toEqual({ GEMINI_KEY: 'test' })
    })

    it('should merge cloud skills with agent-level skills config', () => {
      const config: CloudConfig = {
        version: '1',
        skills: {
          entries: [{ name: 'peekaboo', enabled: true }],
        },
        deployments: {
          agents: [
            {
              id: 'agent-1',
              runtime: 'openclaw',
              configuration: {
                openclaw: {
                  skills: {
                    allowBundled: ['gemini'],
                    entries: { sag: { enabled: false } },
                  },
                },
              },
            },
          ],
        },
      }

      const result = buildOpenClawConfig(config.deployments!.agents[0], config)

      expect(result.skills!.allowBundled).toEqual(['gemini'])
      expect(result.skills!.entries!.sag.enabled).toBe(false)
      expect(result.skills!.entries!.peekaboo.enabled).toBe(true)
      expect(result.skills!.load!.extraDirs).toContain('/app/skills')
    })

    it('should set workspace path from shared workspace config', () => {
      const config: CloudConfig = {
        version: '1',
        workspace: {
          enabled: true,
          mountPath: '/workspace/shared',
          storageSize: '10Gi',
        },
        deployments: {
          agents: [
            {
              id: 'agent-1',
              runtime: 'openclaw',
              configuration: {},
            },
          ],
        },
      }

      const result = buildOpenClawConfig(config.deployments!.agents[0], config)

      expect(result.agents!.defaults!.workspace).toBe('/workspace/shared/agent-1')
    })

    it('should not override explicit workspace when shared workspace enabled', () => {
      const config: CloudConfig = {
        version: '1',
        workspace: {
          enabled: true,
          mountPath: '/workspace/shared',
        },
        deployments: {
          agents: [
            {
              id: 'agent-1',
              runtime: 'openclaw',
              configuration: {
                openclaw: {
                  agents: {
                    defaults: { workspace: '/custom/workspace' },
                  },
                },
              },
            },
          ],
        },
      }

      const result = buildOpenClawConfig(config.deployments!.agents[0], config)

      expect(result.agents!.defaults!.workspace).toBe('/custom/workspace')
    })

    it('should pass through logging and messages config', () => {
      const config: CloudConfig = {
        version: '1',
        deployments: {
          agents: [
            {
              id: 'agent-1',
              runtime: 'openclaw',
              configuration: {
                openclaw: {
                  logging: { level: 'debug', consoleStyle: 'json' },
                  messages: { responsePrefix: '🤖', ackReaction: '👀' },
                },
              },
            },
          ],
        },
      }

      const result = buildOpenClawConfig(config.deployments!.agents[0], config)

      expect(result.logging).toEqual({ level: 'debug', consoleStyle: 'json' })
      expect(result.messages).toEqual({ responsePrefix: '🤖', ackReaction: '👀' })
    })

    it('should map agent permissions to tools config', () => {
      const config: CloudConfig = {
        version: '1',
        deployments: {
          agents: [
            {
              id: 'secure-agent',
              runtime: 'openclaw',
              configuration: { openclaw: {} },
              permissions: {
                default: 'approve-reads',
                tools: {
                  bash: 'always-ask',
                  'web-fetch': 'always-allow',
                  'mcp-*': 'deny-all',
                },
              },
            },
          ],
        },
      }

      const result = buildOpenClawConfig(config.deployments!.agents[0], config)

      expect(result.tools?.profile).toBe('approve-reads')
      expect(result.tools?.allow).toContain('web-fetch')
      expect(result.tools?.deny).toContain('mcp-*')
    })

    it('should drop legacy tool fragments while preserving explicit valid config', () => {
      const config: CloudConfig = {
        version: '1',
        deployments: {
          agents: [
            {
              id: 'legacy-agent',
              runtime: 'openclaw',
              configuration: {
                openclaw: {
                  tools: {
                    profile: 'full',
                    memory: { enabled: true },
                    code: { enabled: true },
                    web: { fetch: { enabled: true } },
                  } as any,
                },
              },
            },
          ],
        },
      }

      const result = buildOpenClawConfig(config.deployments!.agents[0], config)
      const tools = result.tools as Record<string, unknown>

      expect(result.tools?.profile).toBe('full')
      expect(result.tools?.web).toEqual({ fetch: { enabled: true } })
      expect('memory' in tools).toBe(false)
      expect('code' in tools).toBe(false)
    })

    it('should map legacy code enablement to the coding profile when no profile is set', () => {
      const config: CloudConfig = {
        version: '1',
        deployments: {
          agents: [
            {
              id: 'legacy-code-agent',
              runtime: 'openclaw',
              configuration: {
                openclaw: {
                  tools: {
                    code: { enabled: true },
                  } as any,
                },
              },
            },
          ],
        },
      }

      const result = buildOpenClawConfig(config.deployments!.agents[0], config)

      expect(result.tools?.profile).toBe('coding')
      expect((result.tools as Record<string, unknown>)?.code).toBeUndefined()
    })

    it('should materialize plugin build env onto resolved agents instead of hidden config fields', async () => {
      const originalAuthToken = process.env.ANTHROPIC_AUTH_TOKEN
      const originalBaseUrl = process.env.ANTHROPIC_BASE_URL
      const originalModel = process.env.ANTHROPIC_MODEL

      process.env.ANTHROPIC_AUTH_TOKEN = 'sk-test-dashscope'
      process.env.ANTHROPIC_BASE_URL = 'https://example.test/anthropic'
      process.env.ANTHROPIC_MODEL = 'qwen3.6-plus'

      try {
        const config: CloudConfig = {
          version: '1',
          use: [{ plugin: 'model-provider' }],
          deployments: {
            agents: [
              {
                id: 'agent-1',
                runtime: 'openclaw',
                configuration: {},
                env: { EXISTING_ENV: 'kept' },
              },
            ],
          },
        }

        const resolved = await resolveConfig(config)
        const resolvedAgent = resolved.deployments!.agents[0]!

        expect(resolvedAgent.env).toMatchObject({
          EXISTING_ENV: 'kept',
          ANTHROPIC_AUTH_TOKEN: 'sk-test-dashscope',
          ANTHROPIC_BASE_URL: 'https://example.test/anthropic',
          ANTHROPIC_MODEL: 'qwen3.6-plus',
        })

        const openclawConfig = buildOpenClawConfig(resolvedAgent, resolved)
        expect((openclawConfig as Record<string, unknown>)._pluginEnvVars).toBeUndefined()
        expect(openclawConfig.models?.providers?.anthropic).toMatchObject({
          apiKey: '${env:ANTHROPIC_AUTH_TOKEN}',
          baseUrl: 'https://example.test/anthropic',
        })
      } finally {
        if (originalAuthToken === undefined) {
          delete process.env.ANTHROPIC_AUTH_TOKEN
        } else {
          process.env.ANTHROPIC_AUTH_TOKEN = originalAuthToken
        }

        if (originalBaseUrl === undefined) {
          delete process.env.ANTHROPIC_BASE_URL
        } else {
          process.env.ANTHROPIC_BASE_URL = originalBaseUrl
        }

        if (originalModel === undefined) {
          delete process.env.ANTHROPIC_MODEL
        } else {
          process.env.ANTHROPIC_MODEL = originalModel
        }
      }
    })

    it('should materialize model-provider env from explicit template context', async () => {
      const originalAnthropicKey = process.env.ANTHROPIC_API_KEY
      delete process.env.ANTHROPIC_API_KEY

      try {
        const config: CloudConfig = {
          version: '1',
          use: [{ plugin: 'model-provider' }],
          deployments: {
            agents: [
              {
                id: 'agent-1',
                runtime: 'openclaw',
                configuration: {},
              },
            ],
          },
        }

        const resolved = await resolveConfig(
          config,
          { env: { ANTHROPIC_API_KEY: 'sk-tenant-anthropic' } },
          undefined,
        )
        const resolvedAgent = resolved.deployments!.agents[0]!

        expect(process.env.ANTHROPIC_API_KEY).toBeUndefined()
        expect(resolvedAgent.env).toMatchObject({
          ANTHROPIC_API_KEY: 'sk-tenant-anthropic',
        })

        const openclawConfig = buildOpenClawConfig(resolvedAgent, resolved)
        expect(openclawConfig.models?.providers?.anthropic).toMatchObject({
          apiKey: '${env:ANTHROPIC_API_KEY}',
        })
      } finally {
        if (originalAnthropicKey === undefined) {
          delete process.env.ANTHROPIC_API_KEY
        } else {
          process.env.ANTHROPIC_API_KEY = originalAnthropicKey
        }
      }
    })

    it('should append agent-pack runtime guidance into workspace files', () => {
      const config: CloudConfig = {
        version: '1',
        deployments: {
          agents: [
            {
              id: 'strategy-agent',
              runtime: 'openclaw',
              identity: {
                systemPrompt: 'Base prompt.',
              },
              use: [
                {
                  plugin: 'agent-pack',
                  options: {
                    packs: [
                      {
                        id: 'gstack',
                        url: 'https://github.com/garrytan/gstack',
                        mounts: [
                          { kind: 'skills', from: 'openclaw/skills' },
                          { kind: 'instructions', from: 'openclaw' },
                        ],
                      },
                    ],
                  },
                },
              ],
              configuration: {},
            },
          ],
        },
      }

      const result = buildOpenClawConfig(config.deployments!.agents[0], config)
      const workspaceFiles = (result._workspaceFiles ?? {}) as Record<string, string>

      expect(workspaceFiles['SOUL.md']).toContain('Base prompt.')
      expect(workspaceFiles['SOUL.md']).toContain('Mounted Agent Packs')
      expect(workspaceFiles['SOUL.md']).toContain('/agent-packs/gstack/skills')
      expect(workspaceFiles['SOUL.md']).toContain('/agent-packs/gstack/instructions')
    })
  })
})
