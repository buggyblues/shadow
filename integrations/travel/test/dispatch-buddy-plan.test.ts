import { describe, expect, it, vi } from 'vitest'
import type { TravelAutomationTask } from '../client/features/plan/api/community.js'
import { dispatchTravelBuddyPlan } from '../client/features/plan/services/dispatch-buddy-plan.js'

const task: TravelAutomationTask = {
  id: 'task-1',
  tripId: 'trip-1',
  source: 'buddy',
  status: 'running',
  title: '调整雨天行程',
  input: {},
  shadowDelivery: {
    agentId: 'buddy-1',
    taskId: 'inbox-task-1',
    messageId: 'message-1',
  },
  createdAt: '2026-07-26T00:00:00.000Z',
  updatedAt: '2026-07-26T00:00:00.000Z',
}

describe('dispatchTravelBuddyPlan', () => {
  it('opens the Buddy bubble with the real delivery after dispatch', async () => {
    const ensureGrant = vi.fn().mockResolvedValue({ granted: true })
    const dispatch = vi.fn().mockResolvedValue(task)
    const openCopilot = vi.fn().mockResolvedValue({ opened: true })

    await expect(
      dispatchTravelBuddyPlan(
        'trip-1',
        {
          agentId: 'buddy-1',
          title: '调整雨天行程',
          prompt: '把第二天下午改成室内安排',
        },
        '允许小助手处理这次行程',
        {
          dispatch,
          ensureGrant,
          openCopilot,
        },
      ),
    ).resolves.toBe(task)

    expect(ensureGrant).toHaveBeenCalledWith({
      agentId: 'buddy-1',
      reason: '允许小助手处理这次行程',
    })
    expect(openCopilot).toHaveBeenCalledWith(task.shadowDelivery)
    expect(ensureGrant.mock.invocationCallOrder[0]).toBeLessThan(
      dispatch.mock.invocationCallOrder[0],
    )
    expect(dispatch.mock.invocationCallOrder[0]).toBeLessThan(
      openCopilot.mock.invocationCallOrder[0],
    )
  })

  it('keeps a dispatched task successful when the host cannot open its bubble', async () => {
    const openCopilot = vi.fn().mockRejectedValue(new Error('host unavailable'))

    await expect(
      dispatchTravelBuddyPlan(
        'trip-1',
        {
          agentId: 'buddy-1',
          title: '调整雨天行程',
          prompt: '把第二天下午改成室内安排',
        },
        '允许小助手处理这次行程',
        {
          dispatch: vi.fn().mockResolvedValue(task),
          ensureGrant: vi.fn().mockResolvedValue({ granted: true }),
          openCopilot,
        },
      ),
    ).resolves.toBe(task)
  })
})
