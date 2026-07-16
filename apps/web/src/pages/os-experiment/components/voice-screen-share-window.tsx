import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ScreenShareStage,
  type ScreenStageItem,
} from '../../../components/voice/voice-channel-panel'
import { useVoiceSession } from '../../../components/voice/voice-session-context'

export function OsVoiceScreenShareWindow({ channelId }: { channelId?: string }) {
  const { t } = useTranslation()
  const { connectedVoiceChannel, voice } = useVoiceSession()
  const items = useMemo<ScreenStageItem[]>(() => {
    if (!channelId || connectedVoiceChannel?.id !== channelId) return []
    const next: ScreenStageItem[] = []
    if (voice.localScreenTrack) {
      next.push({
        id: 'local',
        label: t('voice.yourScreen'),
        track: voice.localScreenTrack,
        local: true,
      })
    }
    for (const screen of voice.remoteScreens) {
      next.push({
        id: String(screen.uid),
        label: screen.displayName,
        track: screen.track,
      })
    }
    return next
  }, [channelId, connectedVoiceChannel?.id, t, voice.localScreenTrack, voice.remoteScreens])

  if (items.length === 0) {
    return (
      <div className="grid h-full min-h-0 place-items-center bg-black text-sm font-bold text-white/55">
        {t('os.windowUnavailable')}
      </div>
    )
  }

  return <ScreenShareStage items={items} fill />
}
