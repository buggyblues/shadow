import { useQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
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
  const { serverId, channelName } = useParams({ strict: false }) as { serverId?: string; channelName?: string }
  const { activeChannelId, activeServerId, setActiveServer, setActiveChannel } = useChatStore()
  const { mobileView, setMobileView } = useUIStore()
  // Track whether we've restored the channel from URL for this server navigation
  const restoredServerRef = useRef<string | null>(null)

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

  // 1. Resolve server slug → UUID and set activeServer in store
  //    Only update when the resolved server ID actually changes to avoid
  //    unnecessary store resets (setActiveServer resets activeChannelId)
  useEffect(() => {
    if (server?.id && server.id !== activeServerId) {
      setActiveServer(server.id)
      setMobileView('channels')
    }
  }, [server?.id, activeServerId, setActiveServer, setMobileView])

  // 2. Resolve channelName from URL to channel ID
  //    This runs when URL has a channelName (e.g., /servers/slug/general)
  //    It MUST run before channel-sidebar's auto-select to prevent redirect to default channel
  useEffect(() => {
    if (!channelName || channels.length === 0) return
    // Only resolve once per server navigation to avoid loops
    if (restoredServerRef.current === `${serverId}/${channelName}`) return

    const decodedName = decodeURIComponent(channelName)
    const matched = channels.find(
      (ch) => ch.name === decodedName || ch.name.toLowerCase() === decodedName.toLowerCase(),
    )
    if (matched) {
      restoredServerRef.current = `${serverId}/${channelName}`
      if (matched.id !== activeChannelId) {
        setActiveChannel(matched.id)
        joinChannel(matched.id)
      }
      setMobileView('chat')
    }
  }, [channelName, channels, serverId, activeChannelId, setActiveChannel, setMobileView])

  if (!serverId) return null

  return (
    <div className="flex flex-1 min-w-0 overflow-hidden h-full bg-bg-tertiary">
      <div
        className={`${
          mobileView === 'channels' ? 'flex absolute inset-0 z-20 md:relative' : 'hidden'
        } md:flex flex-col w-full md:w-60 flex-shrink-0 transition-transform duration-300 ease-in-out`}
      >
        <ChannelSidebar serverId={serverId} channelNameFromUrl={channelName} />
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
