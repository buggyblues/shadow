import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppContext } from '../app'
import { authMiddleware } from '../middleware/auth.middleware'
import { EnhanceRequestSchema } from '../services/voice-enhance.service'

/**
 * Voice Enhancement API Routes
 *
 * POST /api/voice/enhance - Enhance voice transcript
 * GET  /api/voice/config - Get current LLM configuration
 * POST /api/voice/config - Update LLM configuration (admin only)
 * GET  /api/voice/health - Health check
 */

const router = new Hono<AppContext>()

// Request validation schemas
const EnhanceQuerySchema = z.object({
  transcript: z.string().min(1).max(2000),
  language: z.string().default('zh-CN'),
  enableSelfCorrection: z.coerce.boolean().default(true),
  enableListFormatting: z.coerce.boolean().default(true),
  enableFillerRemoval: z.coerce.boolean().default(true),
  enableToneAdjustment: z.coerce.boolean().default(false),
  targetTone: z.enum(['formal', 'casual', 'professional']).optional(),
})

const ConfigUpdateSchema = z.object({
  provider: z.enum(['openai', 'anthropic', 'alibaba', 'custom']),
  apiKey: z.string().min(1),
  baseUrl: z.string().url().optional(),
  model: z.string().optional(),
  temperature: z.coerce.number().min(0).max(2).optional(),
  maxTokens: z.coerce.number().min(1).max(4096).optional(),
  timeout: z.coerce.number().min(1000).max(30000).optional(),
  enabled: z.coerce.boolean().default(true),
})

/**
 * POST /api/voice/enhance
 * Enhance a voice transcript using LLM
 */
router.post('/enhance', authMiddleware, zValidator('json', EnhanceRequestSchema), async (c) => {
  const voiceEnhanceService = c.get('voiceEnhanceService')
  const body = c.req.valid('json')

  try {
    const result = await voiceEnhanceService.enhance(body)
    return c.json({
      success: true,
      data: result,
    })
  } catch (error) {
    const err = error as { code?: string; message: string }

    if (err.code === 'CONFIG_MISSING') {
      return c.json(
        {
          success: false,
          error: {
            code: 'SERVICE_NOT_CONFIGURED',
            message: 'Voice enhancement service is not configured',
          },
        },
        503,
      )
    }

    if (err.code === 'TIMEOUT') {
      return c.json(
        {
          success: false,
          error: {
            code: 'TIMEOUT',
            message: 'Request timed out, try again later',
          },
        },
        504,
      )
    }

    return c.json(
      {
        success: false,
        error: {
          code: 'ENHANCEMENT_FAILED',
          message: err.message || 'Failed to enhance transcript',
        },
      },
      500,
    )
  }
})

/**
 * GET /api/voice/enhance
 * Query version with URL parameters
 */
router.get('/enhance', authMiddleware, zValidator('query', EnhanceQuerySchema), async (c) => {
  const voiceEnhanceService = c.get('voiceEnhanceService')
  const query = c.req.valid('query')

  try {
    const result = await voiceEnhanceService.enhance({
      transcript: query.transcript,
      language: query.language,
      options: {
        enableSelfCorrection: query.enableSelfCorrection,
        enableListFormatting: query.enableListFormatting,
        enableFillerRemoval: query.enableFillerRemoval,
        enableToneAdjustment: query.enableToneAdjustment,
        targetTone: query.targetTone,
      },
    })

    return c.json({
      success: true,
      data: result,
    })
  } catch (error) {
    const err = error as { code?: string; message: string }

    if (err.code === 'CONFIG_MISSING') {
      return c.json(
        {
          success: false,
          error: {
            code: 'SERVICE_NOT_CONFIGURED',
            message: 'Voice enhancement service is not configured',
          },
        },
        503,
      )
    }

    return c.json(
      {
        success: false,
        error: {
          code: 'ENHANCEMENT_FAILED',
          message: err.message || 'Failed to enhance transcript',
        },
      },
      500,
    )
  }
})

/**
 * GET /api/voice/config
 * Get current LLM configuration (sensitive info redacted)
 */
router.get('/config', authMiddleware, async (c) => {
  const voiceEnhanceService = c.get('voiceEnhanceService')
  const config = voiceEnhanceService.getConfig()

  if (!config) {
    return c.json({
      success: true,
      data: {
        enabled: false,
        configured: false,
      },
    })
  }

  return c.json({
    success: true,
    data: {
      enabled: config.enabled,
      configured: true,
      provider: config.provider,
      model: config.model,
      baseUrl: config.baseUrl,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      timeout: config.timeout,
      // apiKey is intentionally omitted for security
    },
  })
})

/**
 * POST /api/voice/config
 * Update LLM configuration (admin only)
 */
router.post('/config', authMiddleware, zValidator('json', ConfigUpdateSchema), async (c) => {
  // TODO: Add admin check
  const voiceEnhanceService = c.get('voiceEnhanceService')
  const body = c.req.valid('json')

  try {
    voiceEnhanceService.setConfig(body)

    return c.json({
      success: true,
      message: 'Configuration updated successfully',
    })
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: 'CONFIG_UPDATE_FAILED',
          message: error instanceof Error ? error.message : 'Failed to update configuration',
        },
      },
      400,
    )
  }
})

/**
 * GET /api/voice/health
 * Health check endpoint
 */
router.get('/health', async (c) => {
  const voiceEnhanceService = c.get('voiceEnhanceService')
  const health = await voiceEnhanceService.healthCheck()

  return c.json({
    success: health.status === 'ok',
    data: health,
  })
})

export default router
