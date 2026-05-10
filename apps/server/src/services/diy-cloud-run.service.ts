import { randomUUID } from 'node:crypto'
import type { RedisClientType } from 'redis'
import { getRedisClient } from '../lib/redis'
import {
  type DiyCloudAgentStepOutput,
  type DiyCloudDraft,
  type DiyCloudGenerateInput,
  type DiyCloudProgressEvent,
  runDiyCloudPlanner,
} from './diy-cloud.service'

const DIY_CLOUD_RUN_TTL_SECONDS = 24 * 60 * 60
const DIY_CLOUD_RUN_TTL_MS = DIY_CLOUD_RUN_TTL_SECONDS * 1000
const KEY_PREFIX = 'diy-cloud:v2'
const SECRET_KEY_RE =
  /(?:token|secret|password|api[_-]?key|authorization|credential|private[_-]?key|refresh[_-]?token|kubeconfig)/i
const INTERNAL_PAYLOAD_KEYS = new Set(['raw', 'docsExcerpt'])

export type DiyCloudRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export type DiyCloudCachedRun = {
  id: string
  userId: string
  status: DiyCloudRunStatus
  input: Record<string, unknown>
  draft?: Record<string, unknown> | null
  error?: string | null
  modelProvider?: string | null
  modelName?: string | null
  createdAt: string
  updatedAt: string
  expiresAt: string
}

export type DiyCloudCachedRunEvent = {
  runId: string
  seq: number
  type: string
  stepId?: string | null
  payload: Record<string, unknown>
}

type DiyCloudStepOrderState = {
  seenSteps: Set<string>
  nextOrder: number
}

const runKey = (runId: string) => `${KEY_PREFIX}:run:${runId}`
const eventsKey = (runId: string) => `${KEY_PREFIX}:run:${runId}:events`
const seqKey = (runId: string) => `${KEY_PREFIX}:run:${runId}:seq`
const claimKey = (runId: string) => `${KEY_PREFIX}:run:${runId}:claim`

function redactJson(value: unknown, depth = 0): unknown {
  if (depth > 10) return '[Max depth reached]'
  if (Array.isArray(value)) return value.map((item) => redactJson(item, depth + 1))
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !INTERNAL_PAYLOAD_KEYS.has(key))
      .map(([key, child]) => [
        key,
        SECRET_KEY_RE.test(key) && typeof child === 'string'
          ? '[REDACTED]'
          : redactJson(child, depth + 1),
      ]),
  )
}

