import { execInPod, type K8sPodSummary, listPods } from './k8s-cli'

export type BillingUnit = 'usd' | 'shrimp'

export interface ProviderUsageSummary {
  provider: string
  amountUsd: number | null
  usageLabel: string | null
  raw: string | null
  inputTokens: number | null
  outputTokens: number | null
  totalTokens: number | null
}

export interface AgentCostSummary {
  agentName: string
  podName: string | null
  totalUsd: number | null
  billingAmount: number | null
  billingUnit: BillingUnit
  totalTokens: number | null
  providers: ProviderUsageSummary[]
  source: 'json' | 'text' | 'unavailable'
  message: string | null
}

export interface NamespaceCostSummary {
  namespace: string
  totalUsd: number | null
  billingAmount: number | null
  billingUnit: BillingUnit
  totalTokens: number | null
  agents: AgentCostSummary[]
  availableAgents: number
  unavailableAgents: number
  generatedAt: string
}

export interface CostOverviewSummary {
  totalUsd: number | null
  billingAmount: number | null
  billingUnit: BillingUnit
  totalTokens: number | null
  namespaces: Array<{
    namespace: string
    totalUsd: number | null
    billingAmount: number | null
    billingUnit: BillingUnit
    totalTokens: number | null
    agentCount: number
    availableAgents: number
    unavailableAgents: number
  }>
  generatedAt: string
}

interface ParsedUsageSnapshot {
  totalUsd: number | null
  totalTokens: number | null
  providers: ProviderUsageSummary[]
  source: 'json' | 'text'
}

const EXEC_CANDIDATES: string[][] = [
  ['openclaw', 'status', '--usage', '--json'],
  ['openclaw', 'status', '--json', '--usage'],
  ['openclaw', 'status', '--usage'],
]

const PROVIDER_NAME_RE =
  /^(anthropic|openai|openrouter|gemini|google|copilot|github|minimax|claude|z\.ai|xai|mimo|codex)\b/i

function parseTimestamp(value?: string): number {
  if (!value) return 0
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

function parseAmount(text: string): number | null {
  const match = text.match(/\$\s*([0-9]+(?:\.[0-9]+)?)/)
  if (!match) return null
  const amount = Number.parseFloat(match[1] ?? '')
  return Number.isFinite(amount) ? amount : null
}

function parseInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value)
  }
  if (typeof value === 'string') {
    const normalized = value.replace(/,/g, '').trim()
    if (!normalized) return null
    const parsed = Number.parseFloat(normalized)
    return Number.isFinite(parsed) ? Math.round(parsed) : null
  }
  return null
}

function firstNumber(
  obj: Record<string, unknown> | null | undefined,
  keys: string[],
): number | null {
  if (!obj) return null
  for (const key of keys) {
    if (!(key in obj)) continue
    const parsed = parseInteger(obj[key])
    if (parsed !== null) return parsed
  }
  return null
}

function sumNumbers(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (!value || typeof value !== 'object') return 0
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + sumNumbers(item), 0)
  return Object.values(value).reduce((sum, item) => sum + sumNumbers(item), 0)
}

function sumTokenFields(value: unknown): number | null {
  if (!value || typeof value !== 'object') return null
  const obj = value as Record<string, unknown>
  const direct = firstNumber(obj, ['total', 'tokens', 'totalTokens', 'total_tokens'])
  if (direct !== null) return direct

  const input = firstNumber(obj, ['input', 'prompt', 'inputTokens', 'input_tokens', 'promptTokens'])
  const output = firstNumber(obj, [
    'output',
    'completion',
    'outputTokens',
    'output_tokens',
    'completionTokens',
  ])

  if (input !== null || output !== null) {
    return (input ?? 0) + (output ?? 0)
  }

  return null
}

