import { randomUUID } from 'node:crypto'
import type { UserDao } from '../dao/user.dao'
import type { SafeHttpClient } from '../gateways/safe-http-client'
import { logger } from '../lib/logger'
import { isModelProxyToken, verifyModelProxyToken } from '../lib/model-proxy-token'
import type { LedgerService } from './ledger.service'

type ChatCompletionsBody = Record<string, unknown>
type AnthropicMessagesBody = Record<string, unknown>

type ModelProxyIdentity = {
  userId: string
  source: 'model_proxy_token' | 'user_token'
}

type Usage = {
  promptTokens: number
  promptCacheHitTokens: number
  promptCacheMissTokens: number
  completionTokens: number
  totalTokens: number
}

type ReservedCharge = {
  referenceId: string
  model: string
  amount: number
  amountMicros: number
}

type ModelProxyBillingConfig = {
  shrimpMicrosPerCoin: number
  shrimpPerCny: number
  inputTokensPerShrimp: number | null
  outputTokensPerShrimp: number | null
  inputCacheHitCnyPerMillionTokens: number
  inputCacheMissCnyPerMillionTokens: number
  outputCnyPerMillionTokens: number
  inputCacheHitShrimpPerMillionTokens: number
  inputCacheMissShrimpPerMillionTokens: number
  outputShrimpPerMillionTokens: number
}

const DEFAULT_MODEL = 'deepseek-v4-flash'
const PUBLIC_MODEL_ALIAS = 'default'
const DEFAULT_SHRIMP_MICROS_PER_COIN = 1_000_000
const WALLET_RECHARGE_MARKER = 'shadow:wallet-recharge'

function parsePositiveNumberEnv(key: string) {
  const value = Number.parseFloat(process.env[key] ?? '')
  return Number.isFinite(value) && value > 0 ? value : null
}

function parsePositiveNumberEnvWithFallback(key: string, fallback: number) {
  return parsePositiveNumberEnv(key) ?? fallback
}

function parseIntegerEnv(key: string, fallback: number) {
  const value = Number.parseInt(process.env[key] ?? '', 10)
  return Number.isFinite(value) ? value : fallback
}

function parsePositiveIntegerEnv(key: string, fallback: number) {
  const value = Number.parseInt(process.env[key] ?? '', 10)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function firstNonEmptyEnv(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim()
    if (value) return value
  }
  return null
}

function upstreamBaseUrl() {
  return firstNonEmptyEnv('SHADOW_MODEL_PROXY_UPSTREAM_BASE_URL')?.replace(/\/+$/, '') ?? null
}

function upstreamAnthropicBaseUrl() {
  const configured = firstNonEmptyEnv('SHADOW_MODEL_PROXY_UPSTREAM_ANTHROPIC_BASE_URL')
  if (configured) return configured.replace(/\/+$/, '')

  const openAIBaseUrl = upstreamBaseUrl()
  if (!openAIBaseUrl) return null
  try {
    const parsed = new URL(openAIBaseUrl)
    if (parsed.hostname === 'api.deepseek.com') {
      return `${parsed.origin}/anthropic`
    }
  } catch {
    return null
  }
  return null
}

function upstreamApiKey() {
  return firstNonEmptyEnv('SHADOW_MODEL_PROXY_UPSTREAM_API_KEY')
}

function upstreamAnthropicApiKey() {
  return firstNonEmptyEnv(
    'SHADOW_MODEL_PROXY_UPSTREAM_ANTHROPIC_API_KEY',
    'SHADOW_MODEL_PROXY_UPSTREAM_API_KEY',
  )
}

function defaultModel() {
  return (
    firstNonEmptyEnv('SHADOW_MODEL_PROXY_MODEL', 'SHADOW_MODEL_PROXY_DEFAULT_MODEL') ??
    DEFAULT_MODEL
  )
}

function allowedModels() {
  const configured = process.env.SHADOW_MODEL_PROXY_ALLOWED_MODELS?.split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  return configured && configured.length > 0
    ? [...new Set([defaultModel(), ...configured])]
    : [defaultModel()]
}

function publicModels() {
  return [PUBLIC_MODEL_ALIAS]
}

function modelResponse(modelId: string) {
  return {
    id: modelId,
    object: 'model',
    created: 0,
    owned_by: 'shadow-official',
  }
}

function normalizeModel(model: unknown) {
  const candidate = typeof model === 'string' && model.trim() ? model.trim() : defaultModel()
  if (
    candidate === 'default' ||
    candidate === 'shadow-default' ||
    candidate === 'shadow-official'
  ) {
    return defaultModel()
  }
  const allowed = allowedModels()
  if (!allowed.includes(candidate)) {
    throw Object.assign(new Error(`Model is not available: ${candidate}`), {
      status: 400,
      code: 'MODEL_PROXY_MODEL_NOT_ALLOWED',
    })
  }
  return candidate
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function collectText(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(collectText).join('\n')
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (typeof record.text === 'string') return record.text
    if (typeof record.content === 'string') return record.content
    return Object.values(record).map(collectText).join('\n')
  }
  return ''
}

