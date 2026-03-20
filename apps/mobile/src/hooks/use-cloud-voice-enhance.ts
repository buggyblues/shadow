import { useCallback, useState } from 'react'
import { fetchApi } from '../lib/api'

export interface CloudEnhanceOptions {
  enableSelfCorrection?: boolean
  enableListFormatting?: boolean
  enableFillerRemoval?: boolean
  enableToneAdjustment?: boolean
  targetTone?: 'formal' | 'casual' | 'professional'
}

export interface CloudEnhanceResult {
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

export interface CloudEnhanceError {
  code: string
  message: string
}

interface UseCloudVoiceEnhanceReturn {
  enhance: (
    transcript: string,
    language: string,
    options?: CloudEnhanceOptions,
  ) => Promise<CloudEnhanceResult | null>
  isEnhancing: boolean
  error: CloudEnhanceError | null
  lastResult: CloudEnhanceResult | null
}

/**
 * Hook for cloud-based voice enhancement
 * Calls the server-side LLM service for advanced transcript processing
 */
export function useCloudVoiceEnhance(): UseCloudVoiceEnhanceReturn {
  const [isEnhancing, setIsEnhancing] = useState(false)
  const [error, setError] = useState<CloudEnhanceError | null>(null)
  const [lastResult, setLastResult] = useState<CloudEnhanceResult | null>(null)

  const enhance = useCallback(
    async (
      transcript: string,
      language: string = 'zh-CN',
      options: CloudEnhanceOptions = {},
    ): Promise<CloudEnhanceResult | null> => {
      if (!transcript.trim()) {
        return null
      }

      setIsEnhancing(true)
      setError(null)

      try {
        const result = await fetchApi<{
          success: boolean
          data: CloudEnhanceResult
          error?: CloudEnhanceError
        }>('/api/voice/enhance', {
          method: 'POST',
          body: JSON.stringify({
            transcript,
            language,
            options: {
              enableSelfCorrection: true,
              enableListFormatting: true,
              enableFillerRemoval: true,
              enableToneAdjustment: false,
              ...options,
            },
          }),
        })

        if (!result.success) {
          throw new Error(result.error?.message || 'Enhancement failed')
        }

        setLastResult(result.data)
        return result.data
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error'

        // Check if it's a service not configured error
        if (errorMessage.includes('not configured')) {
          setError({
            code: 'SERVICE_NOT_CONFIGURED',
            message: 'Cloud enhancement not available',
          })
        } else {
          setError({
            code: 'ENHANCEMENT_FAILED',
            message: errorMessage,
          })
        }

        return null
      } finally {
        setIsEnhancing(false)
      }
    },
    [],
  )

  return {
    enhance,
    isEnhancing,
    error,
    lastResult,
  }
}
