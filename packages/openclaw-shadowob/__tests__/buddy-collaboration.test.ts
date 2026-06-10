import type { ShadowMessage } from '@shadowob/sdk'
import { describe, expect, it, vi } from 'vitest'
import { claimBuddyCollaborationForRuntime } from '../src/monitor/buddy-collaboration.js'

function message(input: Partial<ShadowMessage>): ShadowMessage {
  return {
    id: 'msg-1',
    content: 'hello',
    channelId: 'channel-1',
    authorId: 'user-1',
    createdAt: '2026-06-10T00:00:00.000Z',
    updatedAt: '2026-06-10T00:00:00.000Z',
    ...input,
  } as ShadowMessage
}

function okClaim(input: {
  rootMessageId: string
  buddyId: string
  turn: number
  target?: 'main' | 'thread'
  threadId?: string
}) {
  const target = input.target ?? 'main'
  return {
    ok: true as const,
    collaborationId: 'collab-1',
    turn: input.turn,
    replyToId: 'reply-to-1',
    target,
    ...(input.threadId ? { threadId: input.threadId } : {}),
    suggestedTextLimit: target === 'main' ? 160 : 360,
    replyDensity: 'short' as const,
    metadata: {
      collaboration: {
        id: 'collab-1',
        rootMessageId: input.rootMessageId,
        buddyId: input.buddyId,
        turn: input.turn,
        target,
        ...(input.threadId ? { threadId: input.threadId } : {}),
        suggestedTextLimit: target === 'main' ? 160 : 360,
        replyDensity: 'short' as const,
      },
    },
  }
}

describe('OpenClaw Buddy collaboration claim adapter', () => {
  it('claims initial turns for human messages that pass preflight', async () => {
    const claimBuddyReply = vi.fn(async (input) =>
      okClaim({ rootMessageId: input.rootMessageId, buddyId: input.buddyId, turn: 1 }),
    )

    const result = await claimBuddyCollaborationForRuntime({
      client: { claimBuddyReply },
      message: message({ id: 'root-1' }),
      channelId: 'channel-1',
      agentId: 'buddy-1',
      maxTurns: 3,
      isProcessingBuddyMessage: false,
      hasRuntimeTaskCard: false,
    })

    expect(claimBuddyReply).toHaveBeenCalledWith({
      channelId: 'channel-1',
      rootMessageId: 'root-1',
      buddyId: 'buddy-1',
      replyToMessageId: 'root-1',
      maxTurns: 3,
      mode: 'initial',
    })
    expect(result).toMatchObject({
      ok: true,
      claimed: true,
      replyToId: 'reply-to-1',
      target: 'main',
      collaboration: {
        id: 'collab-1',
        rootMessageId: 'root-1',
        buddyId: 'buddy-1',
        turn: 1,
      },
    })
  })

  it('skips Buddy messages that do not carry collaboration metadata', async () => {
    const claimBuddyReply = vi.fn()

    const result = await claimBuddyCollaborationForRuntime({
      client: { claimBuddyReply },
      message: message({
        id: 'buddy-msg-1',
        authorId: 'buddy-user-2',
        author: { id: 'buddy-user-2', username: 'other-buddy', isBot: true },
      }),
      channelId: 'channel-1',
      agentId: 'buddy-1',
      isProcessingBuddyMessage: true,
      hasRuntimeTaskCard: false,
    })

    expect(claimBuddyReply).not.toHaveBeenCalled()
    expect(result).toEqual({
      ok: false,
      mode: 'conversation',
      reason: 'missing_collaboration',
    })
  })

  it('claims conversation turns using the original collaboration root', async () => {
    const claimBuddyReply = vi.fn(async (input) =>
      okClaim({
        rootMessageId: input.rootMessageId,
        buddyId: input.buddyId,
        turn: 2,
        target: 'thread',
        threadId: 'thread-1',
      }),
    )

    const result = await claimBuddyCollaborationForRuntime({
      client: { claimBuddyReply },
      message: message({
        id: 'buddy-msg-1',
        authorId: 'buddy-user-2',
        author: { id: 'buddy-user-2', username: 'other-buddy', isBot: true },
        metadata: {
          collaboration: {
            id: 'collab-1',
            rootMessageId: 'root-1',
            buddyId: 'buddy-2',
            turn: 1,
          },
        },
      }),
      channelId: 'channel-1',
      agentId: 'buddy-1',
      maxTurns: 2,
      isProcessingBuddyMessage: true,
      hasRuntimeTaskCard: false,
    })

    expect(claimBuddyReply).toHaveBeenCalledWith({
      channelId: 'channel-1',
      rootMessageId: 'root-1',
      buddyId: 'buddy-1',
      replyToMessageId: 'buddy-msg-1',
      maxTurns: 2,
      mode: 'conversation',
    })
    expect(result).toMatchObject({
      ok: true,
      claimed: true,
      target: 'thread',
      threadId: 'thread-1',
      collaboration: {
        rootMessageId: 'root-1',
        turn: 2,
      },
    })
  })
})
