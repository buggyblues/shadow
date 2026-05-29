import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CloudConfig } from '../../src/config/schema.js'
import type { ProvisionResult } from '../../src/plugins/shadowob/provisioning.js'
import {
  buildProvisionedEnvVars,
  provisionShadowResources,
} from '../../src/plugins/shadowob/provisioning.js'

const shadowClientMocks = vi.hoisted(() => ({
  addAgentsToServer: vi.fn(),
  addChannelMember: vi.fn(),
  createAgent: vi.fn(),
  createChannel: vi.fn(),
  createCommerceDeliverable: vi.fn(),
  createCommerceOffer: vi.fn(),
  createShopProduct: vi.fn(),
  createListing: vi.fn(),
  createServer: vi.fn(),
  createWorkspaceFile: vi.fn(),
  generateAgentToken: vi.fn(),
  getChannel: vi.fn(),
  getManagedUserShop: vi.fn(),
  getServer: vi.fn(),
  getServerChannels: vi.fn(),
  listAgents: vi.fn(),
  listCommerceOffers: vi.fn(),
  listServers: vi.fn(),
  toggleListing: vi.fn(),
  updateAgent: vi.fn(),
  updateListing: vi.fn(),
  uploadMedia: vi.fn(),
  upsertPolicy: vi.fn(),
}))

vi.mock('@shadowob/sdk', () => ({
  ShadowClient: vi.fn(function ShadowClient() {
    return shadowClientMocks
  }),
}))

const originalShadowAgentServerUrl = process.env.SHADOW_AGENT_SERVER_URL

beforeEach(() => {
  delete process.env.SHADOW_AGENT_SERVER_URL
  vi.clearAllMocks()
})

afterEach(() => {
  if (originalShadowAgentServerUrl === undefined) {
    delete process.env.SHADOW_AGENT_SERVER_URL
  } else {
    process.env.SHADOW_AGENT_SERVER_URL = originalShadowAgentServerUrl
  }
})

