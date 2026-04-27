export const LLM_PROVIDER_AUTH_TYPES = ['api_key'] as const
export const LLM_PROVIDER_API_FORMATS = ['openai', 'anthropic', 'gemini'] as const
export const LLM_PROVIDER_MODEL_TAGS = [
  'default',
  'fast',
  'flash',
  'reasoning',
  'vision',
  'tools',
] as const
export const LLM_ROUTING_TIERS = ['default', 'simple', 'standard', 'complex', 'reasoning'] as const
export const LLM_LIMIT_RULE_METRICS = ['tokens', 'cost'] as const
export const LLM_LIMIT_RULE_PERIODS = ['day', 'month'] as const

export type LlmProviderAuthType = (typeof LLM_PROVIDER_AUTH_TYPES)[number]
export type LlmProviderApiFormat = (typeof LLM_PROVIDER_API_FORMATS)[number]
export type LlmRoutingTier = (typeof LLM_ROUTING_TIERS)[number]
export type LlmLimitRuleMetric = (typeof LLM_LIMIT_RULE_METRICS)[number]
export type LlmLimitRulePeriod = (typeof LLM_LIMIT_RULE_PERIODS)[number]

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

export interface LlmRouteAssignment {
  selector: string
  primary?: string
  fallbacks: string[]
}

export interface LlmLimitRule {
  id: string
  metric: LlmLimitRuleMetric
  threshold: number
  period: LlmLimitRulePeriod
  blockRequests: boolean
  enabled: boolean
  triggered: number
}

export interface LlmRoutingPolicy {
  enabled: boolean
  defaultRoute: LlmRouteAssignment
  complexity: Record<'simple' | 'standard' | 'complex' | 'reasoning', LlmRouteAssignment>
  limits: {
    requestsPerMinute: number
    concurrentRequests: number
    monthlyBudgetUsd?: number
  }
  fallback: {
    enabled: boolean
    statusCodes: number[]
  }
  rules: LlmLimitRule[]
}

export interface LlmRoutableModel extends LlmProviderModel {
  ref: string
  providerId: string
  profileId: string
  profileName: string
  enabled: boolean
}

export interface LlmRoutingResolveInput {
  selector?: string
  tags?: string[]
}

export interface LlmRoutingResolveResult {
  route: LlmRoutingTier
  selector: string
  model: LlmRoutableModel | null
  fallbacks: LlmRoutableModel[]
  reason: 'primary' | 'tag_match' | 'default' | 'unresolved'
}

const DEFAULT_FALLBACK_STATUS_CODES = [408, 409, 425, 429, 500, 502, 503, 504]

