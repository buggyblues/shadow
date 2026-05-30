import { usePathname, useRouter } from 'expo-router'
import { GripVertical, Mic, MicOff, PhoneOff, Volume2 } from 'lucide-react-native'
import { createContext, type ReactNode, useContext, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dimensions, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useVoiceChannel, type VoiceChannelController } from '../../hooks/use-voice-channel'
import { serverChannelHref } from '../../lib/routes'
import { border, fontSize, iconSize, radius, size, spacing, useColors } from '../../theme'

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
  const targetPath = activeChannel.serverSlug
    ? serverChannelHref(activeChannel.serverSlug, activeChannel.channelId)
    : null
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
          },
        ]}
      >
        <View
          {...panResponder.panHandlers}
          style={[styles.callHandle, { borderColor: colors.border }]}
        >
          <GripVertical size={iconSize.sm} color={colors.textMuted} />
        </View>
        <View style={[styles.wave, { backgroundColor: colors.inputBackground }]}>
          {[0.45, 0.85, 1, 0.6].map((weight) => (
            <View
              key={weight}
              style={[
                styles.waveBar,
                {
                  height:
                    size.audioBarBase +
                    (hasSpeakingParticipant && !voice.isMuted ? 1 : 0.18) *
                      weight *
                      size.audioBarRange,
                  backgroundColor: voice.isMuted ? colors.textMuted : colors.primary,
                },
              ]}
            />
          ))}
        </View>
        <View style={[styles.callIcon, { backgroundColor: colors.inputBackground }]}>
          <Volume2 size={iconSize.lg} color={colors.primary} />
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
            <MicOff size={iconSize.md} color={colors.error} />
          ) : (
            <Mic size={iconSize.md} color={colors.primary} />
          )}
        </Pressable>
        <Pressable
          accessibilityLabel={t('voice.leave')}
          onPress={(event) => {
            event.stopPropagation()
            void voice.leave()
          }}
          style={[styles.iconButton, { backgroundColor: colors.inputBackground }]}
        >
          <PhoneOff size={iconSize.md} color={colors.error} />
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
    minHeight: size.tabBar,
    width: size.floatingCallWidth,
    maxWidth: '100%',
    borderRadius: radius.lg,
    borderWidth: border.hairline,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  callHandle: {
    width: size.callHandleWidth,
    height: size.callHandleHeight,
    borderRadius: radius.md,
    borderWidth: border.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wave: {
    width: size.iconBubble,
    height: size.iconBubble,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
  },
  waveBar: {
    width: size.dividerAccent,
    borderRadius: radius.full,
  },
  callIcon: {
    width: size.iconBubble,
    height: size.iconBubble,
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
    marginTop: spacing.xxs,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  iconButton: {
    width: size.iconBubble,
    height: size.iconBubble,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