function compactString(value: unknown, maxLength = 260) {
  if (typeof value !== 'string') return undefined
  const text = value.replace(/\s+/g, ' ').trim()
  if (!text) return undefined
  return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 3))}...` : text
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function compactEvidenceItem(item: unknown) {
  if (typeof item === 'string' || typeof item === 'number') return item
  const record = toRecord(item)
  const compact: Record<string, unknown> = {}
  for (const key of [
    'id',
    'name',
    'title',
    'slug',
    'key',
    'label',
    'source',
    'sourcePluginId',
    'category',
    'score',
  ]) {
    const value = record[key]
    if (typeof value === 'string' || typeof value === 'number') compact[key] = value
  }
  if (typeof record.sensitive === 'boolean') compact.sensitive = record.sensitive
  for (const key of ['matchedTerms', 'requiredKeys', 'plugins', 'channels']) {
    const value = record[key]
    if (Array.isArray(value)) {
      compact[key] = value
        .filter((entry) => typeof entry === 'string' || typeof entry === 'number')
        .slice(0, 8)
    }
  }
  const description = compactString(record.description, 160)
  if (description) compact.description = description
  return compact
}

function compactToolResult(result: unknown): unknown {
  if (Array.isArray(result)) return result.slice(0, 12).map(compactEvidenceItem)
  const record = toRecord(result)
  if (Object.keys(record).length === 0) return redactJson(result)
  const single = compactEvidenceItem(record)
  const compact: Record<string, unknown> = {}
  if (single && typeof single === 'object' && !Array.isArray(single)) {
    Object.assign(compact, single)
  }
  const query = compactString(record.query, 220)
  if (query) compact.query = query
  for (const key of ['valid', 'compiledName', 'error']) {
    const value = record[key]
    if (typeof value === 'boolean') compact[key] = value
    if (typeof value === 'string') compact[key] = compactString(value, 220)
  }
  for (const key of ['plugins', 'templates', 'requiredKeys', 'items']) {
    const value = record[key]
    if (Array.isArray(value)) compact[key] = value.slice(0, 12).map(compactEvidenceItem)
  }
  const baselinePlugins = record.baselinePlugins
  if (Array.isArray(baselinePlugins)) {
    compact.baselinePlugins = baselinePlugins.filter((item) => typeof item === 'string').slice(0, 8)
  }
  const repairNotes = record.repairNotes
  if (Array.isArray(repairNotes)) {
    compact.repairNotes = repairNotes
      .map((item) => compactString(item, 180))
      .filter(Boolean)
      .slice(0, 4)
  }
  return compact
}

function compactProgressMeta(meta: unknown): Record<string, unknown> {
  const record = toRecord(redactJson(meta))
  const compact: Record<string, unknown> = {}
  const tool = compactString(record.tool, 80)
  if (tool) compact.tool = tool
  if (typeof record.isError === 'boolean') compact.isError = record.isError

  const args = toRecord(record.args)
  const compactArgs: Record<string, unknown> = {}
  for (const key of ['query', 'pluginId', 'slug']) {
    const value = compactString(args[key], 220)
    if (value) compactArgs[key] = value
  }
  for (const key of ['selectedPluginIds', 'pluginIds']) {
    const value = args[key]
    if (Array.isArray(value)) {
      compactArgs[key] = value.filter((item) => typeof item === 'string').slice(0, 12)
    }
  }
  if (Object.keys(compactArgs).length > 0) compact.args = compactArgs
  if ('result' in record) compact.result = compactToolResult(record.result)
  return compact
}

function publicRunError(err: unknown) {
  const message = err instanceof Error ? err.message : 'Failed to generate DIY Cloud draft'
  if (/failed query|insert into|update .* set|select .* from|params:/i.test(message)) {
    return 'DIY Cloud generation failed while saving progress. Please retry.'
  }
  return compactString(message, 600) ?? 'Failed to generate DIY Cloud draft'
}

function compactStepOutput(output: DiyCloudAgentStepOutput): Record<string, unknown> {
  return {
    type: output.type,
    schemaVersion: output.schemaVersion,
    step: output.step,
    status: output.status,
    title: compactString(output.title, 180) ?? output.title,
    locale: output.locale,
    timezone: output.timezone,
    generatedAt: output.generatedAt,
    result: redactJson(output.result) as Record<string, unknown>,
    reasons: output.reasons.map((reason) => compactString(reason, 260)).filter(Boolean),
    confidence: output.confidence,
  }
}

function toDraftRecord(draft: DiyCloudDraft): Record<string, unknown> {
  const record = redactJson(draft) as Record<string, unknown>
  record.agentOutputs = draft.agentOutputs.map(compactStepOutput)
  record.matchedPlugins = draft.matchedPlugins.map((plugin) => ({
    id: plugin.id,
    name: plugin.name,
    description: plugin.description,
    reason: plugin.reason,
    capabilities: plugin.capabilities,
    requiredKeys: plugin.requiredKeys,
    matchedTerms: plugin.matchedTerms,
  }))
  return record
}

function runExpiresAt() {
  return new Date(Date.now() + DIY_CLOUD_RUN_TTL_MS).toISOString()
}

function parseCachedRun(raw: string | null): DiyCloudCachedRun | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as DiyCloudCachedRun
    return parsed && typeof parsed === 'object' && typeof parsed.id === 'string' ? parsed : null
  } catch {
    return null
  }
}

function parseCachedEvent(raw: string): DiyCloudCachedRunEvent | null {
  try {
    const parsed = JSON.parse(raw) as DiyCloudCachedRunEvent
    return parsed && typeof parsed === 'object' && typeof parsed.seq === 'number' ? parsed : null
  } catch {
    return null
  }
}

export class DiyCloudRunService {
  private async redis() {
    const redis = await getRedisClient()
    if (!redis) {
      throw Object.assign(new Error('Redis is required for DIY Cloud generation runs'), {
        status: 503,
        code: 'DIY_CLOUD_REDIS_REQUIRED',
      })
    }
    return redis
  }

  private async saveRun(redis: RedisClientType, run: DiyCloudCachedRun) {
    await redis.set(runKey(run.id), JSON.stringify(run), { EX: DIY_CLOUD_RUN_TTL_SECONDS })
  }

  private async loadRun(redis: RedisClientType, runId: string) {
    return parseCachedRun(await redis.get(runKey(runId)))
  }

  private async refreshRunTtl(redis: RedisClientType, runId: string) {
    await Promise.all([
      redis.expire(runKey(runId), DIY_CLOUD_RUN_TTL_SECONDS),
      redis.expire(eventsKey(runId), DIY_CLOUD_RUN_TTL_SECONDS),
      redis.expire(seqKey(runId), DIY_CLOUD_RUN_TTL_SECONDS),
      redis.expire(claimKey(runId), DIY_CLOUD_RUN_TTL_SECONDS),
    ])
  }

  async createRun(userId: string, input: DiyCloudGenerateInput) {
    const redis = await this.redis()
    const now = new Date().toISOString()
    const run: DiyCloudCachedRun = {
      id: randomUUID(),
      userId,
      status: 'pending',
      input: redactJson(input) as Record<string, unknown>,
      draft: null,
      error: null,
      modelProvider: null,
      modelName: null,
      createdAt: now,
      updatedAt: now,
      expiresAt: runExpiresAt(),
    }
    await this.saveRun(redis, run)
    await this.appendEvent(run.id, {
      type: 'run.created',
      payload: {
        status: run.status,
        input: run.input,
        expiresAt: run.expiresAt,
      },
    })
    return run
  }

  async getRun(userId: string, runId: string) {
    const redis = await this.redis()
    const run = await this.loadRun(redis, runId)
    return run?.userId === userId ? run : null
  }

  async listEvents(runId: string, afterSeq = 0): Promise<DiyCloudCachedRunEvent[]> {
    const redis = await this.redis()
    const rows = await redis.lRange(eventsKey(runId), Math.max(afterSeq, 0), -1)
    return rows
      .map(parseCachedEvent)
      .filter((event): event is DiyCloudCachedRunEvent => Boolean(event && event.seq > afterSeq))
  }

  async cancelRun(userId: string, runId: string) {
    const redis = await this.redis()
    const run = await this.loadRun(redis, runId)
    if (!run || run.userId !== userId || !['pending', 'running'].includes(run.status)) return null
    const cancelled: DiyCloudCachedRun = {
      ...run,
      status: 'cancelled',
      updatedAt: new Date().toISOString(),
    }
    await this.saveRun(redis, cancelled)
    await this.appendEvent(runId, {
      type: 'run.cancelled',
      payload: { status: 'cancelled' },
    })
    return cancelled
  }

  async startPendingRun(userId: string, runId: string, signal?: AbortSignal) {
    const claimed = await this.claimPending(userId, runId)
    if (!claimed) return false

    const state: DiyCloudStepOrderState = { seenSteps: new Set(), nextOrder: 1 }
    await this.appendEvent(runId, {
      type: 'run.started',
      payload: { status: 'running' },
    })

    try {
      const input = claimed.input as DiyCloudGenerateInput
      const draft = await runDiyCloudPlanner(input, {
        signal,
        onProgress: async (event) => {
          await this.appendPlannerEvent(runId, event, state)
        },
      })
      await this.complete(runId, toDraftRecord(draft))
      return true
    } catch (err) {
      const message = publicRunError(err)
      await this.fail(runId, message)
      await this.appendEvent(runId, {
        type: 'run.failed',
        payload: {
          error: message,
          code:
            err && typeof err === 'object' && 'code' in err
              ? String((err as { code?: unknown }).code)
              : undefined,
          retryable: !(err instanceof DOMException && err.name === 'AbortError'),
        },
      })
      return true
    }
  }

  private async claimPending(userId: string, runId: string) {
    const redis = await this.redis()
    const run = await this.loadRun(redis, runId)
    if (!run || run.userId !== userId || run.status !== 'pending') return null
    const claimed = await redis.set(claimKey(runId), userId, {
      EX: DIY_CLOUD_RUN_TTL_SECONDS,
      NX: true,
    })
    if (claimed !== 'OK') return null
    const latest = await this.loadRun(redis, runId)
    if (!latest || latest.userId !== userId || latest.status !== 'pending') return null
    const updated: DiyCloudCachedRun = {
      ...latest,
      status: 'running',
      updatedAt: new Date().toISOString(),
    }
    await this.saveRun(redis, updated)
    return updated
  }

  private async complete(runId: string, draft: Record<string, unknown>) {
    const redis = await this.redis()
    const run = await this.loadRun(redis, runId)
    if (!run) return null
    const updated: DiyCloudCachedRun = {
      ...run,
      status: 'completed',
      draft,
      error: null,
      updatedAt: new Date().toISOString(),
    }
    await this.saveRun(redis, updated)
    return updated
  }

  private async fail(runId: string, error: string) {
    const redis = await this.redis()
    const run = await this.loadRun(redis, runId)
    if (!run) return null
    const updated: DiyCloudCachedRun = {
      ...run,
      status: 'failed',
      error,
      updatedAt: new Date().toISOString(),
    }
    await this.saveRun(redis, updated)
    return updated
  }

  private async appendEvent(
    runId: string,
    data: { type: string; stepId?: string | null; payload: Record<string, unknown> },
  ) {
    const redis = await this.redis()
    const seq = Number(await redis.incr(seqKey(runId)))
    const payload = {
      schemaVersion: 2,
      seq,
      runId,
      eventId: randomUUID(),
      timestamp: new Date().toISOString(),
      ...data.payload,
      type: data.type,
    }
    const event: DiyCloudCachedRunEvent = {
      runId,
      seq,
      type: data.type,
      stepId: data.stepId ?? null,
      payload: redactJson(payload) as Record<string, unknown>,
    }
    await redis.rPush(eventsKey(runId), JSON.stringify(event))
    await this.refreshRunTtl(redis, runId)
    return event
  }

  private async appendPlannerEvent(
    runId: string,
    event: DiyCloudProgressEvent,
    state: DiyCloudStepOrderState,
  ) {
    if (event.type === 'draft') {
      const draft = toDraftRecord(event.draft)
      await this.appendEvent(runId, {
        type: 'artifact.patch',
        stepId: 'review',
        payload: {
          stepId: 'review',
          artifact: 'cloudConfig',
          patch: toRecord(draft.template),
        },
      })
      await this.appendEvent(runId, {
        type: 'artifact.patch',
        stepId: 'review',
        payload: {
          stepId: 'review',
          artifact: 'guidebook',
          patch: toRecord(draft.guidebook),
        },
      })
      await this.appendEvent(runId, {
        type: 'draft.completed',
        stepId: 'review',
        payload: { draft },
      })
      return
    }

    if (!state.seenSteps.has(event.step)) {
      state.seenSteps.add(event.step)
      await this.appendEvent(runId, {
        type: 'step.created',
        stepId: event.step,
        payload: {
          stepId: event.step,
          title: event.title,
          intent: event.detail,
          order: state.nextOrder,
          iconHint: event.step === 'generate' ? 'build' : event.step,
        },
      })
      state.nextOrder += 1
    }

    await this.appendEvent(runId, {
      type: 'step.delta',
      stepId: event.step,
      payload: {
        stepId: event.step,
        channel: event.channel ?? (event.status === 'running' ? 'status' : 'summary'),
        delta: event.detail,
        status: event.status,
        title: event.title,
        meta: compactProgressMeta(event.meta ?? {}),
      },
    })

    if (event.output) {
      const result = toRecord(redactJson(event.output.result))
      const evidence = Object.entries(result)
        .slice(0, 8)
        .map(([key, value]) => ({
          source:
            event.step === 'validate' ? 'validator' : event.step === 'search' ? 'plugin' : 'user',
          ref: key,
          summary: typeof value === 'string' ? value : JSON.stringify(value).slice(0, 220),
        }))
      await this.appendEvent(runId, {
        type: 'decision',
        stepId: event.step,
        payload: {
          stepId: event.step,
          decisionId: `${event.step}-${event.output.generatedAt}`,
          title: event.output.title,
          selected: event.title,
          basis: {
            observations: [event.detail],
            constraints: event.output.reasons,
            evidence,
            rejectedOptions: [],
            confidence: event.output.confidence ?? null,
            needsUserReview: event.status === 'warning' || event.step === 'review',
          },
          output: compactStepOutput(event.output),
        },
      })
    }
  }
}
