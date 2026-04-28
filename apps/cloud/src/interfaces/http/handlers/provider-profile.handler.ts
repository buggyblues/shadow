/**
 * Provider profile handler — local console equivalent of SaaS provider profiles.
 */

import { randomUUID } from 'node:crypto'
import { Hono } from 'hono'
import { normalizeLlmProviderConfig } from '../../../application/llm-provider-platform.js'
import { listProviderCatalogs } from '../../../application/provider-catalogs.js'
import type { HandlerContext } from './types.js'

const PROVIDER_PROFILE_SCOPE_PREFIX = 'provider:'
const META_KEYS = {
  id: 'SHADOW_PROVIDER_PROFILE_ID',
  providerId: 'SHADOW_PROVIDER_ID',
  name: 'SHADOW_PROVIDER_PROFILE_NAME',
  configJson: 'SHADOW_PROVIDER_CONFIG_JSON',
  enabled: 'SHADOW_PROVIDER_ENABLED',
} as const
const META_KEY_SET = new Set<string>(Object.values(META_KEYS))

function normalizeProviderProfileId(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function providerProfileScope(profileId: string): string {
  return `${PROVIDER_PROFILE_SCOPE_PREFIX}${profileId}`
}

function parseConfig(value: string | undefined): Record<string, unknown> {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

function readProfiles(ctx: HandlerContext) {
  const masked = ctx.envVarDao
    .findAllMasked()
    .filter((entry) => entry.scope.startsWith(PROVIDER_PROFILE_SCOPE_PREFIX))
  const scopes = [...new Set(masked.map((entry) => entry.scope))]

  return scopes
    .map((scope) => {
      const values = new Map(
        ctx.envVarDao.findByScope(scope).map((entry) => [entry.key, entry.value]),
      )
      const fallbackId = scope.slice(PROVIDER_PROFILE_SCOPE_PREFIX.length)
      const id = values.get(META_KEYS.id) ?? fallbackId
      const providerId = values.get(META_KEYS.providerId) ?? ''
      if (!id || !providerId) return null
      return {
        id,
        providerId,
        name: values.get(META_KEYS.name) ?? providerId,
        scope,
        enabled: values.get(META_KEYS.enabled) !== 'false',
        config: parseConfig(values.get(META_KEYS.configJson)),
        envVars: masked
          .filter((entry) => entry.scope === scope && !META_KEY_SET.has(entry.key))
          .map((entry) => ({
            key: entry.key,
            maskedValue: entry.maskedValue,
            isSecret: entry.isSecret,
          })),
      }
    })
    .filter((profile): profile is NonNullable<typeof profile> => Boolean(profile))
    .sort((left, right) => left.name.localeCompare(right.name))
}

export function createProviderProfileHandler(ctx: HandlerContext): Hono {
  const app = new Hono()

  app.get('/provider-catalogs', async (c) => {
    const providers = (await listProviderCatalogs()).map((entry) => ({
      pluginId: entry.pluginId,
      pluginName: entry.pluginName,
      provider: entry.provider,
      secretFields: entry.secretFields,
    }))
    return c.json({ providers })
  })

  app.get('/provider-profiles', (c) => c.json({ profiles: readProfiles(ctx) }))

  app.put('/provider-profiles', async (c) => {
    const body = await c.req.json<{
      id?: string
      providerId: string
      name: string
      enabled?: boolean
      config?: Record<string, unknown>
      envVars?: Record<string, string>
    }>()
    const profileId =
      normalizeProviderProfileId(body.id ?? `${body.providerId}-${randomUUID().slice(0, 8)}`) ||
      `${body.providerId}-${randomUUID().slice(0, 8)}`
    const scope = providerProfileScope(profileId)

    ctx.envVarDao.upsert(scope, META_KEYS.id, profileId, true)
    ctx.envVarDao.upsert(scope, META_KEYS.providerId, body.providerId, true)
    ctx.envVarDao.upsert(scope, META_KEYS.name, body.name, true)
    ctx.envVarDao.upsert(scope, META_KEYS.configJson, JSON.stringify(body.config ?? {}), true)
    ctx.envVarDao.upsert(scope, META_KEYS.enabled, String(body.enabled ?? true), true)

    for (const [key, value] of Object.entries(body.envVars ?? {})) {
      if (value.trim()) ctx.envVarDao.upsert(scope, key, value, true)
    }

    return c.json({
      ok: true,
      profile: readProfiles(ctx).find((profile) => profile.id === profileId),
    })
  })

  app.post('/provider-profiles/:id/test', (c) => {
    const profileId = normalizeProviderProfileId(c.req.param('id'))
    const scope = providerProfileScope(profileId)
    const values = new Map(
      ctx.envVarDao.findByScope(scope).map((entry) => [entry.key, entry.value]),
    )
    const enabled = values.get(META_KEYS.enabled) !== 'false'
    const providerId = values.get(META_KEYS.providerId)
    const hasKey = [...values.keys()].some(
      (key) => key !== META_KEYS.configJson && /KEY|TOKEN/i.test(key),
    )
    return c.json({
      ok: Boolean(enabled && providerId && hasKey),
      status: null,
      message:
        enabled && providerId && hasKey ? 'Connection check ready' : 'Missing provider credentials',
      checkedAt: new Date().toISOString(),
    })
  })

  app.post('/provider-profiles/:id/models/refresh', async (c) => {
    const profileId = normalizeProviderProfileId(c.req.param('id'))
    const scope = providerProfileScope(profileId)
    const values = new Map(
      ctx.envVarDao.findByScope(scope).map((entry) => [entry.key, entry.value]),
    )
    const providerId = values.get(META_KEYS.providerId)
    const config = parseConfig(values.get(META_KEYS.configJson))
    const catalogs = await listProviderCatalogs()
    const catalog = catalogs.find((entry) => entry.provider.id === providerId)
    const configuredModels = normalizeLlmProviderConfig(config).models ?? []
    const catalogModels =
      catalog?.provider.models.map((model) => ({
        id: model.id,
        name: model.name,
        tags: model.tags,
        contextWindow: model.contextWindow,
        maxTokens: model.maxTokens,
      })) ?? []
    const models = configuredModels.length > 0 ? configuredModels : catalogModels
    const nextConfig = {
      ...config,
      models,
      discoveredAt: new Date().toISOString(),
    }
    ctx.envVarDao.upsert(scope, META_KEYS.configJson, JSON.stringify(nextConfig), true)
    return c.json({
      ok: true,
      status: null,
      message: `Discovered ${models.length} model(s)`,
      models,
      profile: readProfiles(ctx).find((profile) => profile.id === profileId),
    })
  })

  app.delete('/provider-profiles/:id', (c) => {
    const profileId = normalizeProviderProfileId(c.req.param('id'))
    const scope = providerProfileScope(profileId)
    for (const entry of ctx.envVarDao.findByScope(scope)) {
      ctx.envVarDao.delete(scope, entry.key)
    }
    return c.json({ ok: true })
  })

  return app
}
