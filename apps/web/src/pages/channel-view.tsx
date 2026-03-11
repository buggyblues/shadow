import { useParams } from '@tanstack/react-router'
import { useLayoutEffect } from 'react'
import { ChatArea } from '../components/chat/chat-area'
import { MemberList } from '../components/member/member-list'
import { setLastChannelId } from '../lib/last-channel'
import { joinChannel, leaveChannel } from '../lib/socket'
import { useChatStore } from '../stores/chat.store'
import { useUIStore } from '../stores/ui.store'

export function ChannelView() {
  const { channelId } = useParams({ strict: false }) as { channelId: string }
  const activeServerId = useChatStore((s) => s.activeServerId)
  const setMobileView = useUIStore((s) => s.setMobileView)

  // Sync channel ID from URL → store before paint
  useLayoutEffect(() => {
    const prev = useChatStore.getState().activeChannelId
    if (prev && prev !== channelId) {
      leaveChannel(prev)
    }
    useChatStore.getState().setActiveChannel(channelId)
    joinChannel(channelId)
    setMobileView('chat')

    // Remember this channel as the last visited for this server
    if (activeServerId) {
      setLastChannelId(activeServerId, channelId)
    }

    return () => {
      leaveChannel(channelId)
    }
  }, [channelId, activeServerId, setMobileView])

  return (
    <>
      <ChatArea />
      <MemberList />
    </>
  )
}
