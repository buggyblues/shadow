import type { RecruitmentDao } from '../dao/recruitment.dao.js'
import type { TripDao } from '../dao/trip.dao.js'
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js'
import { createId } from '../lib/id.js'
import { nowIso } from '../lib/time.js'
import type {
  RequestContext,
  TripJoinApplication,
  TripJoinApplicationStatus,
  TripRecruitment,
} from '../types.js'
import type {
  ApplyToTripInput,
  ReviewTripApplicationInput,
  UpsertTravelIntentInput,
  UpsertTripRecruitmentInput,
} from '../validators/travel.schema.js'

function actorUserId(ctx: RequestContext) {
  return ctx.actor.userId ?? ctx.actor.ownerId ?? ctx.actor.id ?? (ctx.local ? 'local-user' : null)
}

function actorDisplayName(ctx: RequestContext) {
  return ctx.actor.displayName ?? ctx.actor.username ?? actorUserId(ctx) ?? 'Traveler'
}

function normalizedSet(values: string[]) {
  return new Set(values.map((value) => value.trim().toLocaleLowerCase()).filter(Boolean))
}

function recruitmentMatch(
  trip: { destinationLabels: string[]; startDate?: string; endDate?: string },
  recruitment: TripRecruitment,
  intent: Awaited<ReturnType<RecruitmentDao['findTravelIntent']>>,
) {
  if (!intent || intent.status !== 'open') return null
  let score = 0
  const reasons: string[] = []
  const destinations = normalizedSet(trip.destinationLabels)
  if (
    intent.destinationLabels.some((value) => destinations.has(value.trim().toLocaleLowerCase()))
  ) {
    score += 45
    reasons.push('destination')
  }
  const styles = normalizedSet(recruitment.styles)
  const styleMatches = intent.styles.filter((value) => styles.has(value.trim().toLocaleLowerCase()))
  if (styleMatches.length > 0) {
    score += Math.min(25, 10 + styleMatches.length * 5)
    reasons.push('style')
  }
  if (intent.flexibleDates || recruitment.flexibleDates) {
    score += 12
    reasons.push('flexible_dates')
  } else if (trip.startDate && trip.endDate && intent.earliestDate && intent.latestDate) {
    if (trip.startDate <= intent.latestDate && trip.endDate >= intent.earliestDate) {
      score += 20
      reasons.push('dates')
    }
  }
  if (
    intent.budgetMax !== undefined &&
    recruitment.budgetMax !== undefined &&
    intent.currency === recruitment.currency &&
    recruitment.budgetMax <= intent.budgetMax
  ) {
    score += 10
    reasons.push('budget')
  }
  return { score: Math.min(score, 100), reasons }
}

export class RecruitmentService {
  constructor(
    private readonly recruitmentDao: RecruitmentDao,
    private readonly tripDao: TripDao,
  ) {}

  async listOpen(ctx: RequestContext) {
    const userId = actorUserId(ctx)
    const recruitments = await this.recruitmentDao.listOpen(ctx.serverId)
    const ownApplications = userId
      ? await this.recruitmentDao.listApplicationsForUser(ctx.serverId, userId)
      : []
    const ownByRecruitment = new Map(ownApplications.map((item) => [item.recruitmentId, item]))
    const viewerIntent = userId
      ? await this.recruitmentDao.findTravelIntent(ctx.serverId, userId)
      : null
    return Promise.all(
      recruitments.map(async (recruitment) => {
        const trip = await this.tripDao.findTrip(recruitment.tripId)
        if (!trip || trip.serverId !== ctx.serverId) return null
        const members = await this.tripDao.listMembers(trip.id)
        const owner = members.find((member) => member.role === 'owner') ?? members[0]
        const match = recruitmentMatch(trip, recruitment, viewerIntent)
        return {
          recruitment,
          trip: {
            id: trip.id,
            title: trip.title,
            summary: trip.summary,
            coverPhotoUrl: trip.coverPhotoUrl,
            startDate: trip.startDate,
            endDate: trip.endDate,
            destinationLabels: trip.destinationLabels,
          },
          memberCount: members.length,
          organizer: owner
            ? { displayName: owner.displayName, avatarUrl: owner.avatarUrl }
            : undefined,
          viewerApplication: ownByRecruitment.get(recruitment.id),
          viewerIsMember: userId ? members.some((member) => member.userId === userId) : false,
          matchScore: match?.score,
          matchReasons: match?.reasons ?? [],
        }
      }),
    ).then((items) => items.filter((item): item is NonNullable<typeof item> => Boolean(item)))
  }

