import type { BackupDao } from '../dao/backup.dao.js'
import type { TripDao } from '../dao/trip.dao.js'
import { badRequest, notFound } from '../lib/errors.js'
import { createId } from '../lib/id.js'
import { nowIso } from '../lib/time.js'
import type { RequestContext, TravelBackup, TravelState } from '../types.js'
import type { CreateBackupInput } from '../validators/travel.schema.js'

export class BackupService {
  constructor(
    private readonly backupDao: BackupDao,
    private readonly tripDao: TripDao,
  ) {}

  listBackups(ctx: RequestContext, tripId?: string) {
    return this.backupDao.listBackups(ctx.serverId, tripId)
  }

  async createBackup(
    ctx: RequestContext,
    input: CreateBackupInput,
    options: { tripId?: string; createdByMemberId?: string } = {},
  ) {
    if (input.kind === 'trip' && !options.tripId) throw badRequest('tripId is required')
    if (options.tripId) {
      const trip = await this.tripDao.findTrip(options.tripId)
      if (!trip || trip.serverId !== ctx.serverId) throw notFound('Trip')
    }

    const snapshot =
      input.kind === 'server'
        ? await this.backupDao.exportServerSnapshot(ctx.serverId)
        : await this.backupDao.exportTripSnapshot(options.tripId ?? '')
    const backup: TravelBackup = {
      id: createId('backup'),
      serverId: ctx.serverId,
      tripId: options.tripId,
      kind: input.kind,
      status: 'available',
      label: input.label,
      snapshot: snapshot as Record<string, unknown>,
      createdByMemberId: options.createdByMemberId,
      createdAt: nowIso(),
    }
    return this.backupDao.createBackup(backup)
  }

  async exportTrip(ctx: RequestContext, tripId: string) {
    const trip = await this.tripDao.findTrip(tripId)
    if (!trip || trip.serverId !== ctx.serverId) throw notFound('Trip')
    return this.backupDao.exportTripSnapshot(tripId)
  }

  async restoreTripBackup(ctx: RequestContext, tripId: string, backupId: string) {
    const trip = await this.tripDao.findTrip(tripId)
    if (!trip || trip.serverId !== ctx.serverId) throw notFound('Trip')
    const backup = await this.backupDao.findBackup(backupId)
    if (!backup || backup.serverId !== ctx.serverId || backup.tripId !== tripId) {
      throw notFound('Backup')
    }
    if (backup.kind !== 'trip') throw badRequest('Only trip backups can be restored here')
    return this.backupDao.restoreTripSnapshot(
      tripId,
      backup.id,
      backup.snapshot as Partial<TravelState>,
    )
  }
}
