import type {
  AgentFinalAnswer,
  DiyCloudAgentStepOutput,
  DiyCloudDraft,
  DiyCloudGenerateInput,
  DiyCloudGenerationOptions,
  DiyCloudProgressEvent,
  DiyCloudProgressStatus,
  DiyCloudStepId,
  DiyTemplateDsl,
} from './types'

const DIY_CLOUD_STEP_IDS = new Set<DiyCloudStepId>([
  'think',
  'search',
  'generate',
  'validate',
  'review',
])
const SECRET_KEY_RE =
  /(?:token|secret|password|api[_-]?key|authorization|credential|private[_-]?key|refresh[_-]?token|kubeconfig)/i

export function firstNonEmptyEnv(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim()
    if (value) return value
  }
  return null
}

export function outputLocale(input: DiyCloudGenerateInput) {
  return input.locale?.trim() || 'zh-CN'
}

export function outputTimezone(input: DiyCloudGenerateInput) {
  return input.timezone?.trim() || 'Asia/Shanghai'
}

export function compactText(value: unknown, max = 300) {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim().slice(0, max)
}

export function uniqueStrings(values: unknown[], maxItems: number) {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const trimmed = compactText(value, 160)
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    result.push(trimmed)
    if (result.length >= maxItems) break
  }
  return result
}

export function slugify(input: string) {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return slug || 'diy-cloud'
}

export function clampScore(value: unknown) {
  const number = typeof value === 'number' && Number.isFinite(value) ? value : 82
  return Math.max(45, Math.min(98, Math.round(number)))
}

export function parseStringArray(value: unknown, maxItems: number) {
  return Array.isArray(value) ? uniqueStrings(value, maxItems) : []
}

export function parseStepId(value: unknown): DiyCloudStepId | null {
  return typeof value === 'string' && DIY_CLOUD_STEP_IDS.has(value as DiyCloudStepId)
    ? (value as DiyCloudStepId)
    : null
}

export function safeJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    const start = value.indexOf('{')
    const end = value.lastIndexOf('}')
    if (start < 0 || end <= start) return null
    try {
      const parsed = JSON.parse(value.slice(start, end + 1))
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null
    } catch {
      return null
    }
  }
}

export function redactRawJson(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[Max depth reached]'
  if (Array.isArray(value)) return value.slice(0, 40).map((item) => redactRawJson(item, depth + 1))
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => [
      key,
      SECRET_KEY_RE.test(key) ? '[REDACTED]' : redactRawJson(child, depth + 1),
    ]),
  )
}

export function assertNotAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return
  throw Object.assign(new Error('DIY Cloud generation aborted'), {
    status: 499,
    code: 'DIY_CLOUD_GENERATION_ABORTED',
  })
}

export async function emitProgress(
  options: DiyCloudGenerationOptions,
  event: Omit<Extract<DiyCloudProgressEvent, { type: 'progress' }>, 'type' | 'id' | 'timestamp'>,
) {
  assertNotAborted(options.signal)
  await options.onProgress?.({
    ...event,
    type: 'progress',
    id: `${event.step}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
  })
  assertNotAborted(options.signal)
}

export async function emitDraft(options: DiyCloudGenerationOptions, draft: DiyCloudDraft) {
  assertNotAborted(options.signal)
  await options.onProgress?.({
    type: 'draft',
    id: `draft-${Date.now().toString(36)}`,
    timestamp: new Date().toISOString(),
    draft,
  })
  assertNotAborted(options.signal)
}

export function buildStepOutput({
  input,
  step,
  status,
  title,
  result,
  reasons,
  raw,
  confidence,
}: {
  input: DiyCloudGenerateInput
  step: DiyCloudStepId
  status: DiyCloudProgressStatus
  title: string
  result: Record<string, unknown>
  reasons: string[]
  raw: unknown
  confidence?: number
}): DiyCloudAgentStepOutput {
  return {
    type: 'agent_step_output',
    schemaVersion: 1,
    step,
    status,
    title,
    locale: outputLocale(input),
    timezone: outputTimezone(input),
    generatedAt: new Date().toISOString(),
    result,
    reasons: uniqueStrings(reasons, 12),
    confidence,
    raw: redactRawJson(raw),
  }
}

export function invalidFinalPlan(message: string): never {
  throw Object.assign(new Error(message), {
    status: 502,
    code: 'DIY_CLOUD_MODEL_INVALID_FINAL_PLAN',
  })
}

export function requiredText(value: unknown, field: string, max = 300) {
  const text = compactText(value, max)
  if (!text) invalidFinalPlan(`DIY Cloud model final plan is missing ${field}`)
  return text
}

export function toDsl(value: unknown): DiyTemplateDsl {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as DiyTemplateDsl)
    : {}
}

export function parseFinalAnswer(content?: string | null): AgentFinalAnswer | null {
  const json = content ? safeJsonObject(content) : null
  if (!json) return null
  const progress = Array.isArray(json.progress)
    ? json.progress
        .map((item) => {
          if (!item || typeof item !== 'object' || Array.isArray(item)) return null
          const record = item as Record<string, unknown>
          const step = parseStepId(record.step)
          const title = compactText(record.title, 90)
          const detail = compactText(record.detail, 260)
          if (!step || !title || !detail) return null
          return {
            step,
            title,
            detail,
            basis: parseStringArray(record.basis, 4),
          }
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
    : []
  return {
    intent: compactText(json.intent, 300),
    progress,
    selectedPluginIds: parseStringArray(json.selectedPluginIds, 12),
    rejectedPluginIds: parseStringArray(json.rejectedPluginIds, 20),
    selectedTemplateSlugs: parseStringArray(json.selectedTemplateSlugs, 8),
    dsl: toDsl(json.dsl),
    decisions: Array.isArray(json.decisions)
      ? (json.decisions as AgentFinalAnswer['decisions'])
      : [],
    assumptions: parseStringArray(json.assumptions, 8),
    score: clampScore(json.score),
  }
}

export function readDecisionReasons(answer: AgentFinalAnswer, step?: DiyCloudStepId) {
  return (answer.decisions ?? [])
    .filter((decision) => !step || decision.step === step)
    .flatMap((decision) => [
      decision.rationale ?? '',
      ...(Array.isArray(decision.evidence) ? decision.evidence : []),
    ])
    .filter(Boolean)
}

export function decisionForStep(answer: AgentFinalAnswer, step: DiyCloudStepId) {
  return answer.decisions?.find((decision) => decision.step === step)
}

export function progressForStep(answer: AgentFinalAnswer, step: DiyCloudStepId) {
  return answer.progress?.find((progress) => progress.step === step)
}
