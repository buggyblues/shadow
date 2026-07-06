import { Button, cn, GlassPanel, TooltipIconButton } from '@shadowob/ui'
import { Outlet, useLocation, useNavigate } from '@tanstack/react-router'
import { GripVertical, Menu, Mic, MicOff, Phone, PhoneOff } from 'lucide-react'
import { type PointerEvent, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getCopilotChannelIdFromSearch } from '../../lib/copilot-route'
import { useUIStore } from '../../stores/ui.store'
import { ConfirmDialog } from '../common/confirm-dialog'
import { RechargeModal } from '../recharge/recharge-modal'
import { NewcomerLandingModal } from '../server/server-landing'
import { ServerSidebar } from '../server/server-sidebar'
import { useVoiceSession, VoiceSessionProvider } from '../voice/voice-session-context'
import { ServerAppApprovalModal, useAuthenticatedRuntime } from './authenticated-runtime'
import { CommandPalette } from './command-palette'
import { DynamicBackground } from './dynamic-background'

export function AppLayout() {
  return (
    <VoiceSessionProvider>
      <AppLayoutInner />
    </VoiceSessionProvider>
  )
}

function AppLayoutInner() {
  const { t } = useTranslation()
  const runtime = useAuthenticatedRuntime()
  const location = useLocation()
  const pathname = location?.pathname ?? ''
  const { backgroundImage } = useUIStore()
  const { mobileServerSidebarOpen, closeMobileServerSidebar, openMobileServerSidebar } =
    useUIStore()
  const isCloudRoute = /^\/app\/cloud(?:\/|$)/.test(pathname)
  const isServerHomeRoute = /^\/app\/servers\/[^/]+\/?$/u.test(pathname)
  const isServerAppsRoute = /(?:^|\/)servers\/[^/]+\/apps(?:\/|$)/u.test(pathname)
  const routeCopilotChannelId = getCopilotChannelIdFromSearch(
    (location.search ?? {}) as Record<string, unknown>,
  )
  const isCopilotMode = Boolean(isServerAppsRoute && routeCopilotChannelId)
  const showAtmosphereOrbs = !backgroundImage

  return (
    <div className="desktop-app-shell relative flex h-dvh w-screen gap-3 overflow-hidden bg-transparent p-3">
      <div className="desktop-window-drag-strip" aria-hidden="true" />
      {!isCloudRoute && (
        <>
          <DynamicBackground />
          {/* ── Neon Frost atmosphere orbs ── */}
          {showAtmosphereOrbs && (
            <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
              <div
                className="absolute top-[-180px] left-[8%] w-[520px] h-[520px] rounded-full blur-[130px] animate-float opacity-[0.13]"
                style={{ background: 'radial-gradient(circle, #00F3FF 0%, transparent 70%)' }}
              />
              <div
                className="absolute top-[25%] right-[-150px] w-[640px] h-[640px] rounded-full blur-[120px] animate-float opacity-16"
                style={{
                  background: 'radial-gradient(circle, #FF2A55 0%, transparent 70%)',
                  animationDelay: '-7s',
                }}
              />
            </div>
          )}
        </>
      )}

      {/* ── Server sidebar — always visible on md+, overlay on mobile ── */}
      {!isCopilotMode && (
        <div className="relative z-10 hidden md:flex">
          <ServerSidebar />
        </div>
      )}

      {/* ── Mobile server sidebar overlay (glassmorphic) ── */}
      {mobileServerSidebarOpen && !isCopilotMode && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <button
            type="button"
            aria-label={t('common.close')}
            className="absolute inset-0 bg-bg-deep/80 backdrop-blur-md"
            onClick={closeMobileServerSidebar}
          />
          <div
            className={cn(
              'relative z-10 animate-slide-in-left',
              'rounded-r-[24px] border-r border-border-subtle',
              'bg-bg-deep/80 backdrop-blur-xl',
              'shadow-[0_0_40px_rgba(0,243,255,0.06)]',
            )}
          >
            <ServerSidebar onNavigate={closeMobileServerSidebar} />
          </div>
        </div>
      )}

      {/* ── Main content area ── */}
      <div className="relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden">
        {runtime.isLoadingMe && !runtime.me ? (
          <GlassPanel className="flex-1 flex items-center justify-center">
            <div className="inline-flex items-center gap-2 text-sm text-white/50 animate-pulse">
              {t('common.loading')}
            </div>
          </GlassPanel>
        ) : (
          <Outlet />
        )}
      </div>

      {/* ── Mobile FAB to open server sidebar ── */}
      {!mobileServerSidebarOpen && !isCopilotMode && (
        <Button
          size="icon"
          onClick={openMobileServerSidebar}
          aria-label={t('server.openServer')}
          title={t('server.openServer')}
          className={cn(
            'fixed bottom-20 left-4 z-40 md:hidden',
            'h-11 w-11 rounded-full',
            'bg-primary/20 backdrop-blur-xl',
            'border border-primary/20',
            'text-primary shadow-[0_0_20px_rgba(0,243,255,0.25)]',
            'hover:bg-primary/30 hover:shadow-[0_0_28px_rgba(0,243,255,0.35)]',
            'transition-all duration-300',
          )}
        >
          <Menu size={18} />
        </Button>
      )}

      <ConfirmDialog />
      <NewcomerLandingModal
        enabled={isServerHomeRoute}
        userId={runtime.me?.id ?? runtime.user?.id ?? null}
      />
      <ServerAppApprovalModal runtime={runtime} />
      <RechargeModal />
      <CommandPalette />
      <FloatingVoiceCall />
    </div>
  )
}

