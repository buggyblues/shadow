import { apiGet, apiPut } from './api-client.js'

export type ClientStateScope = 'global' | 'trip' | 'user'

export interface ClientStateSnapshot<T> {
  key: string
  revision: number
  scope: ClientStateScope
  tripId?: string
  updatedAt: string | null
  value: T | null
}

export function getClientState<T>(
  key: string,
  input: { scope: ClientStateScope; tripId?: string },
) {
  return apiGet<ClientStateSnapshot<T>>(`/api/client-state/${encodeURIComponent(key)}`, input)
}

export function putClientState<T>(
  key: string,
  input: {
    expectedRevision?: number
    scope: ClientStateScope
    tripId?: string
    value: T
  },
) {
  return apiPut<ClientStateSnapshot<T>>(`/api/client-state/${encodeURIComponent(key)}`, input)
}
