import type { AutomationDao } from '../dao/automation.dao.js'
import type { CommunityDao } from '../dao/community.dao.js'
import type { ShadowGateway } from '../gateways/shadow.gateway.js'
import { badRequest, notFound } from '../lib/errors.js'
import { createId } from '../lib/id.js'
import { nowIso } from '../lib/time.js'
import type {
  BuddyPlanDraft,
  BuddyPlanOperation,
  CommunityShareRef,
  RequestContext,
  TripBuddyBinding,
} from '../types.js'

export class CommunityService {
  constructor(
    private readonly communityDao: CommunityDao,
    private readonly shadowGateway: ShadowGateway,
    private readonly automationDao: AutomationDao,
  ) {}

  listBuddyInboxes(ctx: RequestContext) {
    return this.shadowGateway.listBuddyInboxes(ctx)
  }

  ensureChannel(
    ctx: RequestContext,
    input: {
      dedupeKey: string
      name: string
      topic?: string
      isPrivate: boolean
      memberUserIds: string[]
      syncMembers: boolean
    },
  ) {
    return this.shadowGateway.ensureChannel(ctx, input)
  }

  createPoll(
    ctx: RequestContext,
    input: {
      channelId: string
      question: string
      answers: string[]
      allowMultiselect: boolean
      durationHours: number
    },
  ) {
    return this.shadowGateway.createPoll(ctx, input)
  }

  listBuddyBindings(tripId: string) {
    return this.communityDao.listBuddyBindings(tripId)
  }

  async requireBuddyBinding(tripId: string, agentId: string) {
    const binding = (await this.communityDao.listBuddyBindings(tripId)).find(
      (item) => item.agentId === agentId,
    )
    if (!binding) throw badRequest('Buddy is not bound to this trip')
    return binding
  }

  async bindBuddy(
    tripId: string,
    input: { agentId: string; agentUserId?: string; displayName?: string; capabilities: string[] },
    createdByMemberId?: string,
  ) {
    const timestamp = nowIso()
    const existing = (await this.communityDao.listBuddyBindings(tripId)).find(
      (item) => item.agentId === input.agentId,
    )
    const binding: TripBuddyBinding = {
      id: existing?.id ?? createId('buddybinding'),
      tripId,
      agentId: input.agentId,
      agentUserId: input.agentUserId,
      displayName: input.displayName,
      status: 'active',
      capabilities: input.capabilities,
      createdByMemberId: existing?.createdByMemberId ?? createdByMemberId,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    }
    return this.communityDao.upsertBuddyBinding(binding)
  }

  async revokeBuddy(tripId: string, bindingId: string) {
    const binding = await this.communityDao.revokeBuddyBinding(tripId, bindingId, nowIso())
    if (!binding) throw notFound('Buddy binding')
    return binding
  }

