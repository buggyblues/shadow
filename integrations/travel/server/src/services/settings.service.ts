import type { SettingsDao } from '../dao/settings.dao.js'
import { badRequest, forbidden } from '../lib/errors.js'
import { createId } from '../lib/id.js'
import { decryptSecret, encryptSecret, maskSecret } from '../lib/secrets.js'
import { nowIso } from '../lib/time.js'
import type {
  ProviderSetting,
  ProviderSettingScope,
  RequestContext,
  TripSettings,
} from '../types.js'
import type {
  UpdateTripSettingsInput,
  UpsertProviderSettingsInput,
} from '../validators/travel.schema.js'

const SECRET_KEYS = new Set([
  'google.maps_api_key',
  'unsplash.access_key',
  'mapbox.access_token',
  'llm.api_key',
  'webhook.url',
  'ntfy.token',
  'airtrail.api_key',
  'immich.api_key',
  'synology.password',
])

const ENV_SETTING_KEYS: Record<string, string[]> = {
  'google.maps_api_key': ['TRAVEL_GOOGLE_MAPS_API_KEY', 'GOOGLE_MAPS_API_KEY'],
  'unsplash.access_key': ['TRAVEL_UNSPLASH_ACCESS_KEY', 'UNSPLASH_ACCESS_KEY'],
  'mapbox.access_token': ['TRAVEL_MAPBOX_ACCESS_TOKEN', 'MAPBOX_ACCESS_TOKEN'],
  'llm.provider': ['TRAVEL_LLM_PROVIDER'],
  'llm.model': ['TRAVEL_LLM_MODEL'],
  'llm.base_url': ['TRAVEL_LLM_BASE_URL'],
  'llm.api_key': ['TRAVEL_LLM_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY'],
  'webhook.url': ['TRAVEL_WEBHOOK_URL'],
  'ntfy.server_url': ['TRAVEL_NTFY_SERVER_URL'],
  'ntfy.topic': ['TRAVEL_NTFY_TOPIC'],
  'ntfy.token': ['TRAVEL_NTFY_TOKEN'],
  'airtrail.url': ['TRAVEL_AIRTRAIL_URL'],
  'airtrail.api_key': ['TRAVEL_AIRTRAIL_API_KEY'],
  'immich.url': ['TRAVEL_IMMICH_URL'],
  'immich.api_key': ['TRAVEL_IMMICH_API_KEY'],
  'synology.url': ['TRAVEL_SYNOLOGY_URL'],
  'synology.username': ['TRAVEL_SYNOLOGY_USERNAME'],
  'synology.password': ['TRAVEL_SYNOLOGY_PASSWORD'],
}

function actorUserId(ctx: RequestContext) {
  return (
    ctx.actor.userId ?? ctx.actor.ownerId ?? ctx.actor.id ?? ctx.actor.stableKey ?? 'local-user'
  )
}

function envValue(key: string) {
  for (const envKey of ENV_SETTING_KEYS[key] ?? []) {
    const value = process.env[envKey]
    if (value?.trim()) return value.trim()
  }
  return undefined
}

function canUseScope(ctx: RequestContext, scope: ProviderSettingScope) {
  if (scope === 'server' && !ctx.local)
    throw forbidden('Only local server admins can edit server provider settings')
}

function serializeSettingValue(key: string, value: string, secret = SECRET_KEYS.has(key)) {
  return secret ? encryptSecret(value) : value
}

function deserializeSetting(setting: ProviderSetting, revealSecrets = false) {
  const raw = setting.encrypted ? decryptSecret(setting.value) : setting.value
  return {
    id: setting.id,
    serverId: setting.serverId,
    ownerUserId: setting.ownerUserId,
    scope: setting.scope,
    key: setting.key,
    value: setting.secret && !revealSecrets ? maskSecret(raw) : raw,
    secret: setting.secret,
    updatedAt: setting.updatedAt,
  }
}

export function defaultTripSettings(tripId: string): TripSettings {
  return {
    tripId,
    distanceUnit: 'km',
    temperatureUnit: 'c',
    weekStartsOn: 1,
    defaultShareSections: ['overview', 'itinerary'],
    notificationLeadHours: [24, 2],
    updatedAt: nowIso(),
  }
}

export class SettingsService {
  constructor(private readonly settingsDao: SettingsDao) {}

  async getTripSettings(tripId: string) {
    return (await this.settingsDao.findTripSettings(tripId)) ?? defaultTripSettings(tripId)
  }

  async updateTripSettings(tripId: string, input: UpdateTripSettingsInput) {
    const current = await this.getTripSettings(tripId)
    return this.settingsDao.upsertTripSettings({
      ...current,
      ...input,
      updatedAt: nowIso(),
    })
  }

  async listProviderSettings(ctx: RequestContext) {
    const ownerUserId = actorUserId(ctx)
    const settings = await this.settingsDao.listProviderSettings({
      serverId: ctx.serverId,
      ownerUserId,
      includeServer: true,
    })
    const envSettings = Object.keys(ENV_SETTING_KEYS)
      .map((key) => {
        const value = envValue(key)
        if (!value) return null
        return {
          id: `env:${key}`,
          serverId: ctx.serverId,
          scope: 'server' as const,
          key,
          value: SECRET_KEYS.has(key) ? maskSecret(value) : value,
          secret: SECRET_KEYS.has(key),
          updatedAt: 'env',
          source: 'env',
        }
      })
      .filter(Boolean)
    return {
      settings: settings.map((setting) => deserializeSetting(setting)),
      env: envSettings,
    }
  }

  async upsertProviderSettings(ctx: RequestContext, input: UpsertProviderSettingsInput) {
    const ownerUserId = actorUserId(ctx)
    const results = []
    for (const item of input.settings) {
      const scope = item.scope ?? 'user'
      canUseScope(ctx, scope)
      if (!item.value) {
        await this.settingsDao.deleteProviderSetting({
          serverId: ctx.serverId,
          ownerUserId,
          scope,
          key: item.key,
        })
        results.push({ key: item.key, deleted: true })
        continue
      }
      const secret = item.secret ?? SECRET_KEYS.has(item.key)
      const setting: ProviderSetting = {
        id: createId('setting'),
        serverId: ctx.serverId,
        ownerUserId: scope === 'user' ? ownerUserId : undefined,
        scope,
        key: item.key,
        value: serializeSettingValue(item.key, item.value, secret),
        encrypted: secret,
        secret,
        updatedAt: nowIso(),
      }
      await this.settingsDao.upsertProviderSetting(setting)
      results.push(deserializeSetting(setting))
    }
    return { settings: results }
  }

  async getProviderValue(ctx: RequestContext, key: string) {
    return this.getProviderValueForUser(ctx.serverId, actorUserId(ctx), key)
  }

  async getProviderValueForUser(serverId: string, ownerUserId: string | undefined, key: string) {
    const env = envValue(key)
    if (env) return env
    const userSetting = ownerUserId
      ? await this.settingsDao.findProviderSetting({
          serverId,
          ownerUserId,
          scope: 'user',
          key,
        })
      : null
    const setting =
      userSetting ??
      (await this.settingsDao.findProviderSetting({
        serverId,
        scope: 'server',
        key,
      }))
    if (!setting) return undefined
    return setting.encrypted ? decryptSecret(setting.value) : setting.value
  }

  async getRequiredProviderValue(ctx: RequestContext, key: string) {
    const value = await this.getProviderValue(ctx, key)
    if (!value) throw badRequest(`Provider setting ${key} is not configured`)
    return value
  }
}
