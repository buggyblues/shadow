import type { TravelDataStore } from '../db/database.js'
import type { ProviderSetting, ProviderSettingScope, TripSettings } from '../types.js'

export class SettingsDao {
  constructor(private readonly db: TravelDataStore) {}

  findTripSettings(tripId: string) {
    return this.db.read(
      (state) => state.tripSettings.find((settings) => settings.tripId === tripId) ?? null,
    )
  }

  upsertTripSettings(settings: TripSettings) {
    return this.db.write((state) => {
      const index = state.tripSettings.findIndex((item) => item.tripId === settings.tripId)
      if (index >= 0) state.tripSettings[index] = settings
      else state.tripSettings.push(settings)
      return settings
    })
  }

  listProviderSettings(input: { serverId: string; ownerUserId?: string; includeServer?: boolean }) {
    return this.db.read((state) =>
      state.providerSettings.filter((setting) => {
        if (setting.serverId !== input.serverId) return false
        if (setting.scope === 'server') return input.includeServer !== false
        return Boolean(input.ownerUserId && setting.ownerUserId === input.ownerUserId)
      }),
    )
  }

  findProviderSetting(input: {
    serverId: string
    ownerUserId?: string
    scope: ProviderSettingScope
    key: string
  }) {
    return this.db.read(
      (state) =>
        state.providerSettings.find(
          (setting) =>
            setting.serverId === input.serverId &&
            setting.scope === input.scope &&
            setting.key === input.key &&
            (input.scope === 'server' || setting.ownerUserId === input.ownerUserId),
        ) ?? null,
    )
  }

  upsertProviderSetting(setting: ProviderSetting) {
    return this.db.write((state) => {
      const index = state.providerSettings.findIndex(
        (item) =>
          item.serverId === setting.serverId &&
          item.scope === setting.scope &&
          item.key === setting.key &&
          (setting.scope === 'server' || item.ownerUserId === setting.ownerUserId),
      )
      if (index >= 0)
        state.providerSettings[index] = { ...state.providerSettings[index], ...setting }
      else state.providerSettings.push(setting)
      return setting
    })
  }

  deleteProviderSetting(input: {
    serverId: string
    ownerUserId?: string
    scope: ProviderSettingScope
    key: string
  }) {
    return this.db.write((state) => {
      const before = state.providerSettings.length
      state.providerSettings = state.providerSettings.filter(
        (setting) =>
          !(
            setting.serverId === input.serverId &&
            setting.scope === input.scope &&
            setting.key === input.key &&
            (input.scope === 'server' || setting.ownerUserId === input.ownerUserId)
          ),
      )
      return before !== state.providerSettings.length
    })
  }
}
