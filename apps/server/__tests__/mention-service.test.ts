import { describe, expect, it, vi } from 'vitest'
import { MentionService } from '../src/services/mention.service'

const servers = {
  alpha: {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Alpha Team',
    slug: 'alpha',
  },
  beta: {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Beta Lab',
    slug: 'beta',
  },
}

const channels = {
  general: {
    id: '33333333-3333-4333-8333-333333333333',
    name: 'general',
    serverId: servers.alpha.id,
    isPrivate: false,
  },
  docs: {
    id: '44444444-4444-4444-8444-444444444444',
    name: 'docs',
    serverId: servers.alpha.id,
    isPrivate: false,
  },
  betaNews: {
    id: '55555555-5555-4555-8555-555555555555',
    name: 'news',
    serverId: servers.beta.id,
    isPrivate: false,
  },
  betaPrivate: {
    id: '66666666-6666-4666-8666-666666666666',
    name: 'private',
    serverId: servers.beta.id,
    isPrivate: true,
  },
}

const users = {
  alice: {
    id: '77777777-7777-4777-8777-777777777777',
    username: 'alice',
    displayName: 'Alice',
    avatarUrl: null,
    isBot: false,
  },
  bob: {
    id: '88888888-8888-4888-8888-888888888888',
    username: 'bob',
    displayName: 'Bob',
    avatarUrl: null,
    isBot: false,
  },
  alphaUser: {
    id: '99999999-9999-4999-8999-999999999999',
    username: 'alpha',
    displayName: 'Alpha User',
    avatarUrl: null,
    isBot: false,
  },
  admin: {
    id: '10101010-1010-4101-8101-101010101010',
    username: 'admin',
    displayName: 'Admin',
    avatarUrl: null,
    isBot: false,
  },
}

const serverApps = {
  demoDesk: {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    serverId: servers.alpha.id,
    appKey: 'demo-desk',
    name: 'Demo Desk',
    description: 'Ticket operations',
    iconUrl: 'https://example.test/demo.png',
    status: 'active',
  },
}

function createMentionService() {
  const channelDao = {
    findById: vi.fn(async (id: string) => {
      return Object.values(channels).find((channel) => channel.id === id) ?? null
    }),
    findByServerId: vi.fn(async (serverId: string) => {
      return Object.values(channels).filter((channel) => channel.serverId === serverId)
    }),
  }
  const channelMemberDao = {
    get: vi.fn(async (channelId: string, userId: string) => {
      if (channelId === channels.betaPrivate.id) return null
      if (Object.values(users).some((user) => user.id === userId)) {
        return { channelId, userId }
      }
      return null
    }),
    getUserChannelIds: vi.fn(async (_userId: string, channelIds: string[]) => {
      return channelIds.filter((id) => id !== channels.betaPrivate.id)
    }),
    getMembers: vi.fn(async (channelId: string) => [
      { channelId, userId: users.alice.id, joinedAt: new Date() },
      { channelId, userId: users.bob.id, joinedAt: new Date() },
    ]),
  }
  const serverDao = {
    findById: vi.fn(async (id: string) => {
      return Object.values(servers).find((server) => server.id === id) ?? null
    }),
    getMember: vi.fn(async (serverId: string, userId: string) => {
      if (!Object.values(users).some((user) => user.id === userId)) return null
      return { id: `${serverId}:${userId}`, serverId, userId, role: 'member' }
    }),
    getMembers: vi.fn(async (serverId: string) => [
      {
        id: 'm1',
        serverId,
        userId: users.alice.id,
        nickname: null,
        role: 'member',
        user: users.alice,
      },
      { id: 'm2', serverId, userId: users.bob.id, nickname: null, role: 'member', user: users.bob },
      {
        id: 'm3',
        serverId,
        userId: users.alphaUser.id,
        nickname: null,
        role: 'member',
        user: users.alphaUser,
      },
      {
        id: 'm4',
        serverId,
        userId: users.admin.id,
        nickname: null,
        role: 'admin',
        user: users.admin,
      },
    ]),
    findByUserId: vi.fn(async () => [
      { server: servers.alpha, member: { userId: users.alice.id, serverId: servers.alpha.id } },
      { server: servers.beta, member: { userId: users.alice.id, serverId: servers.beta.id } },
    ]),
  }
  const userDao = {
    findById: vi.fn(async (id: string) => {
      return Object.values(users).find((user) => user.id === id) ?? null
    }),
    findByUsername: vi.fn(async (username: string) => {
      return Object.values(users).find((user) => user.username === username) ?? null
    }),
  }
  const appIntegrationDao = {
    listByServer: vi.fn(async (serverId: string) => {
      return Object.values(serverApps).filter((app) => app.serverId === serverId)
    }),
    findById: vi.fn(async (id: string) => {
      return Object.values(serverApps).find((app) => app.id === id) ?? null
    }),
  }
  const notificationTriggerService = {
    triggerMention: vi.fn(async (input: { userId: string }) => ({
      id: `n-${input.userId}`,
      kind: 'message.mention',
      type: 'mention',
      ...input,
    })),
  }

  return new MentionService({
    channelDao: channelDao as never,
    channelMemberDao: channelMemberDao as never,
    appIntegrationDao: appIntegrationDao as never,
    serverDao: serverDao as never,
    userDao: userDao as never,
    notificationTriggerService: notificationTriggerService as never,
  })
}

