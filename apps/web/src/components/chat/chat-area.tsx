import { Badge, Button, cn } from '@shadowob/ui'
import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  Archive,
  ArrowLeft,
  ClipboardCopy,
  Hash,
  Loader2,
  LogIn,
  LogOut,
  PawPrint,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSocketEvent } from '../../hooks/use-socket'
import { fetchApi } from '../../lib/api'
import { playReceiveSound } from '../../lib/sounds'
import { showToast } from '../../lib/toast'
import { useAuthStore } from '../../stores/auth.store'
import { useChatStore } from '../../stores/chat.store'
import { useUIStore } from '../../stores/ui.store'
import { useConfirmStore } from '../common/confirm-dialog'
import { InvitePanel } from '../common/invite-panel'
import { NotificationBell } from '../notification/notification-bell'
import { type PickerResult, WorkspaceFilePicker } from '../workspace'
import { FilePreviewPanel } from './file-preview-panel'
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
  attachments?: { id: string; filename: string; url: string; contentType: string; size: number }[]
  /** Optimistic send status — only set on client-side pending messages */
  sendStatus?: 'sending' | 'failed'
}

interface MessagesPage {
  messages: Message[]
  hasMore: boolean
}

interface Channel {
  id: string
  name: string
  topic: string | null
  type: string
}

interface MemberEvent {
  serverId: string
  channelId?: string
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
  scope: 'server' | 'channel'
  displayName: string
  isBot: boolean
  timestamp: number
}

/** Pre-computed timeline item with grouping info */
type TimelineItem =
  | { kind: 'message'; data: Message; isGrouped: boolean }
  | { kind: 'system'; data: SystemEvent }

/** Estimated height by content type — used for virtualizer initial estimates */
function estimateItemSize(item: TimelineItem): number {
  if (item.kind === 'system') return 40
  const msg = item.data
  let base = 60
  if (msg.replyToId) base += 36
  if (msg.attachments && msg.attachments.length > 0) {
    base += msg.attachments.length * 120
  }
  const lineCount = (msg.content.match(/\n/g) || []).length
  if (lineCount > 3) base += (lineCount - 3) * 20
  return Math.min(base, 400) // cap to avoid extreme estimates
}

