import { describe, expect, it } from 'vitest'
import {
  BUDDY_INBOX_DELIVERY_PERMISSION,
  type BuddyInboxViewMessage,
  buildBuddyInboxViewMessages,
  buildMessageAgentChainMetadata,
  buildMessageCopilotContextMetadata,
  getBuddyInboxTaskCards,
  hasBuddyInboxTaskCard,
  isBuddyInboxPlatformPermission,
  isMessageAgentChainMetadata,
  isMessageCopilotContext,
  isMessageReferenceCard,
} from '../src/types'

function taskMessage(id: string, status: 'queued' | 'running' | 'completed' | 'failed') {
  return {
    id,
    metadata: {
      cards: [
        {
          id: `card-${id}`,
          kind: 'task',
          version: 1,
          title: `Task ${id}`,
          status,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    },
  } satisfies BuddyInboxViewMessage
}

describe('Buddy Inbox view helpers', () => {
  it('validates and wraps Copilot app message metadata', () => {
    const context = {
      kind: 'server_app_copilot',
      appKey: 'kanban',
      serverAppId: 'server-app-1',
      appName: 'Kanban',
      serverId: 'server-1',
      serverSlug: 'growth',
      channelId: 'inbox-1',
      channelKind: 'inbox',
    } as const

    expect(isMessageCopilotContext(context)).toBe(true)
    expect(buildMessageCopilotContextMetadata(context)).toEqual({ copilotContext: context })
    expect(
      isMessageCopilotContext({
        kind: 'server_app_copilot',
        appKey: '',
      }),
    ).toBe(false)
  })

  it('validates and wraps runtime agent chain metadata', () => {
    const agentChain = {
      agentId: 'brandscout',
      depth: 1,
      participants: ['550e8400-e29b-41d4-a716-446655440001'],
      startedAt: 1_802_000_000_000,
      rootMessageId: '550e8400-e29b-41d4-a716-446655440000',
    }

    expect(isMessageAgentChainMetadata(agentChain)).toBe(true)
    expect(buildMessageAgentChainMetadata(agentChain)).toEqual({ agentChain })
    expect(
      isMessageAgentChainMetadata({
        ...agentChain,
        participants: Array.from({ length: 101 }, (_, index) => `agent-${index}`),
      }),
    ).toBe(false)
  })

  it('exposes the platform permission for Server App task delivery', () => {
    expect(BUDDY_INBOX_DELIVERY_PERMISSION).toBe('buddy_inbox:deliver')
    expect(isBuddyInboxPlatformPermission('buddy_inbox:deliver')).toBe(true)
    expect(isBuddyInboxPlatformPermission('demo.tickets:write')).toBe(false)
  })

  it('identifies task card messages', () => {
    const task = taskMessage('task-1', 'running')
    const chat = { id: 'chat-1', metadata: { cards: [{ kind: 'note', id: 'n-1' }] } }

    expect(hasBuddyInboxTaskCard(task)).toBe(true)
    expect(hasBuddyInboxTaskCard(chat)).toBe(false)
  })

  it('does not apply legacy reply notification compatibility', () => {
    const notification = {
      id: 'notification-1',
      metadata: {
        cards: [
          {
            id: 'reply-notification-card',
            kind: 'task',
            version: 1,
            title: 'Review reply: Render',
            status: 'completed',
            createdAt: '2026-01-01T00:00:00.000Z',
            data: { taskReplyNotification: true },
          },
        ],
      },
    } satisfies BuddyInboxViewMessage

    expect(getBuddyInboxTaskCards(notification)).toHaveLength(1)
    expect(hasBuddyInboxTaskCard(notification)).toBe(true)
    expect(
      buildBuddyInboxViewMessages([notification], {
        isInboxChannel: true,
        mode: 'tasks',
      }),
    ).toEqual([notification])
  })

  it('identifies message reference cards for cross-Inbox reply notifications', () => {
    expect(
      isMessageReferenceCard({
        kind: 'message_reference',
        title: 'Open reply',
        target: {
          channelId: 'worker-inbox',
          messageId: 'reply-1',
          kind: 'inbox_message',
        },
      }),
    ).toBe(true)
    expect(isMessageReferenceCard({ kind: 'message_reference', title: 'Broken' })).toBe(false)
  })

  it('preserves task requirements, output contract, and privacy extensions', () => {
    const message = {
      id: 'task-extensions',
      metadata: {
        cards: [
          {
            id: 'card-task-extensions',
            kind: 'task',
            version: 1,
            title: 'Render workspace artifact',
            status: 'queued',
            createdAt: '2026-01-01T00:00:00.000Z',
            requirements: {
              capabilities: ['workspace.write'],
              skills: [{ kind: 'runtime-skill', package: '@shadow/skills-media' }],
            },
            outputContract: {
              expectedArtifacts: [{ kind: 'workspace.file', mimeTypes: ['video/mp4'] }],
              submitCommand: { appKey: 'kanban', command: 'cards.artifacts.add' },
            },
            privacy: { dataClass: 'server-private', redactionRequired: true },
          },
        ],
      },
    } satisfies BuddyInboxViewMessage

    const [card] = getBuddyInboxTaskCards(message)

    expect(card?.requirements?.skills?.[0]?.package).toBe('@shadow/skills-media')
    expect(card?.outputContract?.submitCommand?.command).toBe('cards.artifacts.add')
    expect(card?.privacy?.dataClass).toBe('server-private')
  })

  it('keeps Inbox display independent of composer mode without folding task replies', () => {
    const messages = [
      taskMessage('task-1', 'running'),
      { id: 'reply-1', replyToId: 'task-1' },
      { id: 'chat-1' },
    ] satisfies BuddyInboxViewMessage[]

    expect(
      buildBuddyInboxViewMessages(messages, {
        isInboxChannel: true,
        mode: 'chat',
      }).map((message) => message.id),
    ).toEqual(['task-1', 'reply-1', 'chat-1'])
    expect(
      buildBuddyInboxViewMessages(messages, {
        isInboxChannel: true,
        mode: 'tasks',
      }).map((message) => message.id),
    ).toEqual(['task-1', 'reply-1', 'chat-1'])
  })

  it('does not filter task cards by task state', () => {
    const messages = [
      taskMessage('task-1', 'running'),
      { id: 'reply-1', replyToId: 'task-1' },
      { id: 'chat-1' },
      taskMessage('task-2', 'completed'),
    ] satisfies BuddyInboxViewMessage[]

    expect(
      buildBuddyInboxViewMessages(messages, {
        isInboxChannel: true,
        mode: 'tasks',
      }).map((message) => message.id),
    ).toEqual(['task-1', 'reply-1', 'chat-1', 'task-2'])
    expect(
      buildBuddyInboxViewMessages(messages, {
        isInboxChannel: true,
        mode: 'chat',
      }).map((message) => message.id),
    ).toEqual(['task-1', 'reply-1', 'chat-1', 'task-2'])
  })
})
