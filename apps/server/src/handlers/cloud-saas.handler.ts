import { randomUUID } from 'node:crypto'
import { zValidator } from '@hono/zod-validator'
import {
  type CostOverviewSummary,
  collectNamespaceCost,
  collectRuntimeEnvRequirements,
  deleteNamespace,
  execInPod,
  extractRequiredEnvVars,
  listManagedNamespaces,
  listPods,
  listProviderCatalogs,
  loadCloudConfigSchema,
  type NamespaceCostSummary,
  prepareCloudSaasConfigSnapshot,
  readPodLogs,
  sanitizeCloudSaasDeployment,
  spawnPodLogStream,
  summarizeCloudConfigValidation,
  summarizeCostOverview,
  validateCloudSaasConfigSnapshot,
} from '@shadowob/cloud'
import { eq, sql } from 'drizzle-orm'
import { type Context, Hono } from 'hono'
import { z } from 'zod'
import type { AppContainer } from '../container'
import { cloudDeployments, cloudTemplates } from '../db/schema'
import { decrypt, encrypt } from '../lib/kms'
import { authMiddleware } from '../middleware/auth.middleware'
import {
  DEFAULT_LLM_ROUTING_POLICY,
  type LlmProviderApiFormat,
  type LlmRoutableModel,
  type LlmRoutingPolicy,
  makeModelRef,
  normalizeLlmProviderConfig,
  normalizeLlmProviderModels,
  normalizeLlmRoutingPolicy,
  parseDiscoveredModelsFromResponse,
  resolveLlmRoute,
} from '../services/llm-provider-platform'

// ─── Resource tier cost map (Shrimp Coins / month) ──────────────────────────

const TIER_COST: Record<string, number> = {
  lightweight: 500,
  standard: 1200,
  pro: 2800,
}

const PROVIDER_PROFILE_SCOPE_PREFIX = 'provider:'
const PROVIDER_PROFILE_META_KEYS = {
  id: 'SHADOW_PROVIDER_PROFILE_ID',
  providerId: 'SHADOW_PROVIDER_ID',
  name: 'SHADOW_PROVIDER_PROFILE_NAME',
  configJson: 'SHADOW_PROVIDER_CONFIG_JSON',
  enabled: 'SHADOW_PROVIDER_ENABLED',
} as const
const PROVIDER_PROFILE_META_KEY_SET = new Set<string>(Object.values(PROVIDER_PROFILE_META_KEYS))
const PROVIDER_PROFILE_MODELS_ENV_KEY = 'SHADOW_PROVIDER_PROFILE_MODELS_JSON'
const PROVIDER_ROUTING_SCOPE = 'provider-routing:default'
const PROVIDER_ROUTING_POLICY_KEY = 'SHADOW_PROVIDER_ROUTING_POLICY_JSON'
const PROVIDER_MODEL_TAGS = ['default', 'fast', 'flash', 'reasoning', 'vision', 'tools'] as const
const PROVIDER_MODEL_TAG_SET = new Set<string>(PROVIDER_MODEL_TAGS)

type ProviderCatalogView = Awaited<ReturnType<typeof listProviderCatalogs>>[number]['provider']

type ProviderProfileView = {
  id: string
  providerId: string
  name: string
  scope: string
  enabled: boolean
  config: Record<string, unknown>
  envVars: Array<{ key: string; maskedValue: string; isSecret: boolean }>
  updatedAt?: string
}

type ProviderProfileModelView = {
  id: string
  name?: string
  tags?: string[]
  contextWindow?: number
  maxTokens?: number
  cost?: {
    input?: number
    output?: number
  }
  capabilities?: {
    vision?: boolean
    tools?: boolean
    reasoning?: boolean
  }
}

function getPrimarySchema(): Record<string, unknown> {
  return loadCloudConfigSchema()
}

function isDeployableTemplateContent(content: unknown): boolean {
  try {
    validateCloudSaasConfigSnapshot(content)
    return true
  } catch {
    return false
  }
}

function nonEmptyProcessEnv(key: string): string | undefined {
  const value = process.env[key]
  return value && value.trim() !== '' ? value : undefined
}

function providerProfileScope(profileId: string): string {
  return `${PROVIDER_PROFILE_SCOPE_PREFIX}${profileId}`
}

function isProviderProfileMetaKey(key: string): boolean {
  return PROVIDER_PROFILE_META_KEY_SET.has(key)
}

function normalizeProviderProfileId(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function parseProviderProfileConfig(value: string | undefined): Record<string, unknown> {
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

function parseProviderProfileEnabled(value: string | undefined): boolean {
  return value !== 'false'
}

function finitePositiveNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined
  return value
}

function normalizeModelTags(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const tags = [
    ...new Set(
      value
        .filter((tag): tag is string => typeof tag === 'string')
        .map((tag) => tag.trim().toLowerCase())
        .filter((tag) => PROVIDER_MODEL_TAG_SET.has(tag)),
    ),
  ]
  return tags.length > 0 ? tags : undefined
}

function normalizeProviderProfileModels(
  config: Record<string, unknown>,
): ProviderProfileModelView[] {
  const rawModels = Array.isArray(config.models) ? config.models : []
  const models: ProviderProfileModelView[] = []
  const seen = new Set<string>()

  for (const raw of rawModels) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const record = raw as Record<string, unknown>
    const id = typeof record.id === 'string' ? record.id.trim() : ''
    if (!id || seen.has(id)) continue
    seen.add(id)

    const name =
      typeof record.name === 'string' && record.name.trim() ? record.name.trim() : undefined
    const contextWindow = finitePositiveNumber(record.contextWindow)
    const maxTokens = finitePositiveNumber(record.maxTokens)
    const inputCost = finitePositiveNumber(
      (record.cost as Record<string, unknown> | undefined)?.input,
    )
    const outputCost = finitePositiveNumber(
      (record.cost as Record<string, unknown> | undefined)?.output,
    )
    const capabilities =
      record.capabilities &&
      typeof record.capabilities === 'object' &&
      !Array.isArray(record.capabilities)
        ? (record.capabilities as Record<string, unknown>)
        : undefined

    models.push({
      id,
      ...(name ? { name } : {}),
      ...(normalizeModelTags(record.tags) ? { tags: normalizeModelTags(record.tags) } : {}),
      ...(contextWindow ? { contextWindow } : {}),
      ...(maxTokens ? { maxTokens } : {}),
      ...(inputCost || outputCost
        ? {
            cost: {
              ...(inputCost ? { input: inputCost } : {}),
              ...(outputCost ? { output: outputCost } : {}),
            },
          }
        : {}),
      ...(capabilities
        ? {
            capabilities: {
              ...(typeof capabilities.vision === 'boolean' ? { vision: capabilities.vision } : {}),
              ...(typeof capabilities.tools === 'boolean' ? { tools: capabilities.tools } : {}),
              ...(typeof capabilities.reasoning === 'boolean'
                ? { reasoning: capabilities.reasoning }
                : {}),
            },
          }
        : {}),
    })
  }

  const legacyModel = config.modelId ?? config.defaultModel ?? config.model
  if (typeof legacyModel === 'string' && legacyModel.trim() && !seen.has(legacyModel.trim())) {
    models.push({ id: legacyModel.trim(), tags: ['default'] })
  }

  return models
}

function configUsesPlugin(value: unknown, pluginId: string, depth = 0): boolean {
  if (depth > 32 || !value || typeof value !== 'object') return false
  if (Array.isArray(value)) return value.some((item) => configUsesPlugin(item, pluginId, depth + 1))

  const record = value as Record<string, unknown>
  if (record.plugin === pluginId) return true
  return Object.values(record).some((child) => configUsesPlugin(child, pluginId, depth + 1))
}

function firstProviderApiKey(
  provider: ProviderCatalogView,
  values: Map<string, string>,
): { key: string; value: string } | null {
  for (const key of [provider.envKey, ...(provider.envKeyAliases ?? [])]) {
    const value = values.get(key)
    if (value?.trim()) return { key, value }
  }
  return null
}

function defaultProviderBaseUrl(provider: ProviderCatalogView): string | undefined {
  if (provider.baseUrl) return provider.baseUrl
  if (provider.id === 'anthropic') return 'https://api.anthropic.com/v1'
  if (provider.id === 'gemini') return 'https://generativelanguage.googleapis.com/v1beta'
  return undefined
}

function normalizeBaseUrl(input: string | undefined): string | undefined {
  const value = input?.trim()
  if (!value) return undefined
  return value.replace(/\/+$/, '')
}

function providerProfileBaseUrl(
  provider: ProviderCatalogView,
  values: Map<string, string>,
  config: Record<string, unknown>,
): string | undefined {
  const configBaseUrl = config.baseUrl
  const envBaseUrl = provider.baseUrlEnvKey ? values.get(provider.baseUrlEnvKey) : undefined
  return normalizeBaseUrl(
    typeof configBaseUrl === 'string' && configBaseUrl.trim()
      ? configBaseUrl
      : envBaseUrl || defaultProviderBaseUrl(provider),
  )
}