export function ChatArea() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { activeChannelId, activeServerId } = useChatStore()
  const user = useAuthStore((s) => s.user)
  const { setMobileView } = useUIStore()
  const parentRef = useRef<HTMLDivElement>(null)
  const [replyToId, setReplyToId] = useState<string | null>(null)
  const [droppedFiles, setDroppedFiles] = useState<File[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [typingUsers, setTypingUsers] = useState<string[]>([])
  const [lastReadCount, setLastReadCount] = useState(0)
  const [highlightMsgId, setHighlightMsgId] = useState<string | null>(null)
  const [systemEvents, setSystemEvents] = useState<SystemEvent[]>([])
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(new Set())
  const [activityUsers, setActivityUsers] = useState<
    { userId: string; username: string; activity: string }[]
  >([])
  const initialScrollDoneRef = useRef(false)
  const prevMessageCountRef = useRef(0)
  const shouldStickToBottomRef = useRef(true)
  const [previewFile, setPreviewFile] = useState<{
    id: string
    filename: string
    url: string
    contentType: string
    size: number
  } | null>(null)

  // Save-to-workspace state
  const [saveToWorkspaceFile, setSaveToWorkspaceFile] = useState<{
    filename: string
    url: string
    contentType: string
    size: number
  } | null>(null)

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

  // Fetch messages with infinite query (cursor-based pagination)
  const PAGE_SIZE = 50
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: isLoadingMessages,
  } = useInfiniteQuery({
    queryKey: ['messages', activeChannelId],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) })
      if (pageParam) params.set('cursor', pageParam as string)
      return fetchApi<MessagesPage>(`/api/channels/${activeChannelId}/messages?${params}`)
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => {
      if (!lastPage.hasMore || lastPage.messages.length === 0) return undefined
      // Cursor = createdAt of the oldest message in this page (first item, since sorted oldest-to-newest)
      return lastPage.messages[0]?.createdAt
    },
    enabled: !!activeChannelId,
    refetchOnWindowFocus: false,
  })

  // Flatten all pages into a single array (oldest-to-newest)
  const messages = useMemo(() => {
    if (!data) return []
    // Pages are stored [latest, older, oldest...], reverse then flatten
    return [...data.pages].reverse().flatMap((p) => p.messages)
  }, [data])

  // O(1) message lookup map — avoids O(n) .find() for replyToMessage
  const messageMap = useMemo(() => {
    const map = new Map<string, Message>()
    for (const m of messages) map.set(m.id, m)
    return map
  }, [messages])

  // Build timeline with pre-computed grouping — avoids per-render calculation
  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = []
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i]
      const prev = i > 0 ? messages[i - 1] : undefined
      const isGrouped =
        prev !== undefined &&
        prev.authorId === m.authorId &&
        !m.replyToId &&
        Math.abs(new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime()) < 60_000
      items.push({ kind: 'message' as const, data: m, isGrouped })
    }

    // Insert system events at the correct position based on timestamp
    for (const evt of systemEvents) {
      let insertIdx = items.length
      for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i]!
        const itemTime =
          item.kind === 'message' ? new Date(item.data.createdAt).getTime() : item.data.timestamp
        if (itemTime <= evt.timestamp) {
          insertIdx = i + 1
          break
        }
        if (i === 0) insertIdx = 0
      }
      items.splice(insertIdx, 0, { kind: 'system', data: evt })
    }
    return items
  }, [messages, systemEvents])

  // Listen for new messages via WebSocket
  useSocketEvent('message:new', (msg: Message) => {
    if (msg.channelId === activeChannelId) {
      const scrollEl = parentRef.current
      const wasNearBottom = scrollEl
        ? scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight < 150
        : true

      queryClient.setQueryData<InfiniteData<MessagesPage>>(['messages', activeChannelId], (old) => {
        if (!old || old.pages.length === 0) return old
        const pages = [...old.pages]
        const firstPage = pages[0]!

        // Deduplicate: if message already exists, update it
        if (firstPage.messages.some((m) => m.id === msg.id)) {
          pages[0] = {
            ...firstPage,
            messages: firstPage.messages.map((m) => (m.id === msg.id ? msg : m)),
          }
          return { ...old, pages }
        }

        // Check if this is confirmation of an optimistic message from us
        if (msg.authorId === user?.id) {
          const tempIdx = firstPage.messages.findIndex(
            (m) => m.id.startsWith('temp-') && m.authorId === msg.authorId,
          )
          if (tempIdx >= 0) {
            pages[0] = {
              ...firstPage,
              messages: firstPage.messages.map((m, i) => (i === tempIdx ? msg : m)),
            }
            return { ...old, pages }
          }
        }

        // Append new message
        pages[0] = {
          ...firstPage,
          messages: [...firstPage.messages, msg],
        }
        return { ...old, pages }
      })
      if (wasNearBottom || shouldStickToBottomRef.current) {
        shouldStickToBottomRef.current = true
        scrollToBottom('smooth')
      }
      // Play receive sound for messages from others
      if (msg.authorId !== user?.id) {
        playReceiveSound()
      }
    }
  })

  // Listen for message updates
  useSocketEvent('message:updated', (msg: Message) => {
    if (msg.channelId === activeChannelId) {
      queryClient.setQueryData<InfiniteData<MessagesPage>>(['messages', activeChannelId], (old) => {
        if (!old) return old
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            messages: page.messages.map((m) => (m.id === msg.id ? msg : m)),
          })),
        }
      })
    }
  })

  // Listen for message deletes
  useSocketEvent('message:deleted', (data: { id: string; channelId: string }) => {
    if (data.channelId === activeChannelId) {
      queryClient.setQueryData<InfiniteData<MessagesPage>>(['messages', activeChannelId], (old) => {
        if (!old) return old
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            messages: page.messages.filter((m) => m.id !== data.id),
          })),
        }
      })
    }
  })

  // Listen for reaction updates via WS
  useSocketEvent(
    'reaction:updated',
    (data: { messageId: string; channelId: string; reactions: ReactionGroup[] }) => {
      if (data.channelId === activeChannelId) {
        queryClient.setQueryData<InfiniteData<MessagesPage>>(
          ['messages', activeChannelId],
          (old) => {
            if (!old) return old
            return {
              ...old,
              pages: old.pages.map((page) => ({
                ...page,
                messages: page.messages.map((m) =>
                  m.id === data.messageId ? { ...m, reactions: data.reactions } : m,
                ),
              })),
            }
          },
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
      const scope = data.channelId ? 'channel' : 'server'
      setSystemEvents((prev) => {
        // Deduplicate: if a server-level join exists for this user within 5s, replace with channel-level
        if (scope === 'channel') {
          const recentServerJoin = prev.find(
            (e) =>
              e.type === 'joined' &&
              e.scope === 'server' &&
              e.displayName === data.displayName &&
              Date.now() - e.timestamp < 5000,
          )
          if (recentServerJoin) {
            return prev.map((e) => (e.id === recentServerJoin.id ? { ...e, scope: 'channel' } : e))
          }
        }
        return [
          ...prev,
          {
            id: `join-${data.userId}-${Date.now()}`,
            type: 'joined',
            scope,
            displayName: data.displayName,
            isBot: data.isBot,
            timestamp: Date.now(),
          },
        ]
      })
      // Invalidate members cache
      queryClient.invalidateQueries({ queryKey: ['members', activeServerId] })
    }
  })

  // Listen for member leave events
  useSocketEvent('member:left', (data: MemberEvent) => {
    if (data.serverId === activeServerId) {
      const scope = data.channelId ? 'channel' : 'server'
      setSystemEvents((prev) => [
        ...prev,
        {
          id: `leave-${data.userId}-${Date.now()}`,
          type: 'left',
          scope,
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
        const displayName = member?.user?.displayName || member?.user?.username || data.userId

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

  // Refetch messages on socket reconnect to catch any missed while offline
  useSocketEvent('connect', () => {
    if (activeChannelId) {
      queryClient.invalidateQueries({ queryKey: ['messages', activeChannelId] })
    }
  })

  // Listen for channel updates (archive/unarchive)
  useSocketEvent('channel:updated', (data: { id: string; isArchived?: boolean }) => {
    if (data.id === activeChannelId) {
      queryClient.invalidateQueries({ queryKey: ['channel', activeChannelId] })
    }
  })

  // Add reaction
  const addReaction = useMutation({
    mutationFn: ({ messageId, emoji }: { messageId: string; emoji: string }) =>
      fetchApi(`/api/messages/${messageId}/reactions`, {
        method: 'POST',
        body: JSON.stringify({ emoji }),
      }),
  })

  // Virtual list setup with dynamic size estimation
  const virtualizer = useVirtualizer({
    count: timeline.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) =>
      estimateItemSize(
        timeline[index] ?? {
          kind: 'message' as const,
          data: {
            content: '',
            createdAt: '',
            authorId: '',
            channelId: '',
            replyToId: null,
            isEdited: false,
            isPinned: false,
            id: '',
          } as Message,
          isGrouped: false,
        },
      ),
    overscan: 5,
  })

  const scrollToBottom = useCallback(
    (behavior: 'auto' | 'smooth' = 'smooth') => {
      if (timeline.length === 0) return
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          virtualizer.scrollToIndex(timeline.length - 1, { align: 'end', behavior })
        })
      })
    },
    [timeline.length, virtualizer],
  )

  // Single consolidated scroll-position effect — avoids conflicts from multiple useLayoutEffects
  useLayoutEffect(() => {
    const prevCount = prevMessageCountRef.current
    const currentCount = timeline.length

    if (currentCount === 0) return

    if (!initialScrollDoneRef.current) {
      // First load: scroll to bottom immediately
      initialScrollDoneRef.current = true
      prevMessageCountRef.current = currentCount
      virtualizer.scrollToIndex(currentCount - 1, { align: 'end' })
      return
    }

    if (currentCount > prevCount) {
      const addedCount = currentCount - prevCount
      const scrollEl = parentRef.current
      if (scrollEl && addedCount > 0) {
        // Check if new messages were prepended (loading older) or appended (new messages)
        // Heuristic: if we were loading older messages, the new items are at the beginning
        // For new messages at the end, auto-scroll only if user was near bottom
        if (shouldStickToBottomRef.current) {
          // User was at bottom — scroll to new bottom
          scrollToBottom('smooth')
          // Track read count
          setLastReadCount(currentCount)
        } else {
          // User was reading older messages — show indicator but don't auto-scroll
        }
      }
    }

    prevMessageCountRef.current = currentCount
  }, [timeline.length, virtualizer, scrollToBottom])

  // Reset scroll state on channel change
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional reset on channel switch
  useEffect(() => {
    initialScrollDoneRef.current = false
    prevMessageCountRef.current = 0
    shouldStickToBottomRef.current = true
    setLastReadCount(0)
  }, [activeChannelId])

  // Scroll event handler — load older messages + track stick-to-bottom
  useEffect(() => {
    const scrollEl = parentRef.current
    if (!scrollEl) return

    const handleScroll = () => {
      // Load more when near the top
      if (scrollEl.scrollTop < 200 && hasNextPage && !isFetchingNextPage) {
        void fetchNextPage()
      }
      // Update read count when near bottom
      const isNearBottom = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight < 80
      shouldStickToBottomRef.current = isNearBottom
    }

    scrollEl.addEventListener('scroll', handleScroll, { passive: true })
    return () => scrollEl.removeEventListener('scroll', handleScroll)
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  // Track read count for new message line (only set once on initial load)
  useEffect(() => {
    if (timeline.length > 0 && lastReadCount === 0) {
      setLastReadCount(timeline.length)
    }
  }, [timeline.length, lastReadCount])

  const handleReact = useCallback(
    (messageId: string, emoji: string) => {
      addReaction.mutate({ messageId, emoji })
    },
    [addReaction],
  )

  const handleToggleSelect = useCallback((messageId: string) => {
    setSelectedMessageIds((prev) => {
      const next = new Set(prev)
      if (next.has(messageId)) next.delete(messageId)
      else next.add(messageId)
      return next
    })
  }, [])

  const handleEnterSelectionMode = useCallback((messageId: string) => {
    setSelectionMode(true)
    setSelectedMessageIds(new Set([messageId]))
  }, [])

  const handleExitSelectionMode = useCallback(() => {
    setSelectionMode(false)
    setSelectedMessageIds(new Set())
  }, [])

  const handleCopySelectedAsMarkdown = useCallback(() => {
    const selectedMsgs = messages
      .filter((m) => selectedMessageIds.has(m.id))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    const md = selectedMsgs
      .map((m) => {
        const author = m.author?.displayName || m.author?.username || 'Unknown'
        const time = new Date(m.createdAt).toLocaleString()
        const attachmentLines = (m.attachments ?? []).map((a) => `  📎 [${a.filename}](${a.url})`)
        return [`**${author}** (${time})`, m.content, ...attachmentLines].filter(Boolean).join('\n')
      })
      .join('\n\n---\n\n')
    navigator.clipboard.writeText(md)
    showToast(t('chat.copiedAsMarkdown', '已复制为 Markdown'), 'success')
    handleExitSelectionMode()
  }, [messages, selectedMessageIds, t, handleExitSelectionMode])

  const handleMessageUpdate = useCallback(
    (msg: Message) => {
      queryClient.setQueryData<InfiniteData<MessagesPage>>(['messages', activeChannelId], (old) => {
        if (!old) return old
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            messages: page.messages.map((m) => (m.id === msg.id ? { ...m, ...msg } : m)),
          })),
        }
      })
    },
    [queryClient, activeChannelId],
  )

  const handleMessageDelete = useCallback(
    (msgId: string) => {
      queryClient.setQueryData<InfiniteData<MessagesPage>>(['messages', activeChannelId], (old) => {
        if (!old) return old
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            messages: page.messages.filter((m) => m.id !== msgId),
          })),
        }
      })
    },
    [queryClient, activeChannelId],
  )

  const handleAreaDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const files = e.dataTransfer.files
    if (files.length > 0) {
      setDroppedFiles(Array.from(files))
    }
  }, [])

  const handleAreaDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleAreaDragLeave = useCallback((e: React.DragEvent) => {
    // Only set false if leaving the container (not entering a child)
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false)
    }
  }, [])

  // Save chat attachment to workspace
  const handleSaveToWorkspace = useCallback(
    async (result: PickerResult) => {
      if (!saveToWorkspaceFile || !activeServerId) return
      try {
        const targetParentId = result.targetFolderId
        // Fetch the attachment and re-upload it to the workspace
        const resp = await fetch(saveToWorkspaceFile.url)
        const blob = await resp.blob()
        const file = new globalThis.File([blob], saveToWorkspaceFile.filename, {
          type: saveToWorkspaceFile.contentType,
        })
        const formData = new FormData()
        formData.append('file', file)
        if (targetParentId) formData.append('parentId', targetParentId)
        await fetchApi(`/api/servers/${activeServerId}/workspace/upload`, {
          method: 'POST',
          body: formData,
        })
        showToast(t('chat.savedToWorkspace'), 'success')
        setSaveToWorkspaceFile(null)
      } catch (_err) {
        showToast(t('chat.saveToWorkspaceFailed'), 'error')
      }
    },
    [saveToWorkspaceFile, activeServerId],
  )

  if (!activeChannelId) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted bg-bg-primary/70 backdrop-blur-xl">
        <Loader2 size={16} className="animate-spin text-primary opacity-60" />
      </div>
    )
  }

  const virtualItems = virtualizer.getVirtualItems()

  return (
    <div className="flex-1 flex min-w-0 h-full">
      <div
        className="flex-1 flex flex-col glass-panel chat-panel overflow-hidden min-w-0 h-full relative"
        onDrop={handleAreaDrop}
        onDragOver={handleAreaDragOver}
        onDragLeave={handleAreaDragLeave}
      >
        {/* Drag overlay */}
        {isDragOver && (
          <div className="absolute inset-0 z-40 bg-primary/10 border-2 border-dashed border-primary rounded-lg flex items-center justify-center pointer-events-none">
            <div className="bg-bg-secondary px-6 py-4 rounded-xl shadow-lg text-text-primary font-black text-lg">
              {t('chat.dropFilesHere', 'Drop files here to upload')}
            </div>
          </div>
        )}
        {/* Channel header */}
        <div className="desktop-drag-titlebar app-header px-6 flex items-center gap-3">
          {/* Mobile back button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileView('channels')}
            className="md:hidden shrink-0 -ml-1 mr-1 h-8 w-8 rounded-full"
          >
            <ArrowLeft size={20} />
          </Button>
          <div className="w-8 h-8 rounded-full bg-bg-tertiary/50 flex items-center justify-center text-primary shrink-0 shadow-inner">
            <Hash size={16} strokeWidth={2.5} />
          </div>
          <h3 className="font-black text-text-primary text-[15px] truncate uppercase tracking-tight">
            {channel?.name ?? '...'}
          </h3>
          {channel?.topic && (
            <>
              <div className="w-[1px] h-6 bg-bg-modifier-hover mx-2 hidden sm:block shrink-0" />
              <p className="text-sm text-text-secondary truncate hidden sm:block font-bold opacity-60">
                {channel.topic}
              </p>
            </>
          )}
          {/* Right side: members toggle + notification bell */}
          <div className="flex items-center gap-2 ml-auto shrink-0">
            <NotificationBell />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => useUIStore.getState().toggleMobileMemberList()}
              className="lg:hidden h-8 w-8 rounded-full"
              title={t('member.toggleList')}
            >
              <Users size={20} />
            </Button>
          </div>
        </div>

        {/* Messages — virtual list */}
        <div
          ref={parentRef}
          className="chat-scroll-surface flex-1 overflow-y-auto overflow-x-hidden"
        >
          {isLoadingMessages ? (
            <div className="flex items-center justify-center h-full text-text-muted">
              <span className="animate-pulse">{t('chat.loading', 'Loading...')}</span>
            </div>
          ) : messages.length === 0 && systemEvents.length === 0 ? (
            <EmptyChannelState
              channelName={channel?.name}
              serverId={activeServerId}
              channelId={activeChannelId}
              isArchived={channel?.isArchived}
              onUnarchive={async () => {
                const ok = await useConfirmStore.getState().confirm({
                  title: t('channel.unarchiveChannel'),
                  message: t('channel.unarchiveChannelConfirm'),
                })
                if (ok) {
                  await fetchApi(`/api/channels/${activeChannelId}/unarchive`, { method: 'POST' })
                  queryClient.invalidateQueries({ queryKey: ['channel', activeChannelId] })
                  queryClient.invalidateQueries({ queryKey: ['channels'] })
                }
              }}
            />
          ) : (
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {/* Loading older messages indicator */}
              {isFetchingNextPage && (
                <div className="absolute top-0 left-0 right-0 flex justify-center py-2 z-10">
                  <span className="text-xs text-text-muted animate-pulse">
                    {t('chat.loadingOlder', 'Loading older messages...')}
                  </span>
                </div>
              )}

              {virtualItems.map((virtualItem) => {
                const item = timeline[virtualItem.index]!

                return (
                  <div
                    key={item.kind === 'message' ? item.data.id : item.data.id}
                    data-index={virtualItem.index}
                    ref={virtualizer.measureElement}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                  >
                    {lastReadCount > 0 && virtualItem.index === lastReadCount && (
                      <div className="flex items-center gap-2 px-4 my-2">
                        <div className="flex-1 h-px bg-danger/60" />
                        <span className="text-xs text-danger font-black px-2">
                          {t('chat.newMessages')}
                        </span>
                        <div className="flex-1 h-px bg-danger/60" />
                      </div>
                    )}
                    {item.kind === 'system' ? (
                      <div className="flex items-center justify-center gap-2 px-4 py-1.5">
                        <Badge
                          variant="neutral"
                          size="md"
                          className="bg-bg-tertiary/50 backdrop-blur-sm rounded-full border-border-subtle gap-1.5 font-normal"
                        >
                          {item.data.type === 'joined' ? (
                            <LogIn size={14} className="text-success" />
                          ) : (
                            <LogOut size={14} className="text-danger" />
                          )}
                          <span>
                            {item.data.isBot ? 'Buddy · ' : ''}
                            <span className="font-medium text-text-secondary">
                              {item.data.displayName}
                            </span>{' '}
                            {item.data.type === 'joined'
                              ? item.data.scope === 'channel'
                                ? t('member.joinedChannel')
                                : t('member.joinedServer')
                              : item.data.scope === 'channel'
                                ? t('member.leftChannel')
                                : t('member.leftServer')}
                          </span>
                        </Badge>
                      </div>
                    ) : (
                      <MessageBubble
                        message={item.data}
                        currentUserId={user?.id ?? ''}
                        isGrouped={item.isGrouped}
                        onReply={(id) => setReplyToId(id)}
                        onReact={handleReact}
                        onMessageUpdate={handleMessageUpdate}
                        onMessageDelete={handleMessageDelete}
                        onPreviewFile={(att) => setPreviewFile(att)}
                        onSaveToWorkspace={
                          activeServerId ? (att) => setSaveToWorkspaceFile(att) : undefined
                        }
                        highlight={highlightMsgId === item.data.id}
                        replyToMessage={
                          item.data.replyToId ? (messageMap.get(item.data.replyToId) ?? null) : null
                        }
                        selectionMode={selectionMode}
                        isSelected={selectedMessageIds.has(item.data.id)}
                        onToggleSelect={handleToggleSelect}
                        onEnterSelectionMode={handleEnterSelectionMode}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Typing indicator */}
        {typingUsers.length > 0 && (
          <div className="px-4 py-1 text-xs text-primary">
            <span className="inline-flex gap-0.5 mr-1">
              <span
                className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce"
                style={{ animationDelay: '0ms' }}
              />
              <span
                className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce"
                style={{ animationDelay: '150ms' }}
              />
              <span
                className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce"
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
                return `Buddy ${u.username} ${activityLabel}`
              })
              .join('、')}
          </div>
        )}

        {/* Message input or selection toolbar */}
        {selectionMode ? (
          <div className="px-6 py-3 bg-bg-secondary/50 backdrop-blur-md border-t border-border-subtle flex items-center gap-3">
            <span className="text-sm text-text-secondary font-medium">
              {t('chat.selectedCount', {
                count: selectedMessageIds.size,
                defaultValue: `已选择 ${selectedMessageIds.size} 条消息`,
              })}
            </span>
            <div className="flex-1" />
            <Button
              variant="primary"
              size="sm"
              onClick={handleCopySelectedAsMarkdown}
              disabled={selectedMessageIds.size === 0}
              icon={ClipboardCopy}
            >
              {t('chat.copyAsMarkdown', '复制为 Markdown')}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleExitSelectionMode} icon={X}>
              {t('common.cancel')}
            </Button>
          </div>
        ) : channel?.isArchived && messages.length > 0 ? (
          <div className="flex items-center justify-center gap-3 px-4 py-3 bg-bg-deep border-t border-border-subtle">
            <div className="flex items-center gap-2 text-text-muted">
              <Archive size={18} />
              <span>{t('channel.archivedNotice')}</span>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={async () => {
                const ok = await useConfirmStore.getState().confirm({
                  title: t('channel.unarchiveChannel'),
                  message: t('channel.unarchiveChannelConfirm'),
                })
                if (ok) {
                  await fetchApi(`/api/channels/${activeChannelId}/unarchive`, { method: 'POST' })
                  queryClient.invalidateQueries({ queryKey: ['channel', activeChannelId] })
                  queryClient.invalidateQueries({ queryKey: ['channels'] })
                }
              }}
            >
              {t('channel.unarchive')}
            </Button>
          </div>
        ) : (
          <MessageInput
            channelId={activeChannelId}
            channelName={channel?.name}
            replyToId={replyToId}
            onClearReply={() => setReplyToId(null)}
            externalFiles={droppedFiles}
            onExternalFilesConsumed={() => setDroppedFiles([])}
          />
        )}
      </div>

      {/* File preview panel */}
      {previewFile && (
        <FilePreviewPanel attachment={previewFile} onClose={() => setPreviewFile(null)} />
      )}

      {/* Save attachment to workspace picker */}
      {saveToWorkspaceFile && activeServerId && (
        <WorkspaceFilePicker
          serverId={activeServerId}
          mode="save-to-folder"
          title={`保存 "${saveToWorkspaceFile.filename}" 到工作区`}
          onConfirm={handleSaveToWorkspace}
          onClose={() => setSaveToWorkspaceFile(null)}
        />
      )}
    </div>
  )
}

// Empty channel state with invite buttons
function EmptyChannelState({
  channelName,
  serverId,
  channelId,
  isArchived,
  onUnarchive,
}: {
  channelName?: string
  serverId: string | null
  channelId: string | null
  isArchived?: boolean
  onUnarchive?: () => void
}) {
  const { t } = useTranslation()
  const [showInvitePanel, setShowInvitePanel] = useState(false)
  const [inviteInitialTab, setInviteInitialTab] = useState<'members' | 'buddies'>('members')

  return (
    <>
      <div className="flex flex-col items-center justify-center h-full text-text-muted px-4 mb-16">
        <Hash size={48} className="mb-4 opacity-30" />
        <p className="text-lg font-bold text-primary mb-2">
          {t('chat.welcomeChannel', {
            channelName: channelName ?? t('chat.channelFallback'),
          })}
        </p>
        <p className="text-sm text-text-muted mb-6">{t('chat.welcomeStart')}</p>
        {isArchived ? (
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-2 text-text-muted">
              <Archive size={20} />
              <span>{t('channel.archivedNotice')}</span>
            </div>
            {onUnarchive && (
              <Button variant="primary" size="sm" className="rounded-full" onClick={onUnarchive}>
                {t('channel.unarchive')}
              </Button>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center">
            <Button
              variant="secondary"
              size="sm"
              className="rounded-full bouncy border px-8 py-[14px] text-[13px] font-black uppercase tracking-[0.05em]"
              style={{
                background: 'linear-gradient(135deg, #F8E71C, #ffb300)',
                border: '1px solid rgba(255,255,255,0.5)',
                boxShadow:
                  '0 10px 25px rgba(248, 231, 28, 0.35), inset 0 2px 4px rgba(255, 255, 255, 0.7)',
                color: '#050508',
                backdropFilter: 'blur(12px)',
              }}
              onClick={() => {
                setInviteInitialTab('buddies')
                setShowInvitePanel(true)
              }}
              icon={PawPrint}
            >
              <span className="uppercase">{t('channel.addAgent')}</span>
            </Button>
          </div>
        )}
      </div>

      {showInvitePanel && serverId && (
        <InvitePanel
          serverId={serverId}
          channelId={channelId}
          channelName={channelName}
          initialTab={inviteInitialTab}
          onClose={() => setShowInvitePanel(false)}
        />
      )}
    </>
  )
}
