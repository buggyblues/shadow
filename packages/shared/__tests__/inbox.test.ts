import { describe, expect, it } from 'vitest'
import {
  BUDDY_INBOX_DELIVERY_PERMISSION,
  type BuddyInboxViewMessage,
  buddyInboxMessageMatchesTaskFilter,
  buildBuddyInboxViewMessages,
  buildMessageAgentChainMetadata,
  buildMessageCopilotContextMetadata,
  getBuddyInboxTaskCards,
  getBuddyInboxTaskMessageIds,
  hasBuddyInboxTaskCard,
  isBuddyInboxPlatformPermission,
  isBuddyInboxTaskReply,
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

  it('identifies task card messages and their replies', () => {
    const task = taskMessage('task-1', 'running')
    const reply = { id: 'reply-1', replyToId: 'task-1' } satisfies BuddyInboxViewMessage
    const chat = { id: 'chat-1', metadata: { cards: [{ kind: 'note', id: 'n-1' }] } }

    const taskIds = getBuddyInboxTaskMessageIds([task, reply, chat])

    expect(hasBuddyInboxTaskCard(task)).toBe(true)
    expect(hasBuddyInboxTaskCard(chat)).toBe(false)
    expect(taskIds).toEqual(new Set(['task-1']))
    expect(isBuddyInboxTaskReply(reply, taskIds)).toBe(true)
  })

  it('does not treat legacy reply notification task cards as Inbox tasks', () => {
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

    expect(getBuddyInboxTaskCards(notification)).toEqual([])
    expect(hasBuddyInboxTaskCard(notification)).toBe(false)
    expect(
      buildBuddyInboxViewMessages([notification], {
        isInboxChannel: true,
        mode: 'tasks',
      }),
    ).toEqual([])
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

  it('keeps Inbox display independent of composer mode and folds task replies', () => {
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
    ).toEqual(['task-1', 'chat-1'])
    expect(
      buildBuddyInboxViewMessages(messages, {
        isInboxChannel: true,
        mode: 'tasks',
      }).map((message) => message.id),
    ).toEqual(['task-1', 'chat-1'])
  })

  it('filters task cards while preserving ordinary chat messages in the all filter', () => {
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
    ).toEqual(['task-1', 'chat-1', 'task-2'])
    expect(
      buildBuddyInboxViewMessages(messages, {
        isInboxChannel: true,
        mode: 'chat',
        taskFilter: 'open',
      }).map((message) => message.id),
    ).toEqual(['task-1'])
    expect(
      buildBuddyInboxViewMessages(messages, {
        isInboxChannel: true,
        mode: 'tasks',
        taskFilter: 'open',
      }).map((message) => message.id),
    ).toEqual(['task-1'])
    expect(
      buildBuddyInboxViewMessages(messages, {
        isInboxChannel: true,
        mode: 'tasks',
        taskFilter: 'done',
      }).map((message) => message.id),
    ).toEqual(['task-2'])
  })

  it('filters open and terminal task cards', () => {
    const running = taskMessage('task-running', 'running')
    const completed = taskMessage('task-completed', 'completed')
    const mixed = {
      id: 'task-mixed',
      metadata: {
        cards: [
          {
            id: 'card-running',
            kind: 'task',
            version: 1,
            title: 'Running',
            status: 'running',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
          {
            id: 'card-failed',
            kind: 'task',
            version: 1,
            title: 'Failed',
            status: 'failed',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
    } satisfies BuddyInboxViewMessage

    expect(buddyInboxMessageMatchesTaskFilter(running, 'open')).toBe(true)
    expect(buddyInboxMessageMatchesTaskFilter(running, 'done')).toBe(false)
    expect(buddyInboxMessageMatchesTaskFilter(completed, 'open')).toBe(false)
    expect(buddyInboxMessageMatchesTaskFilter(completed, 'done')).toBe(true)
    expect(buddyInboxMessageMatchesTaskFilter(mixed, 'open')).toBe(true)
    expect(buddyInboxMessageMatchesTaskFilter(mixed, 'done')).toBe(false)
  })
})
