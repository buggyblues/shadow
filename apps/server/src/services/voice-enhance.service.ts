import { z } from 'zod'
import { logger } from '../lib/logger'

/**
 * Voice Enhancement Service
 *
 * Provides cloud-based LLM enhancement for voice transcripts.
 * Inspired by TypeLess AI's self-correction and smart formatting features.
 *
 * Features:
 * - Self-correction detection (recognizes "actually", "不对", "I mean")
 * - Entity recognition and replacement (time, date, location)
 * - List formatting
 * - Filler word removal
 * - Tone adjustment
 *
 * Supported Providers:
 * - OpenAI (GPT-4, GPT-4o-mini)
 * - Anthropic (Claude)
 * - Alibaba (Qwen)
 * - Custom endpoint
 */

// Configuration schema
export const VoiceEnhanceConfigSchema = z.object({
  provider: z.enum(['openai', 'anthropic', 'alibaba', 'custom']),
  apiKey: z.string().min(1),
  baseUrl: z.string().url().optional(),
  model: z.string().default('gpt-4o-mini'),
  temperature: z.number().min(0).max(2).default(0.3),
  maxTokens: z.number().min(1).max(4096).default(500),
  timeout: z.number().min(1000).max(30000).default(5000),
  enabled: z.boolean().default(true),
})

export type VoiceEnhanceConfig = z.infer<typeof VoiceEnhanceConfigSchema>

// Request/Response schemas
export const EnhanceRequestSchema = z.object({
  transcript: z.string().min(1).max(2000),
  language: z.string().default('zh-CN'),
  options: z
    .object({
      enableSelfCorrection: z.boolean().default(true),
      enableListFormatting: z.boolean().default(true),
      enableFillerRemoval: z.boolean().default(true),
      enableToneAdjustment: z.boolean().default(false),
      targetTone: z.enum(['formal', 'casual', 'professional']).optional(),
    })
    .default({}),
})

export type EnhanceRequest = z.infer<typeof EnhanceRequestSchema>

export interface EnhanceResponse {
  original: string
  enhanced: string
  wasCorrected: boolean
  corrections: Array<{
    type: 'self_correction' | 'filler_removal' | 'list_format' | 'tone_adjust' | 'entity_replace'
    original: string
    replacement: string
    reason: string
  }>
  latency: number
  provider: string
  model: string
}

export interface EnhanceError {
  code: 'CONFIG_MISSING' | 'PROVIDER_ERROR' | 'TIMEOUT' | 'RATE_LIMIT' | 'INVALID_RESPONSE'
  message: string
  details?: unknown
}

// Provider-specific configurations
const PROVIDER_CONFIGS: Record<string, { baseUrl: string; defaultModel: string }> = {
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
  },
  anthropic: {
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-3-haiku-20240307',
  },
  alibaba: {
    baseUrl: 'https://dashscope.aliyuncs.com/api/v1',
    defaultModel: 'qwen-turbo',
  },
}

export class VoiceEnhanceService {
  private config: VoiceEnhanceConfig | null = null

  constructor() {
    this.loadConfigFromEnv()
  }

  /**
   * Load configuration from environment variables
   */
  private loadConfigFromEnv(): void {
    const provider = process.env.VOICE_ENHANCE_PROVIDER as
      | 'openai'
      | 'anthropic'
      | 'alibaba'
      | 'custom'
      | undefined
    const apiKey = process.env.VOICE_ENHANCE_API_KEY

    if (!provider || !apiKey) {
      logger.info('VoiceEnhanceService: Configuration not found, service disabled')
      return
    }

    try {
      this.config = VoiceEnhanceConfigSchema.parse({
        provider,
        apiKey,
        baseUrl: process.env.VOICE_ENHANCE_BASE_URL,
        model: process.env.VOICE_ENHANCE_MODEL,
        temperature: process.env.VOICE_ENHANCE_TEMPERATURE
          ? parseFloat(process.env.VOICE_ENHANCE_TEMPERATURE)
          : undefined,
        maxTokens: process.env.VOICE_ENHANCE_MAX_TOKENS
          ? parseInt(process.env.VOICE_ENHANCE_MAX_TOKENS, 10)
          : undefined,
        timeout: process.env.VOICE_ENHANCE_TIMEOUT
          ? parseInt(process.env.VOICE_ENHANCE_TIMEOUT, 10)
          : undefined,
        enabled: process.env.VOICE_ENHANCE_ENABLED !== 'false',
      })

      logger.info(`VoiceEnhanceService: Configured with provider ${provider}`)
    } catch (error) {
      logger.error({ error }, 'VoiceEnhanceService: Failed to load configuration')
    }
  }