function extractTokenSummary(value: unknown): {
  inputTokens: number | null
  outputTokens: number | null
  totalTokens: number | null
} {
  if (!value || typeof value !== 'object') {
    return { inputTokens: null, outputTokens: null, totalTokens: null }
  }

  const obj = value as Record<string, unknown>
  const inputTokens =
    firstNumber(obj, ['inputTokens', 'input_tokens', 'promptTokens', 'prompt_tokens']) ??
    firstNumber(obj.usage as Record<string, unknown> | undefined, ['input', 'prompt']) ??
    firstNumber(obj.tokens as Record<string, unknown> | undefined, ['input', 'prompt'])

  const outputTokens =
    firstNumber(obj, ['outputTokens', 'output_tokens', 'completionTokens', 'completion_tokens']) ??
    firstNumber(obj.usage as Record<string, unknown> | undefined, ['output', 'completion']) ??
    firstNumber(obj.tokens as Record<string, unknown> | undefined, ['output', 'completion'])

  const totalTokens =
    firstNumber(obj, ['totalTokens', 'total_tokens', 'tokens']) ??
    sumTokenFields(obj.usage) ??
    sumTokenFields(obj.tokens) ??
    (inputTokens !== null || outputTokens !== null
      ? (inputTokens ?? 0) + (outputTokens ?? 0)
      : null)

  return {
    inputTokens,
    outputTokens,
    totalTokens,
  }
}

function parseTokensFromText(line: string): {
  inputTokens: number | null
  outputTokens: number | null
  totalTokens: number | null
} {
  const read = (pattern: RegExp) => {
    const match = line.match(pattern)
    return match?.[1] ? parseInteger(match[1]) : null
  }

  const inputTokens =
    read(/(?:input|prompt)\s*(?:tokens?)?\s*[:=]?\s*([\d,]+)/i) ?? read(/\bin\s*[:=]?\s*([\d,]+)/i)
  const outputTokens =
    read(/(?:output|completion)\s*(?:tokens?)?\s*[:=]?\s*([\d,]+)/i) ??
    read(/\bout\s*[:=]?\s*([\d,]+)/i)
  const totalTokens =
    read(/(?:total\s*)?tokens?\s*[:=]?\s*([\d,]+)/i) ??
    (inputTokens !== null || outputTokens !== null
      ? (inputTokens ?? 0) + (outputTokens ?? 0)
      : null)

  return {
    inputTokens,
    outputTokens,
    totalTokens,
  }
}

function uniqueProviders(providers: ProviderUsageSummary[]): ProviderUsageSummary[] {
  const deduped = new Map<string, ProviderUsageSummary>()
  for (const provider of providers) {
    const key = provider.provider.toLowerCase()
    const existing = deduped.get(key)
    if (!existing) {
      deduped.set(key, provider)
      continue
    }
    deduped.set(key, {
      provider: existing.provider,
      amountUsd: provider.amountUsd ?? existing.amountUsd,
      usageLabel: provider.usageLabel ?? existing.usageLabel,
      raw: provider.raw ?? existing.raw,
      inputTokens: provider.inputTokens ?? existing.inputTokens,
      outputTokens: provider.outputTokens ?? existing.outputTokens,
      totalTokens: provider.totalTokens ?? existing.totalTokens,
    })
  }
  return [...deduped.values()]
}

function deriveLabelFromLine(line: string): string {
  const prefix = line.split(':')[0]?.trim()
  if (prefix && prefix.length <= 40) return prefix
  const providerMatch = line.match(PROVIDER_NAME_RE)
  return providerMatch?.[1] ?? 'OpenClaw'
}

function parseUsageText(stdout: string): ParsedUsageSnapshot | null {
  const lines = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length === 0) return null

  const providers: ProviderUsageSummary[] = []

  for (const line of lines) {
    const amountUsd = parseAmount(line)
    const tokenSummary = parseTokensFromText(line)
    const usageLabel = line.includes('% left') ? line : null
    const looksRelevant =
      amountUsd !== null ||
      usageLabel !== null ||
      tokenSummary.totalTokens !== null ||
      PROVIDER_NAME_RE.test(line)

    if (!looksRelevant) continue

    providers.push({
      provider: deriveLabelFromLine(line),
      amountUsd,
      usageLabel,
      raw: line,
      ...tokenSummary,
    })
  }

  const unique = uniqueProviders(providers)
  if (unique.length === 0) return null

  const totals = unique
    .map((provider) => provider.amountUsd)
    .filter((value): value is number => value !== null)
  const tokenTotals = unique
    .map((provider) => provider.totalTokens)
    .filter((value): value is number => value !== null)

  return {
    totalUsd: totals.length > 0 ? totals.reduce((sum, value) => sum + value, 0) : null,
    totalTokens: tokenTotals.length > 0 ? tokenTotals.reduce((sum, value) => sum + value, 0) : null,
    providers: unique,
    source: 'text',
  }
}

