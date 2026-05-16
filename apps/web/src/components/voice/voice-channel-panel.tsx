import { cn } from '@shadowob/ui'
import {
  Headphones,
  Mic,
  MicOff,
  MonitorUp,
  Phone,
  PhoneOff,
  ScreenShareOff,
  Settings,
  UserPlus,
  Volume2,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { type RemoteScreen, type VoiceParticipant } from '../../hooks/use-voice-channel'
import { UserAvatar } from '../common/avatar'
import { NetworkQualityIcon } from './network-quality-icon'
import { useVoiceSession } from './voice-session-context'

function VideoTrackSurface({ track }: { track: RemoteScreen['track'] }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    let disposed = false

    element.innerHTML = ''
    requestAnimationFrame(() => {
      if (disposed || !ref.current) return
      try {
        track.play(ref.current, { fit: 'contain' })
      } catch {
        // Playback can fail transiently while the browser is attaching a screen track.
      }
    })

    return () => {
      disposed = true
      track.stop?.()
      element.innerHTML = ''
    }
  }, [track])

  return (
    <div
      ref={ref}
      className="absolute inset-0 h-full w-full bg-[#050607] [&_video]:!h-full [&_video]:!w-full [&_video]:!object-contain"
    />
  )
}

function ScreenTile({ screen }: { screen: RemoteScreen }) {
  return (
    <div className="relative min-h-[360px] overflow-hidden rounded-lg bg-[#050607] ring-1 ring-white/10">
      <VideoTrackSurface track={screen.track} />
      <div className="absolute bottom-3 left-3 rounded-md bg-black/65 px-3 py-1.5 text-sm font-black text-white">
        {screen.displayName}
      </div>
    </div>
  )
}

function LocalScreenPreview({ track }: { track: RemoteScreen['track'] }) {
  return <VideoTrackSurface track={track} />
}

function VoiceWaves({ active, level = 0 }: { active: boolean; level?: number }) {
  const height = Math.max(20, Math.min(64, level * 0.9))
  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-0 flex items-center justify-center rounded-full',
        active ? 'opacity-100' : 'opacity-0',
      )}
    >
      <span
        className="absolute rounded-full border-2 border-success/55"
        style={{ width: `${height + 86}px`, height: `${height + 86}px` }}
      />
      <span
        className="absolute animate-ping rounded-full border border-success/45"
        style={{ width: `${height + 110}px`, height: `${height + 110}px` }}
      />
    </div>
  )
}

function ParticipantTile({
  participant,
  localLevel,
}: {
  participant: VoiceParticipant
  localLevel: number
}) {
  const name = participant.displayName ?? participant.username
  const waveLevel = participant.isSpeaking ? Math.max(localLevel, 36) : 0

  return (
    <div
      className={cn(
        'relative flex min-h-[220px] flex-col items-center justify-center rounded-lg bg-[#f1eadf] text-[#16171b] ring-1 ring-white/10',
        participant.isSpeaking && 'ring-2 ring-success/70',
      )}
    >
      <div className="relative">
        <VoiceWaves active={participant.isSpeaking} level={waveLevel} />
        <UserAvatar
          userId={participant.userId}
          avatarUrl={participant.avatarUrl}
          displayName={name}
          size="xl"
          className="relative z-10 h-24 w-24 border-4 border-white shadow-xl"
        />
      </div>
      <div className="absolute bottom-4 left-4 flex max-w-[70%] items-center gap-2 rounded-md bg-black/50 px-3 py-1.5 text-sm font-black text-white">
        {participant.isMuted ? <MicOff size={15} /> : <Mic size={15} />}
        <span className="truncate">{name}</span>
      </div>
      <div className="absolute right-4 top-4 flex items-center gap-2 text-black/55">
        {participant.isScreenSharing && <MonitorUp size={18} />}
        {participant.isDeafened && <Headphones size={18} />}
      </div>
    </div>
  )
}

function ControlButton({
  active,
  danger,
  disabled,
  label,
  onClick,
  children,
}: {
  active?: boolean
  danger?: boolean
  disabled?: boolean
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={label}
      onClick={onClick}
      className={cn(
        'grid h-12 w-14 place-items-center rounded-xl bg-white/8 text-white/80 transition hover:bg-white/14 hover:text-white disabled:cursor-not-allowed disabled:opacity-45',
        active && 'bg-primary/25 text-primary hover:text-primary',
        danger && 'bg-danger text-white hover:bg-danger/90',
      )}
    >
      {children}
    </button>
  )
}

