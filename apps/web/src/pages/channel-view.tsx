import { Button, GlassPanel } from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import { Clock, Lock, Send } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  type ChannelSwitcherOption,
  ChatArea,
  type ChatInitialMessagesPage,
} from '../components/chat/chat-area'
import type { Attachment } from '../components/chat/message-bubble/types'
import { MemberList, type MemberListInitialMember } from '../components/member/member-list'
import { ServerLandingPanel } from '../components/server/server-landing'
import { VoiceChannelPanel } from '../components/voice/voice-channel-panel'
import { useSocketEvent } from '../hooks/use-socket'
import { fetchApi } from '../lib/api'
import { invalidateServerChannelState, serverChannelCacheKeys } from '../lib/channel-cache'
import { setLastChannelId } from '../lib/last-channel'
import { scheduleIdleAfterDelay, scheduleIdleAfterNextPaint } from '../lib/schedule'
import { joinChannel, leaveChannel } from '../lib/socket'
import { useChatStore } from '../stores/chat.store'
import { useUIStore } from '../stores/ui.store'

interface NotificationEvent {
  referenceId?: string | null
  referenceType?: string | null
  scopeChannelId?: string | null
  metadata?: Record<string, unknown> | null
}

function metaString(event: NotificationEvent, key: string) {
  const value = event.metadata?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function getNotificationChannelId(event: NotificationEvent) {
  return (
    event.scopeChannelId ??
    metaString(event, 'channelId') ??
    (event.referenceType === 'channel' || event.referenceType === 'channel_invite'
      ? event.referenceId
      : null)
  )
}

interface ChannelAccessState {
  canAccess: boolean
  requiresApproval?: boolean
  joinRequestStatus?: 'pending' | 'approved' | 'rejected' | null
  isServerMember?: boolean
  isChannelMember?: boolean
  channel: {
    id: string
    name: string
    type?: string
    serverId: string
    isPrivate?: boolean
    topic?: string | null
  }
}

interface ChannelViewProps {
  channelId?: string
  serverSlug?: string
  initialMessages?: ChatInitialMessagesPage | null
  initialMembers?: MemberListInitialMember[] | null
  initialAccess?: ChannelAccessState | null
  routeAccessFallbackLoading?: boolean
  onPreviewFile?: (attachment: Attachment) => void
  onOpenMembers?: (anchor: DOMRect) => void
  syncNavigationState?: boolean
  copilot?: {
    channels: ChannelSwitcherOption[]
    messageMetadata?: Record<string, unknown>
    onSelectChannel: (channelId: string) => void
    onEnter: () => void
    onExit: () => void
  }
}

export function ChannelView({
  channelId: channelIdProp,
  serverSlug: serverSlugProp,
  initialMessages,
  initialMembers,
  initialAccess,
  routeAccessFallbackLoading = false,
  onPreviewFile,
  onOpenMembers,
  syncNavigationState = true,
  copilot,
}: ChannelViewProps = {}) {
  const { t } = useTranslation()
  const routeParams = useParams({ strict: false }) as {
    channelId?: string
    serverSlug?: string
  }
  const channelId = channelIdProp ?? routeParams.channelId ?? ''
  const serverSlug = serverSlugProp ?? routeParams.serverSlug
  const activeServerId = useChatStore((s) => s.activeServerId)
  const setMobileView = useUIStore((s) => s.setMobileView)
  const queryClient = useQueryClient()
  const readScopeCooldownRef = useRef<Map<string, number>>(new Map())
  const readScopeInFlightRef = useRef<Set<string>>(new Set())
  const {
    data: fetchedAccess,
    isLoading: isAccessLoading,
    isError: isAccessError,
  } = useQuery({
    queryKey: ['channel-access', channelId],
    queryFn: () => fetchApi<ChannelAccessState>(`/api/channels/${channelId}/access`),
    enabled: !!channelId && !initialAccess,
    retry: false,
    staleTime: 30_000,
  })
  const access = initialAccess ?? fetchedAccess
  const canAccessChannel = access?.canAccess === true

  const { data: channel } = useQuery({
    queryKey: ['channel', channelId],
    queryFn: () =>
      fetchApi<{
        id: string
        name: string
        type: string
        serverId: string
        isPrivate: boolean
        topic?: string | null
      }>(`/api/channels/${channelId}`),
    enabled: !!channelId && canAccessChannel,
    staleTime: 30_000,
  })

  const requestAccess = useMutation({
    mutationFn: () =>
      fetchApi(`/api/channels/${channelId}/join-requests`, {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channel-access', channelId] })
      invalidateServerChannelState(queryClient, serverChannelCacheKeys(serverSlug, activeServerId))
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
    },
  })

  const { data: serverAccess } = useQuery({
    queryKey: ['server-access', serverSlug],
    queryFn: () =>
      fetchApi<{
        server: {
          id: string
          name: string
          slug: string | null
          iconUrl?: string | null
          bannerUrl?: string | null
          description?: string | null
          isPublic?: boolean
        }
        isMember: boolean
        canAccess: boolean
        requiresApproval: boolean
        joinRequestStatus: 'pending' | 'approved' | 'rejected' | null
      }>(`/api/servers/${serverSlug}/access`),
    enabled: !!serverSlug && access?.canAccess === false && access?.isServerMember === false,
    retry: false,
    staleTime: 30_000,
  })

  const requestServerAccess = useMutation({
    mutationFn: () =>
      fetchApi<{ ok: boolean; status: 'approved' | 'pending'; requestId?: string }>(
        `/api/servers/${serverSlug}/join-requests`,
        { method: 'POST' },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['server-access', serverSlug] })
      queryClient.invalidateQueries({ queryKey: ['channel-access', channelId] })
      invalidateServerChannelState(queryClient, serverChannelCacheKeys(serverSlug, activeServerId))
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
    },
  })

  const markChannelScopeRead = useCallback(
    async (options: { force?: boolean } = {}) => {
      if (!channelId) return
      const key = `channel:${channelId}`
      const now = Date.now()
      const last = readScopeCooldownRef.current.get(key) ?? 0
      if (!options.force && (now - last < 1200 || readScopeInFlightRef.current.has(key))) return
      readScopeCooldownRef.current.set(key, now)
      readScopeInFlightRef.current.add(key)
      try {
        await fetchApi('/api/notifications/read-scope', {
          method: 'POST',
          body: JSON.stringify({ channelId }),
        })
        queryClient.invalidateQueries({ queryKey: ['notifications'] })
        queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
        queryClient.invalidateQueries({ queryKey: ['notification-scoped-unread'] })
      } finally {
        readScopeInFlightRef.current.delete(key)
      }
    },
    [channelId, queryClient],
  )

  // Sync channel ID from URL → store before paint
  useLayoutEffect(() => {
    if (!syncNavigationState) return
    useChatStore.getState().setActiveChannel(channelId)
    setMobileView('chat')
  }, [channelId, setMobileView, syncNavigationState])

  useEffect(() => {
    if (!canAccessChannel) return
    const cancelDeferredJoin = scheduleIdleAfterNextPaint(() => {
      joinChannel(channelId)
    })
    const cancelDeferredRead = scheduleIdleAfterDelay(() => {
      void markChannelScopeRead()
    }, 1600)

    return () => {
      cancelDeferredJoin()
      cancelDeferredRead()
      leaveChannel(channelId)
    }
  }, [canAccessChannel, channelId, markChannelScopeRead])

  useSocketEvent<NotificationEvent>('notification:new', (event) => {
    queryClient.invalidateQueries({ queryKey: ['notification-scoped-unread'] })
    queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
    const notificationChannelId = getNotificationChannelId(event)
    if (notificationChannelId === channelId) {
      void markChannelScopeRead({ force: true })
    }
  })

  useEffect(() => {
    if (activeServerId && channel?.serverId === activeServerId) {
      setLastChannelId(activeServerId, channelId)
    }
  }, [activeServerId, channel?.serverId, channelId])

  const copilotChannelSwitcher = useMemo(
    () =>
      copilot
        ? {
            channels: copilot.channels,
            activeChannelId: channelId,
            onSelectChannel: copilot.onSelectChannel,
          }
        : undefined,
    [channelId, copilot?.channels, copilot?.onSelectChannel],
  )

  if (
    !access &&
    (isAccessLoading ||
      (!isAccessError && !fetchedAccess) ||
      (isAccessError && routeAccessFallbackLoading))
  ) {
    return <ChannelContentLoading />
  }

  if (isAccessError || !access) {
    return (
      <GlassPanel className="flex flex-1 items-center justify-center px-6 text-center text-sm font-bold text-text-muted">
        {t('channel.accessUnavailable')}
      </GlassPanel>
    )
  }

  if (!access.canAccess) {
    if (access.isServerMember === false && serverSlug) {
      const isPublic = serverAccess?.server.isPublic === true
      const isPending =
        serverAccess?.joinRequestStatus === 'pending' || requestServerAccess.isSuccess
      return (
        <>
          <ServerLandingPanel
            server={serverAccess?.server}
            mode={isPublic ? 'public' : 'private'}
            pending={!isPublic && isPending}
            loading={requestServerAccess.isPending}
            onJoin={() => requestServerAccess.mutate()}
          />
        </>
      )
    }

    const isPending = access.joinRequestStatus === 'pending' || requestAccess.isSuccess
    const wallChannel = access.channel ?? channel

    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <GlassPanel className="w-full max-w-md rounded-2xl border border-white/10 bg-bg-primary/80 p-6 text-center shadow-[0_18px_64px_rgba(0,0,0,0.32)]">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-primary/15 text-primary">
            {isPending ? <Clock size={28} /> : <Lock size={28} />}
          </div>
          <h2 className="text-xl font-black text-text-primary">
            {wallChannel?.name ? `#${wallChannel.name}` : t('channel.privateChannel')}
          </h2>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            {t('channel.privateChannelGateDesc')}
          </p>
          <Button
            type="button"
            className="mt-5 w-full cursor-pointer rounded-xl"
            disabled={isPending || requestAccess.isPending}
            loading={requestAccess.isPending}
            onClick={() => requestAccess.mutate()}
          >
            {isPending ? <Clock size={16} /> : <Send size={16} />}
            <span>{isPending ? t('channel.requestPending') : t('channel.requestAccess')}</span>
          </Button>
        </GlassPanel>
      </div>
    )
  }

  if (channel?.type === 'voice') {
    return <VoiceChannelPanel key={channelId} channelId={channelId} channelName={channel.name} />
  }

  if (copilot) {
    const routeServerId = access.channel.serverId ?? activeServerId
    return (
      <ChatArea
        key={channelId}
        channelId={channelId}
        serverId={routeServerId}
        initialMessages={initialMessages}
        showMemberToggle={false}
        channelSwitcher={copilotChannelSwitcher}
        messageMetadata={copilot.messageMetadata}
        onEnterChannel={copilot.onEnter}
        onExitCopilot={copilot.onExit}
        onPreviewFile={onPreviewFile}
        onOpenMembers={onOpenMembers}
      />
    )
  }

  const isInboxChannel = channel?.topic?.startsWith('shadow:buddy-inbox:') ?? false
  const routeServerId = access.channel.serverId ?? activeServerId

  return (
    <>
      <ChatArea
        key={channelId}
        channelId={channelId}
        serverId={routeServerId}
        initialMessages={initialMessages}
        showMemberToggle={!isInboxChannel}
        onPreviewFile={onPreviewFile}
        onOpenMembers={onOpenMembers}
      />
      {!isInboxChannel && !onOpenMembers && (
        <MemberList
          channelId={channelId}
          serverId={routeServerId}
          initialMembers={initialMembers}
        />
      )}
    </>
  )
}

