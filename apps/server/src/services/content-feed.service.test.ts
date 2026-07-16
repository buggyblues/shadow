import { describe, expect, it, vi } from 'vitest'
import { ContentFeedService } from './content-feed.service'

type ServiceOverrides = {
  contentFeedDao?: Record<string, unknown>
  messageDao?: Record<string, unknown>
  channelDao?: Record<string, unknown>
  channelAccessService?: Record<string, unknown>
}

function createService(overrides: ServiceOverrides = {}) {
  const contentFeedDao = {
    upsertFeedItem: vi.fn(async (input) => ({
      id: 'feed-1',
      channelId: input.channelId,
      serverId: input.serverId,
      publishedAt: input.publishedAt,
    })),
    deleteFeedItemByMessageId: vi.fn(),
    findPreferences: vi.fn(async () => null),
    upsertPreferences: vi.fn(async (userId, input) => ({
      id: 'pref-1',
      userId,
      includeKinds: input.includeKinds ?? ['image', 'html', 'pdf', 'file', 'voice', 'card'],
      pushEnabled: input.pushEnabled ?? true,
      digestMode: input.digestMode ?? 'realtime',
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
      updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    })),
    ...overrides.contentFeedDao,
  }
  const messageDao = {
    findById: vi.fn(),
    getAttachments: vi.fn(async () => []),
    ...overrides.messageDao,
  }
  const channelDao = {
    findById: vi.fn(),
    ...overrides.channelDao,
  }
  const channelAccessService = {
    assertCanRead: vi.fn(async () => ({
      id: 'channel-1',
      kind: 'server',
      serverId: 'server-1',
    })),
    ...overrides.channelAccessService,
  }
  const service = new ContentFeedService({
    contentFeedDao: contentFeedDao as never,
    messageDao: messageDao as never,
    channelDao: channelDao as never,
    channelAccessService: channelAccessService as never,
  })
  return { service, contentFeedDao, messageDao, channelDao, channelAccessService }
}

