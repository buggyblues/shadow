/**
 * model-provider plugin — thin selector/router over provider catalogs declared
 * by provider plugins.
 *
 * Provider-specific knowledge lives in each provider plugin via
 * api.addProviderCatalog(). This plugin only:
 *   - sniffs available provider env/profile values,
 *   - emits OpenClaw models.providers entries, and
 *   - selects primary/fallback model refs by tag.
 */

import { definePlugin } from '../helpers.js'
import type {
  ModelTag,
  PluginBuildContext,
  PluginConfigFragment,
  PluginManifest,
  ProviderCatalog,
  ProviderModelEntry,
} from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

const PROVIDER_PROFILE_MODELS_ENV_KEY = 'SHADOW_PROVIDER_PROFILE_MODELS_JSON'
const ALL_TAGS: readonly ModelTag[] = ['default', 'fast', 'flash', 'reasoning', 'vision']

type RuntimeEnv = Record<string, string | undefined>

type ProviderProfileModelSet = {
  providerId: string
  profileId?: string
  models: ProviderModelEntry[]
}

function providerCatalogs(ctx: PluginBuildContext): ProviderCatalog[] {
  return ctx.pluginRegistry
    .getAll()
    .flatMap((plugin) => plugin.providerCatalogs ?? [])
    .filter((catalog) => catalog.allowEnvDetection !== false)
    .sort((a, b) => (a.priority ?? 1000) - (b.priority ?? 1000))
}

function resolveEnvKey(catalog: ProviderCatalog, env: RuntimeEnv): string | undefined {
  for (const key of [catalog.envKey, ...(catalog.envKeyAliases ?? [])]) {
    if (env[key] ?? process.env[key]) return key
  }
  return undefined
}

function runtimeValue(key: string | undefined, env: RuntimeEnv): string | undefined {
  if (!key) return undefined
  return env[key] ?? process.env[key]
}

function modelTagAliases(tag: ModelTag): ModelTag[] {
  return tag === 'fast' || tag === 'flash' ? ['fast', 'flash'] : [tag]
}

function normalizeProfileModel(raw: unknown): ProviderModelEntry | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  const id = typeof record.id === 'string' ? record.id.trim() : ''
  if (!id) return null
  const tags = Array.isArray(record.tags)
    ? record.tags
        .filter((tag): tag is string => typeof tag === 'string')
        .map((tag) => tag.trim().toLowerCase())
        .filter((tag): tag is ModelTag => (ALL_TAGS as readonly string[]).includes(tag))
    : undefined
  const contextWindow =
    typeof record.contextWindow === 'number' && Number.isFinite(record.contextWindow)
      ? record.contextWindow
      : undefined
  const maxTokens =
    typeof record.maxTokens === 'number' && Number.isFinite(record.maxTokens)
      ? record.maxTokens
      : undefined

  return {
    id,
    ...(typeof record.name === 'string' && record.name.trim() ? { name: record.name.trim() } : {}),
    ...(tags && tags.length > 0 ? { tags: [...new Set(tags)] } : {}),
    ...(contextWindow ? { contextWindow } : {}),
    ...(maxTokens ? { maxTokens } : {}),
  }
}

function parseProviderProfileModelSets(env: RuntimeEnv): ProviderProfileModelSet[] {
  const value = runtimeValue(PROVIDER_PROFILE_MODELS_ENV_KEY, env)
  if (!value) return []

  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item): ProviderProfileModelSet | null => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return null
        const record = item as Record<string, unknown>
        const providerId = typeof record.providerId === 'string' ? record.providerId.trim() : ''
        const profileId = typeof record.profileId === 'string' ? record.profileId.trim() : undefined
        const models = Array.isArray(record.models)
          ? record.models
              .map(normalizeProfileModel)
              .filter((model): model is ProviderModelEntry => Boolean(model))
          : []
        return providerId && models.length > 0 ? { providerId, profileId, models } : null
      })
      .filter((entry): entry is ProviderProfileModelSet => Boolean(entry))
  } catch {
    return []
  }
}

function mergeModelEntries(
  catalog: ProviderCatalog,
  profileModelSets: ProviderProfileModelSet[],
): ProviderCatalog {
  const profileModels = profileModelSets
    .filter((set) => set.providerId === catalog.id)
    .flatMap((set) => set.models)
  if (profileModels.length === 0) return catalog

  const seen = new Set<string>()
  const models: ProviderModelEntry[] = []
  for (const model of [...profileModels, ...catalog.models]) {
    if (seen.has(model.id)) continue
    seen.add(model.id)
    models.push(model)
  }
  return { ...catalog, models }
}

function modelEntries(models: ProviderModelEntry[]): Array<Record<string, unknown>> {
  return models.map((model) => ({
    id: model.id,
    name: model.name ?? model.id,
    ...(model.contextWindow != null ? { contextWindow: model.contextWindow } : {}),
    ...(model.maxTokens != null ? { maxTokens: model.maxTokens } : {}),
  }))
}

function withModelOverride(
  catalog: ProviderCatalog,
  env: RuntimeEnv,
): { catalog: ProviderCatalog; models: ProviderModelEntry[] } {
  const modelOverride = runtimeValue(catalog.modelEnvKey, env)
  if (!modelOverride) return { catalog, models: catalog.models }

  const models: ProviderModelEntry[] = [
    { id: modelOverride, tags: [...ALL_TAGS] },
    ...catalog.models,
  ]
  return { catalog: { ...catalog, models }, models }
}

