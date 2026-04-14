/**
 * E2E tests for Shadow Cloud deployment flow.
 *
 * These tests validate the full config → provision → deploy pipeline
 * by testing that all config transformations and resource generation
 * work correctly end-to-end.
 */

import { describe, expect, it } from 'vitest'
import { buildOpenClawConfig, expandExtends, resolveConfig } from '../../src/config/parser.js'
import type { CloudConfig } from '../../src/config/schema.js'
import { validateCloudConfig } from '../../src/config/schema.js'
import type { ProvisionResult } from '../../src/provisioning/index.js'
import { buildProvisionedEnvVars } from '../../src/provisioning/index.js'

/**
 * Full production-like config used across E2E tests.
 */
function createFullConfig(): CloudConfig {
  return {
    version: '1',
    environment: 'staging',
    plugins: {
      shadowob: {
        servers: [
          {
            id: 'main-server',
            name: 'AI Agents Server',
            slug: 'ai-agents',
            isPublic: false,
            channels: [
              { id: 'ch-general', title: 'General', type: 'text' },
              { id: 'ch-support', title: 'Support', type: 'text' },
            ],
          },
        ],
        buddies: [
          {
            id: 'assistant-bot',
            name: 'Assistant',
            description: 'General assistant',
            avatarUrl: 'https://example.com/avatar.png',
          },
          {
            id: 'support-bot',
            name: 'Support Agent',
            description: 'Customer support',
          },
        ],
        bindings: [
          {
            targetId: 'assistant-bot',
            targetType: 'buddy',
            servers: ['main-server'],
            channels: ['ch-general'],
            agentId: 'agent-assistant',
          },
          {
            targetId: 'support-bot',
            targetType: 'buddy',
            servers: ['main-server'],
            channels: ['ch-support'],
            agentId: 'agent-support',
          },
        ],
      },
    },
    registry: {
      providers: [
        {
          id: 'openai',
          api: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
          apiKey: '${env:OPENAI_API_KEY}',
          models: [
            { id: 'gpt-4o', name: 'GPT-4o' },
            { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
          ],
        },
      ],
      configurations: [
        {
          id: 'base-openclaw',
          openclaw: {
            agents: {
              defaults: {
                workspace: '/workspace',
                timeoutSeconds: 30,
                maxConcurrent: 4,
              },
            },
            tools: { allow: ['web-search', 'calculator'] },
            session: {
              dmScope: 'per-peer',
            },
          },
        },
      ],
    },
    deployments: {
      namespace: 'shadow-staging',
      agents: [
        {
          id: 'agent-assistant',
          runtime: 'openclaw',
          replicas: 2,
          configuration: {
            extends: 'base-openclaw',
            openclaw: {
              agents: {
                list: [
                  {
                    id: 'agent-assistant',
                    systemPrompt: 'You are a friendly general assistant. Be helpful and concise.',
                  },
                ],
              },
            },
          },
          resources: {
            requests: { cpu: '100m', memory: '256Mi' },
            limits: { cpu: '500m', memory: '512Mi' },
          },
          env: {
            LOG_LEVEL: 'info',
            AGENT_TYPE: 'assistant',
          },
        },
        {
          id: 'agent-support',
          runtime: 'openclaw',
          replicas: 1,
          configuration: {
            extends: 'base-openclaw',
            openclaw: {
              agents: {
                list: [
                  {
                    id: 'agent-support',
                    systemPrompt:
                      'You are a customer support agent. Be empathetic and solution-oriented.',
                  },
                ],
              },
              tools: { allow: ['ticket-system', 'knowledge-base'] },
            },
          },
          env: {
            LOG_LEVEL: 'debug',
            AGENT_TYPE: 'support',
          },
        },
      ],
    },
  }
}

describe('E2E: Cloud Deployment Pipeline', () => {
  describe('Config validation and parsing', () => {
    it('should validate the full production config', () => {
      const config = createFullConfig()
      const result = validateCloudConfig(config)
      expect(result.success).toBe(true)
    })

    it('should expand extends for all agents', () => {
      const config = createFullConfig()
      const configurations = config.registry!.configurations!

      for (const agent of config.deployments!.agents) {
        const expanded = expandExtends(agent.configuration, configurations)

        // Should have base agents.defaults config
        expect(expanded.openclaw?.agents?.defaults?.workspace).toBe('/workspace')
        expect(expanded.openclaw?.agents?.defaults?.timeoutSeconds).toBe(30)
        // Should have base session config
        expect(expanded.openclaw?.session?.dmScope).toBe('per-peer')
        // extends should be removed
        expect(expanded.extends).toBeUndefined()
      }
    })

    it('should preserve agent-specific overrides after extends expansion', () => {
      const config = createFullConfig()
      const configurations = config.registry!.configurations!

      const assistantConfig = expandExtends(
        config.deployments!.agents[0].configuration,
        configurations,
      )
      expect(assistantConfig.openclaw?.agents?.list?.[0]?.systemPrompt).toBe(
        'You are a friendly general assistant. Be helpful and concise.',
      )

      const supportConfig = expandExtends(
        config.deployments!.agents[1].configuration,
        configurations,
      )
      expect(supportConfig.openclaw?.agents?.list?.[0]?.systemPrompt).toBe(
        'You are a customer support agent. Be empathetic and solution-oriented.',
      )
      // Support agent overrides tools
      expect(supportConfig.openclaw?.tools?.allow).toEqual(['ticket-system', 'knowledge-base'])
    })
  })

  describe('Template resolution', () => {
    it('should resolve all env references', () => {
      const config = createFullConfig()
      const env = {
        OPENAI_API_KEY: 'sk-test-12345',
      }

      const resolved = resolveConfig(config, { env })

      // Provider API key should be resolved
      const provider = resolved.registry!.providers![0]
      expect(provider.apiKey).toBe('sk-test-12345')
    })

    it('should throw for missing required env vars', () => {
      const config = createFullConfig()
      expect(() => resolveConfig(config, { env: {} })).toThrow(
        'Environment variable OPENAI_API_KEY is not set',
      )
    })
  })

  describe('OpenClaw config generation', () => {
    it('should generate valid OpenClaw config with buddy bindings', () => {
      const config = createFullConfig()
      const resolved = resolveConfig(config, {
        env: { OPENAI_API_KEY: 'sk-test' },
      })

      for (const agent of resolved.deployments!.agents) {
        const openclawConfig = buildOpenClawConfig(agent, resolved)

        // Should have agent in agents.list
        expect(openclawConfig.agents?.list).toBeDefined()
        expect(openclawConfig.agents!.list![0].id).toBe(agent.id)

        // Should have providers
        expect(openclawConfig.models?.providers?.openai).toBeDefined()
      }
    })

    it('should create correct shadowob channel accounts per agent', () => {
      const config = createFullConfig()
      const resolved = resolveConfig(config, {
        env: { OPENAI_API_KEY: 'sk-test' },
      })

      // Assistant agent should have assistant-bot binding
      const assistantAgent = resolved.deployments!.agents[0]
      const assistantConfig = buildOpenClawConfig(assistantAgent, resolved)
      expect(assistantConfig.channels?.shadowob?.accounts?.['assistant-bot']).toBeDefined()
      expect(assistantConfig.channels!.shadowob!.accounts!['assistant-bot'].token).toContain(
        'SHADOW_TOKEN_ASSISTANT_BOT',
      )

      // Support agent should have support-bot binding
      const supportAgent = resolved.deployments!.agents[1]
      const supportConfig = buildOpenClawConfig(supportAgent, resolved)
      expect(supportConfig.channels?.shadowob?.accounts?.['support-bot']).toBeDefined()
      expect(supportConfig.channels!.shadowob!.accounts!['support-bot'].token).toContain(
        'SHADOW_TOKEN_SUPPORT_BOT',
      )
    })

    it('should generate correct binding entries', () => {
      const config = createFullConfig()
      const resolved = resolveConfig(config, {
        env: { OPENAI_API_KEY: 'sk-test' },
      })

      const assistantAgent = resolved.deployments!.agents[0]
      const assistantConfig = buildOpenClawConfig(assistantAgent, resolved)

      expect(assistantConfig.bindings).toHaveLength(1)
      expect(assistantConfig.bindings![0].agentId).toBe('agent-assistant')
      expect(assistantConfig.bindings![0].match.channel).toBe('shadowob')
      expect(assistantConfig.bindings![0].match.accountId).toBe('assistant-bot')
    })
  })

  describe('Provisioned env vars', () => {
    it('should generate correct env vars for each agent', () => {
      const config = createFullConfig()
      const provision: ProvisionResult = {
        servers: new Map([['main-server', 'real-server-id-123']]),
        channels: new Map([
          ['ch-general', 'real-channel-general'],
          ['ch-support', 'real-channel-support'],
        ]),
        buddies: new Map([
          [
            'assistant-bot',
            {
              agentId: 'real-agent-assistant',
              token: 'jwt-token-assistant-abc',
              userId: 'user-assistant',
            },
          ],
          [
            'support-bot',
            {
              agentId: 'real-agent-support',
              token: 'jwt-token-support-xyz',
              userId: 'user-support',
            },
          ],
        ]),
      }

      const assistantEnv = buildProvisionedEnvVars(
        'agent-assistant',
        config,
        provision,
        'https://shadow.example.com',
      )
      expect(assistantEnv.SHADOW_SERVER_URL).toBe('https://shadow.example.com')
      expect(assistantEnv.SHADOW_TOKEN_ASSISTANT_BOT).toBe('jwt-token-assistant-abc')
      expect(assistantEnv.SHADOW_TOKEN_SUPPORT_BOT).toBeUndefined()

      const supportEnv = buildProvisionedEnvVars(
        'agent-support',
        config,
        provision,
        'https://shadow.example.com',
      )
      expect(supportEnv.SHADOW_SERVER_URL).toBe('https://shadow.example.com')
      expect(supportEnv.SHADOW_TOKEN_SUPPORT_BOT).toBe('jwt-token-support-xyz')
      expect(supportEnv.SHADOW_TOKEN_ASSISTANT_BOT).toBeUndefined()
    })
  })

  describe('Full pipeline: config → expand → resolve → generate', () => {
    it('should produce complete deployment-ready config for each agent', () => {
      const config = createFullConfig()
      const env = {
        OPENAI_API_KEY: 'sk-prod-key',
      }

      // Step 1: Validate
      const result = validateCloudConfig(config)
      expect(result.success).toBe(true)

      // Step 2: Resolve (expand extends + template resolution)
      const resolved = resolveConfig(config, { env })

      // Step 3: Generate OpenClaw configs
      for (const agent of resolved.deployments!.agents) {
        const openclawConfig = buildOpenClawConfig(agent, resolved)

        // Should be a valid JSON-serializable object
        const serialized = JSON.stringify(openclawConfig)
        const parsed = JSON.parse(serialized)
        expect(parsed).toEqual(openclawConfig)

        // Should have agent entry in list
        expect(openclawConfig.agents?.list?.[0]?.id).toBe(agent.id)

        // Should have resolved provider API key
        expect(openclawConfig.models?.providers?.openai?.apiKey).toBe('sk-prod-key')

        // Should have gateway config
        expect(openclawConfig.gateway?.port).toBe(3100)
      }
    })

    it('should handle config with multiple agents sharing base config', () => {
      const config = createFullConfig()
      const resolved = resolveConfig(config, {
        env: { OPENAI_API_KEY: 'sk-test' },
      })

      const agents = resolved.deployments!.agents

      // Both agents should have resolved defaults from base
      for (const agent of agents) {
        expect(agent.configuration.openclaw?.agents?.defaults?.workspace).toBe('/workspace')
        expect(agent.configuration.openclaw?.session?.dmScope).toBe('per-peer')
      }

      // But different system prompts
      expect(agents[0].configuration.openclaw?.agents?.list?.[0]?.systemPrompt).not.toBe(
        agents[1].configuration.openclaw?.agents?.list?.[0]?.systemPrompt,
      )
    })
  })
})
