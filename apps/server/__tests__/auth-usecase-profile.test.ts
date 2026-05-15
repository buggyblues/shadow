import { describe, expect, it, vi } from 'vitest'
import { AuthUseCase } from '../src/usecases/auth.usecase'

vi.mock('../src/lib/redis', () => ({
  getRedisClient: vi.fn().mockResolvedValue(null),
  presenceKeys: {
    onlineSockets: (userId: string) => `presence:${userId}`,
  },
}))

function createUseCase() {
  const users = new Map([
    [
      'owner-1',
      {
        id: 'owner-1',
        username: 'owner',
        displayName: 'Owner',
        avatarUrl: null,
        isBot: false,
        status: 'offline',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
    ],
    [
      'viewer-1',
      {
        id: 'viewer-1',
        username: 'viewer',
        displayName: 'Viewer',
        avatarUrl: null,
        isBot: false,
        status: 'offline',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
    ],
    [
      'bot-private',
      {
        id: 'bot-private',
        username: 'private-buddy',
        displayName: 'Private Buddy',
        avatarUrl: null,
        isBot: true,
        status: 'offline',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
    ],
    [
      'bot-shareable',
      {
        id: 'bot-shareable',
        username: 'shareable-buddy',
        displayName: 'Shareable Buddy',
        avatarUrl: null,
        isBot: true,
        status: 'offline',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
    ],
  ])
  const agents = [
    {
      id: 'agent-private',
      userId: 'bot-private',
      ownerId: 'owner-1',
      status: 'running',
      totalOnlineSeconds: 10,
      config: { buddyMode: 'private', description: 'private' },
    },
    {
      id: 'agent-shareable',
      userId: 'bot-shareable',
      ownerId: 'owner-1',
      status: 'running',
      totalOnlineSeconds: 20,
      config: { buddyMode: 'shareable', description: 'shareable' },
    },
  ]

  const useCase = new AuthUseCase({
    accessService: {},
    userDao: {
      findById: vi.fn(async (id: string) => users.get(id) ?? null),
    },
    agentDao: {
      findByUserId: vi.fn(
        async (userId: string) => agents.find((agent) => agent.userId === userId) ?? null,
      ),
      findByOwnerId: vi.fn(async (ownerId: string) =>
        agents.filter((agent) => agent.ownerId === ownerId),
      ),
    },
    serverDao: {},
    mediaService: {
      resolveMediaUrl: (value: string | null) => value,
    },
    walletService: {},
    taskCenterService: {},
  } as never)

  return { useCase }
}

describe('AuthUseCase public profile Buddy privacy', () => {
  it('does not expose a private Buddy profile to non-owners', async () => {
    const { useCase } = createUseCase()

    const profile = await useCase.getUserPublicProfile(
      { kind: 'user', userId: 'viewer-1', authMethod: 'jwt', scopes: [] },
      'bot-private',
    )

    expect(profile).toBeNull()
  })

  it('filters private Buddies from another user public profile', async () => {
    const { useCase } = createUseCase()

    const profile = await useCase.getUserPublicProfile(
      { kind: 'user', userId: 'viewer-1', authMethod: 'jwt', scopes: [] },
      'owner-1',
    )

    expect(profile?.ownedAgents.map((agent) => agent.userId)).toEqual(['bot-shareable'])
  })

  it('keeps private Buddies visible to the owner', async () => {
    const { useCase } = createUseCase()

    const profile = await useCase.getUserPublicProfile(
      { kind: 'user', userId: 'owner-1', authMethod: 'jwt', scopes: [] },
      'owner-1',
    )

    expect(profile?.ownedAgents.map((agent) => agent.userId).sort()).toEqual([
      'bot-private',
      'bot-shareable',
    ])
  })
})
