import { usePathname, useRouter } from 'expo-router'
import { GripVertical, Mic, MicOff, PhoneOff, Volume2 } from 'lucide-react-native'
import { createContext, type ReactNode, useContext, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dimensions, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useVoiceChannel, type VoiceChannelController } from '../../hooks/use-voice-channel'
import { fontSize, radius, spacing, useColors } from '../../theme'

export interface VoiceChannelSummary {
  channelId: string
  channelName: string
  serverSlug?: string | null
}

interface VoiceSessionContextValue {
  activeChannel: VoiceChannelSummary | null
  setActiveChannel: (channel: VoiceChannelSummary) => void
  voice: VoiceChannelController
}

const VoiceSessionContext = createContext<VoiceSessionContextValue | null>(null)

export function VoiceSessionProvider({ children }: { children: ReactNode }) {
  const [activeChannel, setActiveChannel] = useState<VoiceChannelSummary | null>(null)
  const voice = useVoiceChannel(activeChannel?.channelId ?? null)
  const value = useMemo(() => ({ activeChannel, setActiveChannel, voice }), [activeChannel, voice])

  return (
    <VoiceSessionContext.Provider value={value}>
      {children}
      <FloatingVoiceCall />
    </VoiceSessionContext.Provider>
  )
}

export function useVoiceSession() {
  const value = useContext(VoiceSessionContext)
  if (!value) throw new Error('useVoiceSession must be used inside VoiceSessionProvider')
  return value
}

function FloatingVoiceCall() {
  const { activeChannel, voice } = useVoiceSession()
  const colors = useColors()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const pathname = usePathname()
  const { t } = useTranslation()
  const [position, setPosition] = useState<{ x: number; y: number }>(() => {
    const windowSize = Dimensions.get('window')
    return { x: spacing.md, y: Math.max(spacing.md, windowSize.height - insets.bottom - 88) }
  })
  const dragOrigin = useRef<{ x: number; y: number } | null>(null)
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2,
        onPanResponderGrant: () => {
          dragOrigin.current = position
        },
        onPanResponderMove: (_, gesture) => {
          const windowSize = Dimensions.get('window')
          const origin = dragOrigin.current ?? position
          setPosition({
            x: Math.max(spacing.xs, Math.min(origin.x + gesture.dx, windowSize.width - 332)),
            y: Math.max(spacing.xs, Math.min(origin.y + gesture.dy, windowSize.height - 82)),
          })
        },
        onPanResponderRelease: () => {
          dragOrigin.current = null
        },
        onPanResponderTerminate: () => {
          dragOrigin.current = null
        },
      }),
    [position],
  )

  if (!activeChannel) return null
  if (voice.status === 'idle') return null
  const targetPath =
    activeChannel.serverSlug &&
    `/(main)/servers/${activeChannel.serverSlug}/channels/${activeChannel.channelId}`
  const hasSpeakingParticipant = voice.participants.some((participant) => participant.isSpeaking)
  if (activeChannel.serverSlug && pathname?.includes(`/servers/${activeChannel.serverSlug}`)) {
    return null
  }

  return (
    <View pointerEvents="box-none" style={[styles.overlay, { left: position.x, top: position.y }]}>
      <Pressable
        onPress={() => {
          if (targetPath) router.push(targetPath as never)
        }}
        style={[
          styles.floatingCall,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            shadowColor: '#000',
          },
        ]}
      >
        <View
          {...panResponder.panHandlers}
          style={[styles.callHandle, { borderColor: colors.border }]}
        >
          <GripVertical size={15} color={colors.textMuted} />
        </View>
        <View style={[styles.wave, { backgroundColor: `${colors.primary}18` }]}>
          {[0.45, 0.85, 1, 0.6].map((weight) => (
            <View
              key={weight}
              style={[
                styles.waveBar,
                {
                  backgroundColor: colors.primary,
                  height: 9 + (hasSpeakingParticipant && !voice.isMuted ? 1 : 0.18) * weight * 20,
                  opacity: voice.isMuted ? 0.35 : 1,
                },
              ]}
            />
          ))}
        </View>
        <View style={[styles.callIcon, { backgroundColor: `${colors.primary}22` }]}>
          <Volume2 size={18} color={colors.primary} />
        </View>
        <View style={styles.callText}>
          <Text style={[styles.callTitle, { color: colors.text }]} numberOfLines={1}>
            {activeChannel.channelName}
          </Text>
          <Text style={[styles.callMeta, { color: colors.textMuted }]} numberOfLines={1}>
            {t('voice.activeCall')}
          </Text>
        </View>
        <Pressable
          accessibilityLabel={voice.isMuted ? t('voice.unmute') : t('voice.mute')}
          onPress={(event) => {
            event.stopPropagation()
            voice.toggleMute()
          }}
          style={[styles.iconButton, { backgroundColor: colors.background }]}
        >
          {voice.isMuted ? (
            <MicOff size={16} color={colors.error} />
          ) : (
            <Mic size={16} color={colors.primary} />
          )}
        </Pressable>
        <Pressable
          accessibilityLabel={t('voice.leave')}
          onPress={(event) => {
            event.stopPropagation()
            void voice.leave()
          }}
          style={[styles.iconButton, { backgroundColor: `${colors.error}18` }]}
        >
          <PhoneOff size={16} color={colors.error} />
        </Pressable>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    zIndex: 50,
  },
  floatingCall: {
    minHeight: 58,
    width: 324,
    maxWidth: '100%',
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  callHandle: {
    width: 30,
    height: 42,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wave: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  waveBar: {
    width: 3,
    borderRadius: 999,
  },
  callIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callText: {
    flex: 1,
    minWidth: 0,
  },
  callTitle: {
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
  callMeta: {
    marginTop: 2,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
