import { describe, expect, it } from 'vitest'
import { buildMessageCopilotContextMetadata, isMessageCopilotContext } from '../src'

describe('message metadata helpers', () => {
  it('re-exports Copilot message metadata helpers', () => {
    const context = {
      kind: 'server_app_copilot',
      appKey: 'kanban',
      serverAppId: 'server-app-1',
    } as const

    expect(isMessageCopilotContext(context)).toBe(true)
    expect(buildMessageCopilotContextMetadata(context)).toEqual({ copilotContext: context })
  })
})