function estimateTokensFromText(text: string) {
  if (!text) return 0
  return Math.max(1, Math.ceil(text.length / 4))
}

function estimatePromptTokens(body: ChatCompletionsBody) {
  const messagesText = collectText(body.messages)
  const toolsText = collectText(body.tools)
  return estimateTokensFromText(`${messagesText}\n${toolsText}`.trim())
}

function estimateMaxOutputTokens(body: ChatCompletionsBody) {
  const explicit = Number(body.max_tokens ?? body.max_completion_tokens)
  const fallback = parseIntegerEnv('SHADOW_MODEL_PROXY_DEFAULT_MAX_OUTPUT_TOKENS', 2048)
  const hardMax = parseIntegerEnv('SHADOW_MODEL_PROXY_MAX_OUTPUT_TOKENS', 8192)
  return clamp(Number.isFinite(explicit) && explicit > 0 ? explicit : fallback, 1, hardMax)
}

function usageFromResponse(data: unknown): Usage | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const usage = (data as Record<string, unknown>).usage
  if (!usage || typeof usage !== 'object' || Array.isArray(usage)) return null
  const record = usage as Record<string, unknown>
  const promptTokensRaw = Number(record.prompt_tokens ?? record.input_tokens ?? 0)
  const promptCacheHitTokens = Number(
    record.prompt_cache_hit_tokens ?? record.input_cache_hit_tokens ?? record.cache_hit_tokens ?? 0,
  )
  const explicitCacheMissTokens = Number(
    record.prompt_cache_miss_tokens ??
      record.input_cache_miss_tokens ??
      record.cache_miss_tokens ??
      Number.NaN,
  )
  const completionTokens = Number(record.completion_tokens ?? record.output_tokens ?? 0)
  const promptTokens = Number.isFinite(promptTokensRaw) ? Math.max(0, promptTokensRaw) : 0
  const cacheHit = Number.isFinite(promptCacheHitTokens) ? Math.max(0, promptCacheHitTokens) : 0
  const cacheMiss = Number.isFinite(explicitCacheMissTokens)
    ? Math.max(0, explicitCacheMissTokens)
    : Math.max(0, promptTokens - cacheHit)
  const normalizedPromptTokens = Math.max(promptTokens, cacheHit + cacheMiss)
  const totalTokens = Number(record.total_tokens ?? normalizedPromptTokens + completionTokens)
  if (!Number.isFinite(promptTokensRaw) && !Number.isFinite(completionTokens)) return null
  return {
    promptTokens: normalizedPromptTokens,
    promptCacheHitTokens: Math.min(cacheHit, normalizedPromptTokens),
    promptCacheMissTokens: Math.min(cacheMiss, normalizedPromptTokens),
    completionTokens: Number.isFinite(completionTokens) ? Math.max(0, completionTokens) : 0,
    totalTokens: Number.isFinite(totalTokens)
      ? Math.max(0, totalTokens)
      : Math.max(0, normalizedPromptTokens + completionTokens),
  }
}

function outputTextFromResponse(data: unknown) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return ''
  const content = (data as Record<string, unknown>).content
  const contentText = collectText(content)
  if (contentText) return contentText
  const choices = (data as Record<string, unknown>).choices
  if (!Array.isArray(choices)) return ''
  return choices
    .map((choice) => {
      if (!choice || typeof choice !== 'object') return ''
      const record = choice as Record<string, unknown>
      return collectText(record.message) || collectText(record.delta) || collectText(record.text)
    })
    .join('\n')
}

