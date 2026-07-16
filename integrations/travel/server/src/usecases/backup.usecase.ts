import type { AccessPolicy } from '../security/access-policy.js'
import type { BackupService } from '../services/backup.service.js'
import type { RequestContext } from '../types.js'
import type { CreateBackupInput } from '../validators/travel.schema.js'
import type { TravelEventBus } from '../ws/travel-events.js'

export class BackupUseCase {
  constructor(
    private readonly backupService: BackupService,
    private readonly accessPolicy: AccessPolicy,
    private readonly eventBus: TravelEventBus,
  ) {}

  async listTripBackups(ctx: RequestContext, tripId: string) {
    await this.accessPolicy.requireTripRole(ctx, tripId, 'owner')
    return this.backupService.listBackups(ctx, tripId)
  }

  async createTripBackup(ctx: RequestContext, tripId: string, input: CreateBackupInput) {
    const access = await this.accessPolicy.requireTripRole(ctx, tripId, 'owner')
    const backup = await this.backupService.createBackup(
      ctx,
      { ...input, kind: 'trip' },
      {
        tripId,
        createdByMemberId: access.member?.id ?? undefined,
      },
    )
    this.eventBus.emit({ type: 'backup.created', tripId, payload: { backup } })
    return backup
  }

  async exportTrip(ctx: RequestContext, tripId: string) {
    await this.accessPolicy.requireTripRole(ctx, tripId, 'owner')
    return this.backupService.exportTrip(ctx, tripId)
  }

  async restoreTripBackup(ctx: RequestContext, tripId: string, backupId: string) {
    await this.accessPolicy.requireTripRole(ctx, tripId, 'owner')
    const snapshot = await this.backupService.restoreTripBackup(ctx, tripId, backupId)
    this.eventBus.emit({ type: 'backup.restored', tripId, payload: { backupId } })
    return snapshot
  }
}