async function testProviderConnection(
  provider: ProviderCatalogView,
  values: Map<string, string>,
  config: Record<string, unknown>,
): Promise<{ ok: boolean; status?: number; message: string; checkedAt: string }> {
  const checkedAt = new Date().toISOString()
  const apiKey = firstProviderApiKey(provider, values)
  if (!apiKey) {
    return { ok: false, message: 'Missing provider API key', checkedAt }
  }

  const baseUrl = providerProfileBaseUrl(provider, values, config)
  if (!baseUrl) {
    return { ok: false, message: 'Missing provider base URL', checkedAt }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8_000)
  try {
    let url = `${baseUrl}/models`
    const headers: Record<string, string> = { Accept: 'application/json' }

    if (provider.api === 'google' || provider.api === 'google-generative-ai') {
      url = `${baseUrl}/models?key=${encodeURIComponent(apiKey.value)}`
    } else if (provider.api === 'anthropic-messages') {
      headers['x-api-key'] = apiKey.value
      headers['anthropic-version'] = '2023-06-01'
    } else {
      headers.Authorization = `Bearer ${apiKey.value}`
    }

    const response = await fetch(url, { headers, signal: controller.signal })
    if (response.ok) {
      return { ok: true, status: response.status, message: 'Connection succeeded', checkedAt }
    }
    const body = await response.text().catch(() => '')
    return {
      ok: false,
      status: response.status,
      message: body.trim().slice(0, 240) || `Provider returned ${response.status}`,
      checkedAt,
    }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Connection failed',
      checkedAt,
    }
  } finally {
    clearTimeout(timeout)
  }
}

function providerProfileApiFormat(
  provider: ProviderCatalogView,
  config: Record<string, unknown>,
): LlmProviderApiFormat {
  const normalized = normalizeLlmProviderConfig(config)
  if (normalized.apiFormat) return normalized.apiFormat
  if (provider.api === 'google' || provider.api === 'google-generative-ai') return 'gemini'
  return provider.api === 'anthropic' || provider.api === 'anthropic-messages'
    ? 'anthropic'
    : 'openai'
}

async function discoverProviderProfileModels(
  provider: ProviderCatalogView,
  values: Map<string, string>,
  config: Record<string, unknown>,
): Promise<{ ok: boolean; status?: number; message: string; models: ProviderProfileModelView[] }> {
  const apiKey = firstProviderApiKey(provider, values)
  const apiFormat = providerProfileApiFormat(provider, config)
  const baseUrl = providerProfileBaseUrl(provider, values, config)

  if (!baseUrl) return { ok: false, message: 'Missing provider base URL', models: [] }
  if (!apiKey) return { ok: false, message: 'Missing provider API key', models: [] }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8_000)
  try {
    const url =
      apiFormat === 'anthropic'
        ? `${baseUrl}/models?limit=100`
        : apiFormat === 'gemini'
          ? `${baseUrl}/models${apiKey ? `?key=${encodeURIComponent(apiKey.value)}` : ''}`
          : `${baseUrl}/models`
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (apiKey) {
      if (apiFormat === 'anthropic') {
        headers['x-api-key'] = apiKey.value
        headers['anthropic-version'] = '2023-06-01'
      } else if (apiFormat === 'openai') {
        headers.Authorization = `Bearer ${apiKey.value}`
      }
    }

    const response = await fetch(url, { headers, signal: controller.signal })
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      return {
        ok: false,
        status: response.status,
        message: body.trim().slice(0, 240) || `Provider returned ${response.status}`,
        models: [],
      }
    }

    const body = await response.json()
    const models = parseDiscoveredModelsFromResponse(body, apiFormat)
    return {
      ok: true,
      status: response.status,
      message: `Discovered ${models.length} model(s)`,
      models,
    }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Model discovery failed',
      models: [],
    }
  } finally {
    clearTimeout(timeout)
  }
}

function buildRoutableModels(profiles: ProviderProfileView[]): LlmRoutableModel[] {
  return profiles.flatMap((profile) => {
    const config = normalizeLlmProviderConfig(profile.config)
    return (config.models ?? []).map((model) => ({
      ...model,
      ref: makeModelRef(profile.id, model.id),
      providerId: profile.providerId,
      profileId: profile.id,
      profileName: profile.name,
      enabled: profile.enabled,
    }))
  })
}

function collectProviderProfileIds(
  value: unknown,
  out = new Set<string>(),
  depth = 0,
): Set<string> {
  if (depth > 32 || !value || typeof value !== 'object') return out

  if (Array.isArray(value)) {
    for (const item of value) collectProviderProfileIds(item, out, depth + 1)
    return out
  }

  const record = value as Record<string, unknown>
  if (record.plugin === 'model-provider') {
    const options = record.options as Record<string, unknown> | undefined
    const profileId = options?.profileId
    if (typeof profileId === 'string' && profileId.trim()) out.add(profileId.trim())

    const profileIds = options?.profileIds
    if (Array.isArray(profileIds)) {
      for (const id of profileIds) {
        if (typeof id === 'string' && id.trim()) out.add(id.trim())
      }
    }
  }

  for (const child of Object.values(record)) collectProviderProfileIds(child, out, depth + 1)
  return out
}

type DeploymentAgentConfig = {
  id?: unknown
  replicas?: unknown
}

function getDeploymentAgentNames(deployment: {
  name: string
  agentCount?: number | null
  configSnapshot?: unknown
}): string[] {
  const configSnapshot =
    deployment.configSnapshot && typeof deployment.configSnapshot === 'object'
      ? (deployment.configSnapshot as Record<string, unknown>)
      : null
  const deployments = configSnapshot?.deployments as
    | { agents?: DeploymentAgentConfig[] }
    | undefined
  const agentNames = (deployments?.agents ?? [])
    .map((agent) => (typeof agent?.id === 'string' ? agent.id : null))
    .filter((agentName): agentName is string => Boolean(agentName))

  if (agentNames.length > 0) {
    return agentNames
  }

  if ((deployment.agentCount ?? 0) > 1) {
    return Array.from(
      { length: deployment.agentCount ?? 0 },
      (_, index) => `${deployment.name}-${index + 1}`,
    )
  }

  return [deployment.name]
}

