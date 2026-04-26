import { useQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import { useEffect, useLayoutEffect } from 'react'
import { ChatArea } from '../components/chat/chat-area'
import { MemberList } from '../components/member/member-list'
import { fetchApi } from '../lib/api'
import { setLastChannelId } from '../lib/last-channel'
import { joinChannel, leaveChannel } from '../lib/socket'
import { useChatStore } from '../stores/chat.store'
import { useUIStore } from '../stores/ui.store'

export function ChannelView() {
  const { channelId } = useParams({ strict: false }) as { channelId: string }
  const activeServerId = useChatStore((s) => s.activeServerId)
  const setMobileView = useUIStore((s) => s.setMobileView)
  const { data: channel } = useQuery({
    queryKey: ['channel', channelId],
    queryFn: () => fetchApi<{ id: string; serverId: string }>(`/api/channels/${channelId}`),
    enabled: !!channelId,
  })

  // Sync channel ID from URL → store before paint
  useLayoutEffect(() => {
    const prev = useChatStore.getState().activeChannelId
    if (prev && prev !== channelId) {
      leaveChannel(prev)
    }
    useChatStore.getState().setActiveChannel(channelId)
    joinChannel(channelId)
    setMobileView('chat')

    return () => {
      leaveChannel(channelId)
    }
  }, [channelId, setMobileView])

  useEffect(() => {
    if (activeServerId && channel?.serverId === activeServerId) {
      setLastChannelId(activeServerId, channelId)
    }
  }, [activeServerId, channel?.serverId, channelId])

  return (
    <>
      <ChatArea key={channelId} />
      <MemberList />
    </>
  )
}
