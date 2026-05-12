import { useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useLayoutEffect } from 'react'
import { ChatArea } from '../components/chat/chat-area'
import { fetchApi } from '../lib/api'
import { joinChannel, leaveChannel } from '../lib/socket'
import { useChatStore } from '../stores/chat.store'

export function DirectChatView({ channelId, onBack }: { channelId: string; onBack?: () => void }) {
  const queryClient = useQueryClient()

  useLayoutEffect(() => {
    const store = useChatStore.getState()
    const previousChannelId = store.activeChannelId
    const previousServerId = store.activeServerId

    if (previousChannelId && previousChannelId !== channelId) {
      leaveChannel(previousChannelId)
    }

    store.setActiveServer(null)
    store.setActiveChannel(channelId)
    joinChannel(channelId)

    void fetchApi('/api/notifications/read-scope', {
      method: 'POST',
      body: JSON.stringify({ channelId }),
    }).finally(() => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-scoped-unread'] })
    })

    return () => {
      leaveChannel(channelId)
      const latest = useChatStore.getState()
      if (latest.activeChannelId === channelId) {
        latest.setActiveChannel(null)
      }
      latest.setActiveServer(previousServerId)
    }
  }, [channelId, queryClient])

  return <ChatArea key={channelId} onBack={onBack} showMemberToggle={false} />
}

export function DirectChatRoute() {
  const { dmChannelId } = useParams({ strict: false }) as { dmChannelId: string }
  const navigate = useNavigate()

  return <DirectChatView channelId={dmChannelId} onBack={() => navigate({ to: '/settings/dm' })} />
}

export const DirectChatPage = DirectChatRoute
