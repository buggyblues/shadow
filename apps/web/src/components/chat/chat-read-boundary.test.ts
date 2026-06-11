import { describe, expect, it } from 'vitest'
import { shouldAdvanceReadBoundaryForTimelineAppend } from './chat-read-boundary'

const messageItem = (authorId: string) => ({
  kind: 'message' as const,
  data: { authorId },
})

describe('shouldAdvanceReadBoundaryForTimelineAppend', () => {
  it('advances the read boundary for the current user own appended message', () => {
    expect(
      shouldAdvanceReadBoundaryForTimelineAppend({
        appendedItems: [messageItem('user-1')],
        currentItemCount: 4,
        currentUserId: 'user-1',
        previousItemCount: 3,
        previousReadCount: 3,
        shouldStickToBottom: false,
      }),
    ).toBe(true)
  })

  it('does not advance the read boundary for another user message while reading above bottom', () => {
    expect(
      shouldAdvanceReadBoundaryForTimelineAppend({
        appendedItems: [messageItem('user-2')],
        currentItemCount: 4,
        currentUserId: 'user-1',
        previousItemCount: 3,
        previousReadCount: 3,
        shouldStickToBottom: false,
      }),
    ).toBe(false)
  })

  it('does not clear an existing unread boundary when the current user sends later', () => {
    expect(
      shouldAdvanceReadBoundaryForTimelineAppend({
        appendedItems: [messageItem('user-1')],
        currentItemCount: 5,
        currentUserId: 'user-1',
        previousItemCount: 4,
        previousReadCount: 3,
        shouldStickToBottom: false,
      }),
    ).toBe(false)
  })
})
