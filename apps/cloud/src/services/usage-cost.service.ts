/**
 * UsageCostService — aggregate per-agent and per-namespace OpenClaw usage/cost
 * snapshots from running pods.
 *
 * The service is intentionally tolerant: it first tries JSON output, then falls
 * back to human-readable text parsing. If no cost can be extracted, it still
 * returns provider usage hints where possible.
 */

import type { DeploymentStatus, PodStatus } from '../clients/kubectl-client.js'
import { K8sService } from './k8s.service.js'

export interface ProviderUsageSummary {
  provider: string
  amountUsd: number | null
  usageLabel: string | null
  raw: string | null
}

export interface AgentCostSummary {
  agentName: string
  podName: string | null
  totalUsd: number | null
  providers: ProviderUsageSummary[]
  source: 'json' | 'text' | 'unavailable'
  message: string | null
}

export interface NamespaceCostSummary {
  namespace: string
  totalUsd: number | null
  agents: AgentCostSummary[]
  availableAgents: number
  unavailableAgents: number
  generatedAt: string
}

export interface CostOverviewSummary {
  totalUsd: number | null
  namespaces: Array<{
    namespace: string
    totalUsd: number | null
    agentCount: number
    availableAgents: number
    unavailableAgents: number
  }>
  generatedAt: string
}

interface ParsedUsageSnapshot {
  totalUsd: number | null
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

function sumNumbers(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (!value || typeof value !== 'object') return 0
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + sumNumbers(item), 0)
  return Object.values(value).reduce((sum, item) => sum + sumNumbers(item), 0)
}

function parseAmount(text: string): number | null {
  const match = text.match(/\$\s*([0-9]+(?:\.[0-9]+)?)/)
  if (!match) return null
  const amount = Number.parseFloat(match[1] ?? '')
  return Number.isFinite(amount) ? amount : null
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
    const usageLabel = line.includes('% left') ? line : null
    const looksRelevant = amountUsd !== null || usageLabel !== null || PROVIDER_NAME_RE.test(line)
    if (!looksRelevant) continue

    providers.push({
      provider: deriveLabelFromLine(line),
      amountUsd,
      usageLabel,
      raw: line,
    })
  }

  const unique = uniqueProviders(providers)
  if (unique.length === 0) return null

  const totals = unique
    .map((provider) => provider.amountUsd)
    .filter((value): value is number => value !== null)

  return {
    totalUsd: totals.length > 0 ? totals.reduce((sum, value) => sum + value, 0) : null,
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

    if (providerHint && (amountUsd !== null || usageLabel)) {
      providers.push({
        provider: providerHint,
        amountUsd,
        usageLabel,
        raw: null,
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

  if (unique.length === 0) {
    return null
  }

  return {
    totalUsd: totals.length > 0 ? totals.reduce((sum, value) => sum + value, 0) : null,
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

function preferRunningPods(pods: PodStatus[], agentName: string): PodStatus[] {
  return pods
    .filter((pod) => pod.name.includes(agentName))
    .sort((left, right) => {
      if (left.status === 'Running' && right.status !== 'Running') return -1
      if (right.status === 'Running' && left.status !== 'Running') return 1
      return parseTimestamp(right.age) - parseTimestamp(left.age)
    })
}

export class UsageCostService {
  constructor(private k8s: K8sService) {}

  collectNamespace(namespace: string): NamespaceCostSummary {
    const deployments = this.k8s.getDeployments(namespace)
    const pods = this.k8s.getPods(namespace)
    const agents = deployments.map((deployment) => this.collectAgent(namespace, deployment, pods))

    return {
      namespace,
      totalUsd: sumNullable(agents.map((agent) => agent.totalUsd)),
      availableAgents: agents.filter((agent) => agent.source !== 'unavailable').length,
      unavailableAgents: agents.filter((agent) => agent.source === 'unavailable').length,
      agents,
      generatedAt: new Date().toISOString(),
    }
  }

  collectOverview(namespaces: string[]): CostOverviewSummary {
    const summaries = namespaces.map((namespace) => this.collectNamespace(namespace))
    return {
      totalUsd: sumNullable(summaries.map((summary) => summary.totalUsd)),
      namespaces: summaries.map((summary) => ({
        namespace: summary.namespace,
        totalUsd: summary.totalUsd,
        agentCount: summary.agents.length,
        availableAgents: summary.availableAgents,
        unavailableAgents: summary.unavailableAgents,
      })),
      generatedAt: new Date().toISOString(),
    }
  }

  private collectAgent(
    namespace: string,
    deployment: DeploymentStatus,
    pods: PodStatus[],
  ): AgentCostSummary {
    const pod = preferRunningPods(pods, deployment.name)[0]
    if (!pod) {
      return {
        agentName: deployment.name,
        podName: null,
        totalUsd: null,
        providers: [],
        source: 'unavailable',
        message: 'No running pod matched this agent.',
      }
    }

    let unavailableMessage: string | null = null

    for (const command of EXEC_CANDIDATES) {
      const result = this.k8s.execInPod(namespace, pod.name, command)
      if (result.exitCode !== 0 && !result.stdout.trim()) continue

      const jsonCandidate = this.tryParseJson(result.stdout)
      const currentModel = extractCurrentModelLabel(jsonCandidate)
      const parsedJson = jsonCandidate ? parseUsageJson(jsonCandidate) : null
      if (parsedJson) {
        return {
          agentName: deployment.name,
          podName: pod.name,
          totalUsd: parsedJson.totalUsd,
          providers: parsedJson.providers,
          source: parsedJson.source,
          message: null,
        }
      }

      const parsedText = parseUsageText(result.stdout || result.stderr)
      if (parsedText) {
        return {
          agentName: deployment.name,
          podName: pod.name,
          totalUsd: parsedText.totalUsd,
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
      agentName: deployment.name,
      podName: pod.name,
      totalUsd: null,
      providers: [],
      source: 'unavailable',
      message: unavailableMessage ?? 'Unable to extract OpenClaw usage from this pod.',
    }
  }

  private tryParseJson(value: string): unknown | null {
    const trimmed = value.trim()
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null
    try {
      return JSON.parse(trimmed)
    } catch {
      return null
    }
  }
}