describe('ContentFeedService', () => {
  it('indexes attachments and Space App cards from unified metadata cards', async () => {
    const createdAt = new Date('2026-06-01T00:00:00.000Z')
    const { service, contentFeedDao, messageDao, channelDao } = createService({
      messageDao: {
        findById: vi.fn(async () => ({
          id: 'message-1',
          threadId: null,
          channelId: 'channel-1',
          authorId: 'user-1',
          content: 'Open the report',
          createdAt,
          metadata: {
            cards: [
              {
                kind: 'space_app',
                appKey: 'reporter',
                title: 'Launch report',
                description: 'Open the report app',
                action: { mode: 'open_space_app', path: '/reports/weekly' },
              },
            ],
          },
        })),
        getAttachments: vi.fn(async () => [
          {
            id: 'attachment-1',
            filename: 'voice-1.webm',
            contentType: 'audio/webm',
            kind: 'voice',
            size: 1024,
          },
        ]),
      },
      channelDao: {
        findById: vi.fn(async () => ({
          id: 'channel-1',
          kind: 'server',
          serverId: 'server-1',
        })),
      },
    })

    await service.indexMessage('message-1')

    expect(contentFeedDao.upsertFeedItem).toHaveBeenCalledOnce()
    const input = contentFeedDao.upsertFeedItem.mock.calls[0]?.[0]
    expect(input).toMatchObject({
      messageId: 'message-1',
      channelId: 'channel-1',
      serverId: 'server-1',
      title: 'Launch report',
      primaryAttachmentId: 'attachment-1',
      primaryAttachmentContentType: 'audio/webm',
      primaryAttachmentSize: 1024,
      attachmentIds: ['attachment-1'],
    })
    expect(input.contentKinds).toEqual(expect.arrayContaining(['voice', 'card']))
    expect(input.cardRefs).toEqual([
      expect.objectContaining({
        kind: 'space_app',
        appKey: 'reporter',
        title: 'Launch report',
        action: { mode: 'open_space_app', path: '/reports/weekly' },
      }),
    ])
    expect(messageDao.findById).toHaveBeenCalledWith('message-1')
    expect(channelDao.findById).toHaveBeenCalledWith('channel-1')
  })

  it('does not index empty card metadata as content', async () => {
    const { service, contentFeedDao } = createService({
      messageDao: {
        findById: vi.fn(async () => ({
          id: 'message-2',
          threadId: null,
          channelId: 'channel-1',
          authorId: 'user-1',
          content: '',
          createdAt: new Date('2026-06-01T00:00:00.000Z'),
          metadata: {
            cards: [],
          },
        })),
        getAttachments: vi.fn(async () => []),
      },
      channelDao: {
        findById: vi.fn(async () => ({
          id: 'channel-1',
          kind: 'server',
          serverId: 'server-1',
        })),
      },
    })

    await service.indexMessage('message-2')

    expect(contentFeedDao.upsertFeedItem).not.toHaveBeenCalled()
    expect(contentFeedDao.deleteFeedItemByMessageId).toHaveBeenCalledWith('message-2')
  })

  it('treats zero-width-only message text as empty when indexing attachment content', async () => {
    const createdAt = new Date('2026-06-01T00:00:00.000Z')
    const { service, contentFeedDao } = createService({
      messageDao: {
        findById: vi.fn(async () => ({
          id: 'message-3',
          threadId: null,
          channelId: 'channel-1',
          authorId: 'user-1',
          content: '\u200B',
          createdAt,
          metadata: {},
        })),
        getAttachments: vi.fn(async () => [
          {
            id: 'attachment-3',
            filename: 'page.html',
            contentType: 'text/html',
            kind: 'file',
            size: 2048,
          },
        ]),
      },
      channelDao: {
        findById: vi.fn(async () => ({
          id: 'channel-1',
          kind: 'server',
          serverId: 'server-1',
        })),
      },
    })

    await service.indexMessage('message-3')

    const input = contentFeedDao.upsertFeedItem.mock.calls[0]?.[0]
    expect(input).toMatchObject({
      title: 'page.html',
      summary: null,
      contentKinds: ['html'],
      primaryAttachmentId: 'attachment-3',
    })
  })

  it('preserves score in feed cursors for recommended pagination', () => {
    const { service } = createService()
    const publishedAt = new Date('2026-06-01T01:00:00.000Z')

    const encoded = service.encodeCursor({ publishedAt, id: 'feed-1', score: 35 })
    const decoded = service.decodeCursor(encoded)

    expect(decoded).toEqual({ publishedAt, id: 'feed-1', score: 35 })
  })

  it('backfills recent unindexed messages when the first feed page is underfilled', async () => {
    const publishedAt = new Date('2026-06-01T01:00:00.000Z')
    const feedRow = {
      item: {
        id: 'feed-1',
        messageId: 'message-1',
        channelId: 'channel-1',
        serverId: 'server-1',
        authorId: 'user-1',
        title: 'report.pdf',
        summary: null,
        contentKinds: ['pdf'],
        primaryAttachmentId: 'attachment-1',
        primaryAttachmentContentType: 'application/pdf',
        primaryAttachmentSize: 4096,
        attachmentIds: ['attachment-1'],
        cardRefs: [],
        score: 20,
        publishedAt,
        createdAt: publishedAt,
        updatedAt: publishedAt,
      },
      subscription: null,
      event: null,
      channel: {
        id: 'channel-1',
        name: 'general',
        type: 'text',
        serverId: 'server-1',
      },
      server: {
        id: 'server-1',
        name: 'Team',
        slug: 'team',
        iconUrl: null,
      },
      author: {
        id: 'user-1',
        username: 'alice',
        displayName: 'Alice',
        avatarUrl: null,
        isBot: false,
      },
      primaryAttachmentDurationMs: null,
      likeCount: 2,
      viewerLiked: true,
      commentCount: 1,
    }
    const listFeed = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([feedRow])
    const listRecentUnindexedMessageIds = vi.fn(async () => ['message-1'])
    const { service, contentFeedDao } = createService({
      contentFeedDao: {
        listFeed,
        listRecentUnindexedMessageIds,
      },
      messageDao: {
        findById: vi.fn(async () => ({
          id: 'message-1',
          threadId: null,
          channelId: 'channel-1',
          authorId: 'user-1',
          content: 'report',
          createdAt: publishedAt,
          metadata: {},
        })),
        getAttachments: vi.fn(async () => [
          {
            id: 'attachment-1',
            filename: 'report.pdf',
            contentType: 'application/pdf',
            kind: 'file',
            size: 4096,
          },
        ]),
      },
      channelDao: {
        findById: vi.fn(async () => ({
          id: 'channel-1',
          kind: 'server',
          serverId: 'server-1',
        })),
      },
    })

    await expect(service.listFeed({ userId: 'user-1', limit: 30 })).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: 'feed-1',
          primaryAttachmentDurationMs: null,
          readState: 'unread',
          interactions: {
            likeCount: 2,
            viewerLiked: true,
            commentCount: 1,
            viewerSaved: false,
          },
        }),
      ],
      hasMore: false,
      nextCursor: null,
    })

    expect(listFeed).toHaveBeenCalledTimes(2)
    expect(listRecentUnindexedMessageIds).toHaveBeenCalledWith({
      userId: 'user-1',
      channelId: undefined,
      serverId: undefined,
      limit: 80,
    })
    expect(contentFeedDao.upsertFeedItem).toHaveBeenCalledOnce()
  })

  it('returns implicit active subscriptions for accessible channels without rows', async () => {
    const { service } = createService({
      contentFeedDao: {
        listSubscriptions: vi.fn(async () => [
          {
            subscription: null,
            channel: {
              id: 'channel-1',
              name: 'reports',
              type: 'text',
              isPrivate: false,
              serverId: 'server-1',
              lastMessageAt: null,
            },
            server: {
              id: 'server-1',
              name: 'Team',
              slug: 'team',
              iconUrl: null,
            },
          },
        ]),
      },
    })

    await expect(service.listSubscriptions({ userId: 'user-1' })).resolves.toEqual([
      expect.objectContaining({
        id: 'default:channel-1',
        userId: 'user-1',
        channelId: 'channel-1',
        serverId: 'server-1',
        status: 'active',
        includeKinds: ['image', 'html', 'pdf', 'file', 'voice', 'card'],
        isDefault: true,
      }),
    ])
  })

  it('pauses implicit default subscriptions instead of deleting access-derived defaults', async () => {
    const { service, contentFeedDao, channelAccessService } = createService({
      contentFeedDao: {
        upsertSubscription: vi.fn(async (input) => ({
          id: 'sub-1',
          userId: input.userId,
          channelId: input.channelId,
          serverId: input.serverId,
          status: input.status,
          includeKinds: ['image', 'html', 'pdf', 'file', 'voice', 'card'],
          excludeMimeTypes: [],
          minAttachmentSize: null,
          maxAttachmentSize: null,
          pushEnabled: true,
          digestMode: 'realtime',
          lastReadAt: null,
          createdAt: new Date('2026-06-01T00:00:00.000Z'),
          updatedAt: new Date('2026-06-01T00:00:00.000Z'),
        })),
      },
    })

    await expect(service.deleteSubscription('user-1', 'default:channel-1')).resolves.toEqual({
      ok: true,
    })

    expect(channelAccessService.assertCanRead).toHaveBeenCalledWith('channel-1', 'user-1')
    expect(
      (contentFeedDao as unknown as { upsertSubscription: ReturnType<typeof vi.fn> })
        .upsertSubscription,
    ).toHaveBeenCalledWith({
      userId: 'user-1',
      channelId: 'channel-1',
      serverId: 'server-1',
      status: 'paused',
    })
  })
})
