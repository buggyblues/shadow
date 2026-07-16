import type { SyncDao } from '../dao/sync.dao.js'
import { createId } from '../lib/id.js'
import { nowIso } from '../lib/time.js'
import type { AccessPolicy } from '../security/access-policy.js'
import type { RequestContext, SyncMutation } from '../types.js'
import type { SyncMutationsInput } from '../validators/travel.schema.js'
import type { TravelEventBus } from '../ws/travel-events.js'

export class SyncUseCase {
  constructor(
    private readonly syncDao: SyncDao,
    private readonly accessPolicy: AccessPolicy,
    private readonly eventBus: TravelEventBus,
  ) {}

  async manifest(ctx: RequestContext, tripId: string) {
    await this.accessPolicy.requireTripRead(ctx, tripId)
    return this.syncDao.manifest(tripId)
  }

  async applyMutations(ctx: RequestContext, tripId: string, input: SyncMutationsInput) {
    const access = await this.accessPolicy.requireTripWrite(ctx, tripId)
    const createdByMemberId = access.member?.id
    const results = []
    for (const item of input.mutations) {
      const mutation: SyncMutation = {
        id: createId('sync'),
        tripId,
        entityType: item.entityType,
        entityId: item.entityId,
        action: item.action,
        baseUpdatedAt: item.baseUpdatedAt,
        payload: item.payload,
        status: 'queued',
        createdByMemberId,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }
      results.push(await this.syncDao.applyMutation(mutation))
    }
    this.eventBus.emit({ type: 'sync.mutations_applied', tripId, payload: { results } })
    return { results }
  }

  async listMutations(ctx: RequestContext, tripId: string, status?: SyncMutation['status']) {
    await this.accessPolicy.requireTripRead(ctx, tripId)
    return this.syncDao.listMutations(tripId, status)
  }
}
