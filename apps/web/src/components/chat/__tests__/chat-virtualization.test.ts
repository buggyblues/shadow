import { describe, expect, it } from 'vitest'
import {
  CHAT_VIRTUALIZE_THRESHOLD,
  estimateChatMessageSize,
  estimateChatTimelineItemSize,
  getChatMessageItemKey,
  getChatTimelineItemKey,
  getScrollDistanceFromBottom,
  isScrollNearBottom,
  shouldAdjustChatScrollPositionOnItemSizeChange,
} from '../chat-virtualization'

describe('chat virtualization helpers', () => {
  it('virtualizes long channel histories before they become a first-paint bottleneck', () => {
    expect(CHAT_VIRTUALIZE_THRESHOLD).toBeLessThanOrEqual(40)
  })

  it('keeps virtual item keys stable when message indexes shift', () => {
    expect(getChatMessageItemKey({ id: 'm-1', content: 'hello' }, 12)).toBe('message:m-1')
    expect(
      getChatTimelineItemKey({ kind: 'message', data: { id: 'm-2', content: 'hello' } }, 3),
    ).toBe('message:m-2')
    expect(getChatTimelineItemKey({ kind: 'system', data: { id: 'join-1' } }, 4)).toBe(
      'system:join-1',
    )
  })

  it('estimates large markdown blocks above the old small-row ceiling', () => {
    const shortMessage = { id: 'short', content: 'ok' }
    const largeMarkdown = {
      id: 'large',
      content: [
        '# Incident notes',
        '',
        '```ts',
        ...Array.from({ length: 36 }, (_, index) => `const item${index} = "value-${index}"`),
        '```',
        '',
        ...Array.from(
          { length: 18 },
          (_, index) =>
            `- This is a longer markdown list item ${index} with enough text to wrap on a chat row.`,
        ),
      ].join('\n'),
    }

    expect(estimateChatMessageSize(largeMarkdown)).toBeGreaterThan(1400)
    expect(estimateChatMessageSize(largeMarkdown)).toBeGreaterThan(
      estimateChatMessageSize(shortMessage),
    )
  })

  it('accounts for reactions, attachments, and system rows in size estimates', () => {
    const base = estimateChatMessageSize({ id: 'm', content: 'hello' })
    const rich = estimateChatMessageSize({
      id: 'm',
      content: 'hello',
      reactions: [{ emoji: '👍', count: 1 }],
      attachments: [{ contentType: 'image/png' }, { contentType: 'text/plain' }],
    })

    expect(rich).toBeGreaterThan(base + 300)
    expect(estimateChatTimelineItemSize({ kind: 'system', data: { id: 'join' } })).toBe(40)
  })

  it('detects bottom proximity with a bounded threshold', () => {
    const element = {
      scrollHeight: 1000,
      scrollTop: 790,
      clientHeight: 180,
    } as HTMLElement

    expect(getScrollDistanceFromBottom(element)).toBe(30)
    expect(isScrollNearBottom(element, 32)).toBe(true)
    expect(isScrollNearBottom(element, 20)).toBe(false)
  })

  it('opts out of automatic scroll correction for dynamic row measurements', () => {
    expect(shouldAdjustChatScrollPositionOnItemSizeChange()).toBe(false)
  })
})