export const DEFAULT_LLM_ROUTING_POLICY: LlmRoutingPolicy = {
  enabled: true,
  defaultRoute: { selector: 'default', fallbacks: [] },
  complexity: {
    simple: { selector: 'fast', fallbacks: [] },
    standard: { selector: 'default', fallbacks: [] },
    complex: { selector: 'default', fallbacks: [] },
    reasoning: { selector: 'reasoning', fallbacks: [] },
  },
  limits: {
    requestsPerMinute: 120,
    concurrentRequests: 8,
  },
  fallback: {
    enabled: true,
    statusCodes: DEFAULT_FALLBACK_STATUS_CODES,
  },
  rules: [],
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

function normalizeModelRef(value: unknown): string | undefined {
  const ref = stringValue(value)
  if (!ref) return undefined
  return ref.includes('/') ? ref : undefined
}

function normalizeModelRefs(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map(normalizeModelRef)
    .filter((ref): ref is string => Boolean(ref))
    .slice(0, 5)
}

function normalizeLimitRule(value: unknown): LlmLimitRule | null {
  if (!isRecord(value)) return null
  const id = stringValue(value.id)
  const metric = stringValue(value.metric)
  const period = stringValue(value.period)
  const threshold = positiveNumber(value.threshold)
  if (!id || !threshold) return null
  return {
    id,
    metric: LLM_LIMIT_RULE_METRICS.includes(metric as LlmLimitRuleMetric)
      ? (metric as LlmLimitRuleMetric)
      : 'tokens',
    threshold,
    period: LLM_LIMIT_RULE_PERIODS.includes(period as LlmLimitRulePeriod)
      ? (period as LlmLimitRulePeriod)
      : 'day',
    blockRequests: booleanValue(value.blockRequests) ?? false,
    enabled: booleanValue(value.enabled) ?? true,
    triggered: Math.max(0, Math.trunc(Number(value.triggered) || 0)),
  }
}

function normalizeLimitRules(value: unknown): LlmLimitRule[] {
  if (!Array.isArray(value)) return []
  return value
    .map(normalizeLimitRule)
    .filter((rule): rule is LlmLimitRule => Boolean(rule))
    .slice(0, 50)
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

function normalizeRoute(value: unknown, fallbackSelector: string): LlmRouteAssignment {
  if (!isRecord(value)) {
    return { selector: fallbackSelector, fallbacks: [] }
  }
  return {
    selector: stringValue(value.selector) ?? fallbackSelector,
    ...(normalizeModelRef(value.primary) ? { primary: normalizeModelRef(value.primary) } : {}),
    fallbacks: normalizeModelRefs(value.fallbacks),
  }
}

export function normalizeLlmRoutingPolicy(value: unknown): LlmRoutingPolicy {
  const record = isRecord(value) ? value : {}
  const complexity = isRecord(record.complexity) ? record.complexity : {}
  const limits = isRecord(record.limits) ? record.limits : {}
  const fallback = isRecord(record.fallback) ? record.fallback : {}

  return {
    enabled: booleanValue(record.enabled) ?? DEFAULT_LLM_ROUTING_POLICY.enabled,
    defaultRoute: normalizeRoute(
      record.defaultRoute,
      DEFAULT_LLM_ROUTING_POLICY.defaultRoute.selector,
    ),
    complexity: {
      simple: normalizeRoute(
        complexity.simple,
        DEFAULT_LLM_ROUTING_POLICY.complexity.simple.selector,
      ),
      standard: normalizeRoute(
        complexity.standard,
        DEFAULT_LLM_ROUTING_POLICY.complexity.standard.selector,
      ),
      complex: normalizeRoute(
        complexity.complex,
        DEFAULT_LLM_ROUTING_POLICY.complexity.complex.selector,
      ),
      reasoning: normalizeRoute(
        complexity.reasoning,
        DEFAULT_LLM_ROUTING_POLICY.complexity.reasoning.selector,
      ),
    },
    limits: {
      requestsPerMinute:
        positiveNumber(limits.requestsPerMinute) ??
        DEFAULT_LLM_ROUTING_POLICY.limits.requestsPerMinute,
      concurrentRequests:
        positiveNumber(limits.concurrentRequests) ??
        DEFAULT_LLM_ROUTING_POLICY.limits.concurrentRequests,
      ...(positiveNumber(limits.monthlyBudgetUsd)
        ? { monthlyBudgetUsd: positiveNumber(limits.monthlyBudgetUsd) }
        : {}),
    },
    fallback: {
      enabled: booleanValue(fallback.enabled) ?? DEFAULT_LLM_ROUTING_POLICY.fallback.enabled,
      statusCodes: Array.isArray(fallback.statusCodes)
        ? fallback.statusCodes
            .map((status) => Math.trunc(Number(status)))
            .filter((status) => status >= 400 && status <= 599)
            .slice(0, 16)
        : DEFAULT_LLM_ROUTING_POLICY.fallback.statusCodes,
    },
    rules: normalizeLimitRules(record.rules),
  }
}

export function makeModelRef(profileId: string, modelId: string): string {
  return `${profileId}/${modelId}`
}

export function modelMatchesSelector(model: LlmRoutableModel, selector: string): boolean {
  const normalized = selector.trim().toLowerCase()
  if (!normalized) return false
  if (model.ref === selector || model.id === selector) return true
  return (model.tags ?? []).some((tag) => tag.toLowerCase() === normalized)
}

export function resolveLlmRoute(
  policy: LlmRoutingPolicy,
  models: LlmRoutableModel[],
  input: LlmRoutingResolveInput,
): LlmRoutingResolveResult {
  const requestedSelector = stringValue(input.selector)
  const requestedTags = normalizeTags(input.tags)
  const route: LlmRoutingTier =
    requestedSelector && LLM_ROUTING_TIERS.includes(requestedSelector as LlmRoutingTier)
      ? (requestedSelector as LlmRoutingTier)
      : requestedSelector === 'fast'
        ? 'simple'
        : requestedSelector === 'reasoning'
          ? 'reasoning'
          : 'default'
  const assignment = route === 'default' ? policy.defaultRoute : policy.complexity[route]
  const selector = requestedTags[0] ?? assignment.selector
  const enabledModels = models.filter((model) => model.enabled)
  const byRef = new Map(enabledModels.map((model) => [model.ref, model]))

  const primary = assignment.primary ? byRef.get(assignment.primary) : undefined
  if (primary) {
    return {
      route,
      selector,
      model: primary,
      fallbacks: assignment.fallbacks
        .map((ref) => byRef.get(ref))
        .filter(Boolean) as LlmRoutableModel[],
      reason: 'primary',
    }
  }

  const tagMatch = enabledModels.find((model) => modelMatchesSelector(model, selector))
  if (tagMatch) {
    return {
      route,
      selector,
      model: tagMatch,
      fallbacks: assignment.fallbacks
        .map((ref) => byRef.get(ref))
        .filter(Boolean) as LlmRoutableModel[],
      reason: 'tag_match',
    }
  }

  const defaultMatch = enabledModels.find((model) => modelMatchesSelector(model, 'default'))
  if (defaultMatch) {
    return {
      route,
      selector,
      model: defaultMatch,
      fallbacks: assignment.fallbacks
        .map((ref) => byRef.get(ref))
        .filter(Boolean) as LlmRoutableModel[],
      reason: 'default',
    }
  }

  return { route, selector, model: null, fallbacks: [], reason: 'unresolved' }
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
