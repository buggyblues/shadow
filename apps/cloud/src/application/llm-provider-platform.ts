export const LLM_PROVIDER_AUTH_TYPES = ['api_key'] as const
export const LLM_PROVIDER_API_FORMATS = ['openai', 'anthropic', 'gemini'] as const

export type LlmProviderAuthType = (typeof LLM_PROVIDER_AUTH_TYPES)[number]
export type LlmProviderApiFormat = (typeof LLM_PROVIDER_API_FORMATS)[number]

export interface LlmProviderModel {
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

export interface LlmProviderProfileConfig {
  baseUrl?: string
  apiFormat?: LlmProviderApiFormat
  authType?: LlmProviderAuthType
  discoveredAt?: string
  models?: LlmProviderModel[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function positiveNumber(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const tags = value
    .map((tag) => stringValue(tag)?.toLowerCase())
    .filter((tag): tag is string => Boolean(tag))
  return [...new Set(tags)]
}

export function normalizeLlmProviderModels(value: unknown): LlmProviderModel[] {
  if (!Array.isArray(value)) return []
  const models: LlmProviderModel[] = []
  const seen = new Set<string>()

  for (const item of value) {
    if (!isRecord(item)) continue
    const id = stringValue(item.id)
    if (!id || seen.has(id)) continue
    seen.add(id)

    const cost = isRecord(item.cost)
      ? {
          ...(positiveNumber(item.cost.input) ? { input: positiveNumber(item.cost.input) } : {}),
          ...(positiveNumber(item.cost.output) ? { output: positiveNumber(item.cost.output) } : {}),
        }
      : undefined
    const capabilities = isRecord(item.capabilities)
      ? {
          ...(booleanValue(item.capabilities.vision) !== undefined
            ? { vision: booleanValue(item.capabilities.vision) }
            : {}),
          ...(booleanValue(item.capabilities.tools) !== undefined
            ? { tools: booleanValue(item.capabilities.tools) }
            : {}),
          ...(booleanValue(item.capabilities.reasoning) !== undefined
            ? { reasoning: booleanValue(item.capabilities.reasoning) }
            : {}),
        }
      : undefined

    models.push({
      id,
      ...(stringValue(item.name) ? { name: stringValue(item.name) } : {}),
      ...(normalizeTags(item.tags).length > 0 ? { tags: normalizeTags(item.tags) } : {}),
      ...(positiveNumber(item.contextWindow)
        ? { contextWindow: positiveNumber(item.contextWindow) }
        : {}),
      ...(positiveNumber(item.maxTokens) ? { maxTokens: positiveNumber(item.maxTokens) } : {}),
      ...(cost && Object.keys(cost).length > 0 ? { cost } : {}),
      ...(capabilities && Object.keys(capabilities).length > 0 ? { capabilities } : {}),
    })
  }

  return models
}

export function normalizeLlmProviderConfig(
  config: Record<string, unknown>,
): LlmProviderProfileConfig {
  const apiFormat = stringValue(config.apiFormat)
  const authType = stringValue(config.authType)
  return {
    ...(stringValue(config.baseUrl) ? { baseUrl: stringValue(config.baseUrl) } : {}),
    ...(apiFormat && LLM_PROVIDER_API_FORMATS.includes(apiFormat as LlmProviderApiFormat)
      ? { apiFormat: apiFormat as LlmProviderApiFormat }
      : {}),
    ...(authType && LLM_PROVIDER_AUTH_TYPES.includes(authType as LlmProviderAuthType)
      ? { authType: authType as LlmProviderAuthType }
      : {}),
    ...(stringValue(config.discoveredAt) ? { discoveredAt: stringValue(config.discoveredAt) } : {}),
    models: normalizeLlmProviderModels(config.models),
  }
}

export function parseDiscoveredModelsFromResponse(
  body: unknown,
  apiFormat: LlmProviderApiFormat,
): LlmProviderModel[] {
  if (!isRecord(body)) return []

  const raw = apiFormat === 'anthropic' ? body.data : (body.data ?? body.models)
  if (!Array.isArray(raw)) return []

  return normalizeLlmProviderModels(
    raw.map((entry) => {
      if (!isRecord(entry)) return null
      const id =
        stringValue(entry.id) ??
        stringValue(entry.name)?.replace(/^models\//, '') ??
        stringValue(entry.model)
      if (!id) return null
      return {
        id,
        name:
          stringValue(entry.display_name) ??
          stringValue(entry.displayName) ??
          stringValue(entry.name) ??
          id,
        contextWindow:
          positiveNumber(entry.context_length) ?? positiveNumber(entry.inputTokenLimit),
        tags: inferModelTags(id),
      }
    }),
  )
}

function inferModelTags(modelId: string): string[] {
  const lower = modelId.toLowerCase()
  const tags = new Set<string>()
  if (lower.includes('mini') || lower.includes('flash') || lower.includes('haiku')) {
    tags.add('fast')
  }
  if (
    lower.includes('reason') ||
    lower.includes('thinking') ||
    /^o\d/.test(lower) ||
    lower.includes('r1')
  ) {
    tags.add('reasoning')
  }
  if (lower.includes('vision') || lower.includes('vl') || lower.includes('4o')) {
    tags.add('vision')
  }
  if (tags.size === 0) tags.add('default')
  return [...tags]
}
