import { useCallback, useRef, useState } from 'react'
import {
  processStreamingTranscript,
  processVoiceTranscript,
  type VoiceProcessorOptions,
} from '../utils/voice-processor'
import { type CloudEnhanceOptions, useCloudVoiceEnhance } from './use-cloud-voice-enhance'

type SpeechResultEvent = {
  results?: Array<{ transcript?: string }>
  isFinal?: boolean
}

type SpeechModuleLike = {
  start: (options?: Record<string, unknown>) => void
  stop: () => void
  requestPermissionsAsync: () => Promise<{ granted: boolean }>
}

let speechModule: SpeechModuleLike | null = null
let useSpeechRecognitionEventSafe: (
  eventName: string,
  listener: (event: SpeechResultEvent) => void,
) => void = () => {}

try {
  const speech = require('expo-speech-recognition') as {
    ExpoSpeechRecognitionModule?: SpeechModuleLike
    useSpeechRecognitionEvent?: (
      eventName: string,
      listener: (event: SpeechResultEvent) => void,
    ) => void
  }
  speechModule = speech.ExpoSpeechRecognitionModule ?? null
  useSpeechRecognitionEventSafe = speech.useSpeechRecognitionEvent ?? (() => {})
} catch {
  speechModule = null
}

export interface UseTypelessVoiceInputOptions {
  speechLang: string
  onPermissionDenied: () => void
  onUnavailable: () => void
  onTranscriptChange: (transcript: string) => void
  onRecordingStateChange?: (isRecording: boolean) => void
  /** Function to get current input text (for append mode) */
  getCurrentText?: () => string
  /** Voice processing options for local processing */
  processorOptions?: VoiceProcessorOptions
  /** Cloud enhancement options */
  cloudEnhanceOptions?: CloudEnhanceOptions
  /** Enable cloud enhancement (requires server configuration) */
  enableCloudEnhance?: boolean
}

interface UseTypelessVoiceInputReturn {
  isRecording: boolean
  isHolding: boolean
  isEnhancing: boolean
  speechSupported: boolean
  startRecording: () => Promise<void>
  stopRecording: () => void
  onPressIn: () => void
  onPressOut: () => void
}

/**
 * TypeLess-style voice input hook with optional cloud enhancement
 *
 * Features inspired by TypeLess AI (https://www.typeless.com):
 * - Press and hold to record (like Fn key on desktop)
 * - Streaming transcription directly into input
 * - Local smart processing (fillers, duplicates, punctuation)
 * - Optional cloud LLM enhancement (self-correction, entity recognition)
 *
 * Processing Pipeline:
 * 1. Local streaming (real-time): fillers, duplicates, punctuation
 * 2. Local final processing: self-correction patterns, list formatting
 * 3. Cloud enhancement (optional): advanced LLM-based correction
 *
 * Reference: TypeLess installation guide shows the interaction:
 * "Hold down the fn key or your custom keyboard shortcut, and read the message..."
 */