const FLOATING_VOICE_POSITION_KEY = 'shadow.voiceFloatingCall.position'

function defaultFloatingVoicePosition() {
  if (typeof window === 'undefined') return { x: 20, y: 520 }
  return { x: 20, y: Math.max(20, window.innerHeight - 104) }
}

function clampFloatingVoicePosition(position: { x: number; y: number }) {
  if (typeof window === 'undefined') return position
  return {
    x: Math.max(8, Math.min(position.x, window.innerWidth - 320)),
    y: Math.max(8, Math.min(position.y, window.innerHeight - 88)),
  }
}

function readFloatingVoicePosition() {
  if (typeof window === 'undefined') return defaultFloatingVoicePosition()
  try {
    const raw = window.localStorage.getItem(FLOATING_VOICE_POSITION_KEY)
    if (!raw) return defaultFloatingVoicePosition()
    const parsed = JSON.parse(raw) as { x?: unknown; y?: unknown }
    if (typeof parsed.x !== 'number' || typeof parsed.y !== 'number') {
      return defaultFloatingVoicePosition()
    }
    return clampFloatingVoicePosition({ x: parsed.x, y: parsed.y })
  } catch {
    return defaultFloatingVoicePosition()
  }
}

function FloatingVoiceWave({ level, active }: { level: number; active: boolean }) {
  const normalized = active ? Math.max(0.18, Math.min(1, level / 90)) : 0.18
  return (
    <span className="flex h-10 w-9 items-center justify-center gap-0.5 overflow-hidden rounded-xl bg-success/10 text-success">
      {[0.46, 0.82, 1, 0.64].map((weight, index) => (
        <span
          key={weight}
          className={cn(
            'w-1 rounded-full bg-success transition-all duration-150',
            active && 'animate-pulse',
          )}
          style={{
            height: `${10 + normalized * weight * 24}px`,
            animationDelay: `${index * 90}ms`,
          }}
        />
      ))}
    </span>
  )
}

