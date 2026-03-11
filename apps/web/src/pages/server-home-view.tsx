import { useLayoutEffect } from 'react'
import { ServerHome } from '../components/server/server-home'
import { leaveChannel } from '../lib/socket'
import { useChatStore } from '../stores/chat.store'

export function ServerHomeView() {
  // Clear channel state when entering server home
  useLayoutEffect(() => {
    const prev = useChatStore.getState().activeChannelId
    if (prev) {
      leaveChannel(prev)
      useChatStore.getState().setActiveChannel(null)
    }
  }, [])

  return <ServerHome />
}