function parseUsageJson(payload: unknown): ParsedUsageSnapshot | null {
  if (!payload || typeof payload !== 'object') return null

  const providers: ProviderUsageSummary[] = []

  function walk(value: unknown, hint?: string) {
    if (!value || typeof value !== 'object') return

    if (Array.isArray(value)) {
      for (const item of value) walk(item, hint)
      return
    }

    const obj = value as Record<string, unknown>
    const providerHint =
      (typeof obj.provider === 'string' && obj.provider) ||
      (typeof obj.name === 'string' && obj.name) ||
      (typeof obj.id === 'string' && obj.id) ||
      hint ||
      null

    const directAmount =
      [obj.totalUsd, obj.totalCost, obj.estimatedCost, obj.costUsd, obj.usd]
        .map((entry) => (typeof entry === 'number' && Number.isFinite(entry) ? entry : null))
        .find((entry) => entry !== null) ?? null

    const costBlockAmount = obj.cost ? sumNumbers(obj.cost) : 0
    const amountUsd = directAmount ?? (costBlockAmount > 0 ? costBlockAmount : null)

    const usageLabel =
      (typeof obj.usage === 'string' && obj.usage) ||
      (typeof obj.window === 'string' && obj.window) ||
      (typeof obj.label === 'string' && obj.label.includes('% left') ? obj.label : null) ||
      null

    const tokenSummary = extractTokenSummary(obj)

    if (providerHint && (amountUsd !== null || usageLabel || tokenSummary.totalTokens !== null)) {
      providers.push({
        provider: providerHint,
        amountUsd,
        usageLabel,
        raw: null,
        ...tokenSummary,
      })
    }

    for (const [key, child] of Object.entries(obj)) {
      if (key === 'cost' || key === 'provider' || key === 'name' || key === 'id') continue
      walk(child, providerHint ?? key)
    }
  }

  walk(payload)

  const unique = uniqueProviders(providers)
  const totals = unique
    .map((provider) => provider.amountUsd)
    .filter((value): value is number => value !== null)
  const tokenTotals = unique
    .map((provider) => provider.totalTokens)
    .filter((value): value is number => value !== null)

  if (unique.length === 0) {
    return null
  }

  return {
    totalUsd: totals.length > 0 ? totals.reduce((sum, value) => sum + value, 0) : null,
    totalTokens: tokenTotals.length > 0 ? tokenTotals.reduce((sum, value) => sum + value, 0) : null,
    providers: unique,
    source: 'json',
  }
}

function sumNullable(values: Array<number | null>): number | null {
  const filtered = values.filter((value): value is number => value !== null)
  return filtered.length > 0 ? filtered.reduce((sum, value) => sum + value, 0) : null
}

function extractCurrentModelLabel(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null

  const sessions = (payload as Record<string, unknown>).sessions
  if (!sessions || typeof sessions !== 'object') return null

  const recent = (sessions as Record<string, unknown>).recent
  if (!Array.isArray(recent)) return null

  for (const item of recent) {
    if (!item || typeof item !== 'object') continue
    if (typeof (item as Record<string, unknown>).model === 'string') {
      return (item as Record<string, unknown>).model as string
    }
  }

  return null
}

function extractUsageUnavailableReason(payload: unknown, output: string): string | null {
  if (payload && typeof payload === 'object') {
    const usage = (payload as Record<string, unknown>).usage
    if (usage && typeof usage === 'object') {
      const providers = (usage as Record<string, unknown>).providers
      if (Array.isArray(providers) && providers.length === 0) {
        return 'Provider usage data unavailable.'
      }
    }
  }

  const line = output
    .split('\n')
    .map((value) => value.trim())
    .find((value) => /no provider usage available/i.test(value))

  if (!line) return null
  if (/no provider usage available/i.test(line)) {
    return 'Provider usage data unavailable.'
  }

  return line.replace(/^Usage:\s*/i, '')
}

function formatUnavailableMessage(reason: string, model: string | null): string {
  if (!model) {
    return `${reason} OpenClaw did not receive usage details from the current provider for this pod.`
  }

  return `${reason} Model: ${model}. OpenClaw did not receive usage details from the current provider for this pod.`
}

