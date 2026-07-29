import { describe, expect, it, vi } from 'vitest'
import { CommunityService } from '../server/src/services/community.service.js'
import type { RequestContext } from '../server/src/types.js'
import { CommunityUseCase } from '../server/src/usecases/community.usecase.js'

describe('CommunityService Buddy dispatch', () => {
  it('keeps the visible task human-readable and gives the runtime an exact Travel command guide', async () => {
    const tasks = new Map<string, Record<string, unknown>>()
    const dispatchBuddyTask = vi.fn().mockResolvedValue({
      delivery: { messageId: 'message_1', cardId: 'card_1' },
    })
    const service = new CommunityService(
      {
        listBuddyBindings: vi.fn().mockResolvedValue([
          {
            id: 'binding_1',
            tripId: 'trip_1',
            agentId: 'buddy_1',
            agentUserId: 'buddy_user_1',
            displayName: '旅行 Buddy',
            capabilities: ['itinerary'],
            status: 'active',
          },
        ]),
      } as never,
      { dispatchBuddyTask } as never,
      {
        createTask: vi.fn(async (task) => {
          tasks.set(task.id, task)
          return task
        }),
        updateTask: vi.fn(async (taskId, update) => {
          const next = update(tasks.get(taskId))
          tasks.set(taskId, next)
          return next
        }),
      } as never,
    )
    const context: RequestContext = {
      requestId: 'req_1',
      serverId: 'server_1',
      actor: { kind: 'user', userId: 'user_1' },
      startedAt: new Date().toISOString(),
      local: false,
      auth: {
        authenticated: true,
        launchAuthenticated: true,
        oauthAuthenticated: false,
        oauthConfigured: false,
        oauthRequired: false,
      },
      launch: { appKey: 'travel', token: 'launch-token' },
    }

    await service.dispatchPlan(context, 'trip_1', {
      agentId: 'buddy_1',
      title: '规划返程日',
      prompt: '安排一段轻松的返程行程。',
    })

    const payload = dispatchBuddyTask.mock.calls[0]?.[1]
    expect(payload.body).toBe('安排一段轻松的返程行程。\n\n完成后把方案交回旅途，由发起人确认。')
    expect(payload.body).not.toContain('travel.contextPack')
    expect(payload.data.executionGuide).toMatchObject({
      serverId: 'server_1',
      context: { input: { tripId: 'trip_1' } },
      proposal: {
        required: true,
        inputTemplate: {
          tripId: 'trip_1',
          automationTaskId: expect.stringMatching(/^task_/),
        },
      },
    })
    expect(payload.data.executionGuide.context.command).toContain(
      'shadowob space-app call travel travel.contextPack',
    )
    expect(payload.data.executionGuide.proposal.command).toContain(
      'shadowob space-app call travel travel.proposePlan',
    )
  })
})

describe('CommunityUseCase Buddy dispatch access', () => {
  it('lets any trip member request a reviewable Buddy plan without write access', async () => {
    const requireTripRead = vi.fn().mockResolvedValue({
      trip: { id: 'trip_1' },
      member: { id: 'member_1', role: 'traveler' },
    })
    const requireTripWrite = vi.fn()
    const dispatchPlan = vi.fn().mockResolvedValue({
      id: 'task_1',
      tripId: 'trip_1',
      status: 'queued',
    })
    const emit = vi.fn()
    const useCase = new CommunityUseCase(
      { dispatchPlan } as never,
      { requireTripRead, requireTripWrite } as never,
      { emit } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    )

    await expect(
      useCase.dispatchPlan({} as never, 'trip_1', {
        agentId: 'buddy_1',
        title: '规划雨天行程',
        prompt: '保留美术馆并减少室外等待。',
      }),
    ).resolves.toMatchObject({ id: 'task_1', status: 'queued' })

    expect(requireTripRead).toHaveBeenCalledWith(expect.anything(), 'trip_1')
    expect(requireTripWrite).not.toHaveBeenCalled()
    expect(dispatchPlan).toHaveBeenCalledWith(
      expect.anything(),
      'trip_1',
      expect.objectContaining({ agentId: 'buddy_1' }),
    )
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'community.plan.dispatched', tripId: 'trip_1' }),
    )
  })
})
