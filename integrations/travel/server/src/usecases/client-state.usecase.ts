import { badRequest, forbidden } from '../lib/errors.js'
import type { AccessPolicy } from '../security/access-policy.js'
import type { ClientStateService } from '../services/client-state.service.js'
import type { ClientStateScope, RequestContext } from '../types.js'
import type { TravelEventBus } from '../ws/travel-events.js'

const globalKeys = new Set(['shared-reports'])

function actorUserId(ctx: RequestContext) {
  return (
    ctx.actor.userId ?? ctx.actor.ownerId ?? ctx.actor.id ?? ctx.actor.stableKey ?? 'local-user'
  )
}

export class ClientStateUseCase {
  constructor(
    private readonly service: ClientStateService,
    private readonly accessPolicy: AccessPolicy,
    private readonly eventBus: TravelEventBus,
  ) {}

  private async selector(
    ctx: RequestContext,
    input: { key: string; scope: ClientStateScope; tripId?: string },
    write = false,
  ) {
    if (input.scope === 'global' && !globalKeys.has(input.key)) {
      throw forbidden('This state key cannot be shared globally')
    }
    if (input.scope === 'trip') {
      if (!input.tripId) throw badRequest('tripId is required for trip state')
      if (write && (input.key === 'packing-bags' || input.key === 'packing-items')) {
        await this.accessPolicy.requireTripCapability(ctx, input.tripId, 'packing.write')
      } else if (write) await this.accessPolicy.requireTripWrite(ctx, input.tripId)
      else await this.accessPolicy.requireTripRead(ctx, input.tripId)
    }
    return {
      key: input.key,
      ownerUserId: input.scope === 'user' ? actorUserId(ctx) : undefined,
      scope: input.scope,
      serverId: ctx.serverId,
      tripId: input.scope === 'trip' ? input.tripId : undefined,
    }
  }

  async get(ctx: RequestContext, input: { key: string; scope: ClientStateScope; tripId?: string }) {
    return this.service.get(await this.selector(ctx, input))
  }

  async upsert(
    ctx: RequestContext,
    input: {
      expectedRevision?: number
      key: string
      scope: ClientStateScope
      tripId?: string
      value: unknown
    },
  ) {
    const selector = await this.selector(ctx, input, true)
    const record = await this.service.upsert(selector, input)
    this.eventBus.emit({
      type: 'client_state.updated',
      tripId: selector.tripId,
      payload: { key: input.key, revision: record.revision, scope: input.scope },
    })
    return record
  }
}
