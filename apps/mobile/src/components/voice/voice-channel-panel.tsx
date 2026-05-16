import { Headphones, Mic, MicOff, PhoneOff, Volume2, VolumeX } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { RtcSurfaceView } from 'react-native-agora'
import { useVoiceChannel } from '../../hooks/use-voice-channel'
import { fontSize, radius, spacing, useColors } from '../../theme'
import { AppText, BackgroundSurface, Button, GlassHeader, GlassPanel } from '../ui'

export function VoiceChannelPanel({
  channelId,
  channelName,
  onBack,
}: {
  channelId: string
  channelName: string
  onBack: () => void
}) {
  const { t } = useTranslation()
  const colors = useColors()
  const voice = useVoiceChannel(channelId)
  const connected = voice.status === 'connected'
  const connecting = voice.status === 'connecting'

  return (
    <BackgroundSurface style={styles.container}>
      <GlassHeader style={styles.header}>
        <View style={styles.headerText}>
          <AppText variant="title" numberOfLines={1}>
            {channelName}
          </AppText>
          <AppText variant="label" tone="secondary">
            {connected
              ? t('voice.connectedCount', { count: voice.participants.length })
              : t('voice.ready')}
          </AppText>
        </View>
        <Button
          variant={connected ? 'danger' : 'primary'}
          size="sm"
          icon={connected ? PhoneOff : Volume2}
          loading={connecting}
          onPress={() => (connected ? void voice.leave() : void voice.join())}
        >
          {connected ? t('voice.leave') : t('voice.join')}
        </Button>
        <Button variant="ghost" size="sm" onPress={onBack}>
          {t('common.back')}
        </Button>
      </GlassHeader>

      <View style={styles.body}>
        {voice.error && (
          <GlassPanel style={[styles.error, { borderColor: colors.error }]}>
            <Text style={[styles.errorText, { color: colors.error }]}>{voice.error}</Text>
          </GlassPanel>
        )}

        <View style={styles.controls}>
          <Pressable
            disabled={!connected}
            onPress={voice.toggleMute}
            style={[
              styles.control,
              { backgroundColor: voice.isMuted ? `${colors.error}22` : colors.surface },
            ]}
          >
            {voice.isMuted ? (
              <MicOff size={22} color={colors.error} />
            ) : (
              <Mic size={22} color={colors.primary} />
            )}
            <Text style={[styles.controlLabel, { color: colors.text }]}>
              {voice.isMuted ? t('voice.unmute') : t('voice.mute')}
            </Text>
          </Pressable>
          <Pressable
            disabled={!connected}
            onPress={voice.toggleDeafen}
            style={[
              styles.control,
              { backgroundColor: voice.isDeafened ? `${colors.error}22` : colors.surface },
            ]}
          >
            <Headphones size={22} color={voice.isDeafened ? colors.error : colors.primary} />
            <Text style={[styles.controlLabel, { color: colors.text }]}>
              {voice.isDeafened ? t('voice.undeafen') : t('voice.deafen')}
            </Text>
          </Pressable>
          <Pressable
            disabled={!connected}
            onPress={voice.toggleSpeaker}
            style={[styles.control, { backgroundColor: colors.surface }]}
          >
            {voice.speakerEnabled ? (
              <Volume2 size={22} color={colors.primary} />
            ) : (
              <VolumeX size={22} color={colors.textMuted} />
            )}
            <Text style={[styles.controlLabel, { color: colors.text }]}>
              {voice.speakerEnabled ? t('voice.speaker') : t('voice.earpiece')}
            </Text>
          </Pressable>
        </View>

        {voice.remoteVideoUids.length > 0 && (
          <View style={styles.screens}>
            {voice.remoteVideoUids.map((uid) => (
              <View key={uid} style={styles.screenTile}>
                <RtcSurfaceView style={styles.screen} canvas={{ uid }} />
              </View>
            ))}
          </View>
        )}

        <GlassPanel style={styles.participants}>
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
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                {t('voice.noParticipants')}
              </Text>
            }
            renderItem={({ item }) => (
              <View
                style={[
                  styles.participantRow,
                  {
                    backgroundColor: colors.surface,
                    borderColor: item.isSpeaking ? colors.primary : colors.border,
                  },
                ]}
              >
                <View style={[styles.avatar, { backgroundColor: `${colors.primary}20` }]}>
                  <Text style={[styles.avatarText, { color: colors.primary }]}>
                    {(item.displayName ?? item.username).slice(0, 1).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.participantBody}>
                  <Text style={[styles.participantName, { color: colors.text }]} numberOfLines={1}>
                    {item.displayName ?? item.username}
                  </Text>
                  <Text style={[styles.participantMeta, { color: colors.textMuted }]}>
                    {item.isMuted ? t('voice.muted') : t('voice.listening')}
                  </Text>
                </View>
              </View>
            )}
          />
        </GlassPanel>
      </View>
    </BackgroundSurface>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  body: {
    flex: 1,
    padding: spacing.lg,
    gap: spacing.md,
  },
  error: {
    padding: spacing.md,
    borderWidth: 1,
  },
  errorText: {
    fontWeight: '700',
  },
  controls: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  control: {
    flex: 1,
    minHeight: 76,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  controlLabel: {
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
  screens: {
    gap: spacing.md,
  },
  screenTile: {
    height: 220,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  screen: {
    flex: 1,
  },
  participants: {
    flex: 1,
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
  emptyText: {
    textAlign: 'center',
    paddingVertical: spacing.xl,
    fontWeight: '700',
  },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.sm,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontWeight: '900',
  },
  participantBody: {
    flex: 1,
    minWidth: 0,
  },
  participantName: {
    fontSize: fontSize.md,
    fontWeight: '800',
  },
  participantMeta: {
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
})
