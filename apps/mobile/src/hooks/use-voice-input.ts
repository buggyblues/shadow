import Constants from 'expo-constants'
import { useMockVoiceInput } from './use-mock-voice-input'
import {
  type UseTypelessVoiceInputOptions,
  useTypelessVoiceInput,
} from './use-typeless-voice-input'

/**
 * Unified voice input hook
 *
 * Automatically detects if running in Expo Go and uses appropriate implementation:
 * - Expo Go: Mock implementation for UI testing
 * - Development Build / Production: Real voice recognition
 *
 * Usage:
 * ```typescript
 * const {
 *   isRecording,
 *   isHolding,
 *   onPressIn,
 *   onPressOut,
 * } = useVoiceInput({
 *   speechLang: 'zh-CN',
 *   onTranscriptChange: setInputText,
 *   onPermissionDenied: () => Alert.alert('需要麦克风权限'),
 *   onUnavailable: () => Alert.alert('语音输入不可用'),
 * })
 * ```
 */

// Detect if running in Expo Go
const isExpoGo = Constants.appOwnership === 'expo'

export interface UseVoiceInputOptions {
  speechLang: string
  onPermissionDenied: () => void
  onUnavailable: () => void
  onTranscriptChange: (transcript: string) => void
  onRecordingStateChange?: (isRecording: boolean) => void
  /** Function to get current input text (for append mode) */
  getCurrentText?: () => string
  enableCloudEnhance?: boolean
}

export interface UseVoiceInputReturn {
  isRecording: boolean
  isHolding: boolean
  isEnhancing: boolean
  speechSupported: boolean
  onPressIn: () => void
  onPressOut: () => void
  /** True if using mock implementation (Expo Go) */
  isMock: boolean
}

/**
 * Unified voice input hook
 * Automatically selects mock or real implementation based on environment
 *
 * Note: Both hooks are always called to satisfy React hooks rules,
 * but only the appropriate one is used based on environment.
 */
export function useVoiceInput(options: UseVoiceInputOptions): UseVoiceInputReturn {
  // Always call both hooks (React hooks rules)
  const mock = useMockVoiceInput({
    onTranscriptChange: options.onTranscriptChange,
    onRecordingStateChange: options.onRecordingStateChange,
    getCurrentText: options.getCurrentText,
  })

  const real = useTypelessVoiceInput({
    speechLang: options.speechLang,
    onPermissionDenied: options.onPermissionDenied,
    onUnavailable: options.onUnavailable,
    onTranscriptChange: options.onTranscriptChange,
    onRecordingStateChange: options.onRecordingStateChange,
    getCurrentText: options.getCurrentText,
    enableCloudEnhance: options.enableCloudEnhance,
  })

  // Select the appropriate implementation
  // Note: Both hooks are called to satisfy React hooks rules
  if (isExpoGo) {
    return {
      ...mock,
      isMock: true,
    }
  }

  return {
    ...real,
    isMock: false,
  }
}

export type { UseTypelessVoiceInputOptions }
// Re-export types and individual hooks for advanced usage
export { useMockVoiceInput, useTypelessVoiceInput }
