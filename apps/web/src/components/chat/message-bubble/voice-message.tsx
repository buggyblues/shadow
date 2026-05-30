import { cn } from '@shadowob/ui'
import { Loader2, Pause, Radio, Volume2 } from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../../lib/api'
import { resolveAttachmentMediaUrl } from './media'
import type { Attachment } from './types'

const DEFAULT_PEAKS = [
  18, 32, 54, 42, 76, 64, 30, 46, 68, 58, 36, 72, 88, 52, 34, 60, 78, 44, 28, 66, 84, 50, 38, 70,
  56, 32, 62, 74, 48, 26, 58, 82, 64, 40, 30, 54,
]

function normalizePeaks(peaks?: number[] | null) {
  if (!peaks?.length) return DEFAULT_PEAKS
  return peaks.map((peak) => Math.max(8, Math.min(100, peak)))
}

function formatDuration(durationMs?: number | null, fallbackSeconds = 0) {
  const secondsValue =
    typeof durationMs === 'number' && durationMs > 0
      ? durationMs / 1000
      : fallbackSeconds > 0
        ? fallbackSeconds
        : null
  if (!secondsValue) return '--:--'
  const totalSeconds = Math.max(1, Math.round(secondsValue))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

async function markVoicePlayback(attachmentId: string, positionMs: number, completed: boolean) {
  await fetchApi(`/api/attachments/${attachmentId}/voice-playback`, {
    method: 'PUT',
    body: JSON.stringify({ positionMs, completed }),
  })
}

interface VoiceMessageViewProps {
  attachment: Attachment
  isOwn?: boolean
}

function VoiceMessageViewBase({ attachment, isOwn = false }: VoiceMessageViewProps) {
  const { t } = useTranslation()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const markedStartedRef = useRef(false)
  const [mediaUrl, setMediaUrl] = useState<string | null>(null)
  const [isResolving, setIsResolving] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [durationSeconds, setDurationSeconds] = useState((attachment.durationMs ?? 0) / 1000)
  const [playbackPlayed, setPlaybackPlayed] = useState(Boolean(attachment.playback?.played))
  const [transcript, setTranscript] = useState(attachment.transcript ?? null)
  const peaks = useMemo(() => normalizePeaks(attachment.waveformPeaks), [attachment.waveformPeaks])

  useEffect(() => {
    setPlaybackPlayed(Boolean(attachment.playback?.played))
  }, [attachment.playback?.played])

  useEffect(() => {
    setTranscript(attachment.transcript ?? null)
  }, [attachment.transcript])

  useEffect(() => {
    setDurationSeconds((attachment.durationMs ?? 0) / 1000)
    setProgress(0)
  }, [attachment.durationMs, attachment.id])

  useEffect(() => {
    return () => {
      audioRef.current?.pause()
      audioRef.current = null
    }
  }, [])

  useEffect(() => {
    if ((attachment.durationMs ?? 0) > 0 || durationSeconds > 0) return

    let cancelled = false
    let metadataAudio: HTMLAudioElement | null = null
    void resolveAttachmentMediaUrl(attachment.id, 'inline')
      .then((resolved) => {
        if (cancelled) return
        setMediaUrl(resolved.url)
        metadataAudio = new Audio(resolved.url)
        metadataAudio.preload = 'metadata'
        metadataAudio.addEventListener(
          'loadedmetadata',
          () => {
            if (!cancelled && metadataAudio && Number.isFinite(metadataAudio.duration)) {
              setDurationSeconds(metadataAudio.duration)
            }
          },
          { once: true },
        )
        metadataAudio.load()
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
      metadataAudio?.pause()
      metadataAudio = null
    }
  }, [attachment.durationMs, attachment.id, durationSeconds])

  const ensureAudio = useCallback(async () => {
    if (audioRef.current) return audioRef.current
    setIsResolving(true)
    try {
      const url = mediaUrl ?? (await resolveAttachmentMediaUrl(attachment.id, 'inline')).url
      setMediaUrl(url)
      const audio = new Audio(url)
      audio.preload = 'metadata'
      audioRef.current = audio
      audio.addEventListener('loadedmetadata', () => {
        if (Number.isFinite(audio.duration)) setDurationSeconds(audio.duration)
      })
      audio.addEventListener('timeupdate', () => {
        const total = audio.duration || durationSeconds || (attachment.durationMs ?? 0) / 1000 || 1
        setProgress(Math.min(1, audio.currentTime / total))
      })
      audio.addEventListener('ended', () => {
        setIsPlaying(false)
        setProgress(1)
        void markVoicePlayback(
          attachment.id,
          Math.round((attachment.durationMs ?? 0) || audio.duration * 1000),
          true,
        ).catch(() => undefined)
      })
      return audio
    } finally {
      setIsResolving(false)
    }
  }, [attachment.durationMs, attachment.id, durationSeconds, mediaUrl])

  const togglePlayback = useCallback(async () => {
    const audio = await ensureAudio()
    if (isPlaying) {
      audio.pause()
      setIsPlaying(false)
      void markVoicePlayback(attachment.id, Math.round(audio.currentTime * 1000), false).catch(
        () => undefined,
      )
      return
    }

    await audio.play()
    setIsPlaying(true)
    if (!markedStartedRef.current) {
      markedStartedRef.current = true
      setPlaybackPlayed(true)
      void markVoicePlayback(attachment.id, Math.round(audio.currentTime * 1000), false).catch(
        () => undefined,
      )
    }
  }, [attachment.id, ensureAudio, isPlaying])

  const activeIndex = Math.floor(progress * peaks.length)
  const showUnread = !isOwn && !playbackPlayed
  const playedCount = attachment.playback?.playedCount

  return (
    <div className="w-fit max-w-[min(76vw,22rem)]">
      <button
        type="button"
        onClick={() => void togglePlayback().catch(() => undefined)}
        disabled={isResolving}
        className={cn(
          'group relative flex min-h-11 min-w-[8.5rem] items-center gap-2.5 rounded-[14px] px-3 py-2 text-left shadow-sm transition hover:brightness-105 disabled:opacity-60',
          isOwn
            ? 'bg-[#3DDC84] text-[#06140D]'
            : 'border border-border-subtle bg-bg-secondary/90 text-text-primary dark:border-white/8 dark:bg-[#11131a]',
        )}
        title={isPlaying ? t('chat.voicePause') : t('chat.voicePlay')}
      >
        <span className="shrink-0 text-[15px] font-black tabular-nums">
          {formatDuration(attachment.durationMs, durationSeconds)}
        </span>
        <span
          className="flex h-8 min-w-[5rem] flex-1 items-center gap-[3px]"
          aria-label={t('chat.voiceWaveform')}
        >
          {peaks.slice(0, 34).map((peak, index) => (
            <span
              key={`${attachment.id}-${index}`}
              className={cn(
                'w-[3px] rounded-full transition-colors',
                index <= activeIndex
                  ? isOwn
                    ? 'bg-[#06140D]'
                    : 'bg-primary'
                  : isOwn
                    ? 'bg-[#06140D]/35'
                    : 'bg-text-muted/35',
              )}
              style={{ height: `${Math.max(7, Math.round(peak * 0.24))}px` }}
            />
          ))}
        </span>
        <span className="grid h-7 w-7 shrink-0 place-items-center">
          {isResolving ? (
            <Loader2 size={17} className="animate-spin" />
          ) : isPlaying ? (
            <Pause size={18} fill="currentColor" />
          ) : (
            <Volume2 size={19} />
          )}
        </span>
        {showUnread && (
          <span
            className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-danger"
            aria-label={t('chat.voiceUnread')}
          />
        )}
        <span className="sr-only">{mediaUrl}</span>
      </button>
      {typeof playedCount === 'number' && (
        <div className="mt-1 text-[11px] font-semibold text-text-muted">
          {t('chat.voicePlayedCount', { count: playedCount })}
        </div>
      )}
      {transcript?.status === 'ready' && transcript.text ? (
        <div className="mt-1 max-w-[min(76vw,24rem)] rounded-xl bg-bg-secondary/80 px-3 py-2 text-xs leading-5 text-text-secondary">
          <div className="mb-0.5 flex items-center gap-1.5 font-bold text-text-muted">
            <Radio size={12} />
            {t('chat.voiceTranscript')}
          </div>
          <p className="whitespace-pre-wrap break-words">{transcript.text}</p>
        </div>
      ) : transcript?.status === 'pending' || transcript?.status === 'processing' ? (
        <div className="mt-1 text-xs font-semibold text-text-muted">
          {t('chat.voiceTranscriptPending')}
        </div>
      ) : null}
    </div>
  )
}

export const VoiceMessageView = memo(VoiceMessageViewBase)