  /**
   * Update configuration at runtime
   */
  setConfig(config: VoiceEnhanceConfig): void {
    this.config = VoiceEnhanceConfigSchema.parse(config)
    logger.info(`VoiceEnhanceService: Configuration updated for provider ${config.provider}`)
  }

  /**
   * Get current configuration
   */
  getConfig(): VoiceEnhanceConfig | null {
    return this.config
  }

  /**
   * Check if service is enabled and configured
   */
  isEnabled(): boolean {
    return this.config?.enabled ?? false
  }

  /**
   * Enhance voice transcript using LLM
   */
  async enhance(request: EnhanceRequest): Promise<EnhanceResponse> {
    const startTime = Date.now()

    if (!this.isEnabled() || !this.config) {
      throw this.createError('CONFIG_MISSING', 'Voice enhancement service is not configured')
    }

    try {
      const validatedRequest = EnhanceRequestSchema.parse(request)
      const prompt = this.buildPrompt(validatedRequest)

      const result = await this.callLLM(prompt)
      const latency = Date.now() - startTime

      return {
        original: validatedRequest.transcript,
        enhanced: result.enhanced,
        wasCorrected: result.wasCorrected,
        corrections: result.corrections,
        latency,
        provider: this.config.provider,
        model: this.config.model,
      }
    } catch (error) {
      logger.error({ error, request }, 'VoiceEnhanceService: Enhancement failed')

      if (error instanceof Error && error.message.includes('timeout')) {
        throw this.createError('TIMEOUT', 'Request timed out')
      }

      throw this.createError(
        'PROVIDER_ERROR',
        error instanceof Error ? error.message : 'Unknown error',
      )
    }
  }

  /**
   * Build system prompt for LLM
   */
  private buildPrompt(request: EnhanceRequest): string {
    const { transcript, language, options } = request

    const features: string[] = []

    if (options.enableSelfCorrection) {
      features.push(`
Self-Correction Detection:
- Recognize when user corrects themselves ("actually", "wait", "I mean", "不对", "等等", "我是说")
- Keep only the final intended message
- Example: "Let's meet at 7, actually 8 PM" → "Let's meet at 8 PM"
- Example: "我们明天见，不对后天见" → "我们后天见"`)
    }

    if (options.enableFillerRemoval) {
      features.push(`
Filler Word Removal:
- Remove: um, uh, 嗯, 啊, 呃, like, you know, 那个, 就是`)
    }

    if (options.enableListFormatting) {
      features.push(`
List Formatting:
- Convert comma-separated items to formatted lists
- Example: "shopping list: milk, eggs, bread" → "Shopping list:\n- Milk\n- Eggs\n- Bread"`)
    }

    if (options.enableToneAdjustment && options.targetTone) {
      features.push(`
Tone Adjustment (${options.targetTone}):
- Adjust the tone to be ${options.targetTone}
- Keep the core meaning intact`)
    }

    const systemPrompt = `You are a voice transcript enhancer. Process the user's speech transcript and return an improved version.

${features.join('\n')}

Rules:
1. Return ONLY the enhanced text, no explanations
2. Preserve the original language (${language})
3. Maintain the original meaning and intent
4. Make minimal changes - only fix obvious issues

Respond in JSON format:
{
  "enhanced": "the improved text",
  "wasCorrected": true/false,
  "corrections": [
    {
      "type": "self_correction|filler_removal|list_format|tone_adjust|entity_replace",
      "original": "original text",
      "replacement": "replacement text",
      "reason": "explanation"
    }
  ]
}`

    return JSON.stringify({
      system: systemPrompt,
      user: transcript,
    })
  }

