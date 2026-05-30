import {
  AlertCircle,
  Headphones,
  Mic,
  MicOff,
  PhoneOff,
  Volume2,
  VolumeX,
} from 'lucide-react-native'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { getAgoraRtcSurfaceView } from '../../lib/agora'
import {
  border,
  iconSize,
  lineHeight,
  palette,
  radius,
  size,
  spacing,
  useColors,
} from '../../theme'
import { Avatar } from '../common/avatar'
import { AppText, BackgroundSurface, Button, MobileBackButton, MobileNavigationBar } from '../ui'
import { useVoiceSession } from './voice-session-provider'

export function VoiceChannelPanel({
  channelId,
  channelName,
  serverSlug,
  onBack,
}: {
  channelId: string
  channelName: string
  serverSlug?: string | null
  onBack: () => void
}) {
  const { t } = useTranslation()
  const colors = useColors()
  const { activeChannel, setActiveChannel, voice } = useVoiceSession()
  const [focusedVideoUid, setFocusedVideoUid] = useState<number | null>(null)
  const isCurrentSession = activeChannel?.channelId === channelId
  const connected = isCurrentSession && voice.status === 'connected'
  const connecting = isCurrentSession && voice.status === 'connecting'
  const RtcSurfaceView = focusedVideoUid !== null ? getAgoraRtcSurfaceView() : null
  const statusTitle = connected
    ? t('voice.activeCall')
    : connecting
      ? t('voice.connecting')
      : t('voice.ready')
  const statusDescription = voice.error
    ? t('voice.setupRequired')
    : connected
      ? t('voice.connectedCount', { count: voice.participants.length })
      : t('voice.callHint')

  useEffect(() => {
    const sameChannel =
      activeChannel?.channelId === channelId &&
      activeChannel.channelName === channelName &&
      activeChannel.serverSlug === serverSlug
    if (sameChannel) return
    if (!activeChannel || activeChannel.channelId === channelId || voice.status === 'idle') {
      setActiveChannel({ channelId, channelName, serverSlug })
    }
  }, [activeChannel, channelId, channelName, serverSlug, setActiveChannel, voice.status])

  useEffect(() => {
    if (voice.remoteVideoUids.length === 0) {
      setFocusedVideoUid(null)
      return
    }
    if (!focusedVideoUid || !voice.remoteVideoUids.includes(focusedVideoUid)) {
      setFocusedVideoUid(voice.remoteVideoUids[0] ?? null)
    }
  }, [focusedVideoUid, voice.remoteVideoUids])

  return (
    <BackgroundSurface style={styles.container}>
      <MobileNavigationBar
        title={channelName}
        left={<MobileBackButton onPress={onBack} />}
        right={
          <Button
            variant={connected ? 'danger' : 'primary'}
            size="sm"
            icon={connected ? PhoneOff : Volume2}
            loading={connecting}
            disabled={connecting}
            onPress={() => {
              if (!isCurrentSession) {
                setActiveChannel({ channelId, channelName, serverSlug })
                return
              }
              connected ? void voice.leave() : void voice.join()
            }}
          >
            {connected ? t('voice.leave') : t('voice.join')}
          </Button>
        }
      />

      <View style={styles.body}>
        <View
          style={[
            styles.statusCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View
            style={[
              styles.statusIcon,
              {
                backgroundColor: voice.error
                  ? colors.toneDangerSurface
                  : connected
                    ? colors.toneSuccessSurface
                    : colors.inputBackground,
              },
            ]}
          >
            {voice.error ? (
              <AlertCircle size={iconSize['2xl']} color={colors.error} strokeWidth={2.5} />
            ) : (
              <Volume2
                size={iconSize['2xl']}
                color={connected ? colors.success : colors.textMuted}
                strokeWidth={2.5}
              />
            )}
          </View>
          <View style={styles.statusCopy}>
            <AppText variant="bodyStrong">{statusTitle}</AppText>
            <AppText
              variant="label"
              tone={voice.error ? 'danger' : 'secondary'}
              style={styles.statusDescription}
            >
              {statusDescription}
            </AppText>
          </View>
        </View>

        {voice.error ? (
          <View
            style={[
              styles.notice,
              { backgroundColor: colors.toneDangerSurface, borderColor: colors.error },
            ]}
          >
            <AppText variant="bodyStrong" tone="danger">
              {t('voice.unavailableTitle')}
            </AppText>
            <AppText variant="label" tone="secondary" style={styles.noticeText}>
              {voice.error}
            </AppText>
          </View>
        ) : null}

        <View style={styles.controls}>
          <VoiceControlButton
            disabled={!connected}
            active={voice.isMuted}
            danger={voice.isMuted}
            icon={voice.isMuted ? MicOff : Mic}
            label={voice.isMuted ? t('voice.unmute') : t('voice.mute')}
            onPress={voice.toggleMute}
          />
          <VoiceControlButton
            disabled={!connected}
            active={voice.isDeafened}
            danger={voice.isDeafened}
            icon={Headphones}
            label={voice.isDeafened ? t('voice.undeafen') : t('voice.deafen')}
            onPress={voice.toggleDeafen}
          />
          <VoiceControlButton
            disabled={!connected}
            active={voice.speakerEnabled}
            icon={voice.speakerEnabled ? Volume2 : VolumeX}
            label={voice.speakerEnabled ? t('voice.speaker') : t('voice.earpiece')}
            onPress={voice.toggleSpeaker}
          />
        </View>

        {focusedVideoUid !== null ? (
          <View
            style={[
              styles.screenStage,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            {voice.remoteVideoUids.length > 1 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.screenTabs}
              >
                {voice.remoteVideoUids.map((uid, index) => {
                  const active = focusedVideoUid === uid
                  return (
                    <Pressable
                      key={uid}
                      accessibilityLabel={t('voice.focusScreen')}
                      onPress={() => setFocusedVideoUid(uid)}
                      style={[
                        styles.screenTab,
                        {
                          backgroundColor: active ? colors.primary : colors.surface,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <AppText
                        variant="label"
                        style={{ color: active ? palette.foundation : colors.text }}
                      >
                        {index + 1}
                      </AppText>
                    </Pressable>
                  )
                })}
              </ScrollView>
            ) : null}
            <ScrollView
              style={styles.screenViewport}
              contentContainerStyle={styles.screenZoomContent}
              maximumZoomScale={3}
              minimumZoomScale={1}
              bouncesZoom={false}
              decelerationRate="fast"
              centerContent
            >
              {RtcSurfaceView ? (
                <RtcSurfaceView style={styles.screen} canvas={{ uid: focusedVideoUid }} />
              ) : (
                <View style={[styles.screen, styles.screenFallback]}>
                  <AppText variant="bodyStrong" tone="secondary" style={styles.centerText}>
                    {t('voice.nativeModuleUnavailable')}
                  </AppText>
                </View>
              )}
            </ScrollView>
          </View>
        ) : null}

        <View
          style={[
            styles.participants,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={styles.participantHeader}>
            <AppText variant="headline">{t('voice.participants')}</AppText>
            <AppText variant="label" tone="secondary">
              {voice.participants.length}
            </AppText>
          </View>
          <FlatList
            data={voice.participants}
            keyExtractor={(item) => item.userId}
            contentContainerStyle={styles.participantList}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Headphones size={iconSize['4xl']} color={colors.textMuted} strokeWidth={2.2} />
                <AppText variant="bodyStrong" tone="secondary" style={styles.centerText}>
                  {t('voice.noParticipants')}
                </AppText>
              </View>
            }
            renderItem={({ item }) => {
              const name = item.displayName ?? item.username
              return (
                <View
                  style={[
                    styles.participantRow,
                    {
                      backgroundColor: colors.background,
                      borderColor: item.isSpeaking ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Avatar
                    uri={item.avatarUrl}
                    name={name}
                    userId={item.userId}
                    size={size.iconButtonLg}
                    status={item.isSpeaking ? 'online' : null}
                    showStatus={item.isSpeaking}
                  />
                  <View style={styles.participantBody}>
                    <AppText variant="bodyStrong" numberOfLines={1}>
                      {name}
                    </AppText>
                    <AppText variant="label" tone="secondary">
                      {item.isMuted ? t('voice.muted') : t('voice.listening')}
                    </AppText>
                  </View>
                </View>
              )
            }}
          />
        </View>
      </View>
    </BackgroundSurface>
  )
}

function VoiceControlButton({
  icon: Icon,
  label,
  active,
  danger,
  disabled,
  onPress,
}: {
  icon: typeof Mic
  label: string
  active?: boolean
  danger?: boolean
  disabled?: boolean
  onPress: () => void
}) {
  const colors = useColors()
  const iconColor = danger ? colors.error : active ? colors.primary : colors.textMuted

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.control,
        {
          backgroundColor: pressed ? colors.messageHover : colors.surface,
          borderColor: active ? colors.primary : colors.border,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <Icon size={iconSize['2xl']} color={iconColor} strokeWidth={2.5} />
      <AppText variant="bodyStrong" style={styles.controlLabel}>
        {label}
      </AppText>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  body: {
    flex: 1,
    padding: spacing.lg,
    gap: spacing.md,
  },
  statusCard: {
    minHeight: size.listItemLg,
    borderWidth: border.hairline,
    borderRadius: radius.xl,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  statusIcon: {
    width: size.controlLg,
    height: size.controlLg,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusCopy: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  statusDescription: {
    lineHeight: lineHeight.sm,
  },
  notice: {
    borderWidth: border.hairline,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  noticeText: {
    lineHeight: lineHeight.sm,
  },
  controls: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  control: {
    flex: 1,
    minHeight: size.listItemLg,
    borderWidth: border.hairline,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  controlLabel: {
    textAlign: 'center',
  },
  screenStage: {
    borderWidth: border.hairline,
    borderRadius: radius.xl,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  screenTabs: {
    gap: spacing.sm,
  },
  screenTab: {
    width: size.iconBubble,
    height: size.iconBubble,
    borderRadius: radius.md,
    borderWidth: border.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  screenViewport: {
    maxHeight: size.mediaViewportMaxHeight,
    borderRadius: radius.lg,
    backgroundColor: palette.black,
    overflow: 'hidden',
  },
  screenZoomContent: {
    minHeight: size.mediaPlaceholderMinHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  screen: {
    width: '100%',
    aspectRatio: 16 / 9,
  },
  screenFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  participants: {
    flex: 1,
    borderWidth: border.hairline,
    borderRadius: radius.xl,
    padding: spacing.lg,
  },
  participantHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  participantList: {
    gap: spacing.sm,
  },
  emptyState: {
    minHeight: size.panelStateMinHeight,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  centerText: {
    textAlign: 'center',
  },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: border.hairline,
    borderRadius: radius.lg,
    padding: spacing.sm,
  },
  participantBody: {
    flex: 1,
    minWidth: 0,
  },
})