describe('provisioning', () => {
  describe('provisionShadowResources', () => {
    it('recreates a state buddy when fresh token minting fails', async () => {
      const config: CloudConfig = {
        version: '1',
        use: [
          {
            plugin: 'shadowob',
            options: {
              buddies: [{ id: 'strategy-buddy', name: 'Strategy Buddy' }],
            },
          },
        ],
      }

      shadowClientMocks.generateAgentToken
        .mockRejectedValueOnce(
          new Error('Shadow API POST /api/agents/old-agent/token failed (404)'),
        )
        .mockResolvedValueOnce({ token: 'fresh-agent-token' })
      shadowClientMocks.createAgent.mockResolvedValue({
        id: 'new-agent',
        userId: 'new-user',
      })

      const result = await provisionShadowResources(config, {
        serverUrl: 'http://shadow.local',
        userToken: 'user-token',
        existingState: {
          buddies: {
            'strategy-buddy': {
              agentId: 'old-agent',
              userId: 'deleted-user',
            },
          },
        },
        logger: {
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
          success: vi.fn(),
          step: vi.fn(),
          dim: vi.fn(),
        },
      })

      expect(shadowClientMocks.generateAgentToken).toHaveBeenNthCalledWith(1, 'old-agent')
      expect(shadowClientMocks.createAgent).toHaveBeenCalledWith({
        name: 'Strategy Buddy',
        username: 'strategy-buddy',
        displayName: 'Strategy Buddy',
        avatarUrl: undefined,
        buddyMode: 'private',
        allowedServerIds: [],
        config: { shadowob: { buddyId: 'strategy-buddy' } },
      })
      expect(shadowClientMocks.generateAgentToken).toHaveBeenNthCalledWith(2, 'new-agent')
      expect(result.buddies.get('strategy-buddy')).toEqual({
        agentId: 'new-agent',
        userId: 'new-user',
        token: 'fresh-agent-token',
      })
    })

    it('binds paid-file commerce offers to the seller buddy', async () => {
      const config: CloudConfig = {
        version: '1',
        use: [
          {
            plugin: 'shadowob',
            options: {
              servers: [
                {
                  id: 'match-server',
                  name: 'Match Server',
                  channels: [{ id: 'match-channel', title: 'match-channel' }],
                },
              ],
              buddies: [{ id: 'match-girl', name: 'Match Girl' }],
              bindings: [
                {
                  targetId: 'match-girl',
                  targetType: 'buddy',
                  servers: ['match-server'],
                  channels: ['match-channel'],
                  agentId: 'agent-1',
                },
              ],
              commerce: {
                paidFiles: [
                  {
                    id: 'match-animation',
                    serverId: 'match-server',
                    shop: { kind: 'buddy', buddyId: 'match-girl' },
                    sellerBuddyId: 'match-girl',
                    name: 'Glowing Matches',
                    slug: 'glowing-matches',
                    price: 8,
                    fileName: 'match.html',
                    html: '<html></html>',
                    offerSurfaces: ['dm', 'channel'],
                  },
                ],
              },
            },
          },
        ],
      }

      shadowClientMocks.listServers.mockResolvedValue([])
      shadowClientMocks.createServer.mockResolvedValue({ id: 'server-real', name: 'Match Server' })
      shadowClientMocks.getServerChannels.mockResolvedValue([])
      shadowClientMocks.createChannel.mockResolvedValue({
        id: 'channel-real',
        serverId: 'server-real',
        name: 'match-channel',
      })
      shadowClientMocks.listAgents.mockResolvedValue([])
      shadowClientMocks.createAgent.mockResolvedValue({
        id: 'agent-real',
        userId: 'buddy-user-real',
      })
      shadowClientMocks.generateAgentToken.mockResolvedValue({ token: 'buddy-token' })
      shadowClientMocks.addAgentsToServer.mockResolvedValue({ added: ['agent-real'], failed: [] })
      shadowClientMocks.addChannelMember.mockResolvedValue(undefined)
      shadowClientMocks.getManagedUserShop.mockResolvedValue({ id: 'buddy-shop-real' })
      shadowClientMocks.uploadMedia.mockResolvedValue({
        url: '/shadow/uploads/match.html',
        size: 13,
      })
      shadowClientMocks.createWorkspaceFile.mockResolvedValue({ id: 'file-real' })
      shadowClientMocks.createShopProduct.mockResolvedValue({ id: 'product-real' })
      shadowClientMocks.listCommerceOffers.mockResolvedValue({ offers: [] })
      shadowClientMocks.createCommerceOffer.mockResolvedValue({ id: 'offer-real' })
      shadowClientMocks.createCommerceDeliverable.mockResolvedValue({ id: 'deliverable-real' })

      const result = await provisionShadowResources(config, {
        serverUrl: 'http://shadow.local',
        userToken: 'user-token',
        logger: {
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
          success: vi.fn(),
          step: vi.fn(),
          dim: vi.fn(),
        },
      })

      expect(shadowClientMocks.createCommerceOffer).toHaveBeenCalledWith(
        'buddy-shop-real',
        expect.objectContaining({
          productId: 'product-real',
          sellerBuddyUserId: 'buddy-user-real',
        }),
      )
      expect(shadowClientMocks.createAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          buddyMode: 'private',
          allowedServerIds: ['server-real'],
        }),
      )
      expect(shadowClientMocks.createCommerceDeliverable).toHaveBeenCalledWith(
        'buddy-shop-real',
        'offer-real',
        expect.objectContaining({
          senderBuddyUserId: 'buddy-user-real',
        }),
      )
      expect(result.commerce.get('match-animation')).toEqual({
        shopId: 'buddy-shop-real',
        productId: 'product-real',
        offerId: 'offer-real',
        fileId: 'file-real',
        deliverableId: 'deliverable-real',
      })
    })

    it('updates reused private buddy allowlists before binding them to servers', async () => {
      const config: CloudConfig = {
        version: '1',
        use: [
          {
            plugin: 'shadowob',
            options: {
              servers: [{ id: 'server-a', name: 'Server A' }],
              buddies: [{ id: 'buddy-a', name: 'Buddy A' }],
              bindings: [
                {
                  targetId: 'buddy-a',
                  targetType: 'buddy',
                  servers: ['server-a'],
                  channels: [],
                  agentId: 'agent-1',
                },
              ],
            },
          },
        ],
      }

      shadowClientMocks.listServers.mockResolvedValue([])
      shadowClientMocks.createServer.mockResolvedValue({ id: 'server-real', name: 'Server A' })
      shadowClientMocks.generateAgentToken.mockResolvedValue({ token: 'fresh-token' })
      shadowClientMocks.addAgentsToServer.mockResolvedValue({
        added: ['agent-real'],
        failed: [],
      })

      await provisionShadowResources(config, {
        serverUrl: 'http://shadow.local',
        userToken: 'user-token',
        existingState: {
          buddies: {
            'buddy-a': {
              agentId: 'agent-real',
              userId: 'buddy-user-real',
            },
          },
        },
        logger: {
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
          success: vi.fn(),
          step: vi.fn(),
          dim: vi.fn(),
        },
      })

      expect(shadowClientMocks.updateAgent).toHaveBeenCalledWith('agent-real', {
        buddyMode: 'private',
        allowedServerIds: ['server-real'],
      })
      expect(shadowClientMocks.addAgentsToServer).toHaveBeenCalledWith('server-real', [
        'agent-real',
      ])
    })

    it('creates separate non-ASCII named channels instead of collapsing them', async () => {
      const config: CloudConfig = {
        version: '1',
        use: [
          {
            plugin: 'shadowob',
            options: {
              servers: [
                {
                  id: 'trainer-server',
                  name: 'Code Trainer',
                  channels: [
                    { id: 'assistant-news', title: '助教资讯' },
                    { id: 'learning-plan', title: '学习规划' },
                    { id: 'wrong-problems', title: '错题回炉' },
                  ],
                },
              ],
            },
          },
        ],
      }

      const createdChannels: Array<{ id: string; serverId: string; name: string }> = []
      shadowClientMocks.listServers.mockResolvedValue([])
      shadowClientMocks.createServer.mockResolvedValue({ id: 'server-real', name: 'Code Trainer' })
      shadowClientMocks.getServerChannels.mockImplementation(async () => createdChannels)
      shadowClientMocks.createChannel.mockImplementation(async (serverId, data) => {
        const channel = {
          id: `channel-${createdChannels.length + 1}`,
          serverId,
          name: data.name,
        }
        createdChannels.push(channel)
        return channel
      })

      const result = await provisionShadowResources(config, {
        serverUrl: 'http://shadow.local',
        userToken: 'user-token',
        logger: {
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
          success: vi.fn(),
          step: vi.fn(),
          dim: vi.fn(),
        },
      })

      expect(shadowClientMocks.createChannel).toHaveBeenCalledTimes(3)
      expect(createdChannels.map((channel) => channel.name)).toEqual([
        '助教资讯',
        '学习规划',
        '错题回炉',
      ])
      expect(new Set(result.channels.values()).size).toBe(3)
    })

    it('reuses only the exact non-ASCII channel match when one already exists', async () => {
      const config: CloudConfig = {
        version: '1',
        use: [
          {
            plugin: 'shadowob',
            options: {
              servers: [
                {
                  id: 'trainer-server',
                  name: 'Code Trainer',
                  channels: [
                    { id: 'assistant-news', title: '助教资讯' },
                    { id: 'problem-recommendations', title: '题目推荐' },
                    { id: 'learning-plan', title: '学习规划' },
                  ],
                },
              ],
            },
          },
        ],
      }

      const createdChannels: Array<{ id: string; serverId: string; name: string }> = [
        { id: 'existing-news', serverId: 'server-real', name: '助教资讯' },
      ]
      shadowClientMocks.listServers.mockResolvedValue([])
      shadowClientMocks.createServer.mockResolvedValue({ id: 'server-real', name: 'Code Trainer' })
      shadowClientMocks.getServerChannels.mockImplementation(async () => createdChannels)
      shadowClientMocks.createChannel.mockImplementation(async (serverId, data) => {
        const channel = {
          id: `channel-${createdChannels.length + 1}`,
          serverId,
          name: data.name,
        }
        createdChannels.push(channel)
        return channel
      })

      const result = await provisionShadowResources(config, {
        serverUrl: 'http://shadow.local',
        userToken: 'user-token',
        logger: {
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
          success: vi.fn(),
          step: vi.fn(),
          dim: vi.fn(),
        },
      })

      expect(shadowClientMocks.createChannel).toHaveBeenCalledTimes(2)
      expect(createdChannels.map((channel) => channel.name)).toEqual([
        '助教资讯',
        '题目推荐',
        '学习规划',
      ])
      expect(Object.fromEntries(result.channels)).toEqual({
        'assistant-news': 'existing-news',
        'problem-recommendations': 'channel-2',
        'learning-plan': 'channel-3',
      })
      expect(new Set(result.channels.values()).size).toBe(3)
    })

    it('keeps channel-scoped buddy bindings out of the server-wide default policy', async () => {
      const config: CloudConfig = {
        version: '1',
        use: [
          {
            plugin: 'shadowob',
            options: {
              servers: [
                {
                  id: 'trainer-server',
                  name: 'Code Trainer',
                  channels: [
                    { id: 'plan', title: '学习规划' },
                    { id: 'review', title: '代码复盘' },
                  ],
                },
              ],
              buddies: [{ id: 'coach-buddy', name: '算法教练' }],
              bindings: [
                {
                  targetId: 'coach-buddy',
                  targetType: 'buddy',
                  servers: ['trainer-server'],
                  channels: ['plan', 'review'],
                  agentId: 'coach-agent',
                  replyPolicy: { mode: 'mentionOnly' },
                },
              ],
            },
          },
        ],
      }

      shadowClientMocks.listServers.mockResolvedValue([])
      shadowClientMocks.createServer.mockResolvedValue({ id: 'server-real', name: 'Code Trainer' })
      shadowClientMocks.getServerChannels.mockResolvedValue([])
      shadowClientMocks.createChannel
        .mockResolvedValueOnce({ id: 'channel-plan', serverId: 'server-real', name: '学习规划' })
        .mockResolvedValueOnce({ id: 'channel-review', serverId: 'server-real', name: '代码复盘' })
      shadowClientMocks.listAgents.mockResolvedValue([])
      shadowClientMocks.createAgent.mockResolvedValue({
        id: 'agent-real',
        userId: 'buddy-user-real',
      })
      shadowClientMocks.generateAgentToken.mockResolvedValue({ token: 'buddy-token' })
      shadowClientMocks.addAgentsToServer.mockResolvedValue({ added: ['agent-real'], failed: [] })
      shadowClientMocks.addChannelMember.mockResolvedValue(undefined)
      shadowClientMocks.upsertPolicy.mockResolvedValue({})

      await provisionShadowResources(config, {
        serverUrl: 'http://shadow.local',
        userToken: 'user-token',
        logger: {
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
          success: vi.fn(),
          step: vi.fn(),
          dim: vi.fn(),
        },
      })

      expect(shadowClientMocks.addChannelMember).toHaveBeenCalledWith(
        'channel-plan',
        'buddy-user-real',
      )
      expect(shadowClientMocks.addChannelMember).toHaveBeenCalledWith(
        'channel-review',
        'buddy-user-real',
      )
      expect(shadowClientMocks.upsertPolicy).toHaveBeenCalledWith('agent-real', 'server-real', {
        channelId: null,
        listen: false,
        reply: false,
        mentionOnly: false,
        config: {},
      })
      expect(shadowClientMocks.upsertPolicy).toHaveBeenCalledWith('agent-real', 'server-real', {
        channelId: 'channel-plan',
        listen: true,
        reply: true,
        mentionOnly: true,
        config: {},
      })
      expect(shadowClientMocks.upsertPolicy).toHaveBeenCalledWith('agent-real', 'server-real', {
        channelId: 'channel-review',
        listen: true,
        reply: true,
        mentionOnly: true,
        config: {},
      })
    })

    it('fails provisioning when server binding rejects the buddy', async () => {
      const config: CloudConfig = {
        version: '1',
        use: [
          {
            plugin: 'shadowob',
            options: {
              servers: [{ id: 'server-a', name: 'Server A' }],
              buddies: [{ id: 'buddy-a', name: 'Buddy A' }],
              bindings: [
                {
                  targetId: 'buddy-a',
                  targetType: 'buddy',
                  servers: ['server-a'],
                  channels: [],
                  agentId: 'agent-1',
                },
              ],
            },
          },
        ],
      }

      shadowClientMocks.listServers.mockResolvedValue([])
      shadowClientMocks.createServer.mockResolvedValue({ id: 'server-real', name: 'Server A' })
      shadowClientMocks.generateAgentToken.mockResolvedValue({ token: 'fresh-token' })
      shadowClientMocks.addAgentsToServer.mockResolvedValue({
        added: [],
        failed: [{ agentId: 'agent-real', error: 'Buddy is not allowed in this server' }],
      })

      await expect(
        provisionShadowResources(config, {
          serverUrl: 'http://shadow.local',
          userToken: 'user-token',
          existingState: {
            buddies: {
              'buddy-a': {
                agentId: 'agent-real',
                userId: 'buddy-user-real',
              },
            },
          },
          logger: {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            success: vi.fn(),
            step: vi.fn(),
            dim: vi.fn(),
          },
        }),
      ).rejects.toThrow('Buddy is not allowed in this server')
    })
  })

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
          [
            'bot-1',
            {
              agentId: 'real-agent-id',
              token: 'token-abc123',
              userId: 'user-1',
            },
          ],
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

    it('injects provisioned commerce ids for Buddy runtime offer cards', () => {
      const config: CloudConfig = {
        version: '1',
        use: [
          {
            plugin: 'shadowob',
            options: {
              buddies: [{ id: 'match-girl', name: 'Match Girl' }],
              bindings: [
                {
                  targetId: 'match-girl',
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

      const provision = {
        servers: new Map(),
        channels: new Map(),
        buddies: new Map([['match-girl', { agentId: 'aid', token: 'tok', userId: 'uid' }]]),
        listings: new Map(),
        commerce: new Map([
          [
            'match-animation',
            {
              shopId: 'shop-1',
              productId: 'product-1',
              offerId: 'offer-1',
              fileId: 'file-1',
              deliverableId: 'deliverable-1',
            },
          ],
        ]),
      } satisfies ProvisionResult

      const env = buildProvisionedEnvVars('agent-1', config, provision, 'http://localhost')

      expect(env.SHADOW_COMMERCE_OFFER_MATCH_ANIMATION).toBe('offer-1')
      expect(env.SHADOW_COMMERCE_FILE_MATCH_ANIMATION).toBe('file-1')
      expect(env.SHADOW_COMMERCE_DELIVERABLE_MATCH_ANIMATION).toBe('deliverable-1')
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

    it('prefers SHADOW_AGENT_SERVER_URL for in-cluster agent runtime env', () => {
      process.env.SHADOW_AGENT_SERVER_URL = 'http://host.lima.internal:3002'

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
          [
            'bot-1',
            {
              agentId: 'real-agent-id',
              token: 'token-abc123',
              userId: 'user-1',
            },
          ],
        ]),
      }

      const env = buildProvisionedEnvVars('agent-1', config, provision, 'http://server:3002')

      expect(env.SHADOW_SERVER_URL).toBe('http://host.lima.internal:3002')
      expect(env.SHADOW_TOKEN_BOT_1).toBe('token-abc123')
    })
  })
})
