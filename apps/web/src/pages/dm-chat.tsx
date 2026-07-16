import { useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useCallback, useLayoutEffect, useRef } from 'react'
import { ChatArea } from '../components/chat/chat-area'
import { useSocketEvent } from '../hooks/use-socket'
import { fetchApi } from '../lib/api'
import { joinChannel, leaveChannel } from '../lib/socket'
import { useChatStore } from '../stores/chat.store'

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

export function DirectChatView({
  channelId,
  onBack,
  preserveServerContext = false,
  barePanel = false,
}: {
  channelId: string
  onBack?: () => void
  preserveServerContext?: boolean
  barePanel?: boolean
}) {
  const queryClient = useQueryClient()
  const readScopeCooldownRef = useRef<Map<string, number>>(new Map())
  const readScopeInFlightRef = useRef<Set<string>>(new Set())

  const markChannelScopeRead = useCallback(
    async (options: { force?: boolean } = {}) => {
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

  useLayoutEffect(() => {
    const store = useChatStore.getState()
    const previousChannelId = store.activeChannelId
    const previousServerId = store.activeServerId

    if (!preserveServerContext && previousChannelId && previousChannelId !== channelId) {
      leaveChannel(previousChannelId)
    }

    if (!preserveServerContext) store.setActiveServer(null)
    store.setActiveChannel(channelId)
    joinChannel(channelId)
    void markChannelScopeRead()

    return () => {
      leaveChannel(channelId)
      const latest = useChatStore.getState()
      if (latest.activeChannelId === channelId) {
        latest.setActiveChannel(previousChannelId)
        if (previousChannelId) joinChannel(previousChannelId)
      }
      if (!preserveServerContext) latest.setActiveServer(previousServerId)
    }
  }, [channelId, markChannelScopeRead, preserveServerContext])

  useSocketEvent<NotificationEvent>('notification:new', (event) => {
    queryClient.invalidateQueries({ queryKey: ['notification-scoped-unread'] })
    queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
    const notificationChannelId = getNotificationChannelId(event)
    if (notificationChannelId === channelId) {
      void markChannelScopeRead({ force: true })
    }
  })

  return <ChatArea key={channelId} onBack={onBack} showMemberToggle={false} barePanel={barePanel} />
}

export function DirectChatRoute() {
  const { dmChannelId } = useParams({ strict: false }) as { dmChannelId: string }
  const navigate = useNavigate()

  return (
    <DirectChatView channelId={dmChannelId} onBack={() => navigate({ to: '/settings/buddy' })} />
  )
}

export const DirectChatPage = DirectChatRoute