  listTripMembers(tripId: string) {
    return this.tripDao.listMembers(tripId)
  }

  listTravelIntents(ctx: RequestContext) {
    return this.recruitmentDao.listTravelIntents(ctx.serverId)
  }

  async upsertTravelIntent(ctx: RequestContext, input: UpsertTravelIntentInput) {
    const userId = actorUserId(ctx)
    if (!userId) throw forbidden()
    const current = await this.recruitmentDao.findTravelIntent(ctx.serverId, userId)
    const timestamp = nowIso()
    return this.recruitmentDao.upsertTravelIntent({
      id: current?.id ?? createId('intent'),
      serverId: ctx.serverId,
      userId,
      displayName: actorDisplayName(ctx),
      avatarUrl: ctx.actor.avatarUrl ?? current?.avatarUrl ?? undefined,
      destinationLabels: input.destinationLabels,
      earliestDate: input.earliestDate,
      latestDate: input.latestDate,
      flexibleDates: input.flexibleDates,
      budgetMax: input.budgetMax,
      currency: input.currency,
      styles: input.styles,
      note: input.note,
      status: input.status,
      createdAt: current?.createdAt ?? timestamp,
      updatedAt: timestamp,
    })
  }

  async closeTravelIntent(ctx: RequestContext) {
    const userId = actorUserId(ctx)
    if (!userId) throw forbidden()
    const current = await this.recruitmentDao.findTravelIntent(ctx.serverId, userId)
    if (!current) throw notFound('Travel intent')
    return this.recruitmentDao.upsertTravelIntent({
      ...current,
      status: 'closed',
      updatedAt: nowIso(),
    })
  }

  async getForTrip(tripId: string) {
    const recruitment = await this.recruitmentDao.findByTrip(tripId)
    if (!recruitment) return null
    const applications = await this.recruitmentDao.listApplications(recruitment.id)
    return { recruitment, applications }
  }

  async upsert(
    ctx: RequestContext,
    tripId: string,
    memberId: string | undefined,
    input: UpsertTripRecruitmentInput,
  ) {
    const trip = await this.tripDao.findTrip(tripId)
    if (!trip || trip.serverId !== ctx.serverId) throw notFound('Trip')
    const current = await this.recruitmentDao.findByTrip(tripId)
    const timestamp = nowIso()
    const recruitment: TripRecruitment = {
      id: current?.id ?? createId('recruitment'),
      serverId: ctx.serverId,
      tripId,
      status: input.status ?? current?.status ?? 'draft',
      maxMembers: input.maxMembers ?? current?.maxMembers ?? 6,
      departureCity: input.departureCity ?? current?.departureCity,
      flexibleDates: input.flexibleDates ?? current?.flexibleDates ?? false,
      budgetMin: input.budgetMin ?? current?.budgetMin,
      budgetMax: input.budgetMax ?? current?.budgetMax,
      currency: input.currency ?? current?.currency ?? trip.currency,
      styles: input.styles ?? current?.styles ?? [],
      note: input.note ?? current?.note,
      questions: input.questions ?? current?.questions ?? [],
      requiresApproval: input.requiresApproval ?? current?.requiresApproval ?? true,
      closesAt: input.closesAt ?? current?.closesAt,
      recruitmentChannelId: input.recruitmentChannelId ?? current?.recruitmentChannelId,
      memberChannelId: input.memberChannelId ?? current?.memberChannelId,
      publishedByMemberId: current?.publishedByMemberId ?? memberId,
      createdAt: current?.createdAt ?? timestamp,
      updatedAt: timestamp,
    }
    if (
      recruitment.budgetMin !== undefined &&
      recruitment.budgetMax !== undefined &&
      recruitment.budgetMin > recruitment.budgetMax
    ) {
      throw badRequest('budgetMin must not exceed budgetMax')
    }
    const memberCount = (await this.tripDao.listMembers(tripId)).length
    if (recruitment.maxMembers < memberCount)
      throw conflict('Maximum members is below current size')
    if (recruitment.status === 'open' && recruitment.closesAt) {
      if (new Date(recruitment.closesAt).getTime() <= Date.now()) {
        throw badRequest('Recruitment closing time must be in the future')
      }
    }
    return this.recruitmentDao.upsertRecruitment(recruitment)
  }