function preferRunningPods(pods: K8sPodSummary[], agentName: string): K8sPodSummary[] {
  return pods
    .filter((pod) => pod.name.includes(agentName))
    .sort((left, right) => {
      if (left.status === 'Running' && right.status !== 'Running') return -1
      if (right.status === 'Running' && left.status !== 'Running') return 1
      return parseTimestamp(right.age) - parseTimestamp(left.age)
    })
}

function collectAgentUsage(
  namespace: string,
  agentName: string,
  kubeconfig?: string,
): Omit<AgentCostSummary, 'billingAmount' | 'billingUnit'> {
  const pods = listPods(namespace, kubeconfig)
  const pod = preferRunningPods(pods, agentName)[0]

  if (!pod) {
    return {
      agentName,
      podName: null,
      totalUsd: null,
      totalTokens: null,
      providers: [],
      source: 'unavailable',
      message: 'No running pod matched this agent.',
    }
  }

  let unavailableMessage: string | null = null

  for (const command of EXEC_CANDIDATES) {
    const result = execInPod({
      namespace,
      pod: pod.name,
      command,
      kubeconfig,
      timeout: 15_000,
    })

    if (result.exitCode !== 0 && !result.stdout.trim()) continue

    const jsonCandidate = tryParseJson(result.stdout)
    const currentModel = extractCurrentModelLabel(jsonCandidate)
    const parsedJson = jsonCandidate ? parseUsageJson(jsonCandidate) : null
    if (parsedJson) {
      return {
        agentName,
        podName: pod.name,
        totalUsd: parsedJson.totalUsd,
        totalTokens: parsedJson.totalTokens,
        providers: parsedJson.providers,
        source: parsedJson.source,
        message: null,
      }
    }

    const parsedText = parseUsageText(result.stdout || result.stderr)
    if (parsedText) {
      return {
        agentName,
        podName: pod.name,
        totalUsd: parsedText.totalUsd,
        totalTokens: parsedText.totalTokens,
        providers: parsedText.providers,
        source: parsedText.source,
        message: null,
      }
    }

    const rawOutput = [result.stdout, result.stderr].filter(Boolean).join('\n')
    const usageUnavailableReason = extractUsageUnavailableReason(jsonCandidate, rawOutput)
    if (usageUnavailableReason) {
      unavailableMessage = formatUnavailableMessage(usageUnavailableReason, currentModel)
    }
  }

  return {
    agentName,
    podName: pod.name,
    totalUsd: null,
    totalTokens: null,
    providers: [],
    source: 'unavailable',
    message: unavailableMessage ?? 'Unable to extract OpenClaw usage from this pod.',
  }
}

function tryParseJson(value: string): unknown | null {
  const trimmed = value.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null
  try {
    return JSON.parse(trimmed)
  } catch {
    return null
  }
}

export function collectNamespaceCost(opts: {
  namespace: string
  agentNames: string[]
  billingAmount: number | null
  billingUnit: BillingUnit
  kubeconfig?: string
}): NamespaceCostSummary {
  const agentNames = opts.agentNames.length > 0 ? opts.agentNames : [opts.namespace]
  const baseAgents = agentNames.map((agentName) =>
    collectAgentUsage(opts.namespace, agentName, opts.kubeconfig),
  )
  const perAgentBilling =
    opts.billingAmount !== null && baseAgents.length > 0
      ? opts.billingAmount / baseAgents.length
      : null

  const agents: AgentCostSummary[] = baseAgents.map((agent) => ({
    ...agent,
    billingAmount: perAgentBilling,
    billingUnit: opts.billingUnit,
  }))

  return {
    namespace: opts.namespace,
    totalUsd: sumNullable(agents.map((agent) => agent.totalUsd)),
    billingAmount: opts.billingAmount,
    billingUnit: opts.billingUnit,
    totalTokens: sumNullable(agents.map((agent) => agent.totalTokens)),
    agents,
    availableAgents: agents.filter((agent) => agent.source !== 'unavailable').length,
    unavailableAgents: agents.filter((agent) => agent.source === 'unavailable').length,
    generatedAt: new Date().toISOString(),
  }
}