  /**
   * Call LLM   */
  private async callLLM(promptData: string): Promise<{
    enhanced: string
    wasCorrected: boolean
    corrections: EnhanceResponse['corrections']
  }> {
    if (!this.config) {
      throw new Error('Configuration not loaded')
    }

    const { provider, apiKey, baseUrl, model, temperature, maxTokens, timeout } = this.config
    const providerConfig = PROVIDER_CONFIGS[provider]
    const finalBaseUrl = baseUrl || providerConfig?.baseUrl
    const finalModel = model || providerConfig?.defaultModel

    if (!finalBaseUrl) {
      throw new Error(`No base URL configured for provider: ${provider}`)
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      let response: Response

      switch (provider) {
        case 'openai':
        case 'custom':
          response = await fetch(`${finalBaseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: finalModel,
              messages: [
                { role: 'system', content: JSON.parse(promptData).system },
                { role: 'user', content: JSON.parse(promptData).user },
              ],
              temperature,
              max_tokens: maxTokens,
              response_format: { type: 'json_object' },
            }),
            signal: controller.signal,
          })
          break

        case 'anthropic':
          response = await fetch(`${finalBaseUrl}/messages`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: finalModel,
              max_tokens: maxTokens,
              temperature,
              messages: [
                {
                  role: 'user',
                  content: `${JSON.parse(promptData).system}\n\n${JSON.parse(promptData).user}`,
                },
              ],
            }),
            signal: controller.signal,
          })
          break

        case 'alibaba':
          response = await fetch(`${finalBaseUrl}/services/aigc/text-generation/generation`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: finalModel,
              input: {
                messages: [
                  { role: 'system', content: JSON.parse(promptData).system },
                  { role: 'user', content: JSON.parse(promptData).user },
                ],
              },
              parameters: {
                temperature,
                max_tokens: maxTokens,
                result_format: 'json',
              },
            }),
            signal: controller.signal,
          })
          break

        default:
          throw new Error(`Unsupported provider: ${provider}`)
      }

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`LLM API error: ${response.status} ${errorText}`)
      }

      const data = (await response.json()) as unknown
      const result = this.extractResult(data, provider)

      // Parse the JSON response
      const parsed = typeof result === 'string' ? JSON.parse(result) : result

      return {
        enhanced: parsed.enhanced || parsed.content || parsed.text || String(result),
        wasCorrected: parsed.wasCorrected ?? false,
        corrections: parsed.corrections ?? [],
      }
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
  }

  /**
   * Extract result from different provider response formats
   */
  private extractResult(data: unknown, provider: string): unknown {
    if (!data || typeof data !== 'object') {
      return data
    }

    const d = data as Record<string, unknown>

    switch (provider) {
      case 'openai':
      case 'custom':
        return (d.choices as Array<{ message?: { content?: string } }>)?.[0]?.message?.content

      case 'anthropic':
        return (d.content as Array<{ text?: string }>)?.[0]?.text

      case 'alibaba':
        return (d.output as { text?: string })?.text

      default:
        return d
    }
  }

  /**
   * Create standardized error
   */
  private createError(code: EnhanceError['code'], message: string): EnhanceError {
    return { code, message }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ status: 'ok' | 'error'; message: string }> {
    if (!this.isEnabled()) {
      return { status: 'error', message: 'Service not configured' }
    }

    try {
      // Try a simple enhancement
      await this.enhance({
        transcript: 'Hello world',
        language: 'en',
        options: { enableFillerRemoval: false },
      })
      return { status: 'ok', message: 'Service is healthy' }
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }
}