  async apply(ctx: RequestContext, recruitmentId: string, input: ApplyToTripInput) {
    const recruitment = await this.recruitmentDao.findRecruitment(recruitmentId)
    if (!recruitment || recruitment.serverId !== ctx.serverId) throw notFound('Recruitment')
    if (recruitment.status !== 'open') throw conflict('Recruitment is not open')
    if (recruitment.closesAt && new Date(recruitment.closesAt).getTime() <= Date.now()) {
      throw conflict('Recruitment has closed')
    }
    const userId = actorUserId(ctx)
    if (!userId) throw forbidden()
    if (await this.tripDao.findMemberByUser(recruitment.tripId, userId)) {
      throw conflict('Already a trip member')
    }
    const current = await this.recruitmentDao.findApplicationForUser(recruitmentId, userId)
    if (current && current.status !== 'withdrawn' && current.status !== 'rejected') {
      throw conflict('Application already exists')
    }
    const timestamp = nowIso()
    const application: TripJoinApplication = {
      id: createId('application'),
      serverId: ctx.serverId,
      tripId: recruitment.tripId,
      recruitmentId,
      applicantUserId: userId,
      applicantDisplayName: actorDisplayName(ctx),
      applicantAvatarUrl: ctx.actor.avatarUrl ?? undefined,
      message: input.message,
      answers: input.answers,
      status: 'pending',
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    return this.recruitmentDao.createApplication(application)
  }

  async withdraw(ctx: RequestContext, applicationId: string) {
    const application = await this.recruitmentDao.findApplication(applicationId)
    if (!application || application.serverId !== ctx.serverId) throw notFound('Application')
    if (application.applicantUserId !== actorUserId(ctx)) throw forbidden()
    if (!['pending', 'needs_info', 'waitlisted'].includes(application.status)) {
      throw conflict('Application can no longer be withdrawn')
    }
    const updated = await this.recruitmentDao.updateApplication(applicationId, (current) => ({
      ...current,
      status: 'withdrawn',
      updatedAt: nowIso(),
    }))
    if (!updated) throw notFound('Application')
    return updated
  }

  async updateApplication(ctx: RequestContext, applicationId: string, input: ApplyToTripInput) {
    const application = await this.recruitmentDao.findApplication(applicationId)
    if (!application || application.serverId !== ctx.serverId) throw notFound('Application')
    if (application.applicantUserId !== actorUserId(ctx)) throw forbidden()
    if (!['pending', 'needs_info', 'waitlisted'].includes(application.status)) {
      throw conflict('Application can no longer be updated')
    }
    const updated = await this.recruitmentDao.updateApplication(applicationId, (current) => ({
      ...current,
      message: input.message,
      answers: input.answers,
      status: 'pending',
      updatedAt: nowIso(),
    }))
    if (!updated) throw notFound('Application')
    return updated
  }

  async review(
    applicationId: string,
    reviewerMemberId: string | undefined,
    input: ReviewTripApplicationInput,
  ) {
    const application = await this.recruitmentDao.findApplication(applicationId)
    if (!application) throw notFound('Application')
    if (!['pending', 'needs_info', 'waitlisted'].includes(application.status)) {
      throw conflict('Application has already been resolved')
    }
    const timestamp = nowIso()
    if (input.status === 'approved') {
      const recruitment = await this.recruitmentDao.findRecruitment(application.recruitmentId)
      if (!recruitment || recruitment.status !== 'open') throw conflict('Recruitment is not open')
      const members = await this.tripDao.listMembers(application.tripId)
      if (members.length >= recruitment.maxMembers) throw conflict('Trip is full')
      const result = await this.recruitmentDao.approveApplication(
        applicationId,
        {
          id: createId('member'),
          tripId: application.tripId,
          userId: application.applicantUserId,
          displayName: application.applicantDisplayName,
          avatarUrl: application.applicantAvatarUrl,
          role: 'traveler',
          invitedByMemberId: reviewerMemberId,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        {
          status: 'approved',
          reviewNote: input.reviewNote,
          reviewedByMemberId: reviewerMemberId,
          reviewedAt: timestamp,
          updatedAt: timestamp,
        },
      )
      if (!result) throw notFound('Application')
      if (members.length + 1 >= recruitment.maxMembers) {
        await this.recruitmentDao.upsertRecruitment({
          ...recruitment,
          status: 'filled',
          updatedAt: timestamp,
        })
      }
      return result
    }
    const status: TripJoinApplicationStatus = input.status
    const updated = await this.recruitmentDao.updateApplication(applicationId, (current) => ({
      ...current,
      status,
      reviewNote: input.reviewNote,
      reviewedByMemberId: reviewerMemberId,
      reviewedAt: timestamp,
      updatedAt: timestamp,
    }))
    if (!updated) throw notFound('Application')
    return { application: updated }
  }
}
