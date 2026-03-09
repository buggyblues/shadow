import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { ChannelSidebar } from '../components/channel/channel-sidebar'
import { ChatArea } from '../components/chat/chat-area'
import { MemberList } from '../components/member/member-list'
import { useAppStatus } from '../hooks/use-app-status'
import { useUnreadCount } from '../hooks/use-unread-count'
import { fetchApi } from '../lib/api'
import { joinChannel } from '../lib/socket'
import { useChatStore } from '../stores/chat.store'
import { useUIStore } from '../stores/ui.store'

interface ServerMeta {
  id: string
  name: string
  slug: string | null
}

interface ChannelMeta {
  id: string
  name: string
}

interface ChannelListItem {
  id: string
  name: string
  type: string
}

export function ServerPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { serverId, channelName } = useParams({ strict: false }) as { serverId?: string; channelName?: string }
  const { activeChannelId, setActiveServer, setActiveChannel } = useChatStore()
  const { mobileView, setMobileView } = useUIStore()
  const restoredRef = useRef(false)

  const { data: server } = useQuery({
    queryKey: ['server', serverId],
    queryFn: () => fetchApi<ServerMeta>(`/api/servers/${serverId}`),
    enabled: !!serverId,
  })

  // Fetch channels to resolve channelName → channelId
  const { data: channels = [] } = useQuery({
    queryKey: ['channels', serverId],
    queryFn: () => fetchApi<ChannelListItem[]>(`/api/servers/${serverId}/channels`),
    enabled: !!serverId,
  })

  const { data: channel } = useQuery({
    queryKey: ['channel', activeChannelId],
    queryFn: () => fetchApi<ChannelMeta>(`/api/channels/${activeChannelId}`),
    enabled: !!activeChannelId,
  })

  const unreadCount = useUnreadCount()
  const title = channel?.name
    ? `#${channel.name} · ${server?.name ?? t('server.home')}`
    : (server?.name ?? t('common.selectServerToChat'))

  useAppStatus({
    title,
    unreadCount,
    hasNotification: unreadCount > 0,
    variant: 'workspace',
  })

  useEffect(() => {
    if (server?.id) {
      setActiveServer(server.id)
      setMobileView('channels')
      return
    }
    // Only set activeServer from URL param if it looks like a UUID (not a slug)
    if (serverId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(serverId)) {
      setActiveServer(serverId)
      setMobileView('channels')
    }
  }, [server?.id, serverId, setActiveServer, setMobileView])

  // Resolve channelName from URL to channel ID
  useEffect(() => {
    if (!channelName || channels.length === 0 || restoredRef.current) return
    const decodedName = decodeURIComponent(channelName)
    const matched = channels.find(
      (ch) => ch.name === decodedName || ch.name.toLowerCase() === decodedName.toLowerCase(),
    )
    if (matched && matched.id !== activeChannelId) {
      restoredRef.current = true
      setActiveChannel(matched.id)
      joinChannel(matched.id)
      setMobileView('chat')
    }
  }, [channelName, channels, activeChannelId, setActiveChannel, setMobileView])

  // Reset restored flag when serverId changes
  useEffect(() => {
    restoredRef.current = false
  }, [serverId])

  if (!serverId) return null

  return (
    <div className="flex flex-1 min-w-0 overflow-hidden h-full bg-bg-tertiary">
      <div
        className={`${
          mobileView === 'channels' ? 'flex absolute inset-0 z-20 md:relative' : 'hidden'
        } md:flex flex-col w-full md:w-60 flex-shrink-0 transition-transform duration-300 ease-in-out`}
      >
        <ChannelSidebar serverId={serverId} />
      </div>

      <div
        className={`${
          mobileView === 'chat' ? 'flex absolute inset-0 z-10 md:relative md:z-auto' : 'hidden'
        } md:flex flex-1 min-w-0 flex-col transition-all duration-300 ease-in-out`}
      >
        <ChatArea />
      </div>

      <MemberList />
    </div>
  )
}