describe('MentionService', () => {
  it('suggests visible current and cross-server channels without leaking private channels', async () => {
    const service = createMentionService()

    const suggestions = await service.suggest({
      userId: users.alice.id,
      channelId: channels.general.id,
      trigger: '#',
      query: '',
    })

    expect(suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'channel',
          channelId: channels.general.id,
          token: '#general',
        }),
        expect.objectContaining({
          kind: 'channel',
          channelId: channels.betaNews.id,
          token: '#beta/news',
        }),
      ]),
    )
    expect(suggestions).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          channelId: channels.betaPrivate.id,
        }),
      ]),
    )
  })

  it('normalizes client mentions and infers legacy @username mentions into metadata', async () => {
    const service = createMentionService()

    const input = await service.prepareMessageInput(channels.general.id, users.alice.id, {
      content: 'Loop in @bob and #docs',
      mentions: [
        {
          kind: 'channel' as const,
          targetId: channels.docs.id,
          channelId: channels.docs.id,
          serverId: servers.alpha.id,
          token: '#docs',
          label: '#docs',
        },
      ],
    })

    expect(input.mentions).toBeUndefined()
    expect(input.content).toBe(`Loop in <@${users.bob.id}> and <#${channels.docs.id}>`)
    expect(input.metadata?.mentions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'channel',
          targetId: channels.docs.id,
          token: `<#${channels.docs.id}>`,
          sourceToken: '#docs',
        }),
        expect.objectContaining({
          kind: 'user',
          targetId: users.bob.id,
          token: `<@${users.bob.id}>`,
          sourceToken: '@bob',
          label: '@Bob',
        }),
      ]),
    )
  })

  it('infers a bare @admin mention at the start of a message', async () => {
    const service = createMentionService()

    const input = await service.prepareMessageInput(channels.general.id, users.alice.id, {
      content: '@admin 在吗',
    })

    expect(input.content).toBe(`<@${users.admin.id}> 在吗`)
    expect(input.metadata?.mentions).toEqual([
      expect.objectContaining({
        kind: 'user',
        targetId: users.admin.id,
        token: `<@${users.admin.id}>`,
        sourceToken: '@admin',
        label: '@Admin',
      }),
    ])
  })

  it('creates mention notifications from raw content when stored metadata is missing', async () => {
    const service = createMentionService()

    const notifications = await service.createMentionNotifications({
      messageId: '12121212-1212-4121-8121-121212121212',
      channelId: channels.general.id,
      authorId: users.alice.id,
      authorName: users.alice.displayName,
      content: '@admin 在吗',
      mentions: [],
    })

    expect(notifications).toEqual([
      expect.objectContaining({
        userId: users.admin.id,
        kind: 'message.mention',
      }),
    ])
  })

  it('keeps repeated inferred mention occurrences so renderers can highlight each token', async () => {
    const service = createMentionService()

    const mentions = await service.resolveMentions({
      channelId: channels.general.id,
      authorId: users.alice.id,
      content: 'Loop #docs and #docs again',
    })

    expect(mentions.filter((mention) => mention.channelId === channels.docs.id)).toEqual([
      expect.objectContaining({ range: { start: 5, end: 10 } }),
      expect.objectContaining({ range: { start: 15, end: 20 } }),
    ])
  })

  it('does not infer mentions from markdown code spans or fences', async () => {
    const service = createMentionService()

    const mentions = await service.resolveMentions({
      channelId: channels.general.id,
      authorId: users.alice.id,
      content: 'Use `@bob` here\n\n```txt\n#docs\n```',
    })

    expect(mentions).toEqual([])
  })

  it('prefers a selected structured server mention over a same-token user inference', async () => {
    const service = createMentionService()

    const content = 'Ping @alpha now'
    const input = await service.prepareMessageInput(channels.general.id, users.alice.id, {
      content,
      mentions: [
        {
          kind: 'server' as const,
          targetId: servers.alpha.id,
          serverId: servers.alpha.id,
          token: '@alpha',
          label: '@Alpha Team',
          range: { start: 5, end: 11 },
        },
      ],
    })

    expect(input.metadata?.mentions).toEqual([
      expect.objectContaining({
        kind: 'server',
        targetId: servers.alpha.id,
        token: `<@server:${servers.alpha.id}>`,
        sourceToken: '@alpha',
      }),
    ])
    expect(input.metadata?.mentions?.[0]?.range?.start).toBe(5)
    expect(input.content).toBe(`Ping <@server:${servers.alpha.id}> now`)
  })

  it('suggests and canonicalizes installed server app mentions', async () => {
    const service = createMentionService()

    const suggestions = await service.suggest({
      userId: users.alice.id,
      channelId: channels.general.id,
      trigger: '@',
      query: 'demo',
    })

    expect(suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'app',
          targetId: serverApps.demoDesk.id,
          token: '@demo-desk',
          appKey: 'demo-desk',
        }),
      ]),
    )

    const input = await service.prepareMessageInput(channels.general.id, users.alice.id, {
      content: 'Ask @demo-desk to create a high priority ticket',
    })

    expect(input.content).toBe(
      `Ask <@app:${serverApps.demoDesk.id}> to create a high priority ticket`,
    )
    expect(input.metadata?.mentions).toEqual([
      expect.objectContaining({
        kind: 'app',
        targetId: serverApps.demoDesk.id,
        token: `<@app:${serverApps.demoDesk.id}>`,
        sourceToken: '@demo-desk',
        appKey: 'demo-desk',
        appName: 'Demo Desk',
      }),
    ])
  })
})
