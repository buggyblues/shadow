import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { signModelProxyToken } from '../src/lib/model-proxy-token'
import { ModelProxyService } from '../src/services/model-proxy.service'

describe('ModelProxyService', () => {
  const previousEnv: Record<string, string | undefined> = {}
  const ledgerService = {
    debit: vi.fn(),
    credit: vi.fn(),
    settleReservedMicros: vi.fn(),
  }
  const safeHttpClient = {
    fetch: vi.fn(),
  }
  const userDao = {
    findById: vi.fn(),
  }
  const service = new ModelProxyService({
    ledgerService: ledgerService as never,
    userDao: userDao as never,
    safeHttpClient: safeHttpClient as never,
  })

  beforeEach(() => {
    vi.clearAllMocks()
    for (const key of [
      'JWT_SECRET',
      'DEEPSEEK_API_KEY',
      'DEEPSEEK_BASE_URL',
      'SHADOW_MODEL_PROXY_MODEL',
      'SHADOW_MODEL_PROXY_DEFAULT_MODEL',
      'SHADOW_MODEL_PROXY_UPSTREAM_API_KEY',
      'SHADOW_MODEL_PROXY_UPSTREAM_BASE_URL',
      'SHADOW_MODEL_PROXY_UPSTREAM_ANTHROPIC_API_KEY',
      'SHADOW_MODEL_PROXY_UPSTREAM_ANTHROPIC_BASE_URL',
      'SHADOW_MODEL_PROXY_SHRIMP_PER_CNY',
      'SHADOW_MODEL_PROXY_SHRIMP_MICROS_PER_COIN',
      'SHADOW_MODEL_PROXY_INPUT_CACHE_HIT_CNY_PER_MILLION',
      'SHADOW_MODEL_PROXY_INPUT_CACHE_MISS_CNY_PER_MILLION',
      'SHADOW_MODEL_PROXY_OUTPUT_CNY_PER_MILLION',
      'SHADOW_MODEL_PROXY_INPUT_CACHE_HIT_SHRIMP_PER_MILLION',
      'SHADOW_MODEL_PROXY_INPUT_CACHE_MISS_SHRIMP_PER_MILLION',
      'SHADOW_MODEL_PROXY_OUTPUT_SHRIMP_PER_MILLION',
      'SHADOW_MODEL_PROXY_BILLING_MODE',
      'SHADOW_MODEL_PROXY_TOKENS_PER_SHRIMP',
      'SHADOW_MODEL_PROXY_INPUT_TOKENS_PER_SHRIMP',
      'SHADOW_MODEL_PROXY_OUTPUT_TOKENS_PER_SHRIMP',
    ]) {
      previousEnv[key] = process.env[key]
    }
    process.env.JWT_SECRET = 'model-proxy-test-secret'
    process.env.SHADOW_MODEL_PROXY_MODEL = 'deepseek-v4-flash'
    process.env.SHADOW_MODEL_PROXY_UPSTREAM_API_KEY = 'official-upstream-key'
    process.env.SHADOW_MODEL_PROXY_UPSTREAM_BASE_URL = 'https://example.com/v1'
    process.env.SHADOW_MODEL_PROXY_SHRIMP_PER_CNY = '20'
    process.env.SHADOW_MODEL_PROXY_SHRIMP_MICROS_PER_COIN = '1000000'
    process.env.SHADOW_MODEL_PROXY_INPUT_CACHE_HIT_CNY_PER_MILLION = '0.02'
    process.env.SHADOW_MODEL_PROXY_INPUT_CACHE_MISS_CNY_PER_MILLION = '1'
    process.env.SHADOW_MODEL_PROXY_OUTPUT_CNY_PER_MILLION = '2'
    delete process.env.SHADOW_MODEL_PROXY_INPUT_CACHE_HIT_SHRIMP_PER_MILLION
    delete process.env.SHADOW_MODEL_PROXY_INPUT_CACHE_MISS_SHRIMP_PER_MILLION
    delete process.env.SHADOW_MODEL_PROXY_OUTPUT_SHRIMP_PER_MILLION
    delete process.env.SHADOW_MODEL_PROXY_BILLING_MODE
    delete process.env.SHADOW_MODEL_PROXY_TOKENS_PER_SHRIMP
    delete process.env.SHADOW_MODEL_PROXY_INPUT_TOKENS_PER_SHRIMP
    delete process.env.SHADOW_MODEL_PROXY_OUTPUT_TOKENS_PER_SHRIMP
    userDao.findById.mockResolvedValue({ id: 'user-1' })
    ledgerService.debit.mockResolvedValue(998)
    ledgerService.credit.mockResolvedValue(999)
    ledgerService.settleReservedMicros.mockResolvedValue({
      chargedAmount: 0,
      pendingMicros: 20_000,
      balanceAfter: 999,
    })
    safeHttpClient.fetch.mockImplementation(async (url, init) => fetch(url, init))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  it('exposes only the default public model alias', () => {
    process.env.SHADOW_MODEL_PROXY_MODEL = ''
    process.env.SHADOW_MODEL_PROXY_DEFAULT_MODEL = ''

    expect(service.modelsResponse().data).toEqual([
      {
        id: 'default',
        object: 'model',
        created: 0,
        owned_by: 'shadow-official',
      },
    ])
  })

  it('returns OpenAI-compatible model detail for public and configured ids', () => {
    expect(service.modelResponse('default')).toMatchObject({
      id: 'default',
      object: 'model',
      owned_by: 'shadow-official',
    })
    expect(service.modelResponse('deepseek-v4-flash')).toMatchObject({
      id: 'deepseek-v4-flash',
      object: 'model',
      owned_by: 'shadow-official',
    })
  })

  it('rejects unavailable model detail ids', () => {
    expect(() => service.modelResponse('unknown-model')).toThrow('Model is not available')
  })

  it('exposes DeepSeek-compatible billing rates without provider secrets', () => {
    expect(service.billingResponse()).toMatchObject({
      enabled: true,
      currency: 'shrimp',
      model: 'default',
      models: ['default'],
      shrimpMicrosPerCoin: 1_000_000,
      shrimpPerCny: 20,
      inputCacheHitCnyPerMillionTokens: 0.02,
      inputCacheMissCnyPerMillionTokens: 1,
      outputCnyPerMillionTokens: 2,
      inputCacheHitShrimpPerMillionTokens: 0.4,
      inputCacheMissShrimpPerMillionTokens: 20,
      outputShrimpPerMillionTokens: 40,
    })
    expect(JSON.stringify(service.billingResponse())).not.toContain('official-upstream-key')
  })

  it('ignores stale legacy token ratios unless legacy billing mode is enabled', () => {
    process.env.SHADOW_MODEL_PROXY_INPUT_TOKENS_PER_SHRIMP = '1000'
    process.env.SHADOW_MODEL_PROXY_OUTPUT_TOKENS_PER_SHRIMP = '500'

    expect(service.billingResponse()).toMatchObject({
      inputTokensPerShrimp: null,
      outputTokensPerShrimp: null,
      inputCacheHitShrimpPerMillionTokens: 0.4,
      inputCacheMissShrimpPerMillionTokens: 20,
      outputShrimpPerMillionTokens: 40,
    })
  })

  it('forwards chat completions through the official upstream key and bills actual usage', async () => {
    const token = signModelProxyToken({ userId: 'user-1', namespace: 'play-bmad' })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            id: 'chatcmpl-test',
            object: 'chat.completion',
            choices: [{ message: { role: 'assistant', content: 'done' } }],
            usage: { prompt_tokens: 1000, completion_tokens: 500, total_tokens: 1500 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }),
    )

    const identity = await service.resolveIdentity(`Bearer ${token}`)
    const response = await service.proxyChatCompletions(identity, {
      model: 'default',
      max_tokens: 500,
      messages: [{ role: 'user', content: 'hello' }],
    })

    expect(response.status).toBe(200)
    const fetchMock = vi.mocked(fetch)
    const [, init] = fetchMock.mock.calls[0]!
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://example.com/v1/chat/completions')
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer official-upstream-key',
    })
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: 'deepseek-v4-flash',
      messages: [{ role: 'user', content: 'hello' }],
    })
    expect(ledgerService.debit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        amount: 1,
        type: 'purchase',
        referenceType: 'model_proxy',
        note: 'Official model usage reserve (deepseek-v4-flash)',
      }),
    )
    expect(ledgerService.settleReservedMicros).toHaveBeenCalledWith(
      'user-1',
      40_000,
      1,
      'model_proxy',
      expect.any(String),
      'model_proxy',
      'Official model usage (deepseek-v4-flash)',
    )
  })

  it('forwards Anthropic messages through the Anthropic upstream endpoint', async () => {
    process.env.SHADOW_MODEL_PROXY_UPSTREAM_ANTHROPIC_BASE_URL = 'https://example.com/anthropic'
    process.env.SHADOW_MODEL_PROXY_UPSTREAM_ANTHROPIC_API_KEY = 'official-anthropic-key'
    const token = signModelProxyToken({ userId: 'user-1', namespace: 'play-bmad' })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            id: 'msg-test',
            type: 'message',
            role: 'assistant',
            model: 'deepseek-v4-flash',
            content: [{ type: 'text', text: 'done' }],
            usage: { input_tokens: 1000, output_tokens: 500 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }),
    )

    const identity = await service.resolveIdentity(`Bearer ${token}`)
    const response = await service.proxyAnthropicMessages(identity, {
      model: 'default',
      max_tokens: 500,
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
    })

    expect(response.status).toBe(200)
    const fetchMock = vi.mocked(fetch)
    const [, init] = fetchMock.mock.calls[0]!
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://example.com/anthropic/v1/messages')
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer official-anthropic-key',
      'anthropic-version': '2023-06-01',
    })
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: 'deepseek-v4-flash',
      max_tokens: 500,
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
    })
    expect(ledgerService.settleReservedMicros).toHaveBeenCalledWith(
      'user-1',
      40_000,
      1,
      'model_proxy',
      expect.any(String),
      'model_proxy',
      'Official model usage (deepseek-v4-flash)',
    )
  })

  it('returns a recharge chat completion before calling upstream when balance is insufficient', async () => {
    const token = signModelProxyToken({ userId: 'user-1', namespace: 'play-bmad' })
    ledgerService.debit.mockRejectedValueOnce(
      Object.assign(new Error('Insufficient balance'), {
        status: 402,
        code: 'WALLET_INSUFFICIENT_BALANCE',
        requiredAmount: 2,
        balance: 0,
        shortfall: 2,
        nextAction: 'earn_or_recharge',
      }),
    )
    vi.stubGlobal('fetch', vi.fn())

    const identity = await service.resolveIdentity(`Bearer ${token}`)
    const response = await service.proxyChatCompletions(identity, {
      model: 'deepseek-v4-flash',
      max_tokens: 500,
      messages: [{ role: 'user', content: 'hello' }],
    })
    const body = (await response.json()) as {
      choices: Array<{ message: { content: string } }>
      shadow: { type: string; requiredAmount: number; balance: number; shortfall: number }
    }

    expect(response.status).toBe(200)
    expect(response.headers.get('X-Shadow-Recharge-Required')).toBe('true')
    expect(body.shadow).toMatchObject({
      type: 'wallet_recharge_required',
      requiredAmount: 2,
      balance: 0,
      shortfall: 2,
    })
    expect(body.choices[0]?.message.content).toContain('shadow:wallet-recharge')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('supports token-per-shrimp billing ratios from environment configuration', async () => {
    process.env.SHADOW_MODEL_PROXY_BILLING_MODE = 'token_ratio'
    process.env.SHADOW_MODEL_PROXY_INPUT_TOKENS_PER_SHRIMP = '2000'
    process.env.SHADOW_MODEL_PROXY_OUTPUT_TOKENS_PER_SHRIMP = '1000'
    const token = signModelProxyToken({ userId: 'user-1', namespace: 'play-bmad' })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            id: 'chatcmpl-test',
            object: 'chat.completion',
            choices: [{ message: { role: 'assistant', content: 'done' } }],
            usage: { prompt_tokens: 2000, completion_tokens: 1000, total_tokens: 3000 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }),
    )

    const identity = await service.resolveIdentity(`Bearer ${token}`)
    const response = await service.proxyChatCompletions(identity, {
      model: 'deepseek-v4-flash',
      max_tokens: 1000,
      messages: [{ role: 'user', content: 'x'.repeat(8000) }],
    })

    expect(response.status).toBe(200)
    expect(ledgerService.debit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        amount: 2,
        type: 'purchase',
        referenceType: 'model_proxy',
        note: 'Official model usage reserve (deepseek-v4-flash)',
      }),
    )
    expect(ledgerService.settleReservedMicros).toHaveBeenCalledWith(
      'user-1',
      2_000_000,
      2,
      'model_proxy',
      expect.any(String),
      'model_proxy',
      'Official model usage (deepseek-v4-flash)',
    )
  })

  it('bills DeepSeek cache-hit input tokens at the official cached rate', async () => {
    const token = signModelProxyToken({ userId: 'user-1', namespace: 'play-bmad' })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            id: 'chatcmpl-test',
            object: 'chat.completion',
            choices: [{ message: { role: 'assistant', content: 'done' } }],
            usage: {
              prompt_tokens: 1_000_000,
              prompt_cache_hit_tokens: 1_000_000,
              prompt_cache_miss_tokens: 0,
              completion_tokens: 0,
              total_tokens: 1_000_000,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }),
    )

    const identity = await service.resolveIdentity(`Bearer ${token}`)
    const response = await service.proxyChatCompletions(identity, {
      model: 'deepseek-v4-flash',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'hello' }],
    })

    expect(response.status).toBe(200)
    expect(ledgerService.settleReservedMicros).toHaveBeenCalledWith(
      'user-1',
      400_000,
      1,
      'model_proxy',
      expect.any(String),
      'model_proxy',
      'Official model usage (deepseek-v4-flash)',
    )
  })

  it('settles streaming usage once when the client cancels early', async () => {
    const token = signModelProxyToken({ userId: 'user-1', namespace: 'play-bmad' })
    const encoder = new TextEncoder()
    let upstreamCancelCount = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    choices: [{ delta: { content: 'partial' } }],
                    usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 },
                  })}\n\n`,
                ),
              )
            },
            cancel() {
              upstreamCancelCount += 1
            },
          }),
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
        )
      }),
    )

    const identity = await service.resolveIdentity(`Bearer ${token}`)
    const response = await service.proxyChatCompletions(identity, {
      model: 'deepseek-v4-flash',
      stream: true,
      max_tokens: 8,
      messages: [{ role: 'user', content: 'hello' }],
    })
    const reader = response.body?.getReader()
    expect(reader).toBeDefined()
    const first = await reader!.read()
    expect(new TextDecoder().decode(first.value)).toContain('partial')

    await reader!.cancel('done')
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(upstreamCancelCount).toBe(1)
    expect(ledgerService.settleReservedMicros).toHaveBeenCalledTimes(1)
  })

  it('hides upstream auth details and refunds reserve when the provider key is rejected', async () => {
    const token = signModelProxyToken({ userId: 'user-1', namespace: 'play-bmad' })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            error: {
              message: 'Authentication Fails, Your api key: ****72ea is invalid',
              code: 'invalid_request_error',
            },
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } },
        )
      }),
    )

    const identity = await service.resolveIdentity(`Bearer ${token}`)
    const response = await service.proxyChatCompletions(identity, {
      model: 'deepseek-v4-flash',
      max_tokens: 500,
      messages: [{ role: 'user', content: 'hello' }],
    })
    const text = await response.text()

    expect(response.status).toBe(503)
    expect(text).toContain('MODEL_PROXY_PROVIDER_AUTH_FAILED')
    expect(text).not.toContain('72ea')
    expect(ledgerService.credit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        amount: 1,
        type: 'refund',
        referenceType: 'model_proxy',
        note: 'Official model usage refund (deepseek-v4-flash)',
      }),
    )
  })

  it('does not expose upstream error bodies to chat clients', async () => {
    const token = signModelProxyToken({ userId: 'user-1', namespace: 'play-bmad' })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            error: {
              message: 'Provider quota exhausted for account official-prod',
              code: 'provider_quota_exceeded',
            },
          }),
          { status: 429, headers: { 'Content-Type': 'application/json' } },
        )
      }),
    )

    const identity = await service.resolveIdentity(`Bearer ${token}`)
    const response = await service.proxyChatCompletions(identity, {
      model: 'deepseek-v4-flash',
      max_tokens: 500,
      messages: [{ role: 'user', content: 'hello' }],
    })
    const text = await response.text()

    expect(response.status).toBe(503)
    expect(text).toContain('MODEL_PROXY_UPSTREAM_REJECTED')
    expect(text).toContain('Official model provider is busy')
    expect(text).not.toContain('official-prod')
    expect(text).not.toContain('provider_quota_exceeded')
    expect(ledgerService.credit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        amount: 1,
        type: 'refund',
        referenceType: 'model_proxy',
        note: 'Official model usage refund (deepseek-v4-flash)',
      }),
    )
  })

  it('does not treat direct provider aliases as official upstream configuration', async () => {
    const token = signModelProxyToken({ userId: 'user-1', namespace: 'play-bmad' })
    process.env.SHADOW_MODEL_PROXY_UPSTREAM_API_KEY = ''
    process.env.SHADOW_MODEL_PROXY_UPSTREAM_BASE_URL = ''
    process.env.DEEPSEEK_API_KEY = 'test-direct-provider-key'
    process.env.DEEPSEEK_BASE_URL = 'https://deepseek.example/v1/'
    vi.stubGlobal('fetch', vi.fn())

    const identity = await service.resolveIdentity(`Bearer ${token}`)
    const response = await service.proxyChatCompletions(identity, {
      model: 'deepseek-v4-flash',
      messages: [{ role: 'user', content: 'hello' }],
      max_tokens: 8,
    })
    const body = (await response.json()) as { error: { code: string } }

    expect(response.status).toBe(503)
    expect(body.error.code).toBe('MODEL_PROXY_PROVIDER_UNCONFIGURED')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('requires the upstream base URL to come from environment configuration', async () => {
    const token = signModelProxyToken({ userId: 'user-1', namespace: 'play-bmad' })
    delete process.env.SHADOW_MODEL_PROXY_UPSTREAM_BASE_URL
    delete process.env.DEEPSEEK_BASE_URL
    delete process.env.OPENAI_COMPATIBLE_BASE_URL
    vi.stubGlobal('fetch', vi.fn())

    const identity = await service.resolveIdentity(`Bearer ${token}`)
    const response = await service.proxyChatCompletions(identity, {
      model: 'deepseek-v4-flash',
      messages: [{ role: 'user', content: 'hello' }],
    })
    const body = (await response.json()) as {
      error: { code: string }
    }

    expect(response.status).toBe(503)
    expect(body.error.code).toBe('MODEL_PROXY_PROVIDER_UNCONFIGURED')
    expect(ledgerService.debit).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })
})
