import { describe, expect, it } from 'vitest'
import type { CloudConfig } from '../../src/config/schema.js'
import type { ProvisionResult } from '../../src/plugins/shadowob/provisioning.js'
import { buildProvisionedEnvVars } from '../../src/plugins/shadowob/provisioning.js'

describe('provisioning', () => {
  describe('buildProvisionedEnvVars', () => {
    it('should build env vars from provisioned buddies', () => {
      const config: CloudConfig = {
        version: '1',
        use: [
          {
            plugin: 'shadowob',
            options: {
              buddies: [{ id: 'bot-1', name: 'Bot' }],
              bindings: [
                {
                  targetId: 'bot-1',
                  targetType: 'buddy',
                  servers: ['srv-1'],
                  channels: ['ch-1'],
                  agentId: 'agent-1',
                },
              ],
            },
          },
        ],
      }

      const provision: ProvisionResult = {
        servers: new Map([['srv-1', 'real-server-id']]),
        channels: new Map([['ch-1', 'real-channel-id']]),
        buddies: new Map([
          ['bot-1', { agentId: 'real-agent-id', token: 'token-abc123', userId: 'user-1' }],
        ]),
      }

      const env = buildProvisionedEnvVars(
        'agent-1',
        config,
        provision,
        'https://shadow.example.com',
      )

      expect(env.SHADOW_SERVER_URL).toBe('https://shadow.example.com')
      expect(env.SHADOW_TOKEN_BOT_1).toBe('token-abc123')
    })

    it('should handle hyphenated buddy IDs', () => {
      const config: CloudConfig = {
        version: '1',
        use: [
          {
            plugin: 'shadowob',
            options: {
              buddies: [{ id: 'my-cool-bot', name: 'Bot' }],
              bindings: [
                {
                  targetId: 'my-cool-bot',
                  targetType: 'buddy',
                  servers: ['s'],
                  channels: ['c'],
                  agentId: 'agent-1',
                },
              ],
            },
          },
        ],
      }

      const provision: ProvisionResult = {
        servers: new Map(),
        channels: new Map(),
        buddies: new Map([['my-cool-bot', { agentId: 'aid', token: 'tok', userId: 'uid' }]]),
      }

      const env = buildProvisionedEnvVars('agent-1', config, provision, 'http://localhost')
      expect(env.SHADOW_TOKEN_MY_COOL_BOT).toBe('tok')
    })

    it('should return only server URL when no bindings match', () => {
      const config: CloudConfig = {
        version: '1',
        use: [
          {
            plugin: 'shadowob',
            options: {
              bindings: [
                {
                  targetId: 'bot-1',
                  targetType: 'buddy',
                  servers: ['s'],
                  channels: ['c'],
                  agentId: 'other-agent',
                },
              ],
            },
          },
        ],
      }

      const provision: ProvisionResult = {
        servers: new Map(),
        channels: new Map(),
        buddies: new Map(),
      }

      const env = buildProvisionedEnvVars('agent-1', config, provision, 'http://localhost')
      expect(env.SHADOW_SERVER_URL).toBe('http://localhost')
      expect(Object.keys(env)).toHaveLength(1)
    })

    it('should return empty when no shadowob plugin', () => {
      const config: CloudConfig = { version: '1' }
      const provision: ProvisionResult = {
        servers: new Map(),
        channels: new Map(),
        buddies: new Map(),
      }

      const env = buildProvisionedEnvVars('agent-1', config, provision, 'http://localhost')
      expect(Object.keys(env)).toHaveLength(0)
    })
  })
})
