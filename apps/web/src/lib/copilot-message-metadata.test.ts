import { describe, expect, it } from 'vitest'
import { buildCopilotMessageMetadata } from './copilot-message-metadata'

describe('buildCopilotMessageMetadata', () => {
  it('builds bounded app metadata for Copilot messages', () => {
    expect(
      buildCopilotMessageMetadata({
        appKey: ' kanban ',
        spaceAppId: 'space-app-1',
        appName: 'Kanban',
        serverId: 'server-1',
        serverSlug: 'growth',
        channelId: 'inbox-1',
        channelKind: 'inbox',
      }),
    ).toEqual({
      copilotContext: {
        kind: 'space_app_copilot',
        appKey: 'kanban',
        spaceAppId: 'space-app-1',
        appName: 'Kanban',
        serverId: 'server-1',
        serverSlug: 'growth',
        channelId: 'inbox-1',
        channelKind: 'inbox',
      },
    })
  })

  it('skips non-Copilot app routes', () => {
    expect(buildCopilotMessageMetadata({ appKey: '' })).toBeUndefined()
  })
})
