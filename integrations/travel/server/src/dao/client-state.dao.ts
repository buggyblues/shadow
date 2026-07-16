import type { TravelDataStore } from '../db/database.js'
import type { ClientStateRecord, ClientStateScope } from '../types.js'

export interface ClientStateSelector {
  key: string
  ownerUserId?: string
  scope: ClientStateScope
  serverId: string
  tripId?: string
}

function matches(record: ClientStateRecord, selector: ClientStateSelector) {
  return (
    record.serverId === selector.serverId &&
    record.scope === selector.scope &&
    record.key === selector.key &&
    record.ownerUserId === selector.ownerUserId &&
    record.tripId === selector.tripId
  )
}

export class ClientStateDao {
  constructor(private readonly db: TravelDataStore) {}

  find(selector: ClientStateSelector) {
    return this.db.read(
      (state) => state.clientStates.find((record) => matches(record, selector)) ?? null,
    )
  }

  upsert(
    selector: ClientStateSelector,
    create: (current: ClientStateRecord | null) => ClientStateRecord,
  ) {
    return this.db.write((state) => {
      const index = state.clientStates.findIndex((record) => matches(record, selector))
      const next = create(index >= 0 ? (state.clientStates[index] ?? null) : null)
      if (index >= 0) state.clientStates[index] = next
      else state.clientStates.push(next)
      return next
    })
  }
}
