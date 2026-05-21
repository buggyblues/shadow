import {
  Button,
  cn,
  GlassPanel,
  Modal,
  ModalBody,
  ModalButtonGroup,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from '@shadowob/ui'
import { useQuery } from '@tanstack/react-query'
import { Outlet, useLocation, useNavigate } from '@tanstack/react-router'
import { GripVertical, Menu, Mic, MicOff, Phone, PhoneOff, ShieldCheck } from 'lucide-react'
import { type PointerEvent, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../lib/api'
import { clearAuthenticatedSession } from '../../lib/auth-session'
import { connectSocket, disconnectSocket, getSocket } from '../../lib/socket'
import { showToast } from '../../lib/toast'
import { useAuthStore } from '../../stores/auth.store'
import { useUIStore } from '../../stores/ui.store'
import { ConfirmDialog } from '../common/confirm-dialog'
import { RechargeModal } from '../recharge/recharge-modal'
import { NewcomerLandingModal } from '../server/server-landing'
import { ServerSidebar } from '../server/server-sidebar'
import { useVoiceSession, VoiceSessionProvider } from '../voice/voice-session-context'
import { DynamicBackground } from './dynamic-background'

export function AppLayout() {
  return (
    <VoiceSessionProvider>
      <AppLayoutInner />
    </VoiceSessionProvider>
  )
}

interface ServerAppApprovalRequest {
  serverId: string
  appKey: string
  appName: string
  commandName: string
  commandTitle: string
  commandDescription?: string | null
  permission: string
  action: string
  dataClass: string
  subjectKind: 'user' | 'buddy'
  buddyAgentId?: string | null
  approvalMode: string
  reason: string
  channelId?: string | null
  requestedAt?: string
}

function isServerAppApprovalRequest(value: unknown): value is ServerAppApprovalRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as Record<string, unknown>
  return (
    typeof item.serverId === 'string' &&
    typeof item.appKey === 'string' &&
    typeof item.appName === 'string' &&
    typeof item.commandName === 'string' &&
    typeof item.commandTitle === 'string' &&
    typeof item.permission === 'string' &&
    typeof item.action === 'string' &&
    typeof item.dataClass === 'string' &&
    (item.subjectKind === 'user' || item.subjectKind === 'buddy') &&
    typeof item.approvalMode === 'string' &&
    typeof item.reason === 'string'
  )
}

function AppLayoutInner() {
  const { t } = useTranslation()
  const location = useLocation()
  const pathname = location?.pathname ?? ''
  const { user, setUser } = useAuthStore()
  const { backgroundImage, copilotChannel } = useUIStore()
  const { mobileServerSidebarOpen, closeMobileServerSidebar, openMobileServerSidebar } =
    useUIStore()
  const [pendingServerAppApproval, setPendingServerAppApproval] =
    useState<ServerAppApprovalRequest | null>(null)
  const [serverAppApprovalSubmitting, setServerAppApprovalSubmitting] = useState(false)
  const isCloudRoute = /^\/app\/cloud(?:\/|$)/.test(pathname)
  const isServerHomeRoute = /^\/app\/servers\/[^/]+\/?$/u.test(pathname)
  const isServerAppsRoute = /(?:^|\/)servers\/[^/]+\/apps(?:\/|$)/u.test(pathname)
  const isCopilotMode = Boolean(copilotChannel && isServerAppsRoute)
  const showAtmosphereOrbs = !backgroundImage

  // Fetch current user on mount
  const {
    data: me,
    error: meError,
    isLoading: isLoadingMe,
  } = useQuery({
    queryKey: ['me'],
    queryFn: () =>
      fetchApi<{
        id: string
        email: string
        username: string
        displayName: string | null
        avatarUrl: string | null
        status?: string
      }>('/api/auth/me'),
    enabled: !user,
    initialData: user ?? undefined,
    retry: false,
    staleTime: 300_000,
  })

  useEffect(() => {
    if (me) setUser(me)
  }, [me, setUser])

  // Redirect to login on auth failure
  useEffect(() => {
    if (meError && (meError as Error & { status?: number }).status === 401) {
      clearAuthenticatedSession({ redirectToLogin: true })
    }
  }, [meError])

  // WebSocket connection
  useEffect(() => {
    connectSocket()
    const socket = getSocket()
    const handleSessionRevoked = () => {
      showToast(t('settings.sessionRevokedNotice'), 'error')
      clearAuthenticatedSession({ redirectToLogin: true })
    }
    const handleServerAppApprovalRequired = (payload: unknown) => {
      if (!isServerAppApprovalRequest(payload)) return
      setPendingServerAppApproval(payload)
    }
    socket.on('auth:session-revoked', handleSessionRevoked)
    socket.on('server-app:approval-required', handleServerAppApprovalRequired)
    return () => {
      socket.off('auth:session-revoked', handleSessionRevoked)
      socket.off('server-app:approval-required', handleServerAppApprovalRequired)
      disconnectSocket()
    }
  }, [t])

  const closeServerAppApproval = () => {
    setPendingServerAppApproval(null)
  }

  const approveServerAppCommand = async () => {
    if (!pendingServerAppApproval) return
    setServerAppApprovalSubmitting(true)
    try {
      await fetchApi(
        `/api/servers/${pendingServerAppApproval.serverId}/apps/${pendingServerAppApproval.appKey}/approvals`,
        {
          method: 'POST',
          body: JSON.stringify({
            commandName: pendingServerAppApproval.commandName,
            buddyAgentId: pendingServerAppApproval.buddyAgentId ?? undefined,
            remember: pendingServerAppApproval.approvalMode !== 'every_time',
          }),
        },
      )
      showToast(t('serverApps.commandApprovalSuccess'), 'success')
      setPendingServerAppApproval(null)
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : t('serverApps.commandApprovalFailed'),
        'error',
      )
    } finally {
      setServerAppApprovalSubmitting(false)
    }
  }

  return (
    <div className="relative flex h-dvh w-screen overflow-hidden bg-transparent p-3 gap-3">
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
          <div
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
      <div className="relative z-10 flex flex-1 flex-col min-w-0 overflow-hidden">
        {isLoadingMe && !me ? (
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
      <NewcomerLandingModal enabled={isServerHomeRoute} userId={me?.id ?? user?.id ?? null} />
      <Modal open={!!pendingServerAppApproval} onClose={closeServerAppApproval}>
        <ModalContent maxWidth="max-w-[460px]">
          <ModalHeader
            title={t('serverApps.commandApprovalTitle')}
            closeLabel={t('common.close')}
          />
          <ModalBody className="space-y-3">
            <div className="flex items-start gap-3 rounded-xl border border-border-subtle bg-bg-tertiary/40 p-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
                <ShieldCheck size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-black text-text-primary">
                  {pendingServerAppApproval?.appName}
                </p>
                <p className="mt-1 text-xs leading-5 text-text-muted">
                  {pendingServerAppApproval?.commandTitle}
                </p>
                {pendingServerAppApproval?.commandDescription ? (
                  <p className="mt-1 text-xs leading-5 text-text-muted">
                    {pendingServerAppApproval.commandDescription}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="grid gap-2 text-xs text-text-muted">
              <div className="rounded-lg bg-bg-tertiary/30 px-3 py-2">
                {t('serverApps.commandApprovalSubject')}:{' '}
                <span className="text-text-primary">
                  {pendingServerAppApproval?.subjectKind === 'buddy'
                    ? t('serverApps.commandApprovalBuddy')
                    : t('serverApps.commandApprovalPerson')}
                </span>
              </div>
              <div className="rounded-lg bg-bg-tertiary/30 px-3 py-2">
                {t('serverApps.commandApprovalPermission')}:{' '}
                <span className="font-mono text-text-primary">
                  {pendingServerAppApproval?.permission}
                </span>
              </div>
              <div className="rounded-lg bg-bg-tertiary/30 px-3 py-2">
                {t('serverApps.commandApprovalScope')}:{' '}
                <span className="text-text-primary">
                  {pendingServerAppApproval?.action} / {pendingServerAppApproval?.dataClass}
                </span>
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <ModalButtonGroup>
              <Button variant="ghost" size="sm" onClick={closeServerAppApproval}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={approveServerAppCommand}
                loading={serverAppApprovalSubmitting}
                disabled={serverAppApprovalSubmitting}
              >
                <ShieldCheck size={14} />
                {t('serverApps.commandApprovalConfirm')}
              </Button>
            </ModalButtonGroup>
          </ModalFooter>
        </ModalContent>
      </Modal>
      <RechargeModal />
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
      <button
        type="button"
        aria-label={t('voice.moveFloatingCall')}
        title={t('voice.moveFloatingCall')}
        className="flex h-12 w-9 touch-none cursor-grab items-center justify-center rounded-xl border border-border-subtle bg-bg-secondary/60 text-text-muted transition hover:text-text-primary active:cursor-grabbing"
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
      >
        <GripVertical size={16} />
      </button>
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
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-9 w-9 rounded-xl"
        title={voice.isMuted ? t('voice.unmute') : t('voice.mute')}
        onClick={() => void voice.toggleMute()}
        disabled={voice.status !== 'connected'}
      >
        {voice.isMuted ? <MicOff size={16} /> : <Mic size={16} />}
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-9 w-9 rounded-xl text-danger hover:text-danger"
        title={t('voice.disconnect')}
        onClick={() => void leaveVoiceChannel()}
        disabled={voice.status === 'disconnecting'}
      >
        <PhoneOff size={16} />
      </Button>
    </div>
  )
}
