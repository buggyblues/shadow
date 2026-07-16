import type { TravelDataStore } from '../db/database.js'
import type { ProviderCacheEntry } from '../types.js'

export class ProviderCacheDao {
  constructor(private readonly db: TravelDataStore) {}

  find(key: string) {
    return this.db.read((state) => state.providerCache.find((entry) => entry.key === key) ?? null)
  }

  upsert(entry: ProviderCacheEntry) {
    return this.db.write((state) => {
      const index = state.providerCache.findIndex((item) => item.key === entry.key)
      if (index >= 0) state.providerCache[index] = entry
      else state.providerCache.push(entry)
      if (state.providerCache.length > 5000) {
        state.providerCache.sort((a, b) => a.expiresAt.localeCompare(b.expiresAt))
        state.providerCache.splice(0, state.providerCache.length - 5000)
      }
      return entry
    })
  }

  list(provider?: string) {
    return this.db.read((state) =>
      state.providerCache
        .filter((entry) => !provider || entry.provider === provider)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    )
  }

  deleteExpired(nowIso: string) {
    return this.db.write((state) => {
      const before = state.providerCache.length
      state.providerCache = state.providerCache.filter(
        (entry) => (entry.staleAt ?? entry.expiresAt) > nowIso,
      )
      return before - state.providerCache.length
    })
  }
}