function buildProviderEntry(
  catalog: ProviderCatalog,
  env: RuntimeEnv,
): { catalog: ProviderCatalog; entry: Record<string, unknown> } | null {
  const resolvedEnvKey = resolveEnvKey(catalog, env)
  if (!resolvedEnvKey) return null

  const baseUrl = runtimeValue(catalog.baseUrlEnvKey, env) ?? catalog.baseUrl
  if (catalog.id === 'custom' && !baseUrl) return null

  const resolved = withModelOverride(catalog, env)
  const entry: Record<string, unknown> = {
    api: catalog.api,
    apiKey: `\${env:${resolvedEnvKey}}`,
    request: { allowPrivateNetwork: true },
    models: modelEntries(resolved.models),
  }
  if (baseUrl) entry.baseUrl = baseUrl

  return { catalog: resolved.catalog, entry }
}

function resolveModelsByTag(catalogs: ProviderCatalog[], tag: ModelTag): string[] {
  const refs: string[] = []
  const aliases = modelTagAliases(tag)
  for (const catalog of catalogs) {
    const model = catalog.models.find((m) => m.tags?.some((modelTag) => aliases.includes(modelTag)))
    if (model) refs.push(`${catalog.id}/${model.id}`)
  }
  return refs
}

function selectedTag(ctx: PluginBuildContext): ModelTag {
  const agentUseEntry = ctx.agent.use?.find((e) => e.plugin === 'model-provider')
  const templateUseEntry = ctx.config.use?.find((e) => e.plugin === 'model-provider')
  const rawTag = (agentUseEntry?.options?.tag ?? templateUseEntry?.options?.tag ?? 'default') as
    | string
    | undefined
  return (ALL_TAGS as readonly string[]).includes(rawTag ?? '') ? (rawTag as ModelTag) : 'default'
}

function envCandidates(catalogs: ProviderCatalog[]): string[] {
  const keys = new Set<string>([PROVIDER_PROFILE_MODELS_ENV_KEY])
  for (const catalog of catalogs) {
    keys.add(catalog.envKey)
    for (const alias of catalog.envKeyAliases ?? []) keys.add(alias)
    if (catalog.baseUrlEnvKey) keys.add(catalog.baseUrlEnvKey)
    if (catalog.modelEnvKey) keys.add(catalog.modelEnvKey)
  }
  return [...keys]
}

export default definePlugin(manifest as PluginManifest, (api) => {
  api.addProviderCatalog({
    id: 'custom',
    api: 'openai-completions',
    envKey: 'OPENAI_COMPATIBLE_API_KEY',
    baseUrlEnvKey: 'OPENAI_COMPATIBLE_BASE_URL',
    modelEnvKey: 'OPENAI_COMPATIBLE_MODEL_ID',
    priority: 1000,
    models: [{ id: 'default', tags: ['default', 'flash', 'reasoning', 'vision'] }],
  })
  api.addSecretFields([
    {
      key: 'OPENAI_COMPATIBLE_API_KEY',
      label: 'OpenAI-compatible API Key',
      required: false,
      sensitive: true,
    },
    {
      key: 'OPENAI_COMPATIBLE_BASE_URL',
      label: 'OpenAI-compatible Base URL',
      required: false,
      sensitive: false,
    },
    {
      key: 'OPENAI_COMPATIBLE_MODEL_ID',
      label: 'OpenAI-compatible Model ID',
      required: false,
      sensitive: false,
    },
  ])

  api.onBuildConfig((ctx): PluginConfigFragment => {
    const env = ctx.secrets as RuntimeEnv
    const profileModelSets = parseProviderProfileModelSets(env)
    const providers: Record<string, unknown> = {}
    const discovered: ProviderCatalog[] = []

    for (const catalog of providerCatalogs(ctx).map((entry) =>
      mergeModelEntries(entry, profileModelSets),
    )) {
      const provider = buildProviderEntry(catalog, env)
      if (!provider) continue
      providers[catalog.id] = provider.entry
      discovered.push(provider.catalog)
    }

    if (Object.keys(providers).length === 0) return {}

    const fragment: PluginConfigFragment = {
      models: {
        mode: 'merge',
        providers,
      },
    }

    const modelRefs = resolveModelsByTag(discovered, selectedTag(ctx))
    if (modelRefs.length > 0) {
      const [primary, ...fallbacks] = modelRefs
      fragment.agents = {
        defaults: {
          model: {
            primary,
            ...(fallbacks.length > 0 ? { fallbacks } : {}),
          },
        },
      }
    }

    return fragment
  })

  api.onBuildEnv((ctx): Record<string, string> => {
    const env = ctx.secrets as RuntimeEnv
    const out: Record<string, string> = {}
    for (const key of envCandidates(providerCatalogs(ctx))) {
      const value = runtimeValue(key, env)
      if (value) out[key] = value
    }
    return out
  })

  api.onValidate((ctx) => {
    const env = ctx.secrets as RuntimeEnv
    const keys = envCandidates(providerCatalogs(ctx))
    const found = keys.some((key) => runtimeValue(key, env))
    if (!found) {
      return {
        valid: true,
        errors: [
          {
            path: 'use[model-provider]',
            message:
              'model-provider: no provider credentials detected. Configure a saved provider profile or set one provider env var such as ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, DEEPSEEK_API_KEY, XAI_API_KEY, OPENROUTER_API_KEY, or OPENAI_COMPATIBLE_API_KEY.',
            severity: 'warning',
          },
        ],
      }
    }
    return { valid: true, errors: [] }
  })
})
