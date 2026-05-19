import { cn } from '@shadowob/ui'
import { useParams } from '@tanstack/react-router'
import {
  Headphones,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  MonitorUp,
  Phone,
  PhoneOff,
  ScreenShareOff,
  Settings,
  UserPlus,
  Volume2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
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

type ScreenStageItem = {
  id: string
  label: string
  track: RemoteScreen['track']
  local?: boolean
}

function ScreenShareStage({ items }: { items: ScreenStageItem[] }) {
  const { t } = useTranslation()
  const [activeId, setActiveId] = useState(items[0]?.id ?? '')
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [fullscreen, setFullscreen] = useState(false)
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)
  const pointersRef = useRef(new Map<number, { x: number; y: number }>())
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null)
  const active = items.find((item) => item.id === activeId) ?? items[0]

  useEffect(() => {
    if (!items.some((item) => item.id === activeId)) {
      setActiveId(items[0]?.id ?? '')
    }
  }, [activeId, items])

  useEffect(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [active?.id])

  if (!active) return null

  const updateZoom = (next: number) => {
    const clamped = Math.max(0.75, Math.min(4, next))
    setZoom(clamped)
    if (clamped === 1) setPan({ x: 0, y: 0 })
  }

  const resetZoom = () => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }

  const pointerDistance = () => {
    const points = Array.from(pointersRef.current.values())
    if (points.length < 2) return 0
    return Math.hypot(points[0]!.x - points[1]!.x, points[0]!.y - points[1]!.y)
  }

  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-lg bg-[#050607] ring-1 ring-primary/30',
        fullscreen
          ? 'fixed inset-3 z-[90] min-h-0 shadow-[0_24px_80px_rgba(0,0,0,0.55)] md:inset-6'
          : 'min-h-[min(68vh,760px)]',
      )}
    >
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/10 bg-black/55 p-2">
        {items.length > 1 && (
          <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto scrollbar-hidden">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                title={t('voice.focusScreen')}
                onClick={() => setActiveId(item.id)}
                className={cn(
                  'inline-flex h-8 max-w-48 items-center gap-2 rounded-lg px-3 text-xs font-black transition',
                  item.id === active.id
                    ? 'bg-primary/20 text-primary'
                    : 'bg-white/8 text-white/65 hover:bg-white/14 hover:text-white',
                )}
              >
                <Maximize2 size={13} />
                <span className="truncate">{item.label}</span>
              </button>
            ))}
          </div>
        )}
        <div className="ml-auto flex items-center gap-2 rounded-xl border border-white/10 bg-white/6 p-1">
          <button
            type="button"
            title={t('voice.zoomOut')}
            className="grid h-8 w-8 place-items-center rounded-lg text-white/75 transition hover:bg-white/12 hover:text-white"
            onClick={() => updateZoom(zoom - 0.2)}
          >
            <ZoomOut size={15} />
          </button>
          <button
            type="button"
            title={t('voice.resetZoom')}
            className="h-8 rounded-lg px-2 text-xs font-black text-white/75 transition hover:bg-white/12 hover:text-white"
            onClick={resetZoom}
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            title={t('voice.zoomIn')}
            className="grid h-8 w-8 place-items-center rounded-lg text-white/75 transition hover:bg-white/12 hover:text-white"
            onClick={() => updateZoom(zoom + 0.2)}
          >
            <ZoomIn size={15} />
          </button>
          <button
            type="button"
            title={fullscreen ? t('voice.exitFullscreen') : t('voice.fullscreen')}
            className="grid h-8 w-8 place-items-center rounded-lg text-white/75 transition hover:bg-white/12 hover:text-white"
            onClick={() => setFullscreen((value) => !value)}
          >
            {fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
        </div>
      </div>
      <div
        className="relative min-h-0 flex-1 touch-none cursor-grab overflow-hidden overscroll-contain active:cursor-grabbing"
        onWheelCapture={(event) => {
          if (!event.ctrlKey && !event.metaKey) return
          event.preventDefault()
          updateZoom(zoom + (event.deltaY < 0 ? 0.15 : -0.15))
        }}
        onPointerDown={(event) => {
          event.preventDefault()
          event.currentTarget.setPointerCapture(event.pointerId)
          pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
          if (pointersRef.current.size >= 2) {
            pinchRef.current = { distance: pointerDistance(), zoom }
            dragRef.current = null
            return
          }
          if (zoom <= 1) return
          dragRef.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y }
        }}
        onPointerMove={(event) => {
          if (!pointersRef.current.has(event.pointerId)) return
          event.preventDefault()
          pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
          if (pointersRef.current.size >= 2 && pinchRef.current) {
            const baseDistance = Math.max(pinchRef.current.distance, 1)
            const rawRatio = pointerDistance() / baseDistance
            const dampedRatio = 1 + (rawRatio - 1) * 0.58
            updateZoom(pinchRef.current.zoom * dampedRatio)
            return
          }
          if (!dragRef.current) return
          setPan({
            x: dragRef.current.panX + event.clientX - dragRef.current.x,
            y: dragRef.current.panY + event.clientY - dragRef.current.y,
          })
        }}
        onPointerUp={(event) => {
          pointersRef.current.delete(event.pointerId)
          event.currentTarget.releasePointerCapture(event.pointerId)
          dragRef.current = null
          pinchRef.current = null
        }}
        onPointerCancel={(event) => {
          pointersRef.current.delete(event.pointerId)
          dragRef.current = null
          pinchRef.current = null
        }}
      >
        <div
          className="absolute inset-0 transition-transform duration-100"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
          }}
        >
          <VideoTrackSurface track={active.track} />
        </div>
        <div className="absolute bottom-3 left-3 rounded-md bg-black/65 px-3 py-1.5 text-sm font-black">
          {active.label}
        </div>
      </div>
    </div>
  )
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

