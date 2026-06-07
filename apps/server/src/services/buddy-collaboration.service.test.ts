import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BuddyCollaborationService } from './buddy-collaboration.service'

const channelId = '00000000-0000-4000-8000-000000000001'
const rootMessageId = '00000000-0000-4000-8000-000000000002'
const replyToMessageId = '00000000-0000-4000-8000-000000000003'
const buddyId = '00000000-0000-4000-8000-000000000004'
const actorUserId = '00000000-0000-4000-8000-000000000005'
const otherBuddyId = '00000000-0000-4000-8000-000000000008'
const otherActorUserId = '00000000-0000-4000-8000-000000000009'

function createService() {
  const agentDao = {
    findById: vi.fn().mockResolvedValue({
      id: buddyId,
      userId: actorUserId,
    }),
    findByUserIds: vi.fn().mockResolvedValue([]),
  }
  const channelAccessService = {
    getAccess: vi.fn().mockResolvedValue({ ok: true }),
  }
  const messageDao = {
    findById: vi.fn(async (id: string) => ({
      id,
      channelId,
      content: id === rootMessageId ? '<@buddy> 怎么协作更安静？' : 'reply',
    })),
    findThreadByParentMessageId: vi.fn().mockResolvedValue(null),
    createThread: vi.fn().mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000007',
      channelId,
      parentMessageId: rootMessageId,
    }),
  }
  const buddyCollaborationDao = {
    claim: vi.fn().mockResolvedValue({
      ok: true,
      collaboration: {
        id: '00000000-0000-4000-8000-000000000006',
        turn: 1,
        threadId: null,
      },
    }),
    setThreadId: vi.fn().mockResolvedValue(null),
  }

  return {
    deps: {
      agentDao,
      buddyCollaborationDao,
      channelAccessService,
      messageDao,
    },
    service: new BuddyCollaborationService({
      agentDao,
      buddyCollaborationDao,
      channelAccessService,
      messageDao,
    } as never),
  }
}