function modelProxyBillingConfig(): ModelProxyBillingConfig {
  const shrimpMicrosPerCoin = parsePositiveIntegerEnv(
    'SHADOW_MODEL_PROXY_SHRIMP_MICROS_PER_COIN',
    DEFAULT_SHRIMP_MICROS_PER_COIN,
  )
  const shrimpPerCny = parsePositiveNumberEnvWithFallback('SHADOW_MODEL_PROXY_SHRIMP_PER_CNY', 20)
  const useLegacyTokenRatio = process.env.SHADOW_MODEL_PROXY_BILLING_MODE === 'token_ratio'
  const sharedTokensPerShrimp = useLegacyTokenRatio
    ? parsePositiveNumberEnv('SHADOW_MODEL_PROXY_TOKENS_PER_SHRIMP')
    : null
  const inputTokensPerShrimp = useLegacyTokenRatio
    ? (parsePositiveNumberEnv('SHADOW_MODEL_PROXY_INPUT_TOKENS_PER_SHRIMP') ??
      sharedTokensPerShrimp)
    : null
  const outputTokensPerShrimp = useLegacyTokenRatio
    ? (parsePositiveNumberEnv('SHADOW_MODEL_PROXY_OUTPUT_TOKENS_PER_SHRIMP') ??
      sharedTokensPerShrimp)
    : null
  const inputCacheHitCnyPerMillionTokens = parsePositiveNumberEnvWithFallback(
    'SHADOW_MODEL_PROXY_INPUT_CACHE_HIT_CNY_PER_MILLION',
    0.02,
  )
  const inputCacheMissCnyPerMillionTokens = parsePositiveNumberEnvWithFallback(
    'SHADOW_MODEL_PROXY_INPUT_CACHE_MISS_CNY_PER_MILLION',
    1,
  )
  const outputCnyPerMillionTokens = parsePositiveNumberEnvWithFallback(
    'SHADOW_MODEL_PROXY_OUTPUT_CNY_PER_MILLION',
    2,
  )
  const inputCacheHitShrimpPerMillionTokens =
    parsePositiveNumberEnv('SHADOW_MODEL_PROXY_INPUT_CACHE_HIT_SHRIMP_PER_MILLION') ??
    inputCacheHitCnyPerMillionTokens * shrimpPerCny
  const inputCacheMissShrimpPerMillionTokens =
    parsePositiveNumberEnv('SHADOW_MODEL_PROXY_INPUT_CACHE_MISS_SHRIMP_PER_MILLION') ??
    inputCacheMissCnyPerMillionTokens * shrimpPerCny
  const outputShrimpPerMillionTokens =
    parsePositiveNumberEnv('SHADOW_MODEL_PROXY_OUTPUT_SHRIMP_PER_MILLION') ??
    outputCnyPerMillionTokens * shrimpPerCny

  return {
    shrimpMicrosPerCoin,
    shrimpPerCny,
    inputTokensPerShrimp,
    outputTokensPerShrimp,
    inputCacheHitCnyPerMillionTokens,
    inputCacheMissCnyPerMillionTokens,
    outputCnyPerMillionTokens,
    inputCacheHitShrimpPerMillionTokens,
    inputCacheMissShrimpPerMillionTokens,
    outputShrimpPerMillionTokens,
  }
}

function priceMicrosForUsage(
  usage: Pick<
    Usage,
    'promptTokens' | 'promptCacheHitTokens' | 'promptCacheMissTokens' | 'completionTokens'
  >,
) {
  const billing = modelProxyBillingConfig()
  const rawShrimp =
    billing.inputTokensPerShrimp || billing.outputTokensPerShrimp
      ? usage.promptTokens /
          (billing.inputTokensPerShrimp ?? billing.outputTokensPerShrimp ?? 1000) +
        usage.completionTokens /
          (billing.outputTokensPerShrimp ?? billing.inputTokensPerShrimp ?? 1000)
      : (usage.promptCacheHitTokens / 1_000_000) * billing.inputCacheHitShrimpPerMillionTokens +
        (usage.promptCacheMissTokens / 1_000_000) * billing.inputCacheMissShrimpPerMillionTokens +
        (usage.completionTokens / 1_000_000) * billing.outputShrimpPerMillionTokens
  if (!Number.isFinite(rawShrimp) || rawShrimp <= 0) return 0
  return Math.max(1, Math.ceil(rawShrimp * billing.shrimpMicrosPerCoin))
}

function reserveAmountForMicros(amountMicros: number) {
  if (amountMicros <= 0) return 0
  const billing = modelProxyBillingConfig()
  return Math.ceil(amountMicros / billing.shrimpMicrosPerCoin)
}

function usageFromEstimate(body: ChatCompletionsBody): Usage {
  const promptTokens = estimatePromptTokens(body)
  const completionTokens = estimateMaxOutputTokens(body)
  return {
    promptTokens,
    promptCacheHitTokens: 0,
    promptCacheMissTokens: promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  }
}

function buildWalletRechargeMarker(input: {
  requiredAmount?: number
  balance?: number
  shortfall?: number
  model: string
}) {
  const encoded = Buffer.from(
    JSON.stringify({
      ...input,
      reason: 'official_model_balance_insufficient',
      action: 'earn_or_recharge',
    }),
    'utf8',
  ).toString('base64url')
  return `<!-- ${WALLET_RECHARGE_MARKER} ${encoded} -->`
}

function buildWalletRechargeContent(input: {
  requiredAmount?: number
  balance?: number
  shortfall?: number
  model: string
}) {
  return buildWalletRechargeMarker(input)
}

