import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Hash, LogIn, LogOut, Users } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSocketEvent } from '../../hooks/use-socket'
import { fetchApi } from '../../lib/api'
import { playReceiveSound } from '../../lib/sounds'
import { useAuthStore } from '../../stores/auth.store'
import { useChatStore } from '../../stores/chat.store'
import { useUIStore } from '../../stores/ui.store'
import { NotificationBell } from '../notification/notification-bell'
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
  updatedAt?: string
  author?: Author
  reactions?: ReactionGroup[]
}

interface Channel {
  id: string
  name: string
  topic: string | null
  type: string
}

interface MemberEvent {
  serverId: string
  userId: string
  username: string
  displayName: string
  avatarUrl: string | null
  isBot: boolean
}

/** A system event rendered inline between messages */
interface SystemEvent {
  id: string
  type: 'joined' | 'left'
  displayName: string
  isBot: boolean
  timestamp: number
}

export function ChatArea() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { activeChannelId, activeServerId } = useChatStore()
  const user = useAuthStore((s) => s.user)
  const { setMobileView } = useUIStore()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const [replyToId, setReplyToId] = useState<string | null>(null)
  const [typingUsers, setTypingUsers] = useState<string[]>([])
  const [lastReadCount, setLastReadCount] = useState(0)
  const [highlightMsgId, setHighlightMsgId] = useState<string | null>(null)
  const [systemEvents, setSystemEvents] = useState<SystemEvent[]>([])
  const [activityUsers, setActivityUsers] = useState<
    { userId: string; username: string; activity: string }[]
  >([])

  // Handle ?msg= query param for message anchor links
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional trigger on channel change
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const msgId = params.get('msg')
    if (msgId) {
      setHighlightMsgId(msgId)
      // Scroll to the message after a short delay
      setTimeout(() => {
        const el = document.getElementById(`msg-${msgId}`)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }, 500)
      // Clear highlight after animation
      setTimeout(() => setHighlightMsgId(null), 3000)
    }
  }, [activeChannelId])

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
      // Play receive sound for messages from others
      if (msg.authorId !== user?.id) {
        playReceiveSound()
      }
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

  // Listen for member join events
  useSocketEvent('member:joined', (data: MemberEvent) => {
    if (data.serverId === activeServerId) {
      setSystemEvents((prev) => [
        ...prev,
        {
          id: `join-${data.userId}-${Date.now()}`,
          type: 'joined',
          displayName: data.displayName,
          isBot: data.isBot,
          timestamp: Date.now(),
        },
      ])
      // Invalidate members cache
      queryClient.invalidateQueries({ queryKey: ['members', activeServerId] })
    }
  })

  // Listen for member leave events
  useSocketEvent('member:left', (data: MemberEvent) => {
    if (data.serverId === activeServerId) {
      setSystemEvents((prev) => [
        ...prev,
        {
          id: `leave-${data.userId}-${Date.now()}`,
          type: 'left',
          displayName: data.displayName,
          isBot: data.isBot,
          timestamp: Date.now(),
        },
      ])
      // Invalidate members cache
      queryClient.invalidateQueries({ queryKey: ['members', activeServerId] })
    }
  })

  // Listen for agent activity status
  useSocketEvent(
    'presence:activity',
    (data: { userId: string; activity: string | null; channelId: string }) => {
      if (data.channelId !== activeChannelId) return
      setActivityUsers((prev) => {
        if (!data.activity) {
          return prev.filter((u) => u.userId !== data.userId)
        }
        // Look up display name from members cache
        const members = queryClient.getQueryData<
          { userId: string; user?: { displayName?: string; username?: string } }[]
        >(['members', activeServerId])
        const member = members?.find((m) => m.userId === data.userId)
        const displayName =
          member?.user?.displayName || member?.user?.username || data.userId

        const existing = prev.find((u) => u.userId === data.userId)
        if (existing) {
          return prev.map((u) =>
            u.userId === data.userId
              ? { ...u, activity: data.activity as string, username: displayName }
              : u,
          )
        }
        return [...prev, { userId: data.userId, username: displayName, activity: data.activity }]
      })
    },
  )

  // Clear system events and activity on channel change
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional reset
  useEffect(() => {
    setSystemEvents([])
    setActivityUsers([])
  }, [activeChannelId])

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
      // User is at bottom, mark all messages as read
      if (lastReadCount > 0 && lastReadCount < messages.length) {
        setLastReadCount(messages.length)
      }
    }
  }, [messages.length, lastReadCount])

  // Clear new-message line when user scrolls to bottom
  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return

    const handleScroll = () => {
      const isNearBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight < 80
      if (isNearBottom && lastReadCount > 0 && lastReadCount < messages.length) {
        setLastReadCount(messages.length)
      }
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => container.removeEventListener('scroll', handleScroll)
  }, [lastReadCount, messages.length])

  // Reset read count when channel changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional trigger on channel change
  useEffect(() => {
    setLastReadCount(0)
  }, [activeChannelId])

  // Track read count for new message line (only set once on initial load)
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

  const handleMessageUpdate = useCallback(
    (msg: Message) => {
      queryClient.setQueryData<Message[]>(['messages', activeChannelId], (old = []) =>
        old.map((m) => (m.id === msg.id ? { ...m, ...msg } : m)),
      )
    },
    [queryClient, activeChannelId],
  )

  const handleMessageDelete = useCallback(
    (msgId: string) => {
      queryClient.setQueryData<Message[]>(['messages', activeChannelId], (old = []) =>
        old.filter((m) => m.id !== msgId),
      )
    },
    [queryClient, activeChannelId],
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
    <div className="flex-1 flex flex-col bg-bg-primary min-w-0 h-full relative">
      {/* Channel header */}
      <div className="h-12 px-4 flex items-center gap-2 border-b-2 border-bg-tertiary shrink-0 z-10 bg-bg-primary">
        {/* Mobile back button */}
        <button
          onClick={() => setMobileView('channels')}
          className="md:hidden text-text-secondary hover:text-text-primary transition shrink-0 -ml-1 mr-1 p-1 hover:bg-white/5 rounded-md"
        >
          <ArrowLeft size={20} />
        </button>
        <Hash size={24} className="text-text-muted shrink-0" />
        <h3 className="font-bold text-text-primary text-[15px] truncate">{channel?.name ?? '...'}</h3>
        {channel?.topic && (
          <>
            <div className="w-[1px] h-6 bg-white/10 mx-2 hidden sm:block shrink-0" />
            <p className="text-sm text-text-secondary truncate hidden sm:block font-medium">{channel.topic}</p>
          </>
        )}
        {/* Right side: members toggle + notification bell */}
        <div className="flex items-center gap-3 ml-auto shrink-0">
          <NotificationBell />
          <button
            onClick={() => useUIStore.getState().toggleMobileMemberList()}
            className="lg:hidden text-text-secondary hover:text-text-primary transition p-1.5 rounded-md hover:bg-white/5"
            title={t('member.toggleList')}
          >
            <Users size={20} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden py-4">
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
                onMessageUpdate={handleMessageUpdate}
                onMessageDelete={handleMessageDelete}
                highlight={highlightMsgId === msg.id}
                replyToMessage={
                  msg.replyToId ? (messages.find((m) => m.id === msg.replyToId) ?? null) : null
                }
              />
            </div>
          ))
        )}
        {/* System events (member join/leave) */}
        {systemEvents.map((evt) => (
          <div key={evt.id} className="flex items-center justify-center gap-2 px-4 py-1.5">
            <div className="flex items-center gap-1.5 text-xs text-text-muted">
              {evt.type === 'joined' ? (
                <LogIn size={14} className="text-green-400" />
              ) : (
                <LogOut size={14} className="text-red-400" />
              )}
              <span>
                {evt.isBot ? '🤖 ' : ''}
                <span className="font-medium text-text-secondary">{evt.displayName}</span>
                {' '}
                {evt.type === 'joined' ? t('member.joinedServer') : t('member.leftServer')}
              </span>
            </div>
          </div>
        ))}
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

      {/* Agent activity indicator */}
      {activityUsers.length > 0 && (
        <div className="px-4 py-1 text-xs text-text-muted flex items-center gap-1">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
          </span>
          {activityUsers
            .map((u) => {
              const activityLabel =
                u.activity === 'thinking'
                  ? t('member.activityThinking')
                  : u.activity === 'working'
                    ? t('member.activityWorking')
                    : u.activity === 'ready'
                      ? t('member.activityReady')
                      : u.activity === 'preparing'
                        ? t('member.activityPreparing')
                        : u.activity
              return `🤖 ${u.username} ${activityLabel}`
            })
            .join('、')}
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
