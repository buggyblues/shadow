import type { MessageCard } from '@shadowob/shared'
import { describe, expect, it } from 'vitest'
import { isTaskCard } from './task-card'

describe('isTaskCard', () => {
  it('does not apply legacy reply notification compatibility', () => {
    const card = {
      id: 'reply-notification',
      kind: 'task',
      title: 'Review reply: Render video',
      data: {
        taskReplyNotification: true,
      },
    } as MessageCard

    expect(isTaskCard(card)).toBe(true)
  })

  it('keeps ordinary task cards actionable', () => {
    const card = {
      id: 'task-1',
      kind: 'task',
      title: 'Render video',
      data: {
        taskReplyNotification: false,
      },
    } as MessageCard

    expect(isTaskCard(card)).toBe(true)
  })
})
