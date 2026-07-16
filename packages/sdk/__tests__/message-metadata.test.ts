import { describe, expect, it } from 'vitest'
import {
  buildMessageAgentChainMetadata,
  buildMessageCopilotContextMetadata,
  isMessageAgentChainMetadata,
  isMessageCopilotContext,
} from '../src'

describe('message metadata helpers', () => {
  it('re-exports Copilot message metadata helpers', () => {
    const context = {
      kind: 'space_app_copilot',
      appKey: 'kanban',
      spaceAppId: 'space-app-1',
    } as const

    expect(isMessageCopilotContext(context)).toBe(true)
    expect(buildMessageCopilotContextMetadata(context)).toEqual({ copilotContext: context })
  })

  it('re-exports runtime agent chain metadata helpers', () => {
    const agentChain = {
      agentId: 'videoforge',
      depth: 1,
      participants: ['bot-user-1'],
      startedAt: 1_802_000_000_000,
      rootMessageId: 'message-1',
    }

    expect(isMessageAgentChainMetadata(agentChain)).toBe(true)
    expect(buildMessageAgentChainMetadata(agentChain)).toEqual({ agentChain })
  })
})