export function VoiceChannelPanel({
  channelId,
  channelName,
}: {
  channelId: string
  channelName: string
}) {
  const { t } = useTranslation()
  const {
    connectedVoiceChannel,
    voice,
    joinVoiceChannel,
    leaveVoiceChannel,
    showVoiceSettings,
    setShowVoiceSettings,
  } = useVoiceSession()
  const connectedToThisChannel = connectedVoiceChannel?.id === channelId
  const connected = connectedToThisChannel && voice.status === 'connected'
  const connecting = connectedToThisChannel && voice.status === 'connecting'
  const errorMessage = voice.errorKey ? t(`voice.errors.${voice.errorKey}`) : voice.error
  const participants = connectedToThisChannel ? voice.participants : []
  const screens = connectedToThisChannel ? voice.remoteScreens : []
  const localScreenTrack = connectedToThisChannel ? voice.localScreenTrack : null

  const stageItems = useMemo(() => {
    if (localScreenTrack || screens.length > 0) return null
    return participants
  }, [localScreenTrack, participants, screens.length])

  return (
    <section className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden rounded-2xl bg-black text-white ring-1 ring-white/10">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/8 px-5">
        <Volume2 size={22} className="text-white/70" />
        <div className="min-w-0">
          <h1 className="truncate text-base font-black">{channelName}</h1>
          <div className="mt-0.5 flex h-5 items-center gap-2">
            {connectedToThisChannel ? (
              <NetworkQualityIcon quality={voice.networkQuality} />
            ) : (
              <span className="text-xs font-black text-success">{t('voice.ready')}</span>
            )}
          </div>
        </div>
        {errorMessage && connectedToThisChannel && (
          <div className="ml-auto max-w-[360px] truncate rounded-lg border border-danger/35 bg-danger/15 px-3 py-1.5 text-xs font-bold text-danger">
            {errorMessage}
          </div>
        )}
      </header>

      <div className="relative min-h-0 flex-1 overflow-y-auto px-8 py-7">
        {!connectedToThisChannel && (
          <div className="flex h-full min-h-[520px] items-center justify-center">
            <div className="text-center">
              <div className="mx-auto mb-5 grid h-24 w-24 place-items-center rounded-full bg-white/10 text-white/75">
                <Volume2 size={42} />
              </div>
              <h2 className="text-2xl font-black">{channelName}</h2>
              <p className="mt-2 text-sm font-bold text-white/50">{t('voice.ready')}</p>
              <button
                type="button"
                onClick={() => void joinVoiceChannel({ id: channelId, name: channelName })}
                className="mt-6 inline-flex h-12 items-center gap-2 rounded-xl bg-success px-5 text-sm font-black text-black transition hover:brightness-110"
              >
                <Phone size={18} />
                {t('voice.join')}
              </button>
            </div>
          </div>
        )}

        {connectedToThisChannel && (
          <div className="mx-auto flex min-h-full max-w-5xl flex-col justify-center gap-4 pb-20">
            {localScreenTrack && (
              <div className="relative min-h-[420px] overflow-hidden rounded-lg bg-[#050607] ring-1 ring-primary/35">
                <LocalScreenPreview track={localScreenTrack} />
                <div className="absolute bottom-3 left-3 rounded-md bg-black/65 px-3 py-1.5 text-sm font-black">
                  {t('voice.yourScreen')}
                </div>
              </div>
            )}
            {screens.map((screen) => (
              <ScreenTile key={String(screen.uid)} screen={screen} />
            ))}
            {stageItems && stageItems.length > 0 && (
              <div
                className={cn(
                  'grid gap-4',
                  stageItems.length === 1
                    ? 'grid-cols-1'
                    : stageItems.length === 2
                      ? 'grid-cols-1 xl:grid-cols-2'
                      : 'grid-cols-1 lg:grid-cols-2 xl:grid-cols-3',
                )}
              >
                {stageItems.map((participant) => (
                  <ParticipantTile
                    key={participant.userId}
                    participant={participant}
                    localLevel={voice.inputVolume}
                  />
                ))}
              </div>
            )}
            {stageItems && stageItems.length === 0 && (
              <div className="flex min-h-[420px] items-center justify-center rounded-lg bg-white/[0.04] ring-1 ring-white/8">
                <div className="text-center">
                  <UserPlus size={40} className="mx-auto text-white/35" />
                  <p className="mt-3 text-sm font-black text-white/55">
                    {t('voice.noParticipants')}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {connectedToThisChannel && (
        <div className="pointer-events-none absolute inset-x-0 bottom-5 flex justify-center px-4">
          <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-white/10 bg-[#111216]/90 p-2 shadow-2xl backdrop-blur-xl">
            <ControlButton
              active={voice.isMuted}
              danger={voice.isMuted}
              disabled={!connected}
              label={voice.isMuted ? t('voice.unmute') : t('voice.mute')}
              onClick={() => void voice.toggleMute()}
            >
              {voice.isMuted ? <MicOff size={22} /> : <Mic size={22} />}
            </ControlButton>
            <ControlButton
              active={voice.isDeafened}
              danger={voice.isDeafened}
              disabled={!connected}
              label={voice.isDeafened ? t('voice.undeafen') : t('voice.deafen')}
              onClick={() => voice.toggleDeafen()}
            >
              <Headphones size={22} />
            </ControlButton>
            <ControlButton
              active={voice.isScreenSharing}
              disabled={!connected}
              label={voice.isScreenSharing ? t('voice.stopShare') : t('voice.shareScreen')}
              onClick={() =>
                voice.isScreenSharing ? void voice.stopScreenShare() : void voice.startScreenShare()
              }
            >
              {voice.isScreenSharing ? <ScreenShareOff size={22} /> : <MonitorUp size={22} />}
            </ControlButton>
            <ControlButton
              active={showVoiceSettings}
              label={t('voice.settings')}
              onClick={() => {
                setShowVoiceSettings((open) => !open)
                void voice.refreshDevices()
              }}
            >
              <Settings size={22} />
            </ControlButton>
            <ControlButton
              danger
              disabled={connecting}
              label={t('voice.disconnect')}
              onClick={() => void leaveVoiceChannel()}
            >
              <PhoneOff size={22} />
            </ControlButton>
          </div>
        </div>
      )}

      {connectedToThisChannel && showVoiceSettings && (
        <aside className="absolute bottom-24 left-1/2 w-[min(340px,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-white/10 bg-[#111216]/95 p-4 shadow-2xl backdrop-blur-xl">
          <div className="mb-3 text-sm font-black">{t('voice.settings')}</div>
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-black uppercase tracking-[0.12em] text-white/45">
                {t('voice.inputDevice')}
              </span>
              <select
                value={voice.selectedMicrophoneId}
                onChange={(event) => void voice.setMicrophoneDevice(event.target.value)}
                className="h-10 w-full rounded-lg border border-white/10 bg-black/35 px-3 text-sm font-bold text-white outline-none"
              >
                <option value="">{t('voice.defaultDevice')}</option>
                {voice.microphones.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || t('voice.unknownDevice')}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-black uppercase tracking-[0.12em] text-white/45">
                {t('voice.outputDevice')}
              </span>
              <select
                value={voice.selectedSpeakerId}
                onChange={(event) => void voice.setSpeakerDevice(event.target.value)}
                className="h-10 w-full rounded-lg border border-white/10 bg-black/35 px-3 text-sm font-bold text-white outline-none"
              >
                <option value="">{t('voice.defaultDevice')}</option>
                {voice.speakers.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || t('voice.unknownDevice')}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 flex items-center justify-between text-xs font-black uppercase tracking-[0.12em] text-white/45">
                <span>{t('voice.outputVolume')}</span>
                <span>{voice.outputVolume}%</span>
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={voice.outputVolume}
                onChange={(event) => voice.setOutputVolume(Number(event.target.value))}
                className="w-full accent-primary"
              />
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() =>
                  voice.isTestingMic ? voice.stopMicTest() : void voice.startMicTest()
                }
                className="h-9 rounded-lg bg-white/8 px-3 text-xs font-black text-white/70 transition hover:bg-white/14 hover:text-white"
              >
                {voice.isTestingMic ? t('voice.stopTest') : t('voice.testMic')}
              </button>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-success transition-[width]"
                  style={{ width: `${Math.min(100, voice.micTestLevel)}%` }}
                />
              </div>
            </div>
          </div>
        </aside>
      )}
    </section>
  )
}
