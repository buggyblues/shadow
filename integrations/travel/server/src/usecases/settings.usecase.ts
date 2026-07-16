import type { AccessPolicy } from '../security/access-policy.js'
import type { SettingsService } from '../services/settings.service.js'
import type { RequestContext } from '../types.js'
import type {
  UpdateTripSettingsInput,
  UpsertProviderSettingsInput,
} from '../validators/travel.schema.js'
import type { TravelEventBus } from '../ws/travel-events.js'

export class SettingsUseCase {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly accessPolicy: AccessPolicy,
    private readonly eventBus: TravelEventBus,
  ) {}

  async getTripSettings(ctx: RequestContext, tripId: string) {
    await this.accessPolicy.requireTripRead(ctx, tripId)
    return this.settingsService.getTripSettings(tripId)
  }

  async updateTripSettings(ctx: RequestContext, tripId: string, input: UpdateTripSettingsInput) {
    await this.accessPolicy.requireTripRole(ctx, tripId, 'owner')
    const settings = await this.settingsService.updateTripSettings(tripId, input)
    this.eventBus.emit({ type: 'settings.updated', tripId, payload: { settings } })
    return settings
  }

  async listProviderSettings(ctx: RequestContext) {
    return this.settingsService.listProviderSettings(ctx)
  }

  async upsertProviderSettings(ctx: RequestContext, input: UpsertProviderSettingsInput) {
    const result = await this.settingsService.upsertProviderSettings(ctx, input)
    this.eventBus.emit({
      type: 'provider_settings.updated',
      payload: { count: result.settings.length },
    })
    return result
  }
}
