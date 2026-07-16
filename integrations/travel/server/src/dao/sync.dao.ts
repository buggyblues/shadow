import type { TravelDataStore } from '../db/database.js'
import type { SyncMutation, TravelState } from '../types.js'

type SyncEntity = NonNullable<SyncMutation['entityType']>

const collectionByEntity: Record<SyncEntity, keyof TravelState> = {
  place: 'places',
  assignment: 'assignments',
  reservation: 'reservations',
  expense: 'expenses',
  packing_item: 'packingItems',
  todo: 'todos',
  day: 'days',
}

function asRows(state: TravelState, entityType: SyncEntity) {
  return state[collectionByEntity[entityType]] as unknown as Array<Record<string, unknown>>
}

export class SyncDao {
  constructor(private readonly db: TravelDataStore) {}

  manifest(tripId: string) {
    return this.db.read((state) => {
      const entityTypes = Object.keys(collectionByEntity) as SyncEntity[]
      const versions: Record<string, Record<string, string | undefined>> = {}
      for (const entityType of entityTypes) {
        versions[entityType] = {}
        for (const row of asRows(state, entityType)) {
          if (row.tripId !== tripId || typeof row.id !== 'string') continue
          versions[entityType][row.id] =
            typeof row.updatedAt === 'string' ? row.updatedAt : state.updatedAt
        }
      }
      return {
        tripId,
        generatedAt: new Date().toISOString(),
        stateUpdatedAt: state.updatedAt,
        versions,
      }
    })
  }

  applyMutation(mutation: SyncMutation) {
    return this.db.write((state) => {
      const rows = asRows(state, mutation.entityType)
      const now = new Date().toISOString()
      const index = mutation.entityId
        ? rows.findIndex((row) => row.id === mutation.entityId && row.tripId === mutation.tripId)
        : -1
      const current = index >= 0 ? rows[index] : null

      if (
        current &&
        mutation.baseUpdatedAt &&
        typeof current.updatedAt === 'string' &&
        current.updatedAt !== mutation.baseUpdatedAt
      ) {
        mutation.status = 'conflict'
        mutation.conflict = {
          reason: 'base_updated_at_mismatch',
          serverUpdatedAt: current.updatedAt,
          serverValue: current,
        }
      } else if (mutation.action === 'delete') {
        if (!current) {
          mutation.status = 'failed'
          mutation.conflict = { reason: 'entity_not_found' }
        } else {
          rows.splice(index, 1)
          mutation.status = 'applied'
          mutation.result = { deleted: true, entityId: mutation.entityId }
        }
      } else if (mutation.action === 'update') {
        if (!current) {
          mutation.status = 'failed'
          mutation.conflict = { reason: 'entity_not_found' }
        } else {
          const next = {
            ...current,
            ...mutation.payload,
            id: current.id,
            tripId: mutation.tripId,
            updatedAt: now,
          }
          rows[index] = next
          mutation.status = 'applied'
          mutation.result = next
        }
      } else {
        const id = mutation.entityId ?? String(mutation.payload.id ?? mutation.id)
        if (rows.some((row) => row.id === id && row.tripId === mutation.tripId)) {
          mutation.status = 'conflict'
          mutation.conflict = { reason: 'entity_already_exists' }
        } else {
          const created = {
            ...mutation.payload,
            id,
            tripId: mutation.tripId,
            createdAt:
              typeof mutation.payload.createdAt === 'string' ? mutation.payload.createdAt : now,
            updatedAt: now,
          }
          rows.push(created)
          mutation.entityId = id
          mutation.status = 'applied'
          mutation.result = created
        }
      }

      mutation.updatedAt = now
      state.syncMutations.push(mutation)
      return mutation
    })
  }

  listMutations(tripId: string, status?: SyncMutation['status']) {
    return this.db.read((state) =>
      state.syncMutations
        .filter((mutation) => mutation.tripId === tripId)
        .filter((mutation) => !status || mutation.status === status)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    )
  }
}