function chatCompletionRechargeResponse(input: {
  model: string
  requiredAmount?: number
  balance?: number
  shortfall?: number
}) {
  const content = buildWalletRechargeContent(input)
  return new Response(
    JSON.stringify({
      id: `chatcmpl-shadow-recharge-${randomUUID()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: input.model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content,
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      },
      shadow: {
        type: 'wallet_recharge_required',
        requiredAmount: input.requiredAmount,
        balance: input.balance,
        shortfall: input.shortfall,
      },
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Shadow-Recharge-Required': 'true',
      },
    },
  )
}

function chatCompletionRechargeStream(input: {
  model: string
  requiredAmount?: number
  balance?: number
  shortfall?: number
}) {
  const id = `chatcmpl-shadow-recharge-${randomUUID()}`
  const created = Math.floor(Date.now() / 1000)
  const content = buildWalletRechargeContent(input)
  const encoder = new TextEncoder()
  const chunks = [
    {
      id,
      object: 'chat.completion.chunk',
      created,
      model: input.model,
      choices: [{ index: 0, delta: { role: 'assistant', content }, finish_reason: null }],
    },
    {
      id,
      object: 'chat.completion.chunk',
      created,
      model: input.model,
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    },
  ]
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`))
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      },
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
        'X-Shadow-Recharge-Required': 'true',
      },
    },
  )
}

function anthropicRechargeResponse(input: {
  model: string
  requiredAmount?: number
  balance?: number
  shortfall?: number
}) {
  const content = buildWalletRechargeContent(input)
  return new Response(
    JSON.stringify({
      id: `msg_shadow_recharge_${randomUUID()}`,
      type: 'message',
      role: 'assistant',
      model: input.model,
      content: [{ type: 'text', text: content }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: {
        input_tokens: 0,
        output_tokens: 0,
      },
      shadow: {
        type: 'wallet_recharge_required',
        requiredAmount: input.requiredAmount,
        balance: input.balance,
        shortfall: input.shortfall,
      },
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Shadow-Recharge-Required': 'true',
      },
    },
  )
}

function anthropicRechargeStream(input: {
  model: string
  requiredAmount?: number
  balance?: number
  shortfall?: number
}) {
  const id = `msg_shadow_recharge_${randomUUID()}`
  const content = buildWalletRechargeContent(input)
  const encoder = new TextEncoder()
  const events = [
    [
      'message_start',
      {
        type: 'message_start',
        message: {
          id,
          type: 'message',
          role: 'assistant',
          model: input.model,
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 0, output_tokens: 0 },
        },
      },
    ],
    [
      'content_block_start',
      {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      },
    ],
    [
      'content_block_delta',
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: content },
      },
    ],
    ['content_block_stop', { type: 'content_block_stop', index: 0 }],
    [
      'message_delta',
      {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn', stop_sequence: null },
        usage: { output_tokens: 0 },
      },
    ],
    ['message_stop', { type: 'message_stop' }],
  ] as const

  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const [event, data] of events) {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
        }
        controller.close()
      },
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
        'X-Shadow-Recharge-Required': 'true',
      },
    },
  )
}

function openAIErrorResponse(status: number, message: string, code: string, extra = {}) {
  return new Response(
    JSON.stringify({
      error: {
        message,
        type: status === 402 ? 'insufficient_balance' : 'invalid_request_error',
        code,
        ...extra,
      },
    }),
    {
      status,
      headers: { 'Content-Type': 'application/json' },
    },
  )
}

function anthropicErrorResponse(status: number, message: string, code: string, extra = {}) {
  return new Response(
    JSON.stringify({
      type: 'error',
      error: {
        type: status === 401 ? 'authentication_error' : 'api_error',
        message,
        code,
        ...extra,
      },
    }),
    {
      status,
      headers: { 'Content-Type': 'application/json' },
    },
  )
}

function filteredResponseHeaders(headers: Headers) {
  const out = new Headers()
  const contentType = headers.get('content-type')
  if (contentType) out.set('Content-Type', contentType)
  const requestId = headers.get('x-request-id') ?? headers.get('x-ds-request-id')
  if (requestId) out.set('X-Upstream-Request-Id', requestId)
  return out
}

function parseBearer(authHeader?: string | null) {
  const match = authHeader?.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}

function buildUpstreamBody(body: ChatCompletionsBody, model: string) {
  const next: ChatCompletionsBody = { ...body, model }
  if (next.stream === true) {
    const streamOptions =
      next.stream_options &&
      typeof next.stream_options === 'object' &&
      !Array.isArray(next.stream_options)
        ? (next.stream_options as Record<string, unknown>)
        : {}
    next.stream_options = { ...streamOptions, include_usage: true }
  }
  return next
}

function buildUpstreamAnthropicBody(body: AnthropicMessagesBody, model: string) {
  const next: AnthropicMessagesBody = { ...body, model }
  if (!Number.isFinite(Number(next.max_tokens))) {
    next.max_tokens = estimateMaxOutputTokens(next)
  }
  return next
}

export class ModelProxyService {
  constructor(
    private deps: {
      ledgerService: LedgerService
      userDao: UserDao
      safeHttpClient: SafeHttpClient
    },
  ) {}

  modelsResponse() {
    return {
      object: 'list',
      data: publicModels().map((model) => modelResponse(model)),
    }
  }

