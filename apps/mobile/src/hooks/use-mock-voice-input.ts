import { useCallback, useRef, useState } from 'react'

/**
 * Mock voice input hook for Expo Go testing
 *
 * Since expo-speech-recognition requires native modules not available in Expo Go,
 * this mock simulates the TypeLess voice input experience for UI testing.
 *
 * Features:
 * - Simulates press-and-hold recording
 * - Provides sample phrases to test processing pipeline
 * - Mimics real voice input timing and states
 * - Appends to existing text (not overwrite)
 *
 * Usage:
 * ```typescript
 * const isExpoGo = Constants.appOwnership === 'expo'
 * const voiceInput = isExpoGo
 *   ? useMockVoiceInput({ onTranscriptChange: setInputText, getCurrentText: () => inputText })
 *   : useTypelessVoiceInput({ ... })
 * ```
 */

interface UseMockVoiceInputOptions {
  onTranscriptChange: (transcript: string) => void
  onRecordingStateChange?: (isRecording: boolean) => void
  /** Function to get current input text (for append mode) */
  getCurrentText?: () => string
}

interface UseMockVoiceInputReturn {
  isRecording: boolean
  isHolding: boolean
  isEnhancing: boolean
  speechSupported: boolean
  onPressIn: () => void
  onPressOut: () => void
}

// Sample phrases to test different processing features
const MOCK_PHRASES = [
  // Basic phrases
  '你好，这是一条测试消息',
  'Hello, this is a test message',

  // Self-correction patterns (中文)
  '我们明天见面，不对，后天见面',
  '价格是100块，等等，200块',
  '我是说，这个方案更好',

  // Self-correction patterns (English)
  "Let's meet at 7, actually, 8 PM",
  "I'll take the red one, wait, the blue one",

  // List formatting
  '购物清单：牛奶，面包，鸡蛋',
  'TODO list: write code, test, deploy',

  // Filler words
  '嗯，我觉得啊，这个方案呃，可以',
  'Um, I think uh, we should go',

  // Complex sentences
  '明天下午三点开会，不对，改成四点，记得带电脑',
]

export function useMockVoiceInput({
  onTranscriptChange,
  onRecordingStateChange,
  getCurrentText,
}: UseMockVoiceInputOptions): UseMockVoiceInputReturn {
  const [isRecording, setIsRecording] = useState(false)
  const [isHolding, setIsHolding] = useState(false)
  const [isEnhancing, setIsEnhancing] = useState(false)

  // Store the text before recording started (for append mode)
  const textBeforeRecording = useRef('')
  const recordingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const enhanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const simulateRecording = useCallback(() => {
    // Simulate recording delay (1.5-2.5 seconds)
    const recordingDelay = 1500 + Math.random() * 1000

    recordingTimer.current = setTimeout(() => {
      // Pick random phrase
      const phrase =
        MOCK_PHRASES[Math.floor(Math.random() * MOCK_PHRASES.length)] ?? MOCK_PHRASES[0]!

      // Simulate streaming - character by character
      let currentIndex = 0
      const streamInterval = setInterval(() => {
        if (currentIndex <= phrase.length) {
          // Append to existing text (not overwrite)
          const newText = phrase.slice(0, currentIndex)
          const prefix = textBeforeRecording.current
          const separator = prefix && newText ? ' ' : ''
          onTranscriptChange(prefix + separator + newText)
          currentIndex += 2 // Add 2 chars at a time for realistic effect
        } else {
          clearInterval(streamInterval)

          // Simulate cloud enhancement delay
          if (Math.random() > 0.5) {
            setIsEnhancing(true)
            enhanceTimer.current = setTimeout(() => {
              setIsEnhancing(false)
              // Sometimes "enhance" the text (capitalize first letter)
              const enhanced = phrase.charAt(0).toUpperCase() + phrase.slice(1)
              if (enhanced !== phrase) {
                const prefix = textBeforeRecording.current
                const separator = prefix ? ' ' : ''
                onTranscriptChange(prefix + separator + enhanced)
              }
            }, 800)
          }
        }
      }, 50)

      // Stop recording after streaming
      setTimeout(
        () => {
          setIsRecording(false)
          onRecordingStateChange?.(false)
        },
        recordingDelay + phrase.length * 25 + 100,
      )
    }, recordingDelay)
  }, [onTranscriptChange, onRecordingStateChange])

  const onPressIn = useCallback(() => {
    setIsHolding(true)
    setIsRecording(true)
    onRecordingStateChange?.(true)

    // Capture current text before recording starts
    textBeforeRecording.current = getCurrentText?.() ?? ''

    // Clear any previous timers
    if (recordingTimer.current) {
      clearTimeout(recordingTimer.current)
    }
    if (enhanceTimer.current) {
      clearTimeout(enhanceTimer.current)
    }

    simulateRecording()
  }, [simulateRecording, onRecordingStateChange, getCurrentText])

  const onPressOut = useCallback(() => {
    setIsHolding(false)
    // In mock, we let the recording finish naturally
    // In real implementation, this would stop the recording
  }, [])

  return {
    isRecording,
    isHolding,
    isEnhancing,
    speechSupported: true, // Always true in mock
    onPressIn,
    onPressOut,
  }
}