describe('BuddyCollaborationService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('claims a Buddy reply and returns collaboration metadata', async () => {
    const { deps, service } = createService()

    const result = await service.claimBuddyReply({
      actorUserId,
      buddyId,
      channelId,
      replyToMessageId,
      rootMessageId,
    })

    expect(result).toEqual({
      ok: true,
      collaborationId: '00000000-0000-4000-8000-000000000006',
      turn: 1,
      replyToId: replyToMessageId,
      target: 'main',
      suggestedTextLimit: 160,
      replyDensity: 'short',
      metadata: {
        collaboration: {
          id: '00000000-0000-4000-8000-000000000006',
          rootMessageId,
          buddyId,
          turn: 1,
          target: 'main',
          suggestedTextLimit: 160,
          replyDensity: 'short',
        },
      },
    })
    expect(deps.buddyCollaborationDao.claim).toHaveBeenCalledWith({
      channelId,
      rootMessageId,
      buddyId,
      replyToMessageId,
      maxTurns: 4,
      ttlMs: 10 * 60 * 1000,
    })
  })

  it('rejects claims from users that do not own the Buddy runtime identity', async () => {
    const { deps, service } = createService()
    deps.agentDao.findById.mockResolvedValueOnce({
      id: buddyId,
      userId: '00000000-0000-4000-8000-000000000099',
    })

    await expect(
      service.claimBuddyReply({
        actorUserId,
        buddyId,
        channelId,
        replyToMessageId,
        rootMessageId,
      }),
    ).resolves.toEqual({ ok: false, reason: 'policy_denied' })
    expect(deps.channelAccessService.getAccess).not.toHaveBeenCalled()
    expect(deps.buddyCollaborationDao.claim).not.toHaveBeenCalled()
  })

  it('caps max turns before claiming the collaboration', async () => {
    const { deps, service } = createService()

    await service.claimBuddyReply({
      actorUserId,
      buddyId,
      channelId,
      maxTurns: 99,
      replyToMessageId,
      rootMessageId,
    })

    expect(deps.buddyCollaborationDao.claim).toHaveBeenCalledWith(
      expect.objectContaining({ maxTurns: 8 }),
    )
  })

  it('passes initial claim mode to the collaboration dao', async () => {
    const { deps, service } = createService()

    await service.claimBuddyReply({
      actorUserId,
      buddyId,
      channelId,
      mode: 'initial',
      replyToMessageId,
      rootMessageId,
    })

    expect(deps.buddyCollaborationDao.claim).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'initial' }),
    )
  })

  it('routes multi-Buddy initial claims into a collaboration thread', async () => {
    const { deps, service } = createService()
    deps.messageDao.findById.mockImplementation(async (id: string) => ({
      id,
      channelId,
      content: id === rootMessageId ? '<@buddy-1> <@buddy-2> 辩论一下' : 'reply',
      metadata:
        id === rootMessageId
          ? {
              mentions: [
                {
                  kind: 'buddy',
                  targetId: actorUserId,
                  userId: actorUserId,
                  token: `<@${actorUserId}>`,
                  label: '@一号机',
                },
                {
                  kind: 'buddy',
                  targetId: otherActorUserId,
                  userId: otherActorUserId,
                  token: `<@${otherActorUserId}>`,
                  label: '@二号机',
                },
              ],
            }
          : null,
    }))
    deps.agentDao.findByUserIds.mockResolvedValueOnce([
      { id: buddyId, userId: actorUserId },
      { id: otherBuddyId, userId: otherActorUserId },
    ])

    const result = await service.claimBuddyReply({
      actorUserId,
      buddyId,
      channelId,
      mode: 'initial',
      replyToMessageId,
      rootMessageId,
    })

    expect(result).toMatchObject({
      ok: true,
      target: 'thread',
      threadId: '00000000-0000-4000-8000-000000000007',
      metadata: {
        collaboration: {
          buddyId,
          target: 'thread',
          threadId: '00000000-0000-4000-8000-000000000007',
        },
      },
    })
    expect(deps.buddyCollaborationDao.claim).toHaveBeenCalledWith(
      expect.objectContaining({
        mentionedBuddyIds: [buddyId, otherBuddyId],
        mode: 'initial',
      }),
    )
  })

  it('rejects initial collaboration claims from Buddies not mentioned by the root message', async () => {
    const { deps, service } = createService()
    deps.messageDao.findById.mockImplementation(async (id: string) => ({
      id,
      channelId,
      content: id === rootMessageId ? '<@buddy-2> 辩论一下' : 'reply',
      metadata:
        id === rootMessageId
          ? {
              mentions: [
                {
                  kind: 'buddy',
                  targetId: otherActorUserId,
                  userId: otherActorUserId,
                  token: `<@${otherActorUserId}>`,
                  label: '@二号机',
                },
              ],
            }
          : null,
    }))
    deps.agentDao.findByUserIds.mockResolvedValueOnce([
      { id: otherBuddyId, userId: otherActorUserId },
    ])

    await expect(
      service.claimBuddyReply({
        actorUserId,
        buddyId,
        channelId,
        mode: 'initial',
        replyToMessageId,
        rootMessageId,
      }),
    ).resolves.toEqual({ ok: false, reason: 'policy_denied' })
    expect(deps.buddyCollaborationDao.claim).not.toHaveBeenCalled()
  })

  it('routes second and later turns to the root thread', async () => {
    const { deps, service } = createService()
    deps.buddyCollaborationDao.claim.mockResolvedValueOnce({
      ok: true,
      collaboration: {
        id: '00000000-0000-4000-8000-000000000006',
        turn: 2,
        threadId: null,
      },
    })

    const result = await service.claimBuddyReply({
      actorUserId,
      buddyId,
      channelId,
      replyToMessageId,
      rootMessageId,
    })

    expect(result).toEqual({
      ok: true,
      collaborationId: '00000000-0000-4000-8000-000000000006',
      turn: 2,
      replyToId: replyToMessageId,
      target: 'thread',
      threadId: '00000000-0000-4000-8000-000000000007',
      suggestedTextLimit: 360,
      replyDensity: 'short',
      metadata: {
        collaboration: {
          id: '00000000-0000-4000-8000-000000000006',
          rootMessageId,
          buddyId,
          turn: 2,
          target: 'thread',
          threadId: '00000000-0000-4000-8000-000000000007',
          suggestedTextLimit: 360,
          replyDensity: 'short',
        },
      },
    })
    expect(deps.messageDao.findThreadByParentMessageId).toHaveBeenCalledWith(rootMessageId)
    expect(deps.messageDao.createThread).toHaveBeenCalledWith({
      name: '怎么协作更安静？',
      channelId,
      parentMessageId: rootMessageId,
      creatorId: actorUserId,
    })
    expect(deps.buddyCollaborationDao.setThreadId).toHaveBeenCalledWith({
      channelId,
      rootMessageId,
      threadId: '00000000-0000-4000-8000-000000000007',
    })
  })
})