  modelResponse(model: string) {
    const requested = model.trim()
    if (!requested) {
      throw Object.assign(new Error('Model id is required'), {
        status: 400,
        code: 'MODEL_PROXY_INVALID_REQUEST',
      })
    }
    normalizeModel(requested)
    return modelResponse(requested)
  }

  billingResponse() {
    const billing = modelProxyBillingConfig()
    return {
      enabled: process.env.SHADOW_MODEL_PROXY_ENABLED !== 'false',
      currency: 'shrimp' as const,
      model: PUBLIC_MODEL_ALIAS,
      models: publicModels(),
      shrimpMicrosPerCoin: billing.shrimpMicrosPerCoin,
      shrimpPerCny: billing.shrimpPerCny,
      inputTokensPerShrimp: billing.inputTokensPerShrimp,
      outputTokensPerShrimp: billing.outputTokensPerShrimp,
      inputCacheHitCnyPerMillionTokens: billing.inputCacheHitCnyPerMillionTokens,
      inputCacheMissCnyPerMillionTokens: billing.inputCacheMissCnyPerMillionTokens,
      outputCnyPerMillionTokens: billing.outputCnyPerMillionTokens,
      inputCacheHitShrimpPerMillionTokens: billing.inputCacheHitShrimpPerMillionTokens,
      inputCacheMissShrimpPerMillionTokens: billing.inputCacheMissShrimpPerMillionTokens,
      outputShrimpPerMillionTokens: billing.outputShrimpPerMillionTokens,
    }
  }

  async resolveIdentity(authHeader?: string | null): Promise<ModelProxyIdentity> {
    const token = parseBearer(authHeader)
    if (!token) {
      throw Object.assign(new Error('Missing bearer token'), {
        status: 401,
        code: 'MODEL_PROXY_UNAUTHORIZED',
      })
    }

    if (isModelProxyToken(token)) {
      const payload = verifyModelProxyToken(token)
      const user = await this.deps.userDao.findById(payload.userId)
      if (!user) {
        throw Object.assign(new Error('Model proxy user no longer exists'), {
          status: 401,
          code: 'MODEL_PROXY_UNAUTHORIZED',
        })
      }
      return { userId: payload.userId, source: 'model_proxy_token' }
    }

    const { verifyToken } = await import('../lib/jwt')
    const payload = verifyToken(token, 'access')
    const user = await this.deps.userDao.findById(payload.userId)
    if (!user) {
      throw Object.assign(new Error('Invalid bearer token'), {
        status: 401,
        code: 'MODEL_PROXY_UNAUTHORIZED',
      })
    }
    return { userId: payload.userId, source: 'user_token' }
  }

  private requireUpstreamConfig(style: 'openai' | 'anthropic' = 'openai') {
    const apiKey = style === 'anthropic' ? upstreamAnthropicApiKey() : upstreamApiKey()
    const baseUrl = style === 'anthropic' ? upstreamAnthropicBaseUrl() : upstreamBaseUrl()
    if (!apiKey || !baseUrl) {
      throw Object.assign(new Error('Official model provider is not configured'), {
        status: 503,
        code: 'MODEL_PROXY_PROVIDER_UNCONFIGURED',
      })
    }
    return { apiKey, baseUrl }
  }

  private async reserve(identity: ModelProxyIdentity, body: ChatCompletionsBody, model: string) {
    const referenceId = randomUUID()
    const amountMicros = priceMicrosForUsage(usageFromEstimate(body))
    const amount = reserveAmountForMicros(amountMicros)
    if (amount <= 0) return { referenceId, model, amount, amountMicros }
    await this.deps.ledgerService.debit({
      userId: identity.userId,
      amount,
      type: 'purchase',
      referenceId,
      referenceType: 'model_proxy',
      note: `Official model usage reserve (${model})`,
    })
    return { referenceId, model, amount, amountMicros }
  }

  private async settle(
    identity: ModelProxyIdentity,
    charge: ReservedCharge,
    actualAmountMicros: number,
  ) {
    await this.deps.ledgerService.settleReservedMicros(
      identity.userId,
      actualAmountMicros,
      charge.amount,
      'model_proxy',
      charge.referenceId,
      'model_proxy',
      `Official model usage (${charge.model})`,
    )
  }

  private async refundReserve(identity: ModelProxyIdentity, charge: ReservedCharge) {
    if (charge.amount <= 0) return
    await this.deps.ledgerService
      .credit({
        userId: identity.userId,
        amount: charge.amount,
        type: 'refund',
        referenceId: charge.referenceId,
        referenceType: 'model_proxy',
        note: `Official model usage refund (${charge.model})`,
      })
      .catch((err) =>
        logger.warn({ err, userId: identity.userId }, 'Failed to refund model reserve'),
      )
  }

