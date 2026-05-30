import Constants from 'expo-constants'
import { Mic, Wand2 } from 'lucide-react-native'
import { useState } from 'react'

import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useVoiceInput } from '../../hooks/use-voice-input'
import {
  border,
  fontSize,
  iconSize,
  lineHeight,
  palette,
  radius,
  size,
  spacing,
  useColors,
} from '../../theme'
import { TypelessMicButton } from './typeless-mic-button'

/**
 * Voice Input Demo Component
 *
 * For testing TypeLess-style voice input in Expo Go.
 * Shows which implementation is being used (mock vs real).
 */
export function VoiceInputDemo() {
  const colors = useColors()

  const [inputText, setInputText] = useState('')
  const [logs, setLogs] = useState<string[]>([])

  const _isExpoGo = Constants.appOwnership === 'expo'

  const addLog = (message: string) => {
    setLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${message}`, ...prev].slice(0, 20))
  }

  const { isRecording, isHolding, isEnhancing, onPressIn, onPressOut, isMock } = useVoiceInput({
    speechLang: 'zh-CN',
    onPermissionDenied: () => {
      Alert.alert('需要麦克风权限')
      addLog('Permission denied')
    },
    onUnavailable: () => {
      Alert.alert('语音输入不可用')
      addLog('Voice input unavailable')
    },
    onTranscriptChange: (text) => {
      setInputText(text)
      addLog(`Transcript: "${text}"`)
    },
    onRecordingStateChange: (isRecording) => {
      addLog(isRecording ? 'Recording started' : 'Recording stopped')
    },
  })

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Status Banner */}
      <View
        style={[
          styles.banner,
          { backgroundColor: isMock ? palette.warningSurface : palette.successSurface },
        ]}
      >
        <View style={styles.bannerIcon}>
          {isMock ? (
            <Wand2 size={iconSize.xl} color={palette.warning} />
          ) : (
            <Mic size={iconSize.xl} color={palette.emerald} />
          )}
        </View>
        <View style={styles.bannerContent}>
          <Text style={[styles.bannerTitle, { color: colors.text }]}>
            {isMock ? 'Mock Mode (Expo Go)' : 'Real Voice Input'}
          </Text>
          <Text style={[styles.bannerSubtitle, { color: colors.textMuted }]}>
            {isMock ? 'Using simulated phrases for UI testing' : 'Using device speech recognition'}
          </Text>
        </View>
      </View>

      {/* Demo Input */}
      <View style={styles.demoSection}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Try Voice Input</Text>
        <Text style={[styles.sectionDesc, { color: colors.textMuted }]}>
          Press and hold the mic button to simulate recording
        </Text>

        <View style={styles.micContainer}>
          <TypelessMicButton
            isRecording={isRecording}
            isHolding={isHolding}
            onPressIn={() => {
              addLog('Button pressed')
              onPressIn()
            }}
            onPressOut={() => {
              addLog('Button released')
              onPressOut()
            }}
          />
          {isRecording && (
            <Text style={[styles.recordingText, { color: colors.error }]}>
              {isEnhancing ? 'Enhancing...' : 'Recording...'}
            </Text>
          )}
        </View>

        <View style={[styles.inputPreview, { backgroundColor: colors.inputBackground }]}>
          <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Result:</Text>
          <Text style={[styles.inputText, { color: colors.text }]}>
            {inputText || 'Press and hold mic to speak...'}
          </Text>
        </View>
      </View>

      {/* Sample Phrases */}
      {isMock && (
        <View style={styles.samplesSection}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Sample Phrases (Mock)</Text>
          <Text style={[styles.sectionDesc, { color: colors.textMuted }]}>
            The mock will randomly select from these phrases:
          </Text>
          <View style={styles.samplesList}>
            <Text style={[styles.sampleItem, { color: colors.textSecondary }]}>
              • "我们明天见面，不对，后天见面" (self-correction)
            </Text>
            <Text style={[styles.sampleItem, { color: colors.textSecondary }]}>
              • "购物清单：牛奶，面包，鸡蛋" (list formatting)
            </Text>
            <Text style={[styles.sampleItem, { color: colors.textSecondary }]}>
              • "嗯，我觉得啊，这个方案可以" (filler removal)
            </Text>
            <Text style={[styles.sampleItem, { color: colors.textSecondary }]}>
              • "Let's meet at 7, actually, 8 PM" (English correction)
            </Text>
          </View>
        </View>
      )}

      {/* Logs */}
      <View style={styles.logsSection}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Event Logs</Text>
        <ScrollView style={[styles.logsContainer, { backgroundColor: colors.surface }]}>
          {logs.length === 0 ? (
            <Text style={[styles.emptyLogs, { color: colors.textMuted }]}>No events yet...</Text>
          ) : (
            logs.map((log) => (
              <Text key={log} style={[styles.logItem, { color: colors.textSecondary }]}>
                {log}
              </Text>
            ))
          )}
        </ScrollView>
      </View>

      {/* Instructions */}
      <View style={styles.instructions}>
        <Text style={[styles.instructionTitle, { color: colors.text }]}>
          How to test real voice input:
        </Text>
        <Text style={[styles.instructionText, { color: colors.textMuted }]}>
          1. Run: npx expo run:ios (or run:android){'\n'}
          2. This creates a Development Build with native modules{'\n'}
          3. Voice input will use real speech recognition
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.md,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.lg,
    marginBottom: spacing.lg,
  },
  bannerIcon: {
    width: size.iconButtonLg,
    height: size.iconButtonLg,
    borderRadius: radius.xl,
    backgroundColor: palette.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  bannerContent: {
    flex: 1,
  },
  bannerTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  bannerSubtitle: {
    fontSize: fontSize.sm,
    marginTop: spacing.xxs,
  },
  demoSection: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  sectionDesc: {
    fontSize: fontSize.sm,
    marginBottom: spacing.md,
  },
  micContainer: {
    alignItems: 'center',
    marginVertical: spacing.lg,
  },
  recordingText: {
    marginTop: spacing.sm,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  inputPreview: {
    padding: spacing.md,
    borderRadius: radius.lg,
    minHeight: size.textareaMin,
  },
  inputLabel: {
    fontSize: fontSize.xs,
    marginBottom: spacing.xs,
  },
  inputText: {
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
  },
  samplesSection: {
    marginBottom: spacing.lg,
  },
  samplesList: {
    marginTop: spacing.sm,
  },
  sampleItem: {
    fontSize: fontSize.sm,
    marginBottom: spacing.xs,
    lineHeight: lineHeight.sm,
  },
  logsSection: {
    flex: 1,
    marginBottom: spacing.lg,
  },
  logsContainer: {
    flex: 1,
    padding: spacing.sm,
    borderRadius: radius.md,
    maxHeight: size.profileHeroMinHeight - size.thumbnailMd,
  },
  emptyLogs: {
    fontSize: fontSize.sm,
    textAlign: 'center',
    padding: spacing.md,
  },
  logItem: {
    fontSize: fontSize.xs,
    marginBottom: spacing.xs,
    fontFamily: 'monospace',
  },
  instructions: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: border.hairline,
    borderColor: palette.neutral200,
  },
  instructionTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  instructionText: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
  },
})
