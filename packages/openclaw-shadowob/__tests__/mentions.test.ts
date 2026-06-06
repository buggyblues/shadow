import type { ShadowMessage } from '@shadowob/sdk'
import { describe, expect, it, vi } from 'vitest'
import {
  formatShadowMentionsForAgent,
  mentionsTargetServerApp,
  mentionTargetsBot,
} from '../src/mentions.js'
import { evaluateShadowMessagePreflight } from '../src/monitor/preflight.js'
import { isActiveTaskCardForBuddy, taskCardTargetsBuddy } from '../src/monitor/task-card-routing.js'

function baseMessage(input: Partial<ShadowMessage>): ShadowMessage {
  return {
    id: 'msg-1',
    content: 'hello',
    channelId: 'channel-1',
    authorId: 'user-1',
    createdAt: '2026-05-02T00:00:00.000Z',
    updatedAt: '2026-05-02T00:00:00.000Z',
    ...input,
  } as ShadowMessage
}

describe('Shadow OpenClaw mentions', () => {
  it('uses structured mentions for mentionOnly policies', () => {
    const result = evaluateShadowMessagePreflight({
      message: baseMessage({
        content: 'hello <@bot-1>',
        metadata: {
          mentions: [
            {
              kind: 'buddy',
              targetId: 'bot-1',
              userId: 'bot-1',
              username: 'workspace-buddy',
              token: '<@bot-1>',
              label: '@Workspace Buddy',
            },
          ],
        },
      }),
      botUserId: 'bot-1',
      botUsername: 'workspace-buddy',
      channelPolicies: new Map([
        ['channel-1', { listen: true, reply: true, mentionOnly: true }],
      ] as never),
      runtime: { log: vi.fn(), error: vi.fn() },
    })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.wasMentionedExplicitly).toBe(true)
  })

  it('does not treat structured server mentions as user mentions for smart reply skips', () => {
    const result = evaluateShadowMessagePreflight({
      message: baseMessage({
        content: 'hello <@server:server-1>',
        metadata: {
          mentions: [
            {
              kind: 'server',
              targetId: 'server-1',
              serverId: 'server-1',
              token: '<@server:server-1>',
              label: '@Workspace Ops',
            },
          ],
        },
      }),
      botUserId: 'bot-1',
      botUsername: 'workspace-buddy',
      channelPolicies: new Map([
        ['channel-1', { listen: true, reply: true, config: { smartReply: true } }],
      ] as never),
      runtime: { log: vi.fn(), error: vi.fn() },
    })

    expect(result.ok).toBe(true)
  })

  it('formats mention context for the agent prompt', () => {
    const mentions = [
      {
        kind: 'channel' as const,
        targetId: 'channel-2',
        channelId: 'channel-2',
        channelName: 'general',
        serverId: 'server-1',
        serverName: 'GStack',
        token: '<#channel-2>',
        label: '#general',
      },
    ]

    expect(mentionTargetsBot({ mentions, botUserId: 'bot-1', botUsername: 'buddy' })).toBe(false)
    expect(formatShadowMentionsForAgent(mentions)).toContain(
      '#general [channel] channelId=channel-2',
    )
  })

  it('treats server app mentions as explicit triggers and CLI context', () => {
    const mention = {
      kind: 'app' as const,
      targetId: 'app-1',
      appId: 'app-1',
      appKey: 'demo-desk',
      appName: 'Demo Desk',
      serverId: 'server-1',
      serverName: 'Demo Desk Ops',
      token: '<@app:app-1>',
      label: '@Demo Desk',
    }
    const result = evaluateShadowMessagePreflight({
      message: baseMessage({
        content: 'create a ticket in <@app:app-1>',
        metadata: { mentions: [mention] },
      }),
      botUserId: 'bot-1',
      botUsername: 'workspace-buddy',
      channelPolicies: new Map([
        ['channel-1', { listen: true, reply: true, mentionOnly: true }],
      ] as never),
      runtime: { log: vi.fn(), error: vi.fn() },
    })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.wasMentionedExplicitly).toBe(true)
    expect(mentionsTargetServerApp([mention])).toBe(true)
    expect(formatShadowMentionsForAgent([mention])).toContain(
      'shadowob app call "<appKey>" <command>',
    )
  })

  it('skips ordinary Buddy messages unless replyToBuddy is enabled', () => {
    const result = evaluateShadowMessagePreflight({
      message: baseMessage({
        authorId: 'buddy-user-2',
        author: {
          id: 'agent-2',
          username: 'other-buddy',
          isBot: true,
        },
      } as Partial<ShadowMessage>),
      botUserId: 'bot-1',
      botUsername: 'workspace-buddy',
      channelPolicies: new Map([['channel-1', { listen: true, reply: true, config: {} }]] as never),
      runtime: { log: vi.fn(), error: vi.fn() },
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('replyToBuddy=false')
  })

  it('processes active task-card Inbox deliveries from another Buddy without replyToBuddy', () => {
    const runtime = { log: vi.fn(), error: vi.fn() }
    const result = evaluateShadowMessagePreflight({
      message: baseMessage({
        content: 'Please work on this task',
        authorId: 'coordinator-user',
        author: {
          id: 'coordinator-agent',
          username: 'coordinator-buddy',
          isBot: true,
        },
        metadata: {
          cards: [
            {
              id: 'task-1',
              kind: 'task',
              status: 'queued',
              assignee: {
                userId: 'bot-1',
                agentId: 'agent-1',
              },
            },
          ],
        },
      } as Partial<ShadowMessage>),
      botUserId: 'bot-1',
      botUsername: 'workspace-buddy',
      channelPolicies: new Map([
        ['channel-1', { listen: true, reply: true, mentionOnly: true, config: {} }],
      ] as never),
      runtime,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.isProcessingBuddyMessage).toBe(true)
      expect(result.wasMentionedExplicitly).toBe(true)
    }
    expect(runtime.log).toHaveBeenCalledWith(expect.stringContaining('active task-card'))
  })

  it('lets active task-card Inbox deliveries bypass owner trigger gates', () => {
    const result = evaluateShadowMessagePreflight({
      message: baseMessage({
        content: 'Please work on this task',
        authorId: 'coordinator-user',
        author: {
          id: 'coordinator-agent',
          username: 'coordinator-buddy',
          isBot: true,
        },
        metadata: {
          cards: [
            {
              id: 'task-1',
              kind: 'task',
              status: 'queued',
              assignee: {
                userId: 'bot-1',
                agentId: 'agent-1',
              },
            },
          ],
        },
      } as Partial<ShadowMessage>),
      botUserId: 'bot-1',
      botUsername: 'workspace-buddy',
      channelPolicies: new Map([
        [
          'channel-1',
          {
            listen: true,
            reply: true,
            mentionOnly: true,
            config: { allowedTriggerUserIds: ['owner-user'] },
          },
        ],
      ] as never),
      runtime: { log: vi.fn(), error: vi.fn() },
    })

    expect(result.ok).toBe(true)
  })

  it('matches task-card Inbox deliveries by agentId when userId is unavailable', () => {
    const runtime = { log: vi.fn(), error: vi.fn() }
    const taskCard = {
      id: 'task-1',
      kind: 'task',
      status: 'queued',
      assignee: {
        agentId: 'agent-1',
        label: 'Workspace Buddy',
      },
    }

    expect(taskCardTargetsBuddy(taskCard, { botUserId: 'bot-1', botAgentId: 'agent-1' })).toBe(true)
    expect(isActiveTaskCardForBuddy(taskCard, { botUserId: 'bot-1', botAgentId: 'agent-1' })).toBe(
      true,
    )

    const result = evaluateShadowMessagePreflight({
      message: baseMessage({
        content: 'Please work on this task',
        authorId: 'coordinator-user',
        author: {
          id: 'coordinator-agent',
          username: 'coordinator-buddy',
          isBot: true,
        },
        metadata: { cards: [taskCard] },
      } as Partial<ShadowMessage>),
      botUserId: 'bot-1',
      botAgentId: 'agent-1',
      botUsername: 'workspace-buddy',
      channelPolicies: new Map([
        [
          'channel-1',
          {
            listen: true,
            reply: true,
            mentionOnly: true,
            config: { allowedTriggerUserIds: ['owner-user'] },
          },
        ],
      ] as never),
      runtime,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.isProcessingBuddyMessage).toBe(true)
      expect(result.wasMentionedExplicitly).toBe(true)
    }
    expect(runtime.log).toHaveBeenCalledWith(expect.stringContaining('active task-card'))
  })

  it('does not match terminal task-card Inbox deliveries by agentId', () => {
    const result = evaluateShadowMessagePreflight({
      message: baseMessage({
        content: 'Already done',
        authorId: 'coordinator-user',
        author: {
          id: 'coordinator-agent',
          username: 'coordinator-buddy',
          isBot: true,
        },
        metadata: {
          cards: [
            {
              id: 'task-1',
              kind: 'task',
              status: 'completed',
              assignee: { agentId: 'agent-1' },
            },
          ],
        },
      } as Partial<ShadowMessage>),
      botUserId: 'bot-1',
      botAgentId: 'agent-1',
      botUsername: 'workspace-buddy',
      channelPolicies: new Map([
        ['channel-1', { listen: true, reply: true, mentionOnly: true, config: {} }],
      ] as never),
      runtime: { log: vi.fn(), error: vi.fn() },
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('replyToBuddy=false')
  })
})
