import { describe, expect, it } from 'vitest'
import { buildChatTimeline, type ChatTimelineMessage } from './chat-timeline'

function message(
  id: string,
  createdAt: string,
  authorId = 'user-1',
  replyToId: string | null = null,
): ChatTimelineMessage {
  return { id, authorId, replyToId, createdAt }
}

describe('buildChatTimeline', () => {
  it('groups adjacent messages from the same author inside one minute', () => {
    const timeline = buildChatTimeline(
      [
        message('m1', '2026-01-01T00:00:00.000Z'),
        message('m2', '2026-01-01T00:00:30.000Z'),
        message('m3', '2026-01-01T00:00:40.000Z', 'user-2'),
      ],
      [],
    )

    expect(timeline.map((item) => (item.kind === 'message' ? item.isGrouped : false))).toEqual([
      false,
      true,
      false,
    ])
  })

  it('keeps system events in timestamp order without moving equal-time events before messages', () => {
    const timeline = buildChatTimeline(
      [
        message('m1', '2026-01-01T00:00:00.000Z'),
        message('m2', '2026-01-01T00:01:00.000Z', 'user-2'),
      ],
      [
        { id: 'e2', timestamp: Date.parse('2026-01-01T00:01:00.000Z') },
        { id: 'e1', timestamp: Date.parse('2026-01-01T00:00:30.000Z') },
      ],
    )

    expect(timeline.map((item) => `${item.kind}:${item.data.id}`)).toEqual([
      'message:m1',
      'system:e1',
      'message:m2',
      'system:e2',
    ])
  })
})