function LoadingShape({ className }: { className: string }) {
  return <div className={`animate-pulse bg-white/8 ${className}`} />
}

function ChannelContentLoading() {
  return (
    <>
      <GlassPanel
        className="flex h-full min-w-0 flex-1 flex-col overflow-hidden"
        style={{
          background: 'var(--chat-panel-bg)',
          backdropFilter: 'none',
          WebkitBackdropFilter: 'none',
        }}
        aria-hidden
      >
        <div className="app-header flex items-center gap-3 border-b border-border-subtle/30 px-6">
          <LoadingShape className="h-8 w-8 rounded-full" />
          <LoadingShape className="h-5 w-28 rounded-full" />
          <LoadingShape className="hidden h-5 w-40 rounded-full sm:block" />
          <div className="ml-auto flex gap-2">
            <LoadingShape className="h-8 w-8 rounded-full" />
            <LoadingShape className="h-8 w-8 rounded-full" />
          </div>
        </div>
        <div className="flex-1 space-y-6 px-6 py-7">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="flex gap-4">
              <LoadingShape className="h-11 w-11 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2 pt-1">
                <div className="flex items-center gap-3">
                  <LoadingShape className="h-4 w-24 rounded-full" />
                  <LoadingShape className="h-3 w-20 rounded-full" />
                </div>
                <LoadingShape className="h-4 w-[min(78%,34rem)] rounded-full" />
                <LoadingShape className="h-4 w-[min(58%,24rem)] rounded-full" />
              </div>
            </div>
          ))}
        </div>
        <div className="px-5 pb-5">
          <LoadingShape className="h-14 w-full rounded-[28px]" />
        </div>
      </GlassPanel>

      <GlassPanel
        className="hidden h-full w-[240px] shrink-0 overflow-hidden pt-4 lg:block"
        aria-hidden
      >
        <div className="px-4 pb-4 pt-2">
          <LoadingShape className="h-[54px] w-full rounded-full" />
        </div>
        <div className="space-y-5 px-4">
          <div className="space-y-3">
            <LoadingShape className="h-3 w-24 rounded-full" />
            <div className="space-y-2">
              <LoadingShape className="h-[66px] w-full rounded-2xl" />
              <LoadingShape className="h-[56px] w-[88%] rounded-2xl" />
            </div>
          </div>
          <div className="space-y-3">
            <LoadingShape className="h-3 w-24 rounded-full" />
            <LoadingShape className="h-[56px] w-[78%] rounded-2xl" />
          </div>
        </div>
      </GlassPanel>
    </>
  )
}