  async proxyChatCompletions(
    identity: ModelProxyIdentity,
    body: ChatCompletionsBody,
    signal?: AbortSignal,
  ) {
    if (!Array.isArray(body.messages)) {
      return openAIErrorResponse(400, 'messages must be an array', 'MODEL_PROXY_INVALID_REQUEST')
    }

    let model = defaultModel()
    let upstream: { apiKey: string; baseUrl: string }
    let charge: ReservedCharge
    try {
      model = normalizeModel(body.model)
      upstream = this.requireUpstreamConfig()
      charge = await this.reserve(identity, body, model)
    } catch (err) {
      const error = err as {
        status?: number
        code?: string
        requiredAmount?: number
        balance?: number
        shortfall?: number
        nextAction?: string
      }
      if ((error.status ?? 500) === 402 || error.code === 'WALLET_INSUFFICIENT_BALANCE') {
        const rechargeInput = {
          model,
          requiredAmount: error.requiredAmount,
          balance: error.balance,
          shortfall: error.shortfall,
        }
        return body.stream === true
          ? chatCompletionRechargeStream(rechargeInput)
          : chatCompletionRechargeResponse(rechargeInput)
      }
      return openAIErrorResponse(
        error.status ?? 500,
        err instanceof Error ? err.message : 'Model proxy failed',
        error.code ?? 'MODEL_PROXY_ERROR',
        {
          ...(typeof error.requiredAmount === 'number'
            ? { requiredAmount: error.requiredAmount }
            : {}),
          ...(typeof error.balance === 'number' ? { balance: error.balance } : {}),
          ...(typeof error.shortfall === 'number' ? { shortfall: error.shortfall } : {}),
          ...(error.nextAction ? { nextAction: error.nextAction } : {}),
        },
      )
    }

    const upstreamBody = buildUpstreamBody(body, model)
    let response: Response
    try {
      response = await this.deps.safeHttpClient.fetch(`${upstream.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Accept: body.stream === true ? 'text/event-stream' : 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${upstream.apiKey}`,
        },
        body: JSON.stringify(upstreamBody),
        signal,
      })
    } catch (err) {
      await this.refundReserve(identity, charge)
      logger.warn({ err, userId: identity.userId }, 'Official model upstream request failed')
      return openAIErrorResponse(502, 'Model provider request failed', 'MODEL_PROXY_UPSTREAM_ERROR')
    }

    if (!response.ok) {
      await this.refundReserve(identity, charge)
      if (response.status === 401 || response.status === 403) {
        logger.error(
          { status: response.status, userId: identity.userId },
          'Official model upstream authentication failed',
        )
        return openAIErrorResponse(
          503,
          'Official model provider authentication failed',
          'MODEL_PROXY_PROVIDER_AUTH_FAILED',
        )
      }
      logger.warn(
        { status: response.status, userId: identity.userId },
        'Official model upstream returned an error',
      )
      return openAIErrorResponse(
        response.status >= 500 || response.status === 429 ? 503 : 400,
        response.status === 429
          ? 'Official model provider is busy. Please try again later.'
          : 'Official model provider rejected the request.',
        'MODEL_PROXY_UPSTREAM_REJECTED',
      )
    }

    if (body.stream === true) {
      return this.proxyStreamingResponse(response, identity, charge, body)
    }

    return this.proxyJsonResponse(response, identity, charge, body)
  }

  async proxyAnthropicMessages(
    identity: ModelProxyIdentity,
    body: AnthropicMessagesBody,
    signal?: AbortSignal,
  ) {
    if (!Array.isArray(body.messages)) {
      return anthropicErrorResponse(400, 'messages must be an array', 'MODEL_PROXY_INVALID_REQUEST')
    }

    let model = defaultModel()
    let upstream: { apiKey: string; baseUrl: string }
    let charge: ReservedCharge
    try {
      model = normalizeModel(body.model)
      upstream = this.requireUpstreamConfig('anthropic')
      charge = await this.reserve(identity, body, model)
    } catch (err) {
      const error = err as {
        status?: number
        code?: string
        requiredAmount?: number
        balance?: number
        shortfall?: number
        nextAction?: string
      }
      if ((error.status ?? 500) === 402 || error.code === 'WALLET_INSUFFICIENT_BALANCE') {
        const rechargeInput = {
          model,
          requiredAmount: error.requiredAmount,
          balance: error.balance,
          shortfall: error.shortfall,
        }
        return body.stream === true
          ? anthropicRechargeStream(rechargeInput)
          : anthropicRechargeResponse(rechargeInput)
      }
      return anthropicErrorResponse(
        error.status ?? 500,
        err instanceof Error ? err.message : 'Model proxy failed',
        error.code ?? 'MODEL_PROXY_ERROR',
        {
          ...(typeof error.requiredAmount === 'number'
            ? { requiredAmount: error.requiredAmount }
            : {}),
          ...(typeof error.balance === 'number' ? { balance: error.balance } : {}),
          ...(typeof error.shortfall === 'number' ? { shortfall: error.shortfall } : {}),
          ...(error.nextAction ? { nextAction: error.nextAction } : {}),
        },
      )
    }

    const upstreamBody = buildUpstreamAnthropicBody(body, model)
    let response: Response
    try {
      response = await this.deps.safeHttpClient.fetch(`${upstream.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          Accept: body.stream === true ? 'text/event-stream' : 'application/json',
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          Authorization: `Bearer ${upstream.apiKey}`,
        },
        body: JSON.stringify(upstreamBody),
        signal,
      })
    } catch (err) {
      await this.refundReserve(identity, charge)
      logger.warn({ err, userId: identity.userId }, 'Official Anthropic upstream request failed')
      return anthropicErrorResponse(
        502,
        'Model provider request failed',
        'MODEL_PROXY_UPSTREAM_ERROR',
      )
    }

    if (!response.ok) {
      await this.refundReserve(identity, charge)
      if (response.status === 401 || response.status === 403) {
        logger.error(
          { status: response.status, userId: identity.userId },
          'Official Anthropic upstream authentication failed',
        )
        return anthropicErrorResponse(
          503,
          'Official model provider authentication failed',
          'MODEL_PROXY_PROVIDER_AUTH_FAILED',
        )
      }
      logger.warn(
        { status: response.status, userId: identity.userId },
        'Official Anthropic upstream returned an error',
      )
      return anthropicErrorResponse(
        response.status >= 500 || response.status === 429 ? 503 : 400,
        response.status === 429
          ? 'Official model provider is busy. Please try again later.'
          : 'Official model provider rejected the request.',
        'MODEL_PROXY_UPSTREAM_REJECTED',
      )
    }

    if (body.stream === true) {
      return this.proxyAnthropicStreamingResponse(response, identity, charge, body)
    }

    return this.proxyJsonResponse(response, identity, charge, body)
  }

  private async proxyJsonResponse(
    response: Response,
    identity: ModelProxyIdentity,
    charge: ReservedCharge,
    requestBody: ChatCompletionsBody,
  ) {
    const text = await response.text()
    let data: unknown = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = null
    }
    const usage = usageFromResponse(data) ?? {
      promptTokens: estimatePromptTokens(requestBody),
      promptCacheHitTokens: 0,
      promptCacheMissTokens: estimatePromptTokens(requestBody),
      completionTokens: estimateTokensFromText(outputTextFromResponse(data) || text),
      totalTokens: 0,
    }
    const actualAmountMicros = priceMicrosForUsage(usage)
    try {
      await this.settle(identity, charge, actualAmountMicros)
    } catch (err) {
      logger.warn({ err, userId: identity.userId }, 'Failed to settle model usage')
    }

    const headers = filteredResponseHeaders(response.headers)
    headers.set('X-Shadow-Shrimp-Cost-Micros', String(actualAmountMicros))
    headers.set('X-Shadow-Shrimp-Reserved', String(charge.amount))
    return new Response(text, { status: response.status, headers })
  }

  private proxyStreamingResponse(
    response: Response,
    identity: ModelProxyIdentity,
    charge: ReservedCharge,
    requestBody: ChatCompletionsBody,
  ) {
    if (!response.body) {
      void this.refundReserve(identity, charge)
      return openAIErrorResponse(
        502,
        'Model provider returned an empty stream',
        'MODEL_PROXY_UPSTREAM_ERROR',
      )
    }

    const decoder = new TextDecoder()
    const reader = response.body.getReader()
    let buffer = ''
    let outputText = ''
    let usage: Usage | null = null
    let settled = false

    const captureEvent = (event: string) => {
      const dataLines = event
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
      if (dataLines.length === 0) return
      const data = dataLines.join('\n').trim()
      if (!data || data === '[DONE]') return
      try {
        const parsed = JSON.parse(data) as unknown
        usage = usageFromResponse(parsed) ?? usage
        outputText += outputTextFromResponse(parsed)
      } catch {
        // Keep streaming; malformed individual SSE chunks should not break passthrough.
      }
    }

    const settleOnce = async () => {
      if (settled) return
      settled = true
      const finalUsage = usage ?? {
        promptTokens: estimatePromptTokens(requestBody),
        promptCacheHitTokens: 0,
        promptCacheMissTokens: estimatePromptTokens(requestBody),
        completionTokens: estimateTokensFromText(outputText),
        totalTokens: 0,
      }
      const actualAmountMicros = priceMicrosForUsage(finalUsage)
      try {
        await this.settle(identity, charge, actualAmountMicros)
      } catch (err) {
        logger.warn({ err, userId: identity.userId }, 'Failed to settle streaming model usage')
      }
    }

    let closed = false
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const enqueue = (value: Uint8Array) => {
          if (closed) return false
          try {
            controller.enqueue(value)
            return true
          } catch (err) {
            closed = true
            if ((err as { code?: string }).code !== 'ERR_INVALID_STATE') throw err
            return false
          }
        }
        const close = () => {
          if (closed) return
          closed = true
          try {
            controller.close()
          } catch (err) {
            if ((err as { code?: string }).code !== 'ERR_INVALID_STATE') throw err
          }
        }
        const error = (err: unknown) => {
          if (closed) return
          closed = true
          try {
            controller.error(err)
          } catch (controllerErr) {
            if ((controllerErr as { code?: string }).code !== 'ERR_INVALID_STATE') {
              throw controllerErr
            }
          }
        }
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            if (value) {
              const text = decoder.decode(value, { stream: true })
              buffer += text
              const events = buffer.split(/\r?\n\r?\n/)
              buffer = events.pop() ?? ''
              for (const event of events) captureEvent(event)
              if (!enqueue(value)) break
            }
          }
          if (buffer) captureEvent(buffer)
          await settleOnce()
          close()
        } catch (err) {
          logger.warn({ err, userId: identity.userId }, 'Model stream failed')
          await settleOnce()
          error(err)
        }
      },
      async cancel(reason) {
        closed = true
        await reader.cancel(reason).catch(() => null)
        await settleOnce()
      },
    })

    const headers = filteredResponseHeaders(response.headers)
    headers.set('Content-Type', 'text/event-stream')
    headers.set('Cache-Control', 'no-cache')
    headers.set('X-Accel-Buffering', 'no')
    headers.set('X-Shadow-Shrimp-Reserved', String(charge.amount))
    return new Response(stream, { status: response.status, headers })
  }

  private proxyAnthropicStreamingResponse(
    response: Response,
    identity: ModelProxyIdentity,
    charge: ReservedCharge,
    requestBody: AnthropicMessagesBody,
  ) {
    if (!response.body) {
      void this.refundReserve(identity, charge)
      return anthropicErrorResponse(
        502,
        'Model provider returned an empty stream',
        'MODEL_PROXY_UPSTREAM_ERROR',
      )
    }

    const decoder = new TextDecoder()
    const reader = response.body.getReader()
    let buffer = ''
    let outputText = ''
    let usage: Usage | null = null
    let settled = false

    const captureEvent = (event: string) => {
      const dataLines = event
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
      if (dataLines.length === 0) return
      const data = dataLines.join('\n').trim()
      if (!data || data === '[DONE]') return
      try {
        const parsed = JSON.parse(data) as unknown
        usage = usageFromResponse(parsed) ?? usage
        outputText += outputTextFromResponse(parsed)
      } catch {
        // Keep streaming; malformed individual SSE chunks should not break passthrough.
      }
    }

    const settleOnce = async () => {
      if (settled) return
      settled = true
      const promptTokens = estimatePromptTokens(requestBody)
      const finalUsage = usage ?? {
        promptTokens,
        promptCacheHitTokens: 0,
        promptCacheMissTokens: promptTokens,
        completionTokens: estimateTokensFromText(outputText),
        totalTokens: 0,
      }
      const actualAmountMicros = priceMicrosForUsage(finalUsage)
      try {
        await this.settle(identity, charge, actualAmountMicros)
      } catch (err) {
        logger.warn({ err, userId: identity.userId }, 'Failed to settle Anthropic model usage')
      }
    }

    let closed = false
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const enqueue = (value: Uint8Array) => {
          if (closed) return false
          try {
            controller.enqueue(value)
            return true
          } catch (err) {
            closed = true
            if ((err as { code?: string }).code !== 'ERR_INVALID_STATE') throw err
            return false
          }
        }
        const close = () => {
          if (closed) return
          closed = true
          try {
            controller.close()
          } catch (err) {
            if ((err as { code?: string }).code !== 'ERR_INVALID_STATE') throw err
          }
        }
        const error = (err: unknown) => {
          if (closed) return
          closed = true
          try {
            controller.error(err)
          } catch (controllerErr) {
            if ((controllerErr as { code?: string }).code !== 'ERR_INVALID_STATE') {
              throw controllerErr
            }
          }
        }
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            if (value) {
              const text = decoder.decode(value, { stream: true })
              buffer += text
              const events = buffer.split(/\r?\n\r?\n/)
              buffer = events.pop() ?? ''
              for (const event of events) captureEvent(event)
              if (!enqueue(value)) break
            }
          }
          if (buffer) captureEvent(buffer)
          await settleOnce()
          close()
        } catch (err) {
          logger.warn({ err, userId: identity.userId }, 'Anthropic model stream failed')
          await settleOnce()
          error(err)
        }
      },
      async cancel(reason) {
        closed = true
        await reader.cancel(reason).catch(() => null)
        await settleOnce()
      },
    })

    const headers = filteredResponseHeaders(response.headers)
    headers.set('Content-Type', 'text/event-stream')
    headers.set('Cache-Control', 'no-cache')
    headers.set('X-Accel-Buffering', 'no')
    headers.set('X-Shadow-Shrimp-Reserved', String(charge.amount))
    return new Response(stream, { status: response.status, headers })
  }
}
