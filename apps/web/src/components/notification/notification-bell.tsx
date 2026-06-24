import { cn } from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Bell, Check, CheckCheck, ShieldCheck, X } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useSocketEvent } from '../../hooks/use-socket'
import { fetchApi } from '../../lib/api'
import { useChatStore } from '../../stores/chat.store'

const FOCUS_CHAT_MESSAGE_EVENT = 'shadow:focus-chat-message'

interface Notification {
  id: string
  userId: string
  type: 'mention' | 'reply' | 'dm' | 'system'
  kind?: string | null
  title: string
  body: string | null
  referenceId: string | null
  referenceType: string | null
  scopeServerId?: string | null
  scopeChannelId?: string | null
  metadata?: Record<string, unknown> | null
  aggregatedCount?: number | null
  isRead: boolean
  createdAt: string
}

function text(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function getNotificationDisplay(
  n: Notification,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  const metadata = n.metadata ?? {}
  const count = Math.max(n.aggregatedCount ?? 1, 1)
  const actorName = text(metadata.actorName, 'Someone')
  const channelName = text(metadata.channelName, 'channel')
  const serverName = text(metadata.serverName, 'server')
  const appName = text(metadata.appName, 'App')
  const commandTitle = text(metadata.commandTitle, text(metadata.commandName, 'command'))
  const preview = text(metadata.preview, n.body ?? '')

  switch (n.kind) {
    case 'message.mention':
      return {
        title:
          count > 1
            ? t('notification.messageMentionCount', { count })
            : t('notification.messageMention', { actorName }),
        body: preview,
      }
    case 'message.reply':
      return {
        title:
          count > 1
            ? t('notification.messageReplyCount', { count })
            : t('notification.messageReply', { actorName }),
        body: preview,
      }
    case 'dm.message':
      return {
        title:
          count > 1
            ? t('notification.dmMessageCount', { count })
            : t('notification.dmMessage', { actorName }),
        body: preview,
      }
    case 'channel.access_requested':
      return {
        title: t('notification.channelAccessRequested', { actorName, channelName }),
        body: t('notification.channelAccessRequestedBody'),
      }
    case 'channel.access_approved':
      return { title: t('notification.channelAccessApproved', { channelName }), body: n.body ?? '' }
    case 'channel.access_rejected':
      return { title: t('notification.channelAccessRejected', { channelName }), body: n.body ?? '' }
    case 'channel.member_added':
      return {
        title: t('notification.channelMemberAdded', { channelName }),
        body: serverName ? t('notification.inServer', { serverName }) : (n.body ?? ''),
      }
    case 'server.access_requested':
      return {
        title: t('notification.serverAccessRequested', { actorName, serverName }),
        body: t('notification.serverAccessRequestedBody'),
      }
    case 'server.access_approved':
      return { title: t('notification.serverAccessApproved', { serverName }), body: n.body ?? '' }
    case 'server.access_rejected':
      return { title: t('notification.serverAccessRejected', { serverName }), body: n.body ?? '' }
    case 'server.member_joined':
      return {
        title:
          count > 1
            ? t('notification.serverMemberJoinedCount', { count, serverName })
            : t('notification.serverMemberJoined', { actorName, serverName }),
        body: n.body ?? '',
      }
    case 'server.invite':
      return {
        title: t('notification.serverInvite', { actorName, serverName }),
        body: n.body ?? '',
      }
    case 'friendship.request':
      return { title: t('notification.friendshipRequest', { actorName }), body: n.body ?? '' }
    case 'recharge.succeeded':
      return {
        title: t('notification.rechargeSucceeded'),
        body: t('notification.rechargeSucceededBody', {
          amount: metadata.shrimpCoins ?? '',
        }),
      }
    case 'server_app.command_approval_requested':
      return {
        title: t('notification.serverAppCommandApprovalRequested', { appName }),
        body: t('notification.serverAppCommandApprovalRequestedBody', {
          commandTitle,
          serverName,
        }),
      }
    case 'server_app.command_approval_granted':
      return {
        title: t('notification.serverAppCommandApprovalGranted', { appName }),
        body: t('notification.serverAppCommandApprovalGrantedBody', {
          commandTitle,
          serverName,
        }),
      }
    default:
      return { title: n.title, body: n.body ?? '' }
  }
}

function metaString(n: Notification, key: string) {
  const value = n.metadata?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function getNotificationChannelId(n: Notification) {
  return (
    n.scopeChannelId ??
    metaString(n, 'channelId') ??
    (n.referenceType === 'channel' || n.referenceType === 'channel_invite' ? n.referenceId : null)
  )
}

function getNotificationServerId(n: Notification) {
  return (
    n.scopeServerId ??
    metaString(n, 'serverId') ??
    (n.referenceType === 'server_join' || n.referenceType === 'server_invite'
      ? n.referenceId
      : null)
  )
}

function getServerAppApprovalAction(n: Notification) {
  if (n.referenceType !== 'server_app_command_approval') return null
  const serverId = getNotificationServerId(n)
  const appKey = metaString(n, 'appKey')
  const commandName = metaString(n, 'commandName')
  if (!serverId || !appKey || !commandName) return null
  return {
    notificationId: n.id,
    serverId,
    appKey,
    commandName,
    buddyAgentId: metaString(n, 'buddyAgentId') ?? undefined,
    remember: metaString(n, 'approvalMode') !== 'every_time',
  }
}

export function NotificationBell({
  className,
  rootClassName,
  panelClassName,
  onOpenChange,
  compact = false,
  iconSize,
  panelVariant = 'default',
  panelPlacement = 'default',
  osMode = false,
}: {
  className?: string
  rootClassName?: string
  panelClassName?: string
  onOpenChange?: (open: boolean) => void
  compact?: boolean
  iconSize?: number
  panelVariant?: 'default' | 'bubble'
  panelPlacement?: 'default' | 'bottom-end'
  osMode?: boolean
} = {}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const activeChannelId = useChatStore((state) => state.activeChannelId)
  const [showPanel, setShowPanel] = useState(false)
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const skipNextClickRef = useRef(false)

  const updateAnchorRect = useCallback(() => {
    const button = buttonRef.current
    if (!button) return
    setAnchorRect(button.getBoundingClientRect())
  }, [])

  const handleNotificationClick = useCallback(
    async (n: Notification) => {
      setShowPanel(false)
      // Mark as read
      if (!n.isRead) {
        markRead.mutate(n.id)
      }

      const navigateToChannel = async (channelId: string, messageId?: string | null) => {
        const messageSearch = messageId ? { msg: messageId, focus: Date.now().toString(36) } : {}
        if (messageId) {
          void queryClient.invalidateQueries({ queryKey: ['messages', channelId] })
        }
        if (messageId && activeChannelId === channelId) {
          window.dispatchEvent(
            new CustomEvent(FOCUS_CHAT_MESSAGE_EVENT, {
              detail: { channelId, messageId },
            }),
          )
          return
        }
        const channel = await fetchApi<{
          id: string
          name: string
          serverId?: string | null
          kind?: string
        }>(`/api/channels/${channelId}`)
        if (channel.kind === 'dm' || !channel.serverId) {
          navigate({
            to: '/dm/$dmChannelId',
            params: { dmChannelId: channel.id },
            search: messageSearch,
          })
          return
        }
        const server = await fetchApi<{ id: string; slug: string }>(
          `/api/servers/${channel.serverId}`,
        )
        navigate({
          to: '/servers/$serverSlug/channels/$channelId',
          params: { serverSlug: server.slug ?? channel.serverId, channelId: channel.id },
          search: messageSearch,
        })
      }

      const navigateToServer = async (serverId: string) => {
        const server = await fetchApi<{ id: string; slug: string }>(`/api/servers/${serverId}`)
        setShowPanel(false)
        navigate({
          to: '/servers/$serverSlug',
          params: { serverSlug: server.slug ?? server.id },
        })
      }

      const navigateToServerApp = async (serverId: string, appKey: string) => {
        const server = await fetchApi<{ id: string; slug: string }>(`/api/servers/${serverId}`)
        setShowPanel(false)
        navigate({
          to: '/servers/$serverSlug/apps/$appKey',
          params: { serverSlug: server.slug ?? server.id, appKey },
          search: metaString(n, 'channelId') ? { copilot: metaString(n, 'channelId') } : {},
        })
      }

      const navigateToOrder = (orderId: string, entitlementId?: string | null) => {
        setShowPanel(false)
        if (entitlementId) {
          navigate({
            to: '/settings/wallet/orders/$entitlementId',
            params: { entitlementId },
          })
          return
        }
        navigate({
          to: '/settings/wallet/orders/$entitlementId',
          params: { entitlementId: orderId },
          search: { by: 'order' },
        })
      }

      const navigateToEntitlement = (entitlementId: string) => {
        setShowPanel(false)
        navigate({
          to: '/settings/wallet/orders/$entitlementId',
          params: { entitlementId },
        })
      }

      const navigateToShop = async (shopId: string) => {
        const shop = await fetchApi<{
          id: string
          serverId?: string | null
          ownerUserId?: string | null
        }>(`/api/shops/${shopId}`)
        setShowPanel(false)
        if (shop.serverId) {
          navigate({
            to: '/servers/$serverSlug/shop',
            params: { serverSlug: shop.serverId },
          })
          return
        }
        if (shop.ownerUserId) {
          navigate({
            to: '/shop/users/$userId',
            params: { userId: shop.ownerUserId },
            search: { view: 'buyer' },
          })
        }
      }

      const dispatchOsCommand = (detail: Record<string, unknown>) => {
        window.dispatchEvent(new CustomEvent('shadow:os-command', { detail }))
        setShowPanel(false)
      }

      const activateServerInOs = async (serverId: string) => {
        const server = await fetchApi<{ id: string; slug: string | null }>(
          `/api/servers/${serverId}`,
        )
        dispatchOsCommand({
          action: 'open-server',
          serverId: server.id,
          serverSlug: server.slug ?? server.id,
        })
      }

      const activateChannelInOs = async (channelId: string) => {
        const channel = await fetchApi<{
          id: string
          name: string
          serverId?: string | null
          topic?: string | null
        }>(`/api/channels/${channelId}`)
        if (!channel.serverId) return false
        const server = await fetchApi<{ id: string; slug: string | null }>(
          `/api/servers/${channel.serverId}`,
        )
        dispatchOsCommand({
          action: channel.topic?.startsWith('shadow:buddy-inbox:') ? 'open-inbox' : 'open-channel',
          channelId: channel.id,
          serverId: server.id,
          serverSlug: server.slug ?? server.id,
        })
        return true
      }

      const activateShopInOs = async (shopId: string) => {
        const shop = await fetchApi<{ id: string; serverId?: string | null }>(
          `/api/shops/${shopId}`,
        )
        if (!shop.serverId) return false
        dispatchOsCommand({
          action: 'open-builtin',
          builtinKey: 'shop',
          serverId: shop.serverId,
          serverSlug: shop.serverId,
        })
        return true
      }

      if (osMode) {
        const channelId = getNotificationChannelId(n)
        if (channelId) {
          try {
            if (await activateChannelInOs(channelId)) return
          } catch {
            // Fall back to the regular navigation path below.
          }
        }
        if (n.referenceType === 'message' && n.referenceId) {
          try {
            const message = await fetchApi<{ id: string; channelId: string }>(
              `/api/messages/${n.referenceId}`,
            )
            if (await activateChannelInOs(message.channelId)) return
          } catch {
            // Fall back to the regular navigation path below.
          }
        }
        if (
          (n.referenceType === 'server_app' || n.referenceType === 'server_app_command_approval') &&
          getNotificationServerId(n) &&
          metaString(n, 'appKey')
        ) {
          dispatchOsCommand({
            action: 'open-app',
            appKey: metaString(n, 'appKey'),
            serverId: getNotificationServerId(n),
            serverSlug: getNotificationServerId(n),
          })
          return
        }
        if (n.referenceType === 'shop' && n.referenceId) {
          try {
            if (await activateShopInOs(n.referenceId)) return
          } catch {
            // Fall back to the regular navigation path below.
          }
        }
        const serverId = getNotificationServerId(n)
        if (serverId) {
          try {
            await activateServerInOs(serverId)
            return
          } catch {
            // Fall back to the regular navigation path below.
          }
        }
      }

      if (n.referenceType === 'order' && n.referenceId) {
        navigateToOrder(n.referenceId, metaString(n, 'entitlementId'))
        return
      }

      if (n.referenceType === 'entitlement' && n.referenceId) {
        navigateToEntitlement(n.referenceId)
        return
      }

      if (n.referenceType === 'shop' && n.referenceId) {
        try {
          await navigateToShop(n.referenceId)
        } catch {
          setShowPanel(false)
          navigate({ to: '/settings/shop' })
        }
        return
      }

      if (n.referenceType === 'community_asset' && n.referenceId) {
        setShowPanel(false)
        navigate({ to: '/assets/$assetId', params: { assetId: n.referenceId } })
        return
      }

      if (n.referenceType === 'wallet_transaction' || n.referenceType === 'settlement') {
        setShowPanel(false)
        navigate({
          to:
            n.referenceType === 'settlement' ? '/settings/wallet/settlements' : '/settings/wallet',
        })
        return
      }

      if (n.referenceType === 'payment_order') {
        setShowPanel(false)
        navigate({ to: '/settings/wallet' })
        return
      }

      if (
        (n.referenceType === 'server_app' || n.referenceType === 'server_app_command_approval') &&
        getNotificationServerId(n) &&
        metaString(n, 'appKey')
      ) {
        try {
          await navigateToServerApp(getNotificationServerId(n)!, metaString(n, 'appKey')!)
        } catch {
          // App may have been removed.
        }
        return
      }

      if (n.referenceType === 'message' && n.referenceId) {
        const scopedChannelId = getNotificationChannelId(n)
        if (scopedChannelId) {
          try {
            await navigateToChannel(scopedChannelId, n.referenceId)
          } catch {
            // Channel may have been deleted
          }
          return
        }
        try {
          const message = await fetchApi<{ id: string; channelId: string }>(
            `/api/messages/${n.referenceId}`,
          )
          await navigateToChannel(message.channelId, message.id)
        } catch {
          // Message may have been deleted
        }
        return
      }

      const channelId = getNotificationChannelId(n)
      if (channelId) {
        try {
          await navigateToChannel(channelId)
        } catch {
          // Channel may have been deleted
        }
        return
      }

      const serverId = getNotificationServerId(n)
      if (serverId) {
        try {
          await navigateToServer(serverId)
        } catch {
          // Server may have been deleted
        }
      }
    },
    [activeChannelId, navigate, osMode, queryClient],
  )

  const { data: unreadData } = useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: () => fetchApi<{ count: number }>('/api/notifications/unread-count'),
    staleTime: 5_000,
    refetchInterval: 30_000,
  })

  // Fetch notifications list
  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetchApi<Notification[]>('/api/notifications?limit=20'),
    enabled: showPanel,
  })

  // Listen for new notifications via WS
  useSocketEvent('notification:new', (notification: Notification) => {
    if (!notification.isRead) {
      queryClient.setQueryData<{ count: number }>(['notifications-unread-count'], (current) => ({
        count: Math.max(0, (current?.count ?? 0) + 1),
      }))
    }
    queryClient.setQueryData<Notification[]>(['notifications'], (current) => {
      if (!Array.isArray(current)) return current
      const withoutDuplicate = current.filter((item) => item.id !== notification.id)
      return [notification, ...withoutDuplicate].slice(0, 20)
    })
    queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
    queryClient.invalidateQueries({ queryKey: ['notifications'] })
    queryClient.invalidateQueries({ queryKey: ['notification-scoped-unread'] })
  })

  // Mark single as read
  const markRead = useMutation({
    mutationFn: (id: string) => fetchApi(`/api/notifications/${id}/read`, { method: 'PATCH' }),
    onSuccess: () => {
      queryClient.setQueryData<{ count: number }>(['notifications-unread-count'], (current) => ({
        count: Math.max(0, (current?.count ?? 0) - 1),
      }))
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
      queryClient.invalidateQueries({ queryKey: ['notification-scoped-unread'] })
    },
  })

  // Mark all as read
  const markAllRead = useMutation({
    mutationFn: () => fetchApi('/api/notifications/read-all', { method: 'POST' }),
    onSuccess: () => {
      queryClient.setQueryData<{ count: number }>(['notifications-unread-count'], { count: 0 })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
      queryClient.invalidateQueries({ queryKey: ['notification-scoped-unread'] })
    },
  })

  const reviewJoinRequest = useMutation({
    mutationFn: (input: { requestId: string; status: 'approved' | 'rejected' }) =>
      fetchApi(`/api/channel-join-requests/${input.requestId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: input.status }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
      queryClient.invalidateQueries({ queryKey: ['notification-scoped-unread'] })
      queryClient.invalidateQueries({ queryKey: ['channels'] })
    },
  })

  const reviewServerJoinRequest = useMutation({
    mutationFn: (input: { requestId: string; status: 'approved' | 'rejected' }) =>
      fetchApi(`/api/servers/join-requests/${input.requestId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: input.status }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
      queryClient.invalidateQueries({ queryKey: ['notification-scoped-unread'] })
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      queryClient.invalidateQueries({ queryKey: ['server-access'] })
    },
  })

  const approveServerAppCommand = useMutation({
    mutationFn: (input: NonNullable<ReturnType<typeof getServerAppApprovalAction>>) =>
      fetchApi(`/api/servers/${input.serverId}/apps/${input.appKey}/approvals`, {
        method: 'POST',
        body: JSON.stringify({
          commandName: input.commandName,
          buddyAgentId: input.buddyAgentId,
          remember: input.remember,
        }),
      }).then(() =>
        fetchApi(`/api/notifications/${input.notificationId}/read`, { method: 'PATCH' }),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
      queryClient.invalidateQueries({ queryKey: ['notification-scoped-unread'] })
    },
  })

  const unreadCount = unreadData?.count ?? 0

  const hasUnread = unreadCount > 0
  const togglePanel = useCallback(() => {
    setShowPanel((current) => {
      const next = !current
      if (next) updateAnchorRect()
      return next
    })
  }, [updateAnchorRect])

  useEffect(() => {
    onOpenChange?.(showPanel)
  }, [onOpenChange, showPanel])

  useLayoutEffect(() => {
    if (!showPanel) return
    updateAnchorRect()
    window.addEventListener('resize', updateAnchorRect)
    window.addEventListener('scroll', updateAnchorRect, true)
    return () => {
      window.removeEventListener('resize', updateAnchorRect)
      window.removeEventListener('scroll', updateAnchorRect, true)
    }
  }, [showPanel, updateAnchorRect])

  useEffect(() => {
    if (!showPanel) return
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return
      setShowPanel(false)
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowPanel(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [showPanel])

  const panelPosition = (() => {
    const panelWidth =
      panelVariant === 'bubble' && typeof window !== 'undefined'
        ? Math.min(460, window.innerWidth - 24)
        : 320
    const panelHeight = panelVariant === 'bubble' ? 640 : 420
    if (!anchorRect || typeof window === 'undefined') {
      return { arrowX: null, left: 96, top: 16, width: panelWidth }
    }
    const left =
      panelPlacement === 'bottom-end'
        ? Math.max(12, Math.min(anchorRect.right - panelWidth, window.innerWidth - panelWidth - 12))
        : Math.max(12, Math.min(anchorRect.right + 12, window.innerWidth - panelWidth - 12))
    const top =
      panelPlacement === 'bottom-end'
        ? Math.max(12, Math.min(anchorRect.bottom + 12, window.innerHeight - panelHeight - 12))
        : Math.max(12, Math.min(anchorRect.top - 2, window.innerHeight - panelHeight - 12))
    const arrowX = Math.max(
      30,
      Math.min(panelWidth - 30, anchorRect.left + anchorRect.width / 2 - left),
    )
    return { arrowX, left, top, width: panelWidth }
  })()

  return (
    <div className={cn('relative', rootClassName)}>
      <button
        ref={buttonRef}
        type="button"
        onPointerDownCapture={(event) => {
          event.preventDefault()
          event.stopPropagation()
          skipNextClickRef.current = true
          togglePanel()
        }}
        onClickCapture={(event) => {
          event.preventDefault()
          event.stopPropagation()
          if (skipNextClickRef.current) {
            skipNextClickRef.current = false
            return
          }
          togglePanel()
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          event.stopPropagation()
          togglePanel()
        }}
        className={cn(
          'relative flex h-10 w-10 items-center justify-center overflow-visible rounded-full bg-bg-primary text-text-muted transition hover:bg-bg-secondary hover:text-text-primary',
          className,
          hasUnread && (compact ? 'text-accent hover:text-accent' : 'text-text-primary'),
        )}
        data-unread={hasUnread ? 'true' : 'false'}
        title={t('notification.title')}
        aria-label={t('notification.title')}
      >
        {hasUnread && (
          <>
            <span
              className="notification-bell-wave absolute inset-0 rounded-full border border-accent/60"
              aria-hidden="true"
            />
            <span
              className="notification-bell-wave notification-bell-wave-delayed absolute inset-0 rounded-full border border-accent/40"
              aria-hidden="true"
            />
          </>
        )}
        <Bell
          size={iconSize ?? (compact ? 12 : 18)}
          className={cn('relative z-10', hasUnread && 'notification-bell-shake')}
        />
        {hasUnread && compact && (
          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-danger ring-2 ring-bg-primary" />
        )}
        {hasUnread && !compact && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-danger rounded-full text-white text-[11px] font-bold flex items-center justify-center px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {showPanel &&
        createPortal(
          <>
            {/* Panel */}
            <div
              ref={panelRef}
              style={{
                left: panelPosition.left,
                top: panelPosition.top,
                width: panelPosition.width,
              }}
              onPointerDown={(event) => event.stopPropagation()}
              className={cn(
                'fixed z-[90] border backdrop-blur-xl',
                panelVariant === 'bubble'
                  ? 'overflow-visible rounded-[28px] border-white/14 bg-bg-primary/96 shadow-[0_26px_90px_rgba(0,0,0,0.42)]'
                  : 'overflow-hidden rounded-[24px] border-border-subtle bg-bg-primary/95 shadow-[0_16px_64px_rgba(0,0,0,0.4)]',
                panelClassName,
              )}
            >
              {panelVariant === 'bubble' && panelPosition.arrowX !== null ? (
                <span
                  aria-hidden="true"
                  className="absolute -top-2 h-4 w-4 rotate-45 rounded-[3px] border-l border-t border-white/14 bg-bg-primary/96 shadow-[-3px_-3px_10px_rgba(0,0,0,0.12)]"
                  style={{ left: panelPosition.arrowX - 8 }}
                />
              ) : null}
              {/* Header */}
              <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
                <h3 className="font-bold text-text-primary text-sm">{t('notification.title')}</h3>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={() => markAllRead.mutate()}
                    className="flex items-center gap-1 text-xs text-primary hover:text-primary-hover transition"
                    title={t('notification.markAllRead')}
                  >
                    <CheckCheck size={14} />
                    {t('notification.markAllRead')}
                  </button>
                )}
              </div>

              {/* Notifications list */}
              <div
                className={cn(
                  'overflow-y-auto',
                  panelVariant === 'bubble' ? 'max-h-[min(560px,calc(100vh-180px))]' : 'max-h-80',
                )}
              >
                {notifications.length === 0 ? (
                  <div className="py-8 text-center text-text-muted text-sm">
                    {t('notification.empty')}
                  </div>
                ) : (
                  notifications.map((n) => {
                    const display = getNotificationDisplay(n, t)
                    const serverAppApprovalAction = getServerAppApprovalAction(n)
                    return (
                      <div
                        key={n.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleNotificationClick(n)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleNotificationClick(n)
                        }}
                        className={`px-4 py-3 border-b border-border-subtle last:border-0 hover:bg-bg-tertiary/50 transition cursor-pointer ${
                          !n.isRead ? 'bg-primary/5' : ''
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-text-primary font-medium truncate">
                              {display.title}
                            </p>
                            {display.body && (
                              <p className="text-xs text-text-muted mt-0.5 line-clamp-2">
                                {display.body}
                              </p>
                            )}
                            {n.referenceType === 'channel_join_request' && n.referenceId && (
                              <div className={cn('mt-2 flex gap-2', n.isRead && 'hidden')}>
                                <button
                                  type="button"
                                  className="inline-flex h-7 flex-1 cursor-pointer items-center justify-center gap-1 rounded-md bg-success/15 px-2 text-xs font-bold text-success transition hover:bg-success/25"
                                  disabled={reviewJoinRequest.isPending}
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    reviewJoinRequest.mutate({
                                      requestId: n.referenceId!,
                                      status: 'approved',
                                    })
                                  }}
                                >
                                  <Check size={13} />
                                  <span>{t('channel.approveAccess')}</span>
                                </button>
                                <button
                                  type="button"
                                  className="inline-flex h-7 flex-1 cursor-pointer items-center justify-center gap-1 rounded-md bg-danger/15 px-2 text-xs font-bold text-danger transition hover:bg-danger/25"
                                  disabled={reviewJoinRequest.isPending}
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    reviewJoinRequest.mutate({
                                      requestId: n.referenceId!,
                                      status: 'rejected',
                                    })
                                  }}
                                >
                                  <X size={13} />
                                  <span>{t('channel.rejectAccess')}</span>
                                </button>
                              </div>
                            )}
                            {n.referenceType === 'server_join_request' && n.referenceId && (
                              <div className={cn('mt-2 flex gap-2', n.isRead && 'hidden')}>
                                <button
                                  type="button"
                                  className="inline-flex h-7 flex-1 cursor-pointer items-center justify-center gap-1 rounded-md bg-success/15 px-2 text-xs font-bold text-success transition hover:bg-success/25"
                                  disabled={reviewServerJoinRequest.isPending}
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    reviewServerJoinRequest.mutate({
                                      requestId: n.referenceId!,
                                      status: 'approved',
                                    })
                                  }}
                                >
                                  <Check size={13} />
                                  <span>{t('server.approveAccess')}</span>
                                </button>
                                <button
                                  type="button"
                                  className="inline-flex h-7 flex-1 cursor-pointer items-center justify-center gap-1 rounded-md bg-danger/15 px-2 text-xs font-bold text-danger transition hover:bg-danger/25"
                                  disabled={reviewServerJoinRequest.isPending}
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    reviewServerJoinRequest.mutate({
                                      requestId: n.referenceId!,
                                      status: 'rejected',
                                    })
                                  }}
                                >
                                  <X size={13} />
                                  <span>{t('server.rejectAccess')}</span>
                                </button>
                              </div>
                            )}
                            {serverAppApprovalAction && (
                              <div className={cn('mt-2 flex gap-2', n.isRead && 'hidden')}>
                                <button
                                  type="button"
                                  className="inline-flex h-7 flex-1 cursor-pointer items-center justify-center gap-1 rounded-md bg-success/15 px-2 text-xs font-bold text-success transition hover:bg-success/25 disabled:cursor-not-allowed disabled:opacity-60"
                                  disabled={approveServerAppCommand.isPending}
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    approveServerAppCommand.mutate(serverAppApprovalAction)
                                  }}
                                >
                                  <ShieldCheck size={13} />
                                  <span>{t('serverApps.commandApprovalConfirm')}</span>
                                </button>
                              </div>
                            )}
                            <p className="text-[11px] text-text-muted mt-1">
                              {new Date(n.createdAt).toLocaleString()}
                            </p>
                          </div>
                          {!n.isRead && (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation()
                                markRead.mutate(n.id)
                              }}
                              className="shrink-0 p-1 text-text-muted hover:text-primary transition"
                              title={t('notification.markRead')}
                            >
                              <Check size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </>,
          document.body,
        )}
    </div>
  )
}