function VoiceErrorRecovery({
  errorKey,
  errorMessage,
  isRetrying,
  onLeave,
  onRetry,
}: {
  errorKey: string | null
  errorMessage: string | null
  isRetrying: boolean
  onLeave: () => void
  onRetry: () => void
}) {
  const { t } = useTranslation()
  const title =
    errorKey === 'microphonePolicy' || errorKey === 'screenPolicy'
      ? t('voice.permissionPolicyTitle')
      : errorKey === 'microphoneNotFound'
        ? t('voice.microphoneMissingTitle')
        : errorKey === 'microphonePermission'
          ? t('voice.microphonePermissionTitle')
          : t('voice.connectionError')
  const hint =
    errorKey === 'microphonePolicy'
      ? t('voice.microphonePolicyHint')
      : errorKey === 'screenPolicy'
        ? t('voice.screenPolicyHint')
        : errorKey === 'microphonePermission'
          ? t('voice.microphonePermissionHint')
          : null
  const retryLabel =
    errorKey === 'microphonePermission' ? t('voice.requestMicrophone') : t('voice.retryJoin')

  return (
    <div className="flex h-full min-h-[520px] items-center justify-center">
      <div className="w-full max-w-lg rounded-2xl border border-danger/30 bg-[#151015]/95 p-6 text-center shadow-2xl">
        <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-danger/15 text-danger">
          <MicOff size={32} />
        </div>
        <h2 className="text-xl font-black">{title}</h2>
        {errorMessage && <p className="mt-3 text-sm font-bold text-danger">{errorMessage}</p>}
        {hint && <p className="mt-3 text-sm font-bold leading-relaxed text-white/55">{hint}</p>}
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <button
            type="button"
            disabled={isRetrying}
            onClick={onRetry}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-success px-4 text-sm font-black text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Phone size={17} />
            {isRetrying ? t('voice.connecting') : retryLabel}
          </button>
          <button
            type="button"
            onClick={onLeave}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white/8 px-4 text-sm font-black text-white/75 transition hover:bg-white/14 hover:text-white"
          >
            <PhoneOff size={17} />
            {t('voice.disconnect')}
          </button>
        </div>
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
  const { serverSlug } = useParams({ strict: false }) as { serverSlug?: string }
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
  const screenStageItems = useMemo<ScreenStageItem[]>(() => {
    const items: ScreenStageItem[] = []
    if (localScreenTrack) {
      items.push({
        id: 'local',
        label: t('voice.yourScreen'),
        track: localScreenTrack,
        local: true,
      })
    }
    for (const screen of screens) {
      items.push({
        id: String(screen.uid),
        label: screen.displayName,
        track: screen.track,
      })
    }
    return items
  }, [localScreenTrack, screens, t])

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
                onClick={() =>
                  void joinVoiceChannel({ id: channelId, name: channelName, serverSlug })
                }
                className="mt-6 inline-flex h-12 items-center gap-2 rounded-xl bg-success px-5 text-sm font-black text-black transition hover:brightness-110"
              >
                <Phone size={18} />
                {t('voice.join')}
              </button>
            </div>
          </div>
        )}

        {connectedToThisChannel && voice.status === 'error' && (
          <VoiceErrorRecovery
            errorKey={voice.errorKey}
            errorMessage={errorMessage}
            isRetrying={connecting}
            onLeave={() => void leaveVoiceChannel()}
            onRetry={() => void joinVoiceChannel({ id: channelId, name: channelName, serverSlug })}
          />
        )}

        {connectedToThisChannel && voice.status !== 'error' && (
          <div className="mx-auto flex min-h-full max-w-5xl flex-col justify-center gap-4 pb-20">
            {screenStageItems.length > 0 && <ScreenShareStage items={screenStageItems} />}
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
