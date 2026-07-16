import { badRequest } from '../lib/errors.js'
import type { AccessPolicy } from '../security/access-policy.js'
import type { BookingService } from '../services/booking.service.js'
import type { CommunityService } from '../services/community.service.js'
import type { DashboardService } from '../services/dashboard.service.js'
import type { PlanningService } from '../services/planning.service.js'
import type { TodoService } from '../services/todo.service.js'
import type { BuddyPlanOperation, RequestContext } from '../types.js'
import {
  createAssignmentSchema,
  createPlaceSchema,
  createReservationSchema,
  createTodoSchema,
} from '../validators/travel.schema.js'
import type { TravelEventBus } from '../ws/travel-events.js'

export class CommunityUseCase {
  constructor(
    private readonly communityService: CommunityService,
    private readonly accessPolicy: AccessPolicy,
    private readonly eventBus: TravelEventBus,
    private readonly planningService: PlanningService,
    private readonly bookingService: BookingService,
    private readonly todoService: TodoService,
    private readonly dashboardService: DashboardService,
  ) {}

  listInboxes(ctx: RequestContext) {
    return this.communityService.listBuddyInboxes(ctx)
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
    return this.communityService.ensureChannel(ctx, input)
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
    return this.communityService.createPoll(ctx, input)
  }

  async listBuddyBindings(ctx: RequestContext, tripId: string) {
    await this.accessPolicy.requireTripRead(ctx, tripId)
    return this.communityService.listBuddyBindings(tripId)
  }

  async bindBuddy(
    ctx: RequestContext,
    tripId: string,
    input: { agentId: string; agentUserId?: string; displayName?: string; capabilities: string[] },
  ) {
    const access = await this.accessPolicy.requireTripCapability(ctx, tripId, 'member.manage')
    const binding = await this.communityService.bindBuddy(tripId, input, access.member?.id)
    this.eventBus.emit({ type: 'community.buddy.bound', tripId, payload: { binding } })
    return binding
  }

  async revokeBuddy(ctx: RequestContext, tripId: string, bindingId: string) {
    await this.accessPolicy.requireTripCapability(ctx, tripId, 'member.manage')
    const binding = await this.communityService.revokeBuddy(tripId, bindingId)
    this.eventBus.emit({ type: 'community.buddy.revoked', tripId, payload: { binding } })
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
    await this.accessPolicy.requireTripWrite(ctx, tripId)
    const task = await this.communityService.dispatchPlan(ctx, tripId, input)
    this.eventBus.emit({ type: 'community.plan.dispatched', tripId, payload: { task } })
    return task
  }

  async contextPack(ctx: RequestContext, tripId: string) {
    if (ctx.actor.kind === 'buddy') {
      if (!ctx.actor.buddyId) throw badRequest('Buddy identity is missing')
      await this.communityService.requireBuddyBinding(tripId, ctx.actor.buddyId)
    } else {
      await this.accessPolicy.requireTripRead(ctx, tripId)
    }
    return this.dashboardService.contextPack(tripId)
  }

  async listPlanDrafts(ctx: RequestContext, tripId: string) {
    await this.accessPolicy.requireTripRead(ctx, tripId)
    return this.communityService.listPlanDrafts(tripId)
  }

  async proposePlan(
    ctx: RequestContext,
    tripId: string,
    input: {
      automationTaskId?: string
      title: string
      summary?: string
      operations: BuddyPlanOperation[]
    },
  ) {
    if (ctx.actor.kind === 'buddy') {
      if (!ctx.actor.buddyId) throw badRequest('Buddy identity is missing')
      await this.communityService.requireBuddyBinding(tripId, ctx.actor.buddyId)
    } else {
      await this.accessPolicy.requireTripWrite(ctx, tripId)
    }
    const draft = await this.communityService.createPlanDraft(tripId, input, ctx.actor)
    this.eventBus.emit({ type: 'community.plan.proposed', tripId, payload: { draft } })
    return draft
  }

  async reviewPlan(
    ctx: RequestContext,
    tripId: string,
    draftId: string,
    status: 'accepted' | 'rejected',
  ) {
    const access = await this.accessPolicy.requireTripWrite(ctx, tripId)
    const drafts = await this.communityService.listPlanDrafts(tripId)
    const draft = drafts.find((item) => item.id === draftId)
    if (!draft) throw badRequest('Plan draft not found')
    const applied: Array<{ kind: string; id?: string }> = []
    if (status === 'accepted') {
      for (const operation of draft.operations) {
        if (operation.kind === 'place.create') {
          const parsed = createPlaceSchema.safeParse(operation.input)
          if (!parsed.success) throw badRequest('Invalid place operation', parsed.error.flatten())
          const value = await this.planningService.createPlace(
            tripId,
            parsed.data,
            access.member?.id,
          )
          applied.push({ kind: operation.kind, id: value.id })
        } else if (operation.kind === 'assignment.create') {
          const parsed = createAssignmentSchema.safeParse(operation.input)
          if (!parsed.success)
            throw badRequest('Invalid assignment operation', parsed.error.flatten())
          const value = await this.planningService.createAssignment(tripId, parsed.data)
          applied.push({ kind: operation.kind, id: value.id })
        } else if (operation.kind === 'reservation.create') {
          const parsed = createReservationSchema.safeParse(operation.input)
          if (!parsed.success)
            throw badRequest('Invalid reservation operation', parsed.error.flatten())
          const value = await this.bookingService.createReservation(tripId, parsed.data)
          applied.push({ kind: operation.kind, id: value.id })
        } else if (operation.kind === 'todo.create') {
          const parsed = createTodoSchema.safeParse(operation.input)
          if (!parsed.success) throw badRequest('Invalid todo operation', parsed.error.flatten())
          const value = await this.todoService.createTodo(tripId, parsed.data, access.member?.id)
          applied.push({ kind: operation.kind, id: value.id })
        } else {
          applied.push({ kind: operation.kind })
        }
      }
    }
    const reviewed = await this.communityService.reviewPlanDraft(
      tripId,
      draftId,
      status,
      access.member?.id,
    )
    this.eventBus.emit({
      type: `community.plan.${status}`,
      tripId,
      payload: { draft: reviewed, applied },
    })
    return { draft: reviewed, applied }
  }

  async listShares(ctx: RequestContext, tripId: string) {
    await this.accessPolicy.requireTripRead(ctx, tripId)
    return this.communityService.listCommunityShares(tripId)
  }

  async shareTrip(
    ctx: RequestContext,
    tripId: string,
    input: { channelId: string; mode: 'snapshot' | 'live'; allowedSections: string[] },
  ) {
    const access = await this.accessPolicy.requireTripCapability(ctx, tripId, 'share.manage')
    const ref = await this.communityService.shareTrip(ctx, access.trip, input, access.member?.id)
    this.eventBus.emit({ type: 'community.trip.shared', tripId, payload: { ref } })
    return ref
  }
}
