import type { MessageCard } from '@shadowob/shared'
import { describe, expect, it } from 'vitest'
import { isInternalTaskProgressNote, isTaskCard } from './task-card'

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

describe('isInternalTaskProgressNote', () => {
  it('hides runtime and command details from the product task card', () => {
    expect(isInternalTaskProgressNote('Started')).toBe(true)
    expect(isInternalTaskProgressNote('Done')).toBe(true)
    expect(isInternalTaskProgressNote('Acknowledged all main scenario requirements')).toBe(true)
    expect(isInternalTaskProgressNote('Compiling consolidated rationale')).toBe(true)
    expect(
      isInternalTaskProgressNote('Hermes delivered a reply; awaiting explicit completion'),
    ).toBe(true)
    expect(isInternalTaskProgressNote('Buddy replied: 已提交旅行方案')).toBe(true)
    expect(isInternalTaskProgressNote('Run travel.proposePlan now')).toBe(true)
  })

  it('keeps product-facing progress notes visible', () => {
    expect(isInternalTaskProgressNote('正在整理雨天路线和交通衔接')).toBe(false)
  })
})