  async dispatchPlan(
    ctx: RequestContext,
    tripId: string,
    input: {
      agentId: string
      title: string
      prompt: string
      priority?: 'low' | 'normal' | 'medium' | 'high'
    },
  ) {
    const binding = (await this.communityDao.listBuddyBindings(tripId)).find(
      (item) => item.agentId === input.agentId,
    )
    if (!binding) throw badRequest('Buddy must be bound to this trip before dispatch')
    const timestamp = nowIso()
    const taskId = createId('task')
    const idempotencyKey = `travel:trip:${tripId}:plan:${taskId}:${binding.agentId}`
    await this.automationDao.createTask({
      id: taskId,
      tripId,
      source: 'buddy',
      status: 'queued',
      title: input.title,
      input: { prompt: input.prompt, agentId: binding.agentId, idempotencyKey },
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    try {
      const delegatedOwner = binding.capabilities.includes('owner.delegate')
      const dispatch = await this.shadowGateway.dispatchBuddyTask(ctx, {
        agentId: binding.agentId,
        agentUserId: binding.agentUserId,
        assigneeLabel: binding.displayName,
        title: input.title,
        body: [
          input.prompt,
          '',
          `Travel trip: ${tripId}`,
          delegatedOwner
            ? 'You have explicit owner delegation for this trip. Read travel.contextPack first, then use travel.performTripAction and the focused Travel commands to complete the requested work. Use travel.proposePlan only when a decision is genuinely ambiguous or needs human review.'
            : 'Read the trip context with travel.contextPack. Submit a reviewable draft with travel.proposePlan; do not directly mutate the itinerary.',
        ].join('\n'),
        priority: input.priority,
        idempotencyKey,
        resource: {
          kind: 'travel.trip',
          id: tripId,
          label: input.title,
          url: `/shadow/server/trips/${tripId}`,
        },
        data: {
          appKey: 'travel',
          tripId,
          automationTaskId: taskId,
          proposePlanCommand: 'travel.proposePlan',
          contextCommand: 'travel.contextPack',
          ...(delegatedOwner ? { actionCommand: 'travel.performTripAction' } : {}),
        },
      })
      const task = await this.automationDao.updateTask(taskId, (current) => ({
        ...current,
        status: dispatch.delivery.pendingId ? 'queued' : 'running',
        shadowDelivery: dispatch.delivery,
        result: { delivery: dispatch.delivery },
        updatedAt: nowIso(),
      }))
      return task
    } catch (error) {
      await this.automationDao.updateTask(taskId, (current) => ({
        ...current,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        updatedAt: nowIso(),
      }))
      throw error
    }
  }

  listPlanDrafts(tripId: string) {
    return this.communityDao.listPlanDrafts(tripId)
  }

  async createPlanDraft(
    tripId: string,
    input: {
      automationTaskId?: string
      title: string
      summary?: string
      operations: BuddyPlanOperation[]
    },
    actor: { buddyId?: string | null; userId?: string | null },
  ) {
    const timestamp = nowIso()
    const draft: BuddyPlanDraft = {
      id: createId('plandraft'),
      tripId,
      automationTaskId: input.automationTaskId,
      title: input.title,
      summary: input.summary,
      status: 'proposed',
      operations: input.operations,
      createdByAgentId: actor.buddyId ?? undefined,
      createdByUserId: actor.userId ?? undefined,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    const saved = await this.communityDao.createPlanDraft(draft)
    if (input.automationTaskId) {
      await this.automationDao.updateTask(input.automationTaskId, (current) => ({
        ...current,
        status: 'completed',
        result: { ...(current.result ?? {}), planDraftId: saved.id },
        updatedAt: timestamp,
      }))
    }
    return saved
  }

  async reviewPlanDraft(
    tripId: string,
    draftId: string,
    status: 'accepted' | 'rejected',
    reviewedByMemberId?: string,
  ) {
    const draft = await this.communityDao.findPlanDraft(tripId, draftId)
    if (!draft) throw notFound('Plan draft')
    if (draft.status !== 'proposed') throw badRequest('Plan draft has already been reviewed')
    return this.communityDao.updatePlanDraft({
      ...draft,
      status,
      reviewedByMemberId,
      reviewedAt: nowIso(),
      updatedAt: nowIso(),
    })
  }

  listCommunityShares(tripId: string) {
    return this.communityDao.listCommunityShares(tripId)
  }

  async shareTrip(
    ctx: RequestContext,
    trip: {
      id: string
      title: string
      summary?: string
      startDate?: string
      endDate?: string
      destinationLabels: string[]
    },
    input: { channelId: string; mode: 'snapshot' | 'live'; allowedSections: string[] },
    createdByMemberId?: string,
  ) {
    const timestamp = nowIso()
    const id = createId('communityshare')
    const ref: CommunityShareRef = {
      id,
      tripId: trip.id,
      channelId: input.channelId,
      mode: input.mode,
      allowedSections: input.allowedSections,
      status: 'pending',
      idempotencyKey: `travel:share:${id}`,
      createdByMemberId,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    await this.communityDao.createCommunityShare(ref)
    try {
      const delivery = await this.shadowGateway.shareToChannel(ctx, {
        channelId: input.channelId,
        idempotencyKey: ref.idempotencyKey,
        content: `🧭 ${trip.title}${trip.summary ? `\n${trip.summary}` : ''}`,
        metadata: {
          cards: [
            {
              type: 'travel.trip',
              title: trip.title,
              description: trip.summary,
              url: `/shadow/server/trips/${trip.id}`,
              data: {
                appKey: 'travel',
                tripId: trip.id,
                mode: input.mode,
                allowedSections: input.allowedSections,
                dates: [trip.startDate, trip.endDate],
                destinations: trip.destinationLabels,
              },
            },
          ],
        },
      })
      return this.communityDao.updateCommunityShare(id, (current) => ({
        ...current,
        status: 'shared',
        messageId: delivery.messageId,
        updatedAt: nowIso(),
      }))
    } catch (error) {
      await this.communityDao.updateCommunityShare(id, (current) => ({
        ...current,
        status: 'failed',
        updatedAt: nowIso(),
      }))
      throw error
    }
  }
}
