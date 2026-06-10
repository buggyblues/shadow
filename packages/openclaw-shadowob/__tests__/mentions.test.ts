import type { ShadowMessage } from '@shadowob/sdk'
import { describe, expect, it, vi } from 'vitest'
import {
  formatShadowMentionsForAgent,
  hasMultipleBuddyMentions,
  mentionedBuddyIds,
  mentionsTargetServerApp,
  mentionTargetsBuddy,
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
  it('detects multi-Buddy collaboration triggers from structured mentions', () => {
    const mentions = [
      {
        kind: 'buddy',
        targetId: 'bot-1',
        userId: 'bot-1',
        token: '<@bot-1>',
        label: '@一号机',
      },
      {
        kind: 'buddy',
        targetId: 'bot-2',
        userId: 'bot-2',
        token: '<@bot-2>',
        label: '@二号机',
      },
      {
        kind: 'user',
        targetId: 'user-1',
        userId: 'user-1',
        token: '<@user-1>',
        label: '@Admin',
      },
    ] as never

    expect(mentionedBuddyIds(mentions)).toEqual(['bot-1', 'bot-2'])
    expect(hasMultipleBuddyMentions(mentions)).toBe(true)
    expect(hasMultipleBuddyMentions([mentions[0]])).toBe(false)
  })

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
      buddyUserId: 'bot-1',
      buddyUsername: 'workspace-buddy',
      channelPolicies: new Map([
        ['channel-1', { listen: true, reply: true, mentionOnly: true }],
      ] as never),
      runtime: { log: vi.fn(), error: vi.fn() },
    })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.wasMentionedExplicitly).toBe(true)
  })

  it('skips human messages that explicitly mention a different Buddy', () => {
    const result = evaluateShadowMessagePreflight({
      message: baseMessage({
        content: 'hello <@bot-2>',
        metadata: {
          mentions: [
            {
              kind: 'buddy',
              targetId: 'bot-2',
              userId: 'bot-2',
              username: 'other-buddy',
              token: '<@bot-2>',
              label: '@二号机',
            },
          ],
        },
      }),
      buddyUserId: 'bot-1',
      buddyUsername: 'workspace-buddy',
      channelPolicies: new Map([
        ['channel-1', { listen: true, reply: true, config: { smartReply: true } }],
      ] as never),
      runtime: { log: vi.fn(), error: vi.fn() },
    })

    expect(result).toEqual({
      ok: false,
      reason: '[msg] Message explicitly mentions other Buddy targets, skipping (msg-1)',
    })
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
      buddyUserId: 'bot-1',
      buddyUsername: 'workspace-buddy',
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

    expect(mentionTargetsBuddy({ mentions, buddyUserId: 'bot-1', buddyUsername: 'buddy' })).toBe(
      false,
    )
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
      buddyUserId: 'bot-1',
      buddyUsername: 'workspace-buddy',
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

  it('lets explicit human @mentions override disabled reply policy', () => {
    const result = evaluateShadowMessagePreflight({
      message: baseMessage({
        content: 'hello <@bot-1>',
        authorId: 'channel-member',
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
      buddyUserId: 'bot-1',
      buddyUsername: 'workspace-buddy',
      channelPolicies: new Map([
        [
          'channel-1',
          {
            listen: true,
            reply: false,
            mentionOnly: true,
            config: { allowedTriggerUserIds: ['owner-user'] },
          },
        ],
      ] as never),
      runtime: { log: vi.fn(), error: vi.fn() },
    })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.wasMentionedExplicitly).toBe(true)
  })

  it('does not let server app mentions override disabled Buddy reply policy', () => {
    const result = evaluateShadowMessagePreflight({
      message: baseMessage({
        content: 'create a ticket in <@app:app-1>',
        authorId: 'channel-member',
        metadata: {
          mentions: [
            {
              kind: 'app',
              targetId: 'app-1',
              appId: 'app-1',
              appKey: 'demo-desk',
              token: '<@app:app-1>',
              label: '@Demo Desk',
            },
          ],
        },
      } as Partial<ShadowMessage>),
      buddyUserId: 'bot-1',
      buddyUsername: 'workspace-buddy',
      channelPolicies: new Map([
        [
          'channel-1',
          {
            listen: true,
            reply: false,
            mentionOnly: true,
            config: { allowedTriggerUserIds: ['owner-user'] },
          },
        ],
      ] as never),
      runtime: { log: vi.fn(), error: vi.fn() },
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('Policy blocks reply')
  })

  it('processes Buddy messages by default so the claim adapter can enforce collaboration metadata', () => {
    const result = evaluateShadowMessagePreflight({
      message: baseMessage({
        authorId: 'buddy-user-2',
        author: {
          id: 'agent-2',
          username: 'other-buddy',
          isBot: true,
        },
      } as Partial<ShadowMessage>),
      buddyUserId: 'bot-1',
      buddyUsername: 'workspace-buddy',
      channelPolicies: new Map([['channel-1', { listen: true, reply: true, config: {} }]] as never),
      runtime: { log: vi.fn(), error: vi.fn() },
    })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.isProcessingBuddyMessage).toBe(true)
  })

  it('skips Buddy messages when replyToBuddy is explicitly disabled', () => {
    const result = evaluateShadowMessagePreflight({
      message: baseMessage({
        authorId: 'buddy-user-2',
        author: {
          id: 'agent-2',
          username: 'other-buddy',
          isBot: true,
        },
      } as Partial<ShadowMessage>),
      buddyUserId: 'bot-1',
      buddyUsername: 'workspace-buddy',
      channelPolicies: new Map([
        ['channel-1', { listen: true, reply: true, config: { replyToBuddy: false } }],
      ] as never),
      runtime: { log: vi.fn(), error: vi.fn() },
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('replyToBuddy=false')
  })

  it('processes Buddy messages with replyToBuddy even when owner trigger gates are present', () => {
    const result = evaluateShadowMessagePreflight({
      message: baseMessage({
        authorId: 'buddy-user-2',
        author: {
          id: 'agent-2',
          username: 'other-buddy',
          isBot: true,
        },
      } as Partial<ShadowMessage>),
      buddyUserId: 'bot-1',
      buddyUsername: 'workspace-buddy',
      channelPolicies: new Map([
        [
          'channel-1',
          {
            listen: true,
            reply: true,
            config: { replyToBuddy: true, allowedTriggerUserIds: ['owner-user'] },
          },
        ],
      ] as never),
      runtime: { log: vi.fn(), error: vi.fn() },
    })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.isProcessingBuddyMessage).toBe(true)
  })

  it('allows replyToBuddy turns through mention-only collaboration policies', () => {
    const result = evaluateShadowMessagePreflight({
      message: baseMessage({
        authorId: 'buddy-user-2',
        author: {
          id: 'agent-2',
          username: 'other-buddy',
          isBot: true,
        },
        metadata: {
          collaboration: {
            id: 'collab-1',
            rootMessageId: 'root-1',
            buddyId: 'agent-2',
            turn: 1,
          },
        },
      } as Partial<ShadowMessage>),
      buddyUserId: 'bot-1',
      buddyUsername: 'workspace-buddy',
      channelPolicies: new Map([
        [
          'channel-1',
          {
            listen: true,
            reply: true,
            mentionOnly: true,
            config: { replyToBuddy: true, maxBuddyTurns: 2 },
          },
        ],
      ] as never),
      runtime: { log: vi.fn(), error: vi.fn() },
    })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.isProcessingBuddyMessage).toBe(true)
  })

  it('applies Buddy blacklist before an agent chain exists', () => {
    const result = evaluateShadowMessagePreflight({
      message: baseMessage({
        authorId: 'buddy-user-2',
        author: {
          id: 'agent-2',
          username: 'other-buddy',
          isBot: true,
        },
      } as Partial<ShadowMessage>),
      buddyUserId: 'bot-1',
      buddyUsername: 'workspace-buddy',
      channelPolicies: new Map([
        [
          'channel-1',
          {
            listen: true,
            reply: true,
            config: { replyToBuddy: true, buddyBlacklist: ['agent-2'] },
          },
        ],
      ] as never),
      runtime: { log: vi.fn(), error: vi.fn() },
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('blacklist')
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
      buddyUserId: 'bot-1',
      buddyUsername: 'workspace-buddy',
      channelPolicies: new Map([
        [
          'channel-1',
          { listen: true, reply: true, mentionOnly: true, config: { replyToBuddy: false } },
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
      buddyUserId: 'bot-1',
      buddyUsername: 'workspace-buddy',
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

    expect(taskCardTargetsBuddy(taskCard, { buddyUserId: 'bot-1', buddyId: 'agent-1' })).toBe(true)
    expect(isActiveTaskCardForBuddy(taskCard, { buddyUserId: 'bot-1', buddyId: 'agent-1' })).toBe(
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
      buddyUserId: 'bot-1',
      buddyId: 'agent-1',
      buddyUsername: 'workspace-buddy',
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
      buddyUserId: 'bot-1',
      buddyId: 'agent-1',
      buddyUsername: 'workspace-buddy',
      channelPolicies: new Map([
        [
          'channel-1',
          { listen: true, reply: true, mentionOnly: true, config: { replyToBuddy: false } },
        ],
      ] as never),
      runtime: { log: vi.fn(), error: vi.fn() },
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('replyToBuddy=false')
  })
})