function sumNullable(values: Array<number | null>): number | null {
  const filtered = values.filter((value): value is number => value !== null)
  return filtered.length > 0 ? filtered.reduce((sum, value) => sum + value, 0) : null
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function isTerminalDeploymentStatus(status: string): boolean {
  return status === 'deployed' || status === 'failed' || status === 'destroyed'
}

function isVisibleDeploymentStatus(status: string): boolean {
  return (
    status === 'pending' ||
    status === 'deploying' ||
    status === 'cancelling' ||
    status === 'deployed' ||
    status === 'destroying'
  )
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getBearerToken(authHeader: string | undefined): string | undefined {
  const match = authHeader?.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || undefined
}

function requestOrigin(c: Context): string | undefined {
  const host = c.req.header('x-forwarded-host') ?? c.req.header('host')
  if (!host) return undefined
  const proto = c.req.header('x-forwarded-proto') ?? 'http'
  return `${proto}://${host}`
}

export function createCloudSaasHandler(container: AppContainer) {
  const h = new Hono()

  h.use('*', authMiddleware)

  async function loadGroupNameLookup(userId: string): Promise<Map<string, string>> {
    const envDao = container.resolve('cloudEnvVarDao')
    const groups = await envDao.listGroupsByUser(userId)
    return new Map(groups.map((group) => [group.id, group.name]))
  }

  async function resolveGroupId(userId: string, groupName?: string | null): Promise<string | null> {
    if (!groupName || groupName === 'default') return null

    const envDao = container.resolve('cloudEnvVarDao')
    const existing = await envDao.findGroupByName(userId, groupName)
    if (existing) return existing.id

    const created = await envDao.createGroup({ userId, name: groupName })
    return created?.id ?? null
  }

  async function readProviderProfiles(userId: string): Promise<ProviderProfileView[]> {
    const envDao = container.resolve('cloudEnvVarDao')
    const vars = await envDao.listByUser(userId)
    const byScope = new Map<string, typeof vars>()
    for (const variable of vars) {
      if (!variable.scope.startsWith(PROVIDER_PROFILE_SCOPE_PREFIX)) continue
      const scoped = byScope.get(variable.scope) ?? []
      scoped.push(variable)
      byScope.set(variable.scope, scoped)
    }

    const profiles: ProviderProfileView[] = []
    for (const [scope, scopedVars] of byScope) {
      const values = new Map(scopedVars.map((v) => [v.key, decrypt(v.encryptedValue)]))
      const fallbackId = scope.slice(PROVIDER_PROFILE_SCOPE_PREFIX.length)
      const id = values.get(PROVIDER_PROFILE_META_KEYS.id) ?? fallbackId
      const providerId = values.get(PROVIDER_PROFILE_META_KEYS.providerId) ?? ''
      const name = values.get(PROVIDER_PROFILE_META_KEYS.name) ?? (providerId || id)
      const enabled = parseProviderProfileEnabled(values.get(PROVIDER_PROFILE_META_KEYS.enabled))
      if (!id || !providerId) continue

      profiles.push({
        id,
        providerId,
        name,
        scope,
        enabled,
        config: parseProviderProfileConfig(values.get(PROVIDER_PROFILE_META_KEYS.configJson)),
        envVars: scopedVars
          .filter((v) => !isProviderProfileMetaKey(v.key))
          .map((v) => ({
            key: v.key,
            maskedValue: '****',
            isSecret: true,
          })),
        updatedAt: scopedVars
          .map((v) => v.updatedAt?.toISOString())
          .filter((value): value is string => Boolean(value))
          .sort()
          .at(-1),
      })
    }

    return profiles.sort((a, b) => a.name.localeCompare(b.name))
  }

  async function readProviderRoutingPolicy(userId: string): Promise<LlmRoutingPolicy> {
    const envDao = container.resolve('cloudEnvVarDao')
    const vars = await envDao.listByUser(userId, PROVIDER_ROUTING_SCOPE)
    const found = vars.find((entry) => entry.key === PROVIDER_ROUTING_POLICY_KEY)
    if (!found) return DEFAULT_LLM_ROUTING_POLICY
    return normalizeLlmRoutingPolicy(parseProviderProfileConfig(decrypt(found.encryptedValue)))
  }

  async function writeProviderRoutingPolicy(
    userId: string,
    policy: LlmRoutingPolicy,
  ): Promise<LlmRoutingPolicy> {
    const envDao = container.resolve('cloudEnvVarDao')
    const normalized = normalizeLlmRoutingPolicy(policy)
    await envDao.upsertScoped({
      userId,
      scope: PROVIDER_ROUTING_SCOPE,
      key: PROVIDER_ROUTING_POLICY_KEY,
      encryptedValue: encrypt(JSON.stringify(normalized)),
    })
    return normalized
  }

  async function resolveCreateRuntimeEnvVars(
    userId: string,
    inputEnvVars: Record<string, string> | undefined,
    configSnapshot: unknown,
    requestAuthHeader: string | undefined,
    fallbackOrigin: string | undefined,
  ): Promise<Record<string, string>> {
    const envVars: Record<string, string> = {}
    const shadowServerUrl = process.env.SHADOW_SERVER_URL ?? fallbackOrigin
    const shadowAgentServerUrl = process.env.SHADOW_AGENT_SERVER_URL
    const shadowProvisionUrl = process.env.SHADOW_PROVISION_URL
    const requestToken = getBearerToken(requestAuthHeader)

    if (shadowServerUrl) envVars.SHADOW_SERVER_URL = shadowServerUrl
    if (shadowAgentServerUrl) envVars.SHADOW_AGENT_SERVER_URL = shadowAgentServerUrl
    if (shadowProvisionUrl) envVars.SHADOW_PROVISION_URL = shadowProvisionUrl
    if (requestToken) envVars.SHADOW_USER_TOKEN = requestToken

    const needsSavedLookup = Object.values(inputEnvVars ?? {}).some(
      (value) => value === '__SAVED__',
    )
    const runtimeEnvRequirements = await collectRuntimeEnvRequirements(configSnapshot)
    const explicitProviderProfileIds = [...collectProviderProfileIds(configSnapshot)]
      .map(normalizeProviderProfileId)
      .filter(Boolean)
    const providerProfileIds =
      explicitProviderProfileIds.length > 0
        ? explicitProviderProfileIds
        : configUsesPlugin(configSnapshot, 'model-provider')
          ? (await readProviderProfiles(userId))
              .filter((profile) => profile.enabled)
              .map((p) => p.id)
          : []
    const savedValues = new Map<string, string>()
    const providerProfileValues = new Map<string, string>()
    const providerProfileModelSets: Array<{
      providerId: string
      profileId: string
      models: ProviderProfileModelView[]
    }> = []
    const providerCatalogs =
      providerProfileIds.length > 0
        ? (await listProviderCatalogs()).map((entry) => entry.provider)
        : []
    if (needsSavedLookup || runtimeEnvRequirements.length > 0 || providerProfileIds.length > 0) {
      const envDao = container.resolve('cloudEnvVarDao')
      const globalVars = await envDao.listByUser(userId, 'global')
      for (const variable of globalVars) {
        savedValues.set(variable.key, decrypt(variable.encryptedValue))
      }
      for (const profileId of providerProfileIds) {
        const scopedVars = await envDao.listByUser(userId, providerProfileScope(profileId))
        const values = new Map(scopedVars.map((v) => [v.key, decrypt(v.encryptedValue)]))
        const providerId = values.get(PROVIDER_PROFILE_META_KEYS.providerId)
        if (!parseProviderProfileEnabled(values.get(PROVIDER_PROFILE_META_KEYS.enabled))) continue
        const provider = providerCatalogs.find((catalog) => catalog.id === providerId)
        const config = parseProviderProfileConfig(values.get(PROVIDER_PROFILE_META_KEYS.configJson))
        const baseUrl = config.baseUrl
        if (provider?.baseUrlEnvKey && typeof baseUrl === 'string' && baseUrl.trim()) {
          providerProfileValues.set(provider.baseUrlEnvKey, baseUrl)
        }
        const models = normalizeProviderProfileModels(config)
        if (provider && models.length > 0) {
          providerProfileModelSets.push({ providerId: provider.id, profileId, models })
        }
        const model = config.modelId ?? config.defaultModel ?? config.model
        if (provider?.modelEnvKey && typeof model === 'string' && model.trim()) {
          providerProfileValues.set(provider.modelEnvKey, model)
        }
        for (const variable of scopedVars) {
          if (isProviderProfileMetaKey(variable.key)) continue
          const value = values.get(variable.key)
          if (value !== undefined) providerProfileValues.set(variable.key, value)
        }
      }
      if (providerProfileModelSets.length > 0) {
        providerProfileValues.set(
          PROVIDER_PROFILE_MODELS_ENV_KEY,
          JSON.stringify(providerProfileModelSets),
        )
      }
    }

    const explicitKeys = new Set(Object.keys(inputEnvVars ?? {}))
    for (const key of runtimeEnvRequirements) {
      if (explicitKeys.has(key)) continue
      const value =
        providerProfileValues.get(key) ?? savedValues.get(key) ?? nonEmptyProcessEnv(key)
      if (value !== undefined) envVars[key] = value
    }

    for (const [key, value] of providerProfileValues) {
      if (!explicitKeys.has(key) && value !== undefined) envVars[key] = value
    }

    for (const [key, value] of Object.entries(inputEnvVars ?? {})) {
      if (typeof value !== 'string') continue

      if (value === '__SAVED__') {
        const savedValue = savedValues.get(key)
        if (savedValue !== undefined) envVars[key] = savedValue
        continue
      }

      if (value.trim() === '') continue
      envVars[key] = value
    }

    return envVars
  }

  // ─── Templates ─────────────────────────────────────────────────────────────

  h.get('/schema', (c) => c.json(getPrimarySchema()))

  h.post('/validate', async (c) => {
    try {
      const config = await c.req.json<unknown>()
      return c.json(summarizeCloudConfigValidation(config))
    } catch (err) {
      return c.json(
        { ok: false, error: err instanceof Error ? err.message : 'Invalid request' },
        400,
      )
    }
  })

  /**
   * GET /api/cloud-saas/templates
   * List all approved templates (official + community).
   * Supports optional `category` and `q` (search) query params.
   */
  h.get('/templates', async (c) => {
    const category = c.req.query('category')
    const q = c.req.query('q')?.toLowerCase()
    const dao = container.resolve('cloudTemplateDao')
    let templates = (await dao.listApproved()).filter((template) =>
      isDeployableTemplateContent(template.content),
    )
    if (category) {
      templates = templates.filter((t) => t.category === category)
    }
    if (q) {
      templates = templates.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          (t.description ?? '').toLowerCase().includes(q) ||
          (t.tags as string[] | null)?.some((tag) => tag.toLowerCase().includes(q)),
      )
    }
    return c.json(templates)
  })

  /**
   * GET /api/cloud-saas/templates/mine
   * List templates authored by the current user (any review status).
   */
  h.get('/templates/mine', async (c) => {
    const user = c.get('user') as { userId: string }
    const db = container.resolve('db')
    const { eq, and, ne } = await import('drizzle-orm')
    const templates = await db
      .select()
      .from(cloudTemplates)
      .where(and(eq(cloudTemplates.authorId, user.userId), ne(cloudTemplates.source, 'official')))
      .orderBy(cloudTemplates.updatedAt)
    return c.json(templates)
  })

  /**
   * GET /api/cloud-saas/templates/mine/:slug
   * Get a single template authored by the current user (any review status).
   */
  h.get('/templates/mine/:slug', async (c) => {
    const user = c.get('user') as { userId: string }
    const slug = c.req.param('slug')
    const db = container.resolve('db')
    const { eq, and, ne } = await import('drizzle-orm')
    const [template] = await db
      .select()
      .from(cloudTemplates)
      .where(
        and(
          eq(cloudTemplates.slug, slug),
          eq(cloudTemplates.authorId, user.userId),
          ne(cloudTemplates.source, 'official'),
        ),
      )
      .limit(1)
    if (!template) return c.json({ ok: false, error: 'Template not found' }, 404)
    return c.json(template)
  })

  /**
   * GET /api/cloud-saas/templates/:slug
   * Get a single approved template by slug.
   */
  h.get('/templates/:slug', async (c) => {
    const slug = c.req.param('slug')
    const dao = container.resolve('cloudTemplateDao')
    const template = await dao.findBySlug(slug)
    if (!template || template.reviewStatus !== 'approved') {
      return c.json({ ok: false, error: 'Template not found' }, 404)
    }
    if (!isDeployableTemplateContent(template.content)) {
      return c.json({ ok: false, error: 'Template is not deployable' }, 422)
    }
    return c.json(template)
  })

  h.get('/templates/:slug/env-refs', async (c) => {
    const slug = c.req.param('slug')
    const dao = container.resolve('cloudTemplateDao')
    const template = await dao.findBySlug(slug)
    if (!template || template.reviewStatus !== 'approved') {
      return c.json({ ok: false, error: 'Template not found' }, 404)
    }
    if (!isDeployableTemplateContent(template.content)) {
      return c.json({ ok: false, error: 'Template is not deployable' }, 422)
    }
    return c.json({ template: slug, requiredEnvVars: extractRequiredEnvVars(template.content) })
  })

  /**
   * POST /api/cloud-saas/templates
   * Submit a new community template (pending review).
   */
  h.post(
    '/templates',
    zValidator(
      'json',
      z.object({
        slug: z
          .string()
          .min(1)
          .max(255)
          .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase kebab-case'),
        name: z.string().min(1).max(255),
        description: z.string().optional(),
        content: z.record(z.unknown()),
        tags: z.array(z.string()).optional(),
        category: z.string().max(64).optional(),
        baseCost: z.number().int().min(0).optional(),
      }),
    ),
    async (c) => {
      const user = c.get('user') as { userId: string }
      const input = c.req.valid('json')
      const dao = container.resolve('cloudTemplateDao')
      const existing = await dao.findBySlug(input.slug)
      if (existing) {
        return c.json({ ok: false, error: 'Template slug already exists' }, 409)
      }
      const db = container.resolve('db')
      const [template] = await db
        .insert(cloudTemplates)
        .values({
          slug: input.slug,
          name: input.name,
          description: input.description,
          content: input.content,
          tags: input.tags ?? [],
          source: 'community',
          reviewStatus: 'draft',
          submittedByUserId: user.userId,
          authorId: user.userId,
          category: input.category ?? null,
          baseCost: input.baseCost ?? null,
        })
        .returning()
      const activityDao = container.resolve('cloudActivityDao')
      await activityDao.log({
        userId: user.userId,
        type: 'template_submit',
        meta: { slug: input.slug },
      })
      return c.json(template, 201)
    },
  )

  /**
   * PUT /api/cloud-saas/templates/:slug
   * Update own community template (only if still pending or rejected).
   */
  h.put(
    '/templates/:slug',
    zValidator(
      'json',
      z.object({
        name: z.string().min(1).max(255).optional(),
        description: z.string().optional(),
        content: z.record(z.unknown()).optional(),
        tags: z.array(z.string()).optional(),
        category: z.string().max(64).optional(),
        baseCost: z.number().int().min(0).optional(),
      }),
    ),
    async (c) => {
      const user = c.get('user') as { userId: string }
      const slug = c.req.param('slug')
      const input = c.req.valid('json')
      const dao = container.resolve('cloudTemplateDao')
      const template = await dao.findBySlug(slug)
      if (!template) return c.json({ ok: false, error: 'Template not found' }, 404)
      if (template.authorId !== user.userId) {
        return c.json({ ok: false, error: 'Forbidden' }, 403)
      }
      if (template.reviewStatus === 'approved' || template.reviewStatus === 'pending') {
        return c.json({ ok: false, error: 'Cannot edit an approved or pending template' }, 422)
      }
      const db = container.resolve('db')
      const [updated] = await db
        .update(cloudTemplates)
        .set({
          ...(input.name !== undefined && { name: input.name }),
          ...(input.description !== undefined && { description: input.description }),
          ...(input.content !== undefined && { content: input.content }),
          ...(input.tags !== undefined && { tags: input.tags }),
          ...(input.category !== undefined && { category: input.category }),
          ...(input.baseCost !== undefined && { baseCost: input.baseCost }),
          // Keep current review status (draft or rejected) — don't auto-submit
          updatedAt: new Date(),
        })
        .where(eq(cloudTemplates.slug, slug))
        .returning()
      const activityDao = container.resolve('cloudActivityDao')
      await activityDao.log({
        userId: user.userId,
        type: 'template_update',
        meta: { slug },
      })
      return c.json(updated)
    },
  )

  /**
   * POST /api/cloud-saas/templates/:slug/submit
   * Re-submit a draft/rejected template for review.
   */
  h.post('/templates/:slug/submit', async (c) => {
    const user = c.get('user') as { userId: string }
    const slug = c.req.param('slug')
    const dao = container.resolve('cloudTemplateDao')
    const template = await dao.findBySlug(slug)
    if (!template) return c.json({ ok: false, error: 'Template not found' }, 404)
    if (template.authorId !== user.userId) return c.json({ ok: false, error: 'Forbidden' }, 403)
    if (template.reviewStatus === 'pending') {
      return c.json({ ok: false, error: 'Already pending review' }, 422)
    }
    if (template.reviewStatus === 'approved') {
      return c.json({ ok: false, error: 'Template already approved' }, 422)
    }
    // Clear reviewNote when resubmitting
    const updated = await dao.updateReviewStatus(template.id, 'pending', null)
    const activityDao = container.resolve('cloudActivityDao')
    await activityDao.log({
      userId: user.userId,
      type: 'template_submit',
      meta: { slug },
    })
    return c.json(updated)
  })

  /**
   * DELETE /api/cloud-saas/templates/:slug
   * Delete own community template (any review status).
   * If approved, also removes it from the community store.
   */
  h.delete('/templates/:slug', async (c) => {
    const user = c.get('user') as { userId: string }
    const slug = c.req.param('slug')
    const dao = container.resolve('cloudTemplateDao')
    const template = await dao.findBySlug(slug)
    if (!template) return c.json({ ok: false, error: 'Template not found' }, 404)
    if (template.authorId !== user.userId) {
      return c.json({ ok: false, error: 'Forbidden' }, 403)
    }
    const db = container.resolve('db')
    await db.delete(cloudTemplates).where(eq(cloudTemplates.slug, slug))
    const activityDao = container.resolve('cloudActivityDao')
    await activityDao.log({
      userId: user.userId,
      type: 'template_delete',
      meta: { slug, wasApproved: template.reviewStatus === 'approved' },
    })
    return c.json({ ok: true })
  })

  // ─── Deployments ───────────────────────────────────────────────────────────

  /**
   * GET /api/cloud-saas/deployments
   * List current user's deployments (SaaS mode only).
   *
   * If `includeOrphans=1` is supplied, the response also includes a
   * `_orphans` array listing K8s namespaces tagged as managed by Shadow Cloud
   * but with no DB row for the current user. These are typically the result
   * of a DB reset or a worker bug; the dashboard surfaces them so the user
   * can claim or clean them up.
   */
  h.get('/deployments', async (c) => {
    const user = c.get('user') as { userId: string }
    const limit = Math.min(Number(c.req.query('limit')) || 50, 100)
    const offset = Math.max(Number(c.req.query('offset')) || 0, 0)
    const includeOrphans = c.req.query('includeOrphans') === '1'
    const db = container.resolve('db')
    const rows = await db
      .select()
      .from(cloudDeployments)
      .where(eq(cloudDeployments.userId, user.userId))
      .orderBy(cloudDeployments.createdAt)
      .limit(limit)
      .offset(offset)

    const sanitizedRows = rows.map((row) => sanitizeCloudSaasDeployment(row))

    if (!includeOrphans) {
      return c.json(sanitizedRows)
    }

    const known = new Set(rows.map((r) => r.namespace))
    // Reconcile only against the platform default cluster — BYOK clusters
    // would require iterating users' clusters and decrypting each kubeconfig,
    // which is too heavy for a list endpoint. Orphans on BYOK are detected
    // by the worker's reconcile loop instead.
    const ns = listManagedNamespaces() ?? []
    const orphans = ns.filter((n) => !known.has(n))
    return c.json({ items: sanitizedRows, _orphans: orphans })
  })

  /**
   * GET /api/cloud-saas/deployments/costs
   * Aggregate cost snapshots for all visible SaaS deployments.
   */
  h.get('/deployments/costs', async (c) => {
    const user = c.get('user') as { userId: string }
    const db = container.resolve('db')
    const rows = await db
      .select()
      .from(cloudDeployments)
      .where(eq(cloudDeployments.userId, user.userId))
      .orderBy(cloudDeployments.createdAt)

    const visibleRows = rows.filter((row) => isVisibleDeploymentStatus(row.status))
    const summaries = await Promise.all(
      visibleRows.map(async (deployment) => {
        const kubeconfig = (await resolveKubeconfig(deployment)) ?? undefined
        return collectNamespaceCost({
          namespace: deployment.namespace,
          agentNames: getDeploymentAgentNames(deployment),
          billingAmount: deployment.monthlyCost ?? null,
          billingUnit: 'shrimp',
          runtime: { listPods, execInPod },
          kubeconfig,
        })
      }),
    )

    const overview: CostOverviewSummary = summarizeCostOverview(summaries, 'shrimp')

    return c.json(overview)
  })

  /**
   * GET /api/cloud-saas/deployments/:id
   * Get deployment detail.
   */
  h.get('/deployments/:id', async (c) => {
    const user = c.get('user') as { userId: string }
    const id = c.req.param('id')
    const dao = container.resolve('cloudDeploymentDao')
    const deployment = await dao.findById(id, user.userId)
    if (!deployment) return c.json({ ok: false, error: 'Deployment not found' }, 404)
    return c.json(sanitizeCloudSaasDeployment(deployment))
  })

  h.get('/deployments/:id/costs', async (c) => {
    const user = c.get('user') as { userId: string }
    const id = c.req.param('id')
    const dao = container.resolve('cloudDeploymentDao')
    const deployment = await dao.findById(id, user.userId)
    if (!deployment) return c.json({ ok: false, error: 'Deployment not found' }, 404)

    const kubeconfig = (await resolveKubeconfig(deployment)) ?? undefined
    const summary: NamespaceCostSummary = collectNamespaceCost({
      namespace: deployment.namespace,
      agentNames: getDeploymentAgentNames(deployment),
      billingAmount: deployment.monthlyCost ?? null,
      billingUnit: 'shrimp',
      runtime: { listPods, execInPod },
      kubeconfig,
    })

    return c.json(summary)
  })

  /**
   * POST /api/cloud-saas/deployments
   * Create a new SaaS deployment. Deducts Shrimp Coins from the user's wallet.
   */
  h.post(
    '/deployments',
    zValidator(
      'json',
      z.object({
        namespace: z.string().min(1).max(255),
        name: z.string().min(1).max(255),
        templateSlug: z.string().min(1),
        resourceTier: z.enum(['lightweight', 'standard', 'pro']),
        agentCount: z.number().int().min(0).optional(),
        configSnapshot: z.record(z.unknown()),
        envVars: z.record(z.string()).optional(),
      }),
    ),
    async (c) => {
      const user = c.get('user') as { userId: string }
      const input = c.req.valid('json')
      const db = container.resolve('db')

      // Verify template exists
      const templateDao = container.resolve('cloudTemplateDao')
      const template = await templateDao.findBySlug(input.templateSlug)
      if (!template || template.reviewStatus !== 'approved') {
        return c.json({ ok: false, error: 'Template not found or not approved' }, 404)
      }
      if (!isDeployableTemplateContent(template.content)) {
        return c.json({ ok: false, error: 'Template is not deployable' }, 422)
      }

      let storedConfigSnapshot: Record<string, unknown>
      try {
        const runtimeEnvVars = await resolveCreateRuntimeEnvVars(
          user.userId,
          input.envVars,
          input.configSnapshot,
          c.req.header('authorization'),
          requestOrigin(c),
        )
        storedConfigSnapshot = prepareCloudSaasConfigSnapshot(input.configSnapshot, runtimeEnvVars)
      } catch (err) {
        const status =
          typeof (err as { status?: number }).status === 'number'
            ? (err as { status: number }).status
            : 422
        return c.json(
          {
            ok: false,
            error: err instanceof Error ? err.message : 'Invalid configSnapshot',
          },
          { status: status as 400 | 404 | 409 | 422 | 500 },
        )
      }

      const baseCost = template.baseCost ?? 0
      const monthlyCost = (TIER_COST[input.resourceTier] ?? 0) + baseCost

      // Deduct Shrimp Coins
      const walletService = container.resolve('walletService')
      const deployRefId = crypto.randomUUID()
      let charged = false
      let deploymentId: string | null = null

      try {
        await walletService.debit(
          user.userId,
          monthlyCost,
          deployRefId,
          'cloud_deploy',
          `部署 ${template.name} (${input.resourceTier})`,
        )
        charged = true

        // Get or use platform cluster
        const clusterDao = container.resolve('cloudClusterDao')
        const clusters = await clusterDao.listByUser(user.userId)
        const platformCluster = clusters.find((cl) => cl.isPlatform) ?? null

        // Create deployment record
        const deploymentDao = container.resolve('cloudDeploymentDao')
        const deployment = await deploymentDao.create({
          userId: user.userId,
          clusterId: platformCluster?.id ?? null,
          namespace: input.namespace,
          name: input.name,
          agentCount: input.agentCount,
          configSnapshot: storedConfigSnapshot,
        })

        if (!deployment) {
          throw new Error('Failed to create deployment')
        }
        deploymentId = deployment.id

        // Set SaaS fields
        const [updated] = await db
          .update(cloudDeployments)
          .set({
            templateSlug: input.templateSlug,
            resourceTier: input.resourceTier,
            monthlyCost,
            saasMode: true,
          })
          .where(eq(cloudDeployments.id, deployment.id))
          .returning()

        if (!updated) {
          throw new Error('Failed to finalize deployment metadata')
        }

        // Increment template deploy_count
        await db
          .update(cloudTemplates)
          .set({ deployCount: sql`${cloudTemplates.deployCount} + 1` })
          .where(eq(cloudTemplates.slug, input.templateSlug))

        const activityDao = container.resolve('cloudActivityDao')
        await activityDao.log({
          userId: user.userId,
          type: 'deploy',
          namespace: input.namespace,
          meta: { templateSlug: input.templateSlug, resourceTier: input.resourceTier, monthlyCost },
        })

        return c.json(sanitizeCloudSaasDeployment(updated), 201)
      } catch (err) {
        if (deploymentId) {
          try {
            await db.delete(cloudDeployments).where(eq(cloudDeployments.id, deploymentId))
          } catch (cleanupErr) {
            console.error(
              '[cloud-saas] failed to clean up deployment after create error:',
              cleanupErr,
            )
          }
        }

        if (charged) {
          try {
            await walletService.refund(
              user.userId,
              monthlyCost,
              deployRefId,
              'cloud_deploy',
              `部署退款 ${template.name} (${input.resourceTier})`,
            )
          } catch (refundErr) {
            console.error('[cloud-saas] failed to refund wallet after create error:', refundErr)
          }
        }

        const status =
          typeof (err as { status?: number }).status === 'number'
            ? (err as { status: number }).status
            : 500
        return c.json(
          {
            ok: false,
            error: err instanceof Error ? err.message : 'Failed to create deployment',
          },
          { status: status as 400 | 404 | 409 | 422 | 500 },
        )
      }
    },
  )

  /**
   * DELETE /api/cloud-saas/deployments/:id
   * Delete a SaaS deployment.
   */
  h.delete('/deployments/:id', async (c) => {
    const user = c.get('user') as { userId: string }
    const id = c.req.param('id')
    const dao = container.resolve('cloudDeploymentDao')
    const deployment = await dao.findById(id, user.userId)
    if (!deployment) return c.json({ ok: false, error: 'Deployment not found' }, 404)
    await dao.updateStatus(id, 'destroying')
    const activityDao = container.resolve('cloudActivityDao')
    await activityDao.log({
      userId: user.userId,
      type: 'destroy',
      namespace: deployment.namespace,
      meta: { deploymentId: id },
    })
    return c.json({ ok: true })
  })

  /**
   * POST /api/cloud-saas/deployments/:id/cancel
   * Request cancellation of an in-progress deploy.
   * Worker watches for status='cancelling' and SIGTERMs the deploy subprocess.
   * Allowed when status ∈ {pending, deploying}; otherwise 422.
   */
  h.post('/deployments/:id/cancel', async (c) => {
    const user = c.get('user') as { userId: string }
    const id = c.req.param('id')
    const dao = container.resolve('cloudDeploymentDao')
    const deployment = await dao.findById(id, user.userId)
    if (!deployment) return c.json({ ok: false, error: 'Deployment not found' }, 404)
    if (deployment.status !== 'pending' && deployment.status !== 'deploying') {
      return c.json(
        { ok: false, error: `Cannot cancel deployment in status "${deployment.status}"` },
        422,
      )
    }
    await dao.updateStatus(id, 'cancelling')
    await dao.appendLog(id, '[cancel] User requested cancellation', 'warn')
    return c.json({ ok: true, status: 'cancelling' })
  })

  /**
   * POST /api/cloud-saas/deployments/:id/scale
   * Scale a deployment to a new agent count.
   * Updates agentCount in DB and re-enqueues the deployment so the worker
   * runs a Pulumi update to reconcile the desired agent count.
   */
  h.post(
    '/deployments/:id/scale',
    zValidator('json', z.object({ agentCount: z.number().int().min(0).max(50) })),
    async (c) => {
      const user = c.get('user') as { userId: string }
      const id = c.req.param('id')
      const { agentCount } = c.req.valid('json')
      const dao = container.resolve('cloudDeploymentDao')
      const deployment = await dao.findById(id, user.userId)
      if (!deployment) return c.json({ ok: false, error: 'Deployment not found' }, 404)
      if (deployment.status === 'deploying' || deployment.status === 'destroying') {
        return c.json({ ok: false, error: 'Deployment is currently in progress' }, 422)
      }

      // Patch the configSnapshot to reflect the new agentCount if possible
      let configSnapshot = deployment.configSnapshot as Record<string, unknown> | null
      if (configSnapshot && typeof configSnapshot === 'object') {
        const deployments = configSnapshot.deployments as Record<string, unknown> | undefined
        if (deployments && Array.isArray(deployments.agents)) {
          // Set replicas on all agents (Pulumi infra program reads this)
          configSnapshot = {
            ...configSnapshot,
            deployments: {
              ...deployments,
              agents: (deployments.agents as Array<Record<string, unknown>>).map((agent) => ({
                ...agent,
                replicas: agentCount,
              })),
            },
          }
        }
      }

      const db = container.resolve('db')
      const [updated] = await db
        .update(cloudDeployments)
        .set({
          agentCount,
          configSnapshot: configSnapshot ?? deployment.configSnapshot,
          status: 'pending', // re-enqueue for worker to apply via Pulumi
          updatedAt: new Date(),
        })
        .where(eq(cloudDeployments.id, id))
        .returning()
      const activityDao = container.resolve('cloudActivityDao')
      await activityDao.log({
        userId: user.userId,
        type: 'scale',
        namespace: deployment.namespace,
        meta: { deploymentId: id, agentCount },
      })
      if (!updated) {
        return c.json({ ok: false, error: 'Failed to update deployment' }, 500)
      }
      return c.json(sanitizeCloudSaasDeployment(updated))
    },
  )

  /**
   * GET /api/cloud-saas/deployments/:id/logs
   * Stream deployment logs (SSE).
   */
  h.get('/deployments/:id/logs', async (c) => {
    const user = c.get('user') as { userId: string }
    const id = c.req.param('id')
    const dao = container.resolve('cloudDeploymentDao')
    const deployment = await dao.findById(id, user.userId)
    if (!deployment) return c.json({ ok: false, error: 'Deployment not found' }, 404)

    return c.body(
      new ReadableStream({
        async start(controller) {
          const enc = new TextEncoder()
          const send = (data: unknown, event?: string) =>
            controller.enqueue(
              enc.encode(`${event ? `event: ${event}\n` : ''}data: ${JSON.stringify(data)}\n\n`),
            )

          let sentCount = 0
          let lastStatus: string | null = null

          try {
            while (!c.req.raw.signal.aborted) {
              const logs = await dao.getLogs(id)
              for (const log of logs.slice(sentCount)) {
                send({ level: log.level, message: log.message, createdAt: log.createdAt }, 'log')
              }
              sentCount = logs.length

              const current = await dao.findById(id, user.userId)
              if (!current) {
                send({ error: 'Deployment not found' }, 'error')
                break
              }

              if (current.status !== lastStatus) {
                lastStatus = current.status
                send({ status: current.status }, 'status')
              }

              if (isTerminalDeploymentStatus(current.status)) {
                send(
                  {
                    status: current.status,
                    error: current.errorMessage,
                  },
                  'close',
                )
                break
              }

              await delay(1000)
            }
          } catch (err) {
            send(
              { error: err instanceof Error ? err.message : 'Failed to stream deployment logs' },
              'error',
            )
          } finally {
            try {
              controller.close()
            } catch {
              /* already closed */
            }
          }
        },
      }),
      200,
      {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    )
  })

  // ─── Env Vars ──────────────────────────────────────────────────────────────

  /**
   * GET /api/cloud-saas/envvars/:deploymentId
   * Read env vars scoped to a deployment (values masked).
   */
  h.get('/envvars/:deploymentId', async (c) => {
    const user = c.get('user') as { userId: string }
    const deploymentId = c.req.param('deploymentId')
    const deploymentDao = container.resolve('cloudDeploymentDao')
    const deployment = await deploymentDao.findById(deploymentId, user.userId)
    if (!deployment) return c.json({ ok: false, error: 'Deployment not found' }, 404)
    const envDao = container.resolve('cloudEnvVarDao')
    const groupNames = await loadGroupNameLookup(user.userId)
    const vars = await envDao.listByUser(user.userId, deploymentId)
    return c.json(
      vars.map(({ encryptedValue: _e, ...rest }) => ({
        ...rest,
        groupName: rest.groupId ? (groupNames.get(rest.groupId) ?? 'default') : 'default',
      })),
    )
  })

  /**
   * GET /api/cloud-saas/envvars/:deploymentId/:key
   * Get a single env var value for a deployment (decrypted, for editing).
   */
  h.get('/envvars/:deploymentId/:key', async (c) => {
    const user = c.get('user') as { userId: string }
    const deploymentId = c.req.param('deploymentId')
    const key = c.req.param('key')
    const deploymentDao = container.resolve('cloudDeploymentDao')
    const deployment = await deploymentDao.findById(deploymentId, user.userId)
    if (!deployment) return c.json({ ok: false, error: 'Deployment not found' }, 404)
    const envDao = container.resolve('cloudEnvVarDao')
    const groupNames = await loadGroupNameLookup(user.userId)
    const vars = await envDao.listByUser(user.userId, deploymentId)
    const found = vars.find((v) => v.key === key)
    if (!found) return c.json({ ok: false, error: 'Not found' }, 404)
    const { decrypt } = await import('../lib/kms')
    return c.json({
      envVar: {
        scope: deploymentId,
        key: found.key,
        value: decrypt(found.encryptedValue),
        isSecret: true,
        groupName: found.groupId ? (groupNames.get(found.groupId) ?? 'default') : 'default',
      },
    })
  })

  /**
   * DELETE /api/cloud-saas/envvars/:deploymentId/:key
   * Delete a single env var for a deployment.
   */
  h.delete('/envvars/:deploymentId/:key', async (c) => {
    const user = c.get('user') as { userId: string }
    const deploymentId = c.req.param('deploymentId')
    const key = c.req.param('key')
    const deploymentDao = container.resolve('cloudDeploymentDao')
    const deployment = await deploymentDao.findById(deploymentId, user.userId)
    if (!deployment) return c.json({ ok: false, error: 'Deployment not found' }, 404)
    const envDao = container.resolve('cloudEnvVarDao')
    const vars = await envDao.listByUser(user.userId, deploymentId)
    const found = vars.find((v) => v.key === key)
    if (found) await envDao.delete(found.id, user.userId)
    return c.json({ ok: true })
  })

  /**
   * GET /api/cloud-saas/deployments/:id/logs/history
   * Return deployment logs as a plain JSON array (non-streaming).
   */
  h.get('/deployments/:id/logs/history', async (c) => {
    const user = c.get('user') as { userId: string }
    const id = c.req.param('id')
    const dao = container.resolve('cloudDeploymentDao')
    const deployment = await dao.findById(id, user.userId)
    if (!deployment) return c.json({ ok: false, error: 'Deployment not found' }, 404)

    const agentParam = c.req.query('agent')
    const podParam = c.req.query('pod')
    const page = clamp(Number.parseInt(c.req.query('page') ?? '1', 10) || 1, 1, 100)
    const limit = clamp(Number.parseInt(c.req.query('limit') ?? '200', 10) || 200, 20, 500)

    if (agentParam || podParam) {
      const kubeconfig = (await resolveKubeconfig(deployment)) ?? undefined
      const pods = listPods(deployment.namespace, kubeconfig)
      let podName = podParam
      if (!podName && agentParam) {
        podName = pods.find((pod) => pod.name.includes(agentParam))?.name
      }
      if (!podName) {
        podName = pods.find((pod) => pod.status === 'Running')?.name ?? pods[0]?.name
      }

      if (!podName) {
        return c.json({ ok: false, error: 'No pods found for this deployment' }, 404)
      }

      try {
        const requestedTail = page * limit
        const allLines = readPodLogs({
          namespace: deployment.namespace,
          pod: podName,
          tail: requestedTail,
          timestamps: true,
          kubeconfig,
        })
          .split('\n')
          .map((line) => line.trimEnd())
          .filter(Boolean)

        const start = Math.max(allLines.length - requestedTail, 0)
        const end = Math.max(allLines.length - (page - 1) * limit, 0)

        return c.json({
          namespace: deployment.namespace,
          agent: agentParam ?? podName,
          podName,
          page,
          limit,
          lines: allLines.slice(start, end),
          hasMore: allLines.length >= requestedTail,
        })
      } catch (err) {
        return c.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500)
      }
    }

    const logs = await dao.getLogs(id)
    return c.json({
      namespace: deployment.namespace,
      agent: deployment.name,
      podName: deployment.name,
      page,
      limit,
      lines: logs.map((l) => (l.level ? `[${l.level.toUpperCase()}] ${l.message}` : l.message)),
      hasMore: false,
    })
  })

  // ─── Live K8s pod inspection (SaaS) ────────────────────────────────────────

  /**
   * Resolve a deployment's effective kubeconfig (BYOK only). Returns null if
   * the deployment uses the platform's default cluster — callers should then
   * spawn kubectl without `--kubeconfig` and rely on the server's KUBECONFIG
   * env var.
   */
  async function resolveKubeconfig(deployment: {
    clusterId: string | null
  }): Promise<string | null> {
    if (!deployment.clusterId) return null
    const clusterDao = container.resolve('cloudClusterDao')
    const cluster = await clusterDao.findByIdOnly(deployment.clusterId)
    if (!cluster?.kubeconfigEncrypted) return null
    return decrypt(cluster.kubeconfigEncrypted)
  }

  /**
   * GET /api/cloud-saas/deployments/:id/pods
   * List pods running in the deployment's namespace, with status snapshot.
   */
  h.get('/deployments/:id/pods', async (c) => {
    const user = c.get('user') as { userId: string }
    const id = c.req.param('id')
    const dao = container.resolve('cloudDeploymentDao')
    const deployment = await dao.findById(id, user.userId)
    if (!deployment) return c.json({ ok: false, error: 'Deployment not found' }, 404)
    const kubeconfig = (await resolveKubeconfig(deployment)) ?? undefined
    const pods = listPods(deployment.namespace, kubeconfig)
    return c.json({ pods })
  })

  /**
   * GET /api/cloud-saas/deployments/:id/pod-logs?pod=<name>&tail=200
   * Stream live K8s pod logs over Server-Sent Events.
   *
   * Replaces the stub /logs endpoint that only replayed deploy-script output.
   */
  h.get('/deployments/:id/pod-logs', async (c) => {
    const user = c.get('user') as { userId: string }
    const id = c.req.param('id')
    const podParam = c.req.query('pod')
    const agentParam = c.req.query('agent')
    const tail = Math.min(Number(c.req.query('tail')) || 200, 2000)
    const containerParam = c.req.query('container')

    const dao = container.resolve('cloudDeploymentDao')
    const deployment = await dao.findById(id, user.userId)
    if (!deployment) return c.json({ ok: false, error: 'Deployment not found' }, 404)

    const kubeconfig = (await resolveKubeconfig(deployment)) ?? undefined

    // If no pod is specified, pick the first running pod in the namespace.
    let pod: string | undefined = podParam
    const pods = listPods(deployment.namespace, kubeconfig)
    if (!pod && agentParam) {
      pod = pods.find((item) => item.name.includes(agentParam))?.name ?? undefined
    }
    if (!pod) {
      pod = pods.find((p) => p.status === 'Running')?.name ?? pods[0]?.name ?? undefined
    }
    if (!pod) {
      return c.json({ ok: false, error: 'No pods found for this deployment' }, 404)
    }

    return c.body(
      new ReadableStream({
        start(controller) {
          const enc = new TextEncoder()
          const send = (payload: unknown, event?: string) =>
            controller.enqueue(
              enc.encode(`${event ? `event: ${event}\n` : ''}data: ${JSON.stringify(payload)}\n\n`),
            )

          const { proc, cleanup } = spawnPodLogStream({
            namespace: deployment.namespace,
            pod: pod as string,
            container: containerParam,
            follow: true,
            tail,
            kubeconfig,
          })

          let stdoutBuf = ''
          proc.stdout?.on('data', (chunk: Buffer) => {
            stdoutBuf += chunk.toString('utf-8')
            const lines = stdoutBuf.split('\n')
            stdoutBuf = lines.pop() ?? ''
            for (const line of lines) {
              if (line.length > 0) send({ stream: 'stdout', line })
            }
          })
          proc.stderr?.on('data', (chunk: Buffer) => {
            send({ stream: 'stderr', line: chunk.toString('utf-8').trimEnd() })
          })
          proc.on('close', (code) => {
            send({ exitCode: code ?? 0 }, 'end')
            cleanup()
            controller.close()
          })
          proc.on('error', (err) => {
            send({ error: err.message }, 'error')
            cleanup()
            try {
              controller.close()
            } catch {
              /* already closed */
            }
          })

          // Abort handling: when client disconnects, kill kubectl.
          c.req.raw.signal.addEventListener('abort', () => {
            try {
              proc.kill('SIGTERM')
            } catch {
              /* ignore */
            }
          })
        },
      }),
      200,
      {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    )
  })

  /**
   * POST /api/cloud-saas/deployments/orphans/:namespace/claim
   * Adopt a Shadow-Cloud-managed namespace that has no DB row.
   * Creates a `cloud_deployments` row owned by the calling user so they can
   * destroy it through the normal flow.
   */
  h.post('/deployments/orphans/:namespace/claim', async (c) => {
    const user = c.get('user') as { userId: string }
    const namespace = c.req.param('namespace')
    const dao = container.resolve('cloudDeploymentDao')
    const created = await dao.create({
      userId: user.userId,
      namespace,
      name: `orphan-${namespace}`,
      agentCount: 0,
      configSnapshot: null,
    })
    if (!created) {
      return c.json({ ok: false, error: 'Failed to create deployment row' }, 500)
    }
    // Bypass the normal "pending → deploying → deployed" pipeline.
    await dao.updateStatus(created.id, 'deployed')
    await dao.appendLog(created.id, '[reconcile] Adopted orphan namespace', 'info')
    return c.json({ ok: true, deployment: sanitizeCloudSaasDeployment(created) })
  })

  /**
   * POST /api/cloud-saas/deployments/orphans/:namespace/cleanup
   * Force-delete an orphan namespace (no DB row). Admin-only safety check
   * is enforced via the namespace managed labels.
   */
  h.post('/deployments/orphans/:namespace/cleanup', async (c) => {
    const namespace = c.req.param('namespace')
    const managed = listManagedNamespaces() ?? []
    if (!managed.includes(namespace)) {
      return c.json(
        {
          ok: false,
          error: 'Refusing to delete: namespace is not labeled as Shadow Cloud managed',
        },
        422,
      )
    }
    try {
      deleteNamespace(namespace)
      return c.json({ ok: true })
    } catch (err) {
      return c.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500)
    }
  })

  /**
   * PUT /api/cloud-saas/envvars/:deploymentId
   * Upsert env vars for a deployment.
   */
  h.put(
    '/envvars/:deploymentId',
    zValidator(
      'json',
      z.object({
        vars: z.array(z.object({ key: z.string().min(1), value: z.string() })),
      }),
    ),
    async (c) => {
      const user = c.get('user') as { userId: string }
      const deploymentId = c.req.param('deploymentId')
      const { vars } = c.req.valid('json')
      const deploymentDao = container.resolve('cloudDeploymentDao')
      const deployment = await deploymentDao.findById(deploymentId, user.userId)
      if (!deployment) return c.json({ ok: false, error: 'Deployment not found' }, 404)
      const { encrypt } = await import('../lib/kms')
      const envDao = container.resolve('cloudEnvVarDao')
      for (const { key, value } of vars) {
        const encryptedValue = encrypt(value)
        const existing = (await envDao.listByUser(user.userId, deploymentId)).find(
          (v) => v.key === key,
        )
        if (existing) {
          await envDao.update(existing.id, user.userId, encryptedValue)
          continue
        }
        await envDao.create({
          userId: user.userId,
          key,
          encryptedValue,
          scope: deploymentId,
        })
      }
      const activityDao = container.resolve('cloudActivityDao')
      await activityDao.log({
        userId: user.userId,
        type: 'envvar_update',
        meta: { deploymentId, count: vars.length },
      })
      return c.json({ ok: true })
    },
  )

  // ─── Wallet / Balance ──────────────────────────────────────────────────────

  /**
   * GET /api/cloud-saas/wallet
   * Return current user's Shrimp Coin balance.
   */
  h.get('/wallet', async (c) => {
    const user = c.get('user') as { userId: string }
    const walletService = container.resolve('walletService')
    const wallet = await walletService.getOrCreateWallet(user.userId)
    return c.json({ balance: wallet?.balance ?? 0 })
  })

  // NOTE: POST /wallet/topup intentionally removed.
  // Top-ups must go through Stripe (POST /api/v1/recharge/create-intent).
  // For dev/demo top-ups, see POST /api/admin/wallet/grant (admin-only,
  // additionally guarded by ENABLE_DEV_TOPUP=1).

  /**
   * GET /api/cloud-saas/wallet/transactions
   * Return transaction history for the current user's wallet.
   */
  h.get('/wallet/transactions', async (c) => {
    const user = c.get('user') as { userId: string }
    const limit = Math.min(Number(c.req.query('limit')) || 50, 100)
    const offset = Math.max(Number(c.req.query('offset')) || 0, 0)
    const walletService = container.resolve('walletService')
    const [transactions, total] = await Promise.all([
      walletService.getTransactions(user.userId, limit, offset),
      walletService.getTransactionCount(user.userId),
    ])
    return c.json({ transactions, total, limit, offset })
  })

  // ─── Global Env Vars (not scoped to a single deployment) ──────────────────

  /**
   * GET /api/cloud-saas/global-envvars
   * List global env vars (groups + entries) for the current user.
   */
  h.get('/global-envvars', async (c) => {
    const user = c.get('user') as { userId: string }
    const envDao = container.resolve('cloudEnvVarDao')
    const groupNames = await loadGroupNameLookup(user.userId)
    const vars = await envDao.listByUser(user.userId, 'global')
    const persistedGroups = await envDao.listGroupsByUser(user.userId)
    const groups: string[] = [
      'default',
      ...persistedGroups.map((group) => group.name),
      ...vars
        .map((v) => (v.groupId ? groupNames.get(v.groupId) : 'default'))
        .filter((groupName): groupName is string => Boolean(groupName && groupName !== 'default')),
    ]
    return c.json({
      envVars: vars.map(({ encryptedValue: _e, ...rest }) => ({
        scope: rest.scope ?? 'global',
        key: rest.key,
        maskedValue: '****',
        isSecret: true,
        groupName: rest.groupId ? (groupNames.get(rest.groupId) ?? 'default') : 'default',
      })),
      groups: [...new Set(groups)],
    })
  })

  h.post(
    '/global-envvars/groups',
    zValidator('json', z.object({ name: z.string().min(1).max(255) })),
    async (c) => {
      const user = c.get('user') as { userId: string }
      const { name } = c.req.valid('json')
      const envDao = container.resolve('cloudEnvVarDao')
      const existing = await envDao.findGroupByName(user.userId, name)
      if (existing) {
        return c.json({ ok: true, name: existing.name })
      }
      const created = await envDao.createGroup({ userId: user.userId, name })
      if (!created) {
        return c.json({ ok: false, error: 'Failed to create env group' }, 500)
      }
      return c.json({ ok: true, name: created.name })
    },
  )

  h.delete('/global-envvars/groups/:name', async (c) => {
    const user = c.get('user') as { userId: string }
    const name = c.req.param('name')
    const envDao = container.resolve('cloudEnvVarDao')
    await envDao.deleteGroupByName(user.userId, name)
    return c.json({ ok: true })
  })

  /**
   * PUT /api/cloud-saas/global-envvars
   * Upsert a single global env var.
   */
  h.put(
    '/global-envvars',
    zValidator(
      'json',
      z.object({
        key: z.string().min(1),
        value: z.string(),
        isSecret: z.boolean().optional(),
        groupName: z.string().optional(),
      }),
    ),
    async (c) => {
      const user = c.get('user') as { userId: string }
      const { key, value, isSecret: _isSecret, groupName } = c.req.valid('json')
      const { encrypt } = await import('../lib/kms')
      const envDao = container.resolve('cloudEnvVarDao')
      const resolvedGroupId = await resolveGroupId(user.userId, groupName)
      // Delete existing entry with same key first (upsert pattern)
      const existing = await envDao.listByUser(user.userId, 'global')
      const found = existing.find((v) => v.key === key)
      if (found) {
        await envDao.update(found.id, user.userId, encrypt(value))
      } else {
        await envDao.create({
          userId: user.userId,
          key,
          encryptedValue: encrypt(value),
          scope: 'global',
          groupId: resolvedGroupId,
        })
      }
      return c.json({ ok: true })
    },
  )

  /**
   * DELETE /api/cloud-saas/global-envvars/:key
   * Delete a global env var.
   */
  h.delete('/global-envvars/:key', async (c) => {
    const user = c.get('user') as { userId: string }
    const key = c.req.param('key')
    const envDao = container.resolve('cloudEnvVarDao')
    const vars = await envDao.listByUser(user.userId, 'global')
    const found = vars.find((v) => v.key === key)
    if (found) await envDao.delete(found.id, user.userId)
    return c.json({ ok: true })
  })

  /**
   * GET /api/cloud-saas/global-envvars/:key
   * Get a single global env var (value decrypted for display in edit form).
   */
  h.get('/global-envvars/:key', async (c) => {
    const user = c.get('user') as { userId: string }
    const key = c.req.param('key')
    const envDao = container.resolve('cloudEnvVarDao')
    const groupNames = await loadGroupNameLookup(user.userId)
    const vars = await envDao.listByUser(user.userId, 'global')
    const found = vars.find((v) => v.key === key)
    if (!found) return c.json({ ok: false, error: 'Not found' }, 404)
    const { decrypt } = await import('../lib/kms')
    return c.json({
      envVar: {
        scope: 'global',
        key: found.key,
        value: decrypt(found.encryptedValue),
        isSecret: true,
        groupName: found.groupId ? (groupNames.get(found.groupId) ?? 'default') : 'default',
      },
    })
  })

  // ─── Provider Catalogs / Profiles ────────────────────────────────────────

  /**
   * GET /api/cloud-saas/provider-catalogs
   * Discover model providers declared by Cloud plugins.
   */
  h.get('/provider-catalogs', async (c) => {
    const catalogs = await listProviderCatalogs()
    return c.json({
      providers: catalogs.map((entry) => ({
        pluginId: entry.pluginId,
        pluginName: entry.pluginName,
        provider: entry.provider,
        secretFields: entry.secretFields,
      })),
    })
  })

  /**
   * GET /api/cloud-saas/provider-profiles
   * List encrypted provider profiles saved by the current user.
   */
  h.get('/provider-profiles', async (c) => {
    const user = c.get('user') as { userId: string }
    return c.json({ profiles: await readProviderProfiles(user.userId) })
  })

  /**
   * GET /api/cloud-saas/provider-routing
   * Return the Manifest-inspired route policy plus routable models.
   */
  h.get('/provider-routing', async (c) => {
    const user = c.get('user') as { userId: string }
    const [profiles, policy] = await Promise.all([
      readProviderProfiles(user.userId),
      readProviderRoutingPolicy(user.userId),
    ])
    const models = buildRoutableModels(profiles)
    return c.json({
      policy,
      models,
      summary: {
        profiles: profiles.length,
        enabledProfiles: profiles.filter((profile) => profile.enabled).length,
        models: models.length,
        enabledModels: models.filter((model) => model.enabled).length,
      },
    })
  })

  /**
   * PUT /api/cloud-saas/provider-routing
   * Persist the global provider route policy.
   */
  h.put('/provider-routing', zValidator('json', z.object({ policy: z.unknown() })), async (c) => {
    const user = c.get('user') as { userId: string }
    const input = c.req.valid('json')
    const policy = await writeProviderRoutingPolicy(
      user.userId,
      normalizeLlmRoutingPolicy(input.policy),
    )
    return c.json({ ok: true, policy })
  })

  /**
   * POST /api/cloud-saas/provider-routing/resolve
   * Resolve a selector/tag request against saved profiles and policy.
   */
  h.post(
    '/provider-routing/resolve',
    zValidator(
      'json',
      z.object({
        selector: z.string().max(120).optional(),
        tags: z.array(z.string().min(1).max(80)).max(8).optional(),
      }),
    ),
    async (c) => {
      const user = c.get('user') as { userId: string }
      const input = c.req.valid('json')
      const [profiles, policy] = await Promise.all([
        readProviderProfiles(user.userId),
        readProviderRoutingPolicy(user.userId),
      ])
      return c.json({
        ok: true,
        resolved: resolveLlmRoute(policy, buildRoutableModels(profiles), input),
      })
    },
  )

  /**
   * PUT /api/cloud-saas/provider-profiles
   * Upsert a provider profile into the encrypted env store.
   */
  h.put(
    '/provider-profiles',
    zValidator(
      'json',
      z.object({
        id: z.string().min(1).max(120).optional(),
        providerId: z.string().min(1).max(120),
        name: z.string().min(1).max(255),
        enabled: z.boolean().optional(),
        config: z.record(z.unknown()).optional(),
        envVars: z.record(z.string()).optional(),
      }),
    ),
    async (c) => {
      const user = c.get('user') as { userId: string }
      const input = c.req.valid('json')
      const catalogs = await listProviderCatalogs()
      const providerExists = catalogs.some((entry) => entry.provider.id === input.providerId)
      if (!providerExists) {
        return c.json({ ok: false, error: 'Unknown provider' }, 422)
      }

      const profileId =
        normalizeProviderProfileId(input.id ?? `${input.providerId}-${randomUUID().slice(0, 8)}`) ||
        `${input.providerId}-${randomUUID().slice(0, 8)}`
      const scope = providerProfileScope(profileId)
      const envDao = container.resolve('cloudEnvVarDao')
      const meta: Record<string, string> = {
        [PROVIDER_PROFILE_META_KEYS.id]: profileId,
        [PROVIDER_PROFILE_META_KEYS.providerId]: input.providerId,
        [PROVIDER_PROFILE_META_KEYS.name]: input.name,
        [PROVIDER_PROFILE_META_KEYS.configJson]: JSON.stringify(input.config ?? {}),
        [PROVIDER_PROFILE_META_KEYS.enabled]: String(input.enabled ?? true),
      }

      for (const [key, value] of Object.entries(meta)) {
        await envDao.upsertScoped({
          userId: user.userId,
          scope,
          key,
          encryptedValue: encrypt(value),
        })
      }

      for (const [key, value] of Object.entries(input.envVars ?? {})) {
        if (!value.trim()) continue
        await envDao.upsertScoped({
          userId: user.userId,
          scope,
          key,
          encryptedValue: encrypt(value),
        })
      }

      const profile = (await readProviderProfiles(user.userId)).find((p) => p.id === profileId)
      return c.json({ ok: true, profile })
    },
  )

  /**
   * POST /api/cloud-saas/provider-profiles/:id/test
   * Check whether the encrypted provider credentials can reach the provider API.
   */
  h.post('/provider-profiles/:id/test', async (c) => {
    const user = c.get('user') as { userId: string }
    const profileId = normalizeProviderProfileId(c.req.param('id'))
    if (!profileId) return c.json({ ok: false, error: 'Invalid provider profile' }, 400)

    const envDao = container.resolve('cloudEnvVarDao')
    const scopedVars = await envDao.listByUser(user.userId, providerProfileScope(profileId))
    if (scopedVars.length === 0) {
      return c.json({ ok: false, error: 'Provider profile not found' }, 404)
    }

    const values = new Map(scopedVars.map((v) => [v.key, decrypt(v.encryptedValue)]))
    if (!parseProviderProfileEnabled(values.get(PROVIDER_PROFILE_META_KEYS.enabled))) {
      return c.json({
        ok: false,
        status: null,
        message: 'Provider profile is disabled',
        checkedAt: new Date().toISOString(),
      })
    }

    const providerId = values.get(PROVIDER_PROFILE_META_KEYS.providerId)
    const provider = (await listProviderCatalogs())
      .map((entry) => entry.provider)
      .find((catalog) => catalog.id === providerId)
    if (!provider) return c.json({ ok: false, error: 'Unknown provider' }, 422)

    const config = parseProviderProfileConfig(values.get(PROVIDER_PROFILE_META_KEYS.configJson))
    return c.json(await testProviderConnection(provider, values, config))
  })

  /**
   * POST /api/cloud-saas/provider-profiles/:id/models/refresh
   * Discover models from the provider-native API and persist the result.
   */
  h.post('/provider-profiles/:id/models/refresh', async (c) => {
    const user = c.get('user') as { userId: string }
    const profileId = normalizeProviderProfileId(c.req.param('id'))
    if (!profileId) return c.json({ ok: false, error: 'Invalid provider profile' }, 400)

    const envDao = container.resolve('cloudEnvVarDao')
    const scope = providerProfileScope(profileId)
    const scopedVars = await envDao.listByUser(user.userId, scope)
    if (scopedVars.length === 0) {
      return c.json({ ok: false, error: 'Provider profile not found' }, 404)
    }

    const values = new Map(scopedVars.map((v) => [v.key, decrypt(v.encryptedValue)]))
    const providerId = values.get(PROVIDER_PROFILE_META_KEYS.providerId)
    const provider = (await listProviderCatalogs())
      .map((entry) => entry.provider)
      .find((catalog) => catalog.id === providerId)
    if (!provider) return c.json({ ok: false, error: 'Unknown provider' }, 422)

    const config = parseProviderProfileConfig(values.get(PROVIDER_PROFILE_META_KEYS.configJson))
    const result = await discoverProviderProfileModels(provider, values, config)
    if (!result.ok) return c.json(result, result.status && result.status >= 400 ? 502 : 200)

    const nextConfig = {
      ...config,
      apiFormat: providerProfileApiFormat(provider, config),
      models: normalizeLlmProviderModels(result.models),
      discoveredAt: new Date().toISOString(),
    }
    await envDao.upsertScoped({
      userId: user.userId,
      scope,
      key: PROVIDER_PROFILE_META_KEYS.configJson,
      encryptedValue: encrypt(JSON.stringify(nextConfig)),
    })

    const profile = (await readProviderProfiles(user.userId)).find((p) => p.id === profileId)
    return c.json({ ...result, profile })
  })

  /**
   * DELETE /api/cloud-saas/provider-profiles/:id
   * Delete a saved provider profile and its encrypted values.
   */
  h.delete('/provider-profiles/:id', async (c) => {
    const user = c.get('user') as { userId: string }
    const profileId = normalizeProviderProfileId(c.req.param('id'))
    if (profileId) {
      const envDao = container.resolve('cloudEnvVarDao')
      await envDao.deleteByScope(user.userId, providerProfileScope(profileId))
    }
    return c.json({ ok: true })
  })

  // ─── Activity ──────────────────────────────────────────────────────────────

  /**
   * GET /api/cloud-saas/activity
   * Current user's cloud activity log.
   */
  h.get('/activity', async (c) => {
    const user = c.get('user') as { userId: string }
    const limit = Math.min(Number(c.req.query('limit')) || 50, 100)
    const offset = Math.max(Number(c.req.query('offset')) || 0, 0)
    const dao = container.resolve('cloudActivityDao')
    return c.json(await dao.listByUser(user.userId, limit, offset))
  })

  return h
}