export function useTypelessVoiceInput({
  speechLang,
  onPermissionDenied,
  onUnavailable,
  onTranscriptChange,
  onRecordingStateChange,
  getCurrentText,
  processorOptions = {},
  cloudEnhanceOptions = {},
  enableCloudEnhance = false,
}: UseTypelessVoiceInputOptions): UseTypelessVoiceInputReturn {
  const [isRecording, setIsRecording] = useState(false)
  const [isHolding, setIsHolding] = useState(false)

  // Cloud enhancement hook
  const { enhance, isEnhancing } = useCloudVoiceEnhance()

  // Track text before recording started (for append mode)
  const textBeforeRecordingRef = useRef('')
  // Track accumulated transcript for this recording session
  const accumulatedRef = useRef('')
  // Track last processed final result to avoid duplicates
  const lastFinalRef = useRef('')
  // Track permission status to avoid repeated requests
  const permissionGrantedRef = useRef(false)
  // Track if we had a self-correction in this session
  const hadCorrectionRef = useRef(false)
  // Track if we should try cloud enhancement
  const shouldEnhanceRef = useRef(enableCloudEnhance)

  useSpeechRecognitionEventSafe('result', (event) => {
    const transcript = event.results?.[0]?.transcript
    if (!transcript) return

    if (event.isFinal) {
      // Avoid processing the same final result twice
      if (transcript === lastFinalRef.current) return
      lastFinalRef.current = transcript

      // Process the transcript with full options for final results
      const fullOptions: VoiceProcessorOptions = {
        fillerMode: 'conservative',
        enableSelfCorrection: true,
        enableListFormatting: true,
        enablePunctuationFix: true,
        enableDeduplication: true,
        ...processorOptions,
      }

      const processed = processVoiceTranscript(transcript, fullOptions)

      // Check if we had a self-correction
      if (processed !== transcript && transcript.length > processed.length + 5) {
        hadCorrectionRef.current = true
      }

      // Build final text: existing text + new processed text
      const prefix = textBeforeRecordingRef.current
      const separator = prefix && processed ? ' ' : ''
      const finalText = prefix + separator + processed

      // Update input with final text (append mode)
      onTranscriptChange(finalText)
      accumulatedRef.current = finalText

      // Try cloud enhancement if enabled
      if (shouldEnhanceRef.current) {
        enhance(accumulatedRef.current, speechLang, cloudEnhanceOptions)
          .then((result) => {
            if (result?.wasCorrected) {
              // Update with cloud-enhanced version
              onTranscriptChange(result.enhanced)
              accumulatedRef.current = result.enhanced
            }
          })
          .catch(() => {
            // Silently fail - local processing is already applied
          })
      }
    } else {
      // For interim results, use lighter processing
      const streamingOptions: VoiceProcessorOptions = {
        fillerMode: 'conservative',
        enableSelfCorrection: false, // Don't correct mid-stream
        enableListFormatting: false, // Format at end
        enablePunctuationFix: true,
        enableDeduplication: true,
        ...processorOptions,
      }

      const processed = processStreamingTranscript(transcript, streamingOptions)

      // Show preview with current accumulation
      const preview = accumulatedRef.current ? `${accumulatedRef.current} ${processed}` : processed
      onTranscriptChange(preview)
    }
  })

  useSpeechRecognitionEventSafe('end', () => {
    setIsRecording(false)
    setIsHolding(false)
    lastFinalRef.current = ''
    hadCorrectionRef.current = false
    onRecordingStateChange?.(false)
  })

  useSpeechRecognitionEventSafe('error', () => {
    setIsRecording(false)
    setIsHolding(false)
    lastFinalRef.current = ''
    hadCorrectionRef.current = false
    onRecordingStateChange?.(false)
  })

  const startRecording = useCallback(async () => {
    if (!speechModule) {
      onUnavailable()
      return
    }

    // Request permission only if not already granted
    if (!permissionGrantedRef.current) {
      const { granted } = await speechModule.requestPermissionsAsync()
      if (!granted) {
        onPermissionDenied()
        return
      }
      permissionGrantedRef.current = true
    }

    // Capture current text before recording starts
    textBeforeRecordingRef.current = getCurrentText?.() ?? ''

    // Reset state for new recording session
    accumulatedRef.current = ''
    lastFinalRef.current = ''
    hadCorrectionRef.current = false
    shouldEnhanceRef.current = enableCloudEnhance

    speechModule.start({
      lang: speechLang,
      interimResults: true,
      continuous: true,
    })
    setIsRecording(true)
    onRecordingStateChange?.(true)
  }, [
    speechLang,
    onPermissionDenied,
    onUnavailable,
    onRecordingStateChange,
    enableCloudEnhance,
    getCurrentText,
  ])

  const stopRecording = useCallback(() => {
    if (!speechModule) return
    speechModule.stop()
  }, [])

  const onPressIn = useCallback(() => {
    setIsHolding(true)
    startRecording()
  }, [startRecording])

  const onPressOut = useCallback(() => {
    setIsHolding(false)
    stopRecording()
  }, [stopRecording])

  return {
    isRecording,
    isHolding,
    isEnhancing,
    speechSupported: !!speechModule,
    startRecording,
    stopRecording,
    onPressIn,
    onPressOut,
  }
}
