import type { RecruitmentDao } from '../dao/recruitment.dao.js'
import type { TripDao } from '../dao/trip.dao.js'
import type { ShadowGateway } from '../gateways/shadow.gateway.js'
import { logger } from '../lib/logger.js'
import { nowIso } from '../lib/time.js'
import type { RequestContext, TripRecruitment } from '../types.js'

export class ChannelMembershipSyncService {
  constructor(
    private readonly recruitmentDao: RecruitmentDao,
    private readonly tripDao: TripDao,
    private readonly shadowGateway: ShadowGateway,
  ) {}

  async syncTrip(ctx: RequestContext | undefined, tripId: string) {
    const recruitment = await this.recruitmentDao.findByTrip(tripId)
    if (!recruitment || (recruitment.status !== 'open' && !recruitment.memberChannelId)) return null
    return this.reconcileRecruitment(recruitment, ctx)
  }

  async reconcileAll() {
    if (!process.env.TRAVEL_SHADOW_INSTALLATION_TOKEN) {
      return { attempted: 0, failed: 0, synced: 0, skipped: true }
    }
    const recruitments = await this.recruitmentDao.listForChannelReconciliation()
    const results = await Promise.allSettled(
      recruitments.map((recruitment) => this.reconcileRecruitment(recruitment)),
    )
    return {
      attempted: results.length,
      failed: results.filter((result) => result.status === 'rejected').length,
      synced: results.filter((result) => result.status === 'fulfilled').length,
      skipped: false,
    }
  }

  private async reconcileRecruitment(recruitment: TripRecruitment, ctx?: RequestContext) {
    const trip = await this.tripDao.findTrip(recruitment.tripId)
    if (!trip || trip.serverId !== recruitment.serverId) return null
    const members = await this.tripDao.listMembers(trip.id)
    const memberUserIds = [
      ...new Set(members.flatMap((member) => (member.userId ? [member.userId] : []))),
    ]
    if (!memberUserIds.length) return null
    try {
      const channel = await this.shadowGateway.ensureTripMemberChannel(
        {
          serverId: trip.serverId,
          tripId: trip.id,
          tripTitle: trip.title,
          memberUserIds,
          preferredChannelId: recruitment.memberChannelId,
        },
        ctx,
      )
      if (channel.channelId !== recruitment.memberChannelId) {
        await this.recruitmentDao.upsertRecruitment({
          ...recruitment,
          memberChannelId: channel.channelId,
          updatedAt: nowIso(),
        })
      }
      return channel
    } catch (error) {
      logger.warn('Trip member channel reconciliation deferred', { error, tripId: trip.id })
      throw error
    }
  }
}