function FloatingVoiceCall() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { connectedVoiceChannel, voice, leaveVoiceChannel } = useVoiceSession()
  const [position, setPosition] = useState(readFloatingVoicePosition)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    originX: number
    originY: number
  } | null>(null)

  useEffect(() => {
    const handleResize = () => setPosition((current) => clampFloatingVoicePosition(current))
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(FLOATING_VOICE_POSITION_KEY, JSON.stringify(position))
    } catch {
      // Position persistence is non-critical.
    }
  }, [position])

  if (
    !connectedVoiceChannel ||
    (voice.status !== 'connected' &&
      voice.status !== 'connecting' &&
      voice.status !== 'disconnecting' &&
      voice.status !== 'error')
  ) {
    return null
  }

  const channelPath =
    connectedVoiceChannel.serverSlug && connectedVoiceChannel.id
      ? `/app/servers/${connectedVoiceChannel.serverSlug}/channels/${connectedVoiceChannel.id}`
      : null
  const isOnChannel = channelPath ? location.pathname === channelPath : false
  const isInsideConnectedServer = connectedVoiceChannel.serverSlug
    ? location.pathname.startsWith(`/app/servers/${connectedVoiceChannel.serverSlug}`)
    : false
  if (isOnChannel || isInsideConnectedServer) return null

  const handleDragStart = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
    }
  }

  const handleDragMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return
    event.preventDefault()
    setPosition(
      clampFloatingVoicePosition({
        x: dragRef.current.originX + event.clientX - dragRef.current.startX,
        y: dragRef.current.originY + event.clientY - dragRef.current.startY,
      }),
    )
  }

  const handleDragEnd = (event: PointerEvent<HTMLButtonElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null
    }
  }

  return (
    <div
      className="fixed z-50 flex max-w-[calc(100vw-1rem)] items-center gap-2 rounded-2xl border border-success/25 bg-bg-primary/90 p-2 shadow-[0_18px_48px_rgba(0,0,0,0.28)] backdrop-blur-xl"
      style={{ left: position.x, top: position.y }}
    >
      <TooltipIconButton
        label={t('voice.moveFloatingCall')}
        className="flex !h-12 !w-9 touch-none cursor-grab items-center justify-center rounded-xl border border-border-subtle bg-bg-secondary/60 !p-0 !font-normal !normal-case !tracking-normal text-text-muted transition hover:text-text-primary active:cursor-grabbing"
        size="xs"
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
      >
        <GripVertical size={16} />
      </TooltipIconButton>
      <FloatingVoiceWave
        level={voice.inputVolume}
        active={!voice.isMuted && voice.status === 'connected'}
      />
      <button
        type="button"
        className="flex min-w-0 items-center gap-2 rounded-xl px-2 py-1.5 text-left text-text-primary transition hover:bg-bg-modifier-hover"
        onClick={() => {
          if (!connectedVoiceChannel.serverSlug) return
          navigate({
            to: '/servers/$serverSlug/channels/$channelId',
            params: {
              serverSlug: connectedVoiceChannel.serverSlug,
              channelId: connectedVoiceChannel.id,
            },
          })
        }}
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-success/15 text-success">
          <Phone size={17} />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-black">{connectedVoiceChannel.name}</span>
          <span className="block text-xs font-bold text-text-muted">
            {voice.status === 'connecting' || voice.status === 'disconnecting'
              ? t('voice.connecting')
              : t('voice.connected')}
          </span>
        </span>
      </button>
      <TooltipIconButton
        label={voice.isMuted ? t('voice.unmute') : t('voice.mute')}
        size="icon"
        variant="ghost"
        className="!h-9 !w-9 rounded-xl !p-0 !font-normal !normal-case !tracking-normal"
        onClick={() => void voice.toggleMute()}
        disabled={voice.status !== 'connected'}
      >
        {voice.isMuted ? <MicOff size={16} /> : <Mic size={16} />}
      </TooltipIconButton>
      <TooltipIconButton
        label={t('voice.disconnect')}
        size="icon"
        variant="ghost"
        className="!h-9 !w-9 rounded-xl !p-0 !font-normal !normal-case !tracking-normal text-danger hover:text-danger"
        onClick={() => void leaveVoiceChannel()}
        disabled={voice.status === 'disconnecting'}
      >
        <PhoneOff size={16} />
      </TooltipIconButton>
    </div>
  )
}
