import type { ClientStateDao, ClientStateSelector } from '../dao/client-state.dao.js'
import { conflict } from '../lib/errors.js'
import { createId } from '../lib/id.js'
import { nowIso } from '../lib/time.js'

export class ClientStateService {
  constructor(private readonly clientStateDao: ClientStateDao) {}

  async get(selector: ClientStateSelector) {
    const record = await this.clientStateDao.find(selector)
    return (
      record ?? {
        key: selector.key,
        revision: 0,
        scope: selector.scope,
        tripId: selector.tripId,
        updatedAt: null,
        value: null,
      }
    )
  }

  upsert(selector: ClientStateSelector, input: { expectedRevision?: number; value: unknown }) {
    return this.clientStateDao.upsert(selector, (current) => {
      if (
        input.expectedRevision !== undefined &&
        input.expectedRevision !== (current?.revision ?? 0)
      ) {
        throw conflict('Client state was updated elsewhere')
      }
      return {
        id: current?.id ?? createId('client_state'),
        ...selector,
        value: input.value,
        revision: (current?.revision ?? 0) + 1,
        updatedAt: nowIso(),
      }
    })
  }
}
