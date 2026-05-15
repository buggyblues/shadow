import type { ShadowMessage } from '@shadowob/sdk'
import { describe, expect, it, vi } from 'vitest'
import {
  formatShadowMentionsForAgent,
  mentionsTargetServerApp,
  mentionTargetsBot,
} from '../src/mentions.js'
import { evaluateShadowMessagePreflight } from '../src/monitor/preflight.js'

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
})
