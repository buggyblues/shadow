import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Hash } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSocketEvent } from '../../hooks/use-socket'
import { fetchApi } from '../../lib/api'
import { useAuthStore } from '../../stores/auth.store'
import { useChatStore } from '../../stores/chat.store'
import { MessageBubble } from './message-bubble'
import { MessageInput } from './message-input'

interface Author {
  id: string
  username: string
  displayName: string
  avatarUrl: string | null
  isBot: boolean
}

interface ReactionGroup {
  emoji: string
  count: number
  userIds: string[]
}

interface Message {
  id: string
  content: string
  channelId: string
  authorId: string
  threadId: string | null
  replyToId: string | null
  isEdited: boolean
  isPinned: boolean
  createdAt: string
  author?: Author
  reactions?: ReactionGroup[]
}

interface Channel {
  id: string
  name: string
  topic: string | null
  type: string
}

export function ChatArea() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { activeChannelId } = useChatStore()
  const user = useAuthStore((s) => s.user)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const [replyToId, setReplyToId] = useState<string | null>(null)
  const [typingUsers, setTypingUsers] = useState<string[]>([])
  const [lastReadCount, setLastReadCount] = useState(0)
  // Fetch channel info
  const { data: channel } = useQuery({
    queryKey: ['channel', activeChannelId],
    queryFn: () => fetchApi<Channel>(`/api/channels/${activeChannelId}`),
    enabled: !!activeChannelId,
  })

  // Fetch messages
  const { data: messages = [] } = useQuery({
    queryKey: ['messages', activeChannelId],
    queryFn: () => fetchApi<Message[]>(`/api/channels/${activeChannelId}/messages?limit=50`),
    enabled: !!activeChannelId,
    refetchOnWindowFocus: false,
  })

  // Listen for new messages via WebSocket
  useSocketEvent('message:new', (msg: Message) => {
    if (msg.channelId === activeChannelId) {
      queryClient.setQueryData<Message[]>(['messages', activeChannelId], (old = []) => [
        ...old,
        msg,
      ])
    }
  })

  // Listen for message updates
  useSocketEvent('message:updated', (msg: Message) => {
    if (msg.channelId === activeChannelId) {
      queryClient.setQueryData<Message[]>(['messages', activeChannelId], (old = []) =>
        old.map((m) => (m.id === msg.id ? msg : m)),
      )
    }
  })

  // Listen for message deletes
  useSocketEvent('message:deleted', (data: { id: string; channelId: string }) => {
    if (data.channelId === activeChannelId) {
      queryClient.setQueryData<Message[]>(['messages', activeChannelId], (old = []) =>
        old.filter((m) => m.id !== data.id),
      )
    }
  })

  // Listen for reaction updates via WS
  useSocketEvent(
    'reaction:updated',
    (data: { messageId: string; channelId: string; reactions: ReactionGroup[] }) => {
      if (data.channelId === activeChannelId) {
        queryClient.setQueryData<Message[]>(['messages', activeChannelId], (old = []) =>
          old.map((m) => (m.id === data.messageId ? { ...m, reactions: data.reactions } : m)),
        )
      }
    },
  )

  // Listen for typing indicators
  useSocketEvent(
    'message:typing',
    (data: { userId: string; username: string; channelId: string }) => {
      if (data.channelId === activeChannelId && data.userId !== user?.id) {
        setTypingUsers((prev) => {
          if (prev.includes(data.username)) return prev
          return [...prev, data.username]
        })
        // Remove after 3 seconds
        setTimeout(() => {
          setTypingUsers((prev) => prev.filter((u) => u !== data.username))
        }, 3000)
      }
    },
  )

  // Add reaction
  const addReaction = useMutation({
    mutationFn: ({ messageId, emoji }: { messageId: string; emoji: string }) =>
      fetchApi(`/api/messages/${messageId}/reactions`, {
        method: 'POST',
        body: JSON.stringify({ emoji }),
      }),
  })

  // Auto-scroll to bottom on new messages (only if near bottom)
  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      return
    }

    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150

    if (isNearBottom || messages.length <= 50) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages.length])

  // Reset read count when channel changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional trigger on channel change
  useEffect(() => {
    setLastReadCount(0)
  }, [activeChannelId])

  // Track read count for new message line
  useEffect(() => {
    if (messages.length > 0 && lastReadCount === 0) {
      setLastReadCount(messages.length)
    }
  }, [messages.length, lastReadCount])

  const handleReact = useCallback(
    (messageId: string, emoji: string) => {
      addReaction.mutate({ messageId, emoji })
    },
    [addReaction],
  )

  if (!activeChannelId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg-primary">
        <div className="text-center">
          <img src="/Logo.svg" alt="Shadow" className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <p className="text-text-muted text-lg">{t('chat.selectChannel')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col bg-bg-primary min-w-0">
      {/* Channel header */}
      <div className="h-12 px-4 flex items-center gap-2 border-b border-white/5 shadow-sm shrink-0">
        <Hash size={20} className="text-text-muted" />
        <h3 className="font-bold text-text-primary">{channel?.name ?? '...'}</h3>
        {channel?.topic && (
          <>
            <div className="w-px h-5 bg-white/10 mx-2" />
            <p className="text-sm text-text-muted truncate">{channel.topic}</p>
          </>
        )}
      </div>

      {/* Messages */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto py-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-muted">
            <Hash size={48} className="mb-2 opacity-30" />
            <p className="text-lg font-bold text-text-primary mb-1">
              {t('chat.welcomeChannel', {
                channelName: channel?.name ?? t('chat.channelFallback'),
              })}
            </p>
            <p className="text-sm">{t('chat.welcomeStart')}</p>
          </div>
        ) : (
          messages.map((msg, index) => (
            <div key={msg.id}>
              {lastReadCount > 0 && index === lastReadCount && (
                <div className="flex items-center gap-2 px-4 my-2">
                  <div className="flex-1 h-px bg-danger/60" />
                  <span className="text-xs text-danger font-semibold px-2">
                    {t('chat.newMessages')}
                  </span>
                  <div className="flex-1 h-px bg-danger/60" />
                </div>
              )}
              <MessageBubble
                message={msg}
                currentUserId={user?.id ?? ''}
                onReply={(id) => setReplyToId(id)}
                onReact={handleReact}
              />
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Typing indicator */}
      {typingUsers.length > 0 && (
        <div className="px-4 py-1 text-xs text-text-muted">
          <span className="inline-flex gap-0.5 mr-1">
            <span
              className="w-1.5 h-1.5 bg-text-muted rounded-full animate-bounce"
              style={{ animationDelay: '0ms' }}
            />
            <span
              className="w-1.5 h-1.5 bg-text-muted rounded-full animate-bounce"
              style={{ animationDelay: '150ms' }}
            />
            <span
              className="w-1.5 h-1.5 bg-text-muted rounded-full animate-bounce"
              style={{ animationDelay: '300ms' }}
            />
          </span>
          {t('chat.typingIndicator', { users: typingUsers.join('、') })}
        </div>
      )}

      {/* Message input */}
      <MessageInput
        channelId={activeChannelId}
        channelName={channel?.name}
        replyToId={replyToId}
        onClearReply={() => setReplyToId(null)}
      />
    </div>
  )
}
