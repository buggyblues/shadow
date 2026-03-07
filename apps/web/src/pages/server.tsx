import { useQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ChannelSidebar } from '../components/channel/channel-sidebar'
import { ChatArea } from '../components/chat/chat-area'
import { MemberList } from '../components/member/member-list'
import { useAppStatus } from '../hooks/use-app-status'
import { useUnreadCount } from '../hooks/use-unread-count'
import { fetchApi } from '../lib/api'
import { useChatStore } from '../stores/chat.store'
import { useUIStore } from '../stores/ui.store'

interface ServerMeta {
  id: string
  name: string
}

interface ChannelMeta {
  id: string
  name: string
}

export function ServerPage() {
  const { t } = useTranslation()
  const { serverId } = useParams({ strict: false })
  const { activeChannelId, setActiveServer } = useChatStore()
  const { mobileView, setMobileView } = useUIStore()

  const { data: server } = useQuery({
    queryKey: ['server', serverId],
    queryFn: () => fetchApi<ServerMeta>(`/api/servers/${serverId}`),
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
    if (serverId) {
      setActiveServer(serverId)
      setMobileView('channels')
    }
  }, [server?.id, serverId, setActiveServer, setMobileView])

  if (!serverId) return null

  return (
    <div className="flex flex-1 min-w-0 overflow-hidden h-full bg-bg-tertiary">
      {/* Channel sidebar: standard Discord width (240px/w-60). 
          On mobile it takes full width but transitions smoothly. */}
      <div
        className={`${
          mobileView === 'channels' ? 'flex absolute inset-0 z-20 md:relative' : 'hidden'
        } md:flex flex-col w-full md:w-60 flex-shrink-0 transition-transform duration-300 ease-in-out`}
      >
        <ChannelSidebar serverId={serverId} />
      </div>

      {/* Chat area: flexible width, with min-w-0 to prevent flex blowout */}
      <div
        className={`${
          mobileView === 'chat' ? 'flex absolute inset-0 z-10 md:relative md:z-auto' : 'hidden'
        } md:flex flex-1 min-w-0 flex-col transition-all duration-300 ease-in-out`}
      >
        <ChatArea />
      </div>

      {/* Member list: hidden by default, shown on lg+ within its component,
          or as an overlay on smaller screens if managed by a state */}
      <MemberList />
    </div>
  )
}
