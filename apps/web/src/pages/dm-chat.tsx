import { Button, cn, GlassPanel, InputValley } from '@shadowob/ui'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowLeft, Loader2, Paperclip, Reply, Send, Smile, X } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type Message, MessageBubble, type ReactionGroup } from '../components/chat/message-bubble'
import { UserAvatar } from '../components/common/avatar'
import { EmojiPicker } from '../components/common/emoji-picker'
import { useSocketEvent } from '../hooks/use-socket'
import { fetchApi } from '../lib/api'
import { addDmReaction, joinDm, leaveDm, sendDmMessage, sendDmTyping } from '../lib/socket'
import { playReceiveSound, playSendSound } from '../lib/sounds'
import { useAuthStore } from '../stores/auth.store'

interface DmMessageRaw {
  id: string
  content: string
  dmChannelId: string
  authorId: string
  replyToId: string | null
  isEdited: boolean
  createdAt: string
  updatedAt?: string
  author?: {
    id: string
    username: string
    displayName: string
    avatarUrl: string | null
    isBot: boolean
  }
  attachments?: {
    id: string
    dmMessageId: string
    filename: string
    url: string
    contentType: string
    size: number
    width: number | null
    height: number | null
  }[]
  reactions?: ReactionGroup[]
}

/** Convert a DM message to the unified Message shape used by MessageBubble */
function toMessage(m: DmMessageRaw): Message {
  return {
    ...m,
    dmChannelId: m.dmChannelId,
    replyToId: m.replyToId,
    isEdited: m.isEdited,
    attachments: m.attachments?.map((a) => ({
      id: a.id,
      filename: a.filename,
      url: a.url,
      contentType: a.contentType,
      size: a.size,
    })),
    reactions: m.reactions,
  }
}

interface DmChannelInfo {
  id: string
  userAId: string
  userBId: string
  lastMessageAt: string | null
  createdAt: string
  otherUser?: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
    status: string
    isBot: boolean
  }
}

/** Reusable DM chat view — can be embedded inline or used as standalone page */
export function DmChatView({ dmChannelId, onBack }: { dmChannelId: string; onBack?: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [messageText, setMessageText] = useState('')
  const [typingUsers, setTypingUsers] = useState<string[]>([])
  const [showEmoji, setShowEmoji] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [replyToId, setReplyToId] = useState<string | null>(null)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const lastTypingSent = useRef(0)
  const initialScrollDoneRef = useRef(false)

  // Fetch DM channel info (includes otherUser)
  const { data: dmChannels = [] } = useQuery({
    queryKey: ['dm-channels'],
    queryFn: () => fetchApi<DmChannelInfo[]>('/api/dm/channels'),
  })

  const dmChannel = dmChannels.find((c) => c.id === dmChannelId)
  const otherUser = dmChannel?.otherUser

  // Check if chat is disabled for this bot agent (listed or rented out)
  const { data: agentChatStatus } = useQuery({
    queryKey: ['agent-chat-status', otherUser?.id],
    queryFn: () =>
      fetchApi<{
        chatDisabled: boolean
        reason?: string
        rental?: {
          contractId: string
          baseDailyRate: number
          messageFee: number
          totalCost: number
          messageCount: number
          pricingVersion: number
        }
      }>(`/api/marketplace/agent-chat-status/${otherUser!.id}`),
    enabled: !!otherUser?.isBot && !!otherUser?.id,
  })
  const chatDisabled = agentChatStatus?.chatDisabled === true
  const rental = agentChatStatus?.rental

  // Fetch messages
  const {
    data: messagesData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ['dm-messages', dmChannelId],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      fetchApi<DmMessageRaw[]>(
        `/api/dm/channels/${dmChannelId}/messages?limit=50${pageParam ? `&cursor=${pageParam}` : ''}`,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => {
      if (lastPage.length < 50) return undefined
      return lastPage[lastPage.length - 1]?.createdAt
    },
  })

  // Messages in chronological order (oldest to newest)
  const allMessages = useMemo(() => {
    if (!messagesData) return []
    return [...messagesData.pages].reverse().flatMap((p) => p)
  }, [messagesData])

  // Convert to Message objects for MessageBubble
  const messageList = useMemo(() => allMessages.map(toMessage), [allMessages])

  // O(1) lookup map for replyToMessage
  const messageMap = useMemo(() => {
    const map = new Map<string, Message>()
    for (const m of messageList) map.set(m.id, m)
    return map
  }, [messageList])

  // Pre-compute grouping info
  const timelineItems = useMemo(() => {
    return messageList.map((msg, idx) => {
      const prev = idx > 0 ? messageList[idx - 1] : undefined
      const isGrouped =
        prev !== undefined &&
        prev.authorId === msg.authorId &&
        !msg.replyToId &&
        Math.abs(new Date(msg.createdAt).getTime() - new Date(prev.createdAt).getTime()) < 60_000
      return { message: msg, isGrouped }
    })
  }, [messageList])

  // Virtual list setup
  const virtualizer = useVirtualizer({
    count: timelineItems.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => {
      const item = timelineItems[index]
      if (!item) return 80
      const msg = item.message
      let base = 60
      if (msg.replyToId) base += 36
      if (msg.attachments && msg.attachments.length > 0) {
        base += msg.attachments.length * 120
      }
      const lineCount = (msg.content.match(/\n/g) || []).length
      if (lineCount > 3) base += (lineCount - 3) * 20
      return Math.min(base, 400)
    },
    overscan: 5,
  })

  // Join/leave DM socket room
  useLayoutEffect(() => {
    joinDm(dmChannelId)
    return () => {
      leaveDm(dmChannelId)
    }
  }, [dmChannelId])

  type DmPages = { pages: DmMessageRaw[][]; pageParams: (string | undefined)[] }

  // Helper to update a message in the query cache
  const updateMessageInCache = useCallback(
    (updated: DmMessageRaw) => {
      queryClient.setQueryData(['dm-messages', dmChannelId], (old: DmPages | undefined) => {
        if (!old) return old
        return {
          ...old,
          pages: old.pages.map((page) => page.map((m) => (m.id === updated.id ? updated : m))),
        }
      })
    },
    [queryClient, dmChannelId],
  )

  // Helper to remove a message from the query cache
  const removeMessageFromCache = useCallback(
    (id: string) => {
      queryClient.setQueryData(['dm-messages', dmChannelId], (old: DmPages | undefined) => {
        if (!old) return old
        return {
          ...old,
          pages: old.pages.map((page) => page.filter((m) => m.id !== id)),
        }
      })
    },
    [queryClient, dmChannelId],
  )

  // Listen for new DM messages
  useSocketEvent<DmMessageRaw>('dm:message', (msg) => {
    if (msg.dmChannelId !== dmChannelId) return
    queryClient.setQueryData(['dm-messages', dmChannelId], (old: DmPages | undefined) => {
      if (!old) return old
      const newPages = [...old.pages]
      newPages[0] = [msg, ...(newPages[0] ?? [])]
      return { ...old, pages: newPages }
    })
    // Play sound if not from self
    if (msg.authorId !== user?.id) {
      playReceiveSound()
    }
  })

  // Listen for DM message updates (edit)
  useSocketEvent<DmMessageRaw>('dm:message:updated', (msg) => {
    if (msg.dmChannelId !== dmChannelId) return
    updateMessageInCache(msg)
  })

  // Listen for DM message deletions
  useSocketEvent<{ id: string; dmChannelId: string }>('dm:message:deleted', (data) => {
    if (data.dmChannelId !== dmChannelId) return
    removeMessageFromCache(data.id)
  })

  // Listen for DM reaction updates
  useSocketEvent<{ dmMessageId: string; reactions: ReactionGroup[] }>(
    'dm:reaction:updated',
    (data) => {
      queryClient.setQueryData(['dm-messages', dmChannelId], (old: DmPages | undefined) => {
        if (!old) return old
        return {
          ...old,
          pages: old.pages.map((page) =>
            page.map((m) => (m.id === data.dmMessageId ? { ...m, reactions: data.reactions } : m)),
          ),
        }
      })
    },
  )

  // Typing indicator
  useSocketEvent<{ dmChannelId: string; userId: string; username: string }>('dm:typing', (data) => {
    if (data.dmChannelId !== dmChannelId || data.userId === user?.id) return
    setTypingUsers((prev) => (prev.includes(data.username) ? prev : [...prev, data.username]))
    // Clear after 3s
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => setTypingUsers([]), 3000)
  })

  // Scroll to bottom on initial load using virtualizer
  useLayoutEffect(() => {
    if (timelineItems.length > 0 && !initialScrollDoneRef.current && !isLoading) {
      initialScrollDoneRef.current = true
      virtualizer.scrollToIndex(timelineItems.length - 1, { align: 'end' })
    }
  }, [timelineItems.length, virtualizer, isLoading])

  // Reset scroll flag on channel change
  useEffect(() => {
    initialScrollDoneRef.current = false
  }, [dmChannelId])

  // Load more on scroll to top
  useEffect(() => {
    const scrollEl = scrollRef.current
    if (!scrollEl) return
    const handleScroll = () => {
      if (scrollEl.scrollTop < 200 && hasNextPage && !isFetchingNextPage) {
        fetchNextPage()
      }
    }
    scrollEl.addEventListener('scroll', handleScroll, { passive: true })
    return () => scrollEl.removeEventListener('scroll', handleScroll)
  }, [fetchNextPage, hasNextPage, isFetchingNextPage])

  // Send message (with optional attachments)
  const handleSend = useCallback(async () => {
    const content = messageText.trim()
    if (!content && pendingFiles.length === 0) return

    try {
      if (pendingFiles.length > 0) {
        // Upload files first, then send via REST with attachments
        const uploadedAttachments: {
          filename: string
          url: string
          contentType: string
          size: number
        }[] = []
        for (const f of pendingFiles) {
          const formData = new FormData()
          formData.append('file', f)
          const result = await fetchApi<{ url: string; size: number }>('/api/media/upload', {
            method: 'POST',
            body: formData,
          })
          uploadedAttachments.push({
            filename: f.name,
            url: result.url,
            contentType: f.type || 'application/octet-stream',
            size: result.size,
          })
        }
        const contentToSend = content || '\u200B'
        await fetchApi(`/api/dm/channels/${dmChannelId}/messages`, {
          method: 'POST',
          body: JSON.stringify({
            content: contentToSend,
            attachments: uploadedAttachments,
            replyToId: replyToId ?? undefined,
          }),
        })
        playSendSound()
      } else {
        sendDmMessage({ dmChannelId, content, replyToId: replyToId ?? undefined })
        playSendSound()
      }
    } catch (err) {
      console.error('Failed to send DM:', err)
    }

    setMessageText('')
    setReplyToId(null)
    setPendingFiles([])
    inputRef.current?.focus()
  }, [messageText, pendingFiles, dmChannelId, replyToId])

  // Handle typing events
  const handleTyping = useCallback(() => {
    const now = Date.now()
    if (now - lastTypingSent.current > 2000) {
      sendDmTyping(dmChannelId)
      lastTypingSent.current = now
    }
  }, [dmChannelId])

  const statusColor: Record<string, string> = {
    online: 'bg-success',
    idle: 'bg-warning',
    dnd: 'bg-danger',
    offline: 'bg-text-muted',
  }

  const virtualItems = virtualizer.getVirtualItems()

  return (
    <GlassPanel className="chat-panel flex flex-1 min-h-0 flex-col overflow-hidden">
      {/* Header */}
      <div className="app-header flex items-center gap-3 px-4 md:px-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onBack?.()}
          className="md:hidden h-8 w-8"
        >
          <ArrowLeft size={18} />
        </Button>
        <span className="text-text-muted text-lg font-medium">@</span>
        <div className="relative">
          <UserAvatar
            userId={otherUser?.id ?? ''}
            avatarUrl={otherUser?.avatarUrl ?? null}
            displayName={otherUser?.displayName ?? otherUser?.username ?? '?'}
            size="sm"
          />
          <span
            className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-bg-primary ${statusColor[otherUser?.status ?? 'offline'] ?? statusColor.offline}`}
          />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-black text-text-primary text-sm truncate">
            {otherUser?.displayName ?? otherUser?.username ?? t('friends.chat', '聊天')}
          </h3>
          {otherUser?.isBot && (
            <span className="text-[11px] font-black text-primary bg-primary/10 rounded-full px-1.5 py-0.5">
              Buddy
            </span>
          )}
        </div>
      </div>

      {/* Messages Area — virtual list */}
      <div ref={scrollRef} className="chat-scroll-surface flex-1 overflow-y-auto px-4 py-4">
        {isFetchingNextPage && (
          <div className="flex justify-center py-3">
            <Loader2 size={20} className="animate-spin text-primary" />
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 size={32} className="animate-spin text-primary" />
          </div>
        ) : allMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-text-muted">
            <div className="w-12 h-12 rounded-2xl bg-bg-tertiary/60 flex items-center justify-center mb-3">
              <Send size={20} className="text-text-muted/60" />
            </div>
            <p className="text-sm">
              {t('dm.noMessages', '还没有消息，发送第一条消息开始聊天吧！')}
            </p>
          </div>
        ) : (
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualItems.map((virtualItem) => {
              const { message: msg, isGrouped } = timelineItems[virtualItem.index]!

              return (
                <div
                  key={msg.id}
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
                  <MessageBubble
                    message={msg}
                    currentUserId={user?.id ?? ''}
                    variant="dm"
                    isGrouped={isGrouped}
                    onReply={(id) => {
                      setReplyToId(id)
                      inputRef.current?.focus()
                    }}
                    onReact={(messageId, emoji) => {
                      addDmReaction({ dmChannelId, dmMessageId: messageId, emoji })
                    }}
                    onMessageUpdate={(updated) => {
                      const rawUpdated: DmMessageRaw = {
                        ...allMessages.find((m) => m.id === msg.id)!,
                        content: updated.content,
                        isEdited: updated.isEdited,
                        updatedAt: updated.updatedAt,
                      }
                      updateMessageInCache(rawUpdated)
                    }}
                    onMessageDelete={(id) => removeMessageFromCache(id)}
                    editApi={async (messageId, content) => {
                      const res = await fetchApi<DmMessageRaw>(
                        `/api/dm/channels/${dmChannelId}/messages/${messageId}`,
                        { method: 'PATCH', body: JSON.stringify({ content }) },
                      )
                      return toMessage(res)
                    }}
                    deleteApi={async (messageId) => {
                      await fetchApi(`/api/dm/channels/${dmChannelId}/messages/${messageId}`, {
                        method: 'DELETE',
                      })
                    }}
                    replyToMessage={msg.replyToId ? (messageMap.get(msg.replyToId) ?? null) : null}
                  />
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Typing indicator */}
      {typingUsers.length > 0 && (
        <div className="px-4 py-1 text-[12px] text-text-muted">
          <span className="font-medium text-primary">{typingUsers.join(', ')}</span>{' '}
          {t('chat.typing', '正在输入...')}
        </div>
      )}

      {/* Daily rental cost tip */}
      {rental &&
        rental.pricingVersion === 2 &&
        (() => {
          const tipKey = `rental-tip-${rental.contractId}-${new Date().toISOString().slice(0, 10)}`
          const dismissed = localStorage.getItem(tipKey) === '1'
          if (dismissed) return null
          return (
            <div className="mx-4 mb-1 flex items-center justify-between gap-2 px-3 py-2 bg-warning/5 border border-warning/40 rounded-lg text-xs text-warning">
              <span>
                {t(
                  'dm.rentalCostTip',
                  '🦐 今日费用警：基础日费 {{baseDailyRate}}🦐 + 消息费 {{messageFee}}🦐/条，累计花费 {{totalCost}}🦐，已发送 {{messageCount}} 条消息',
                  {
                    baseDailyRate: rental.baseDailyRate,
                    messageFee: rental.messageFee,
                    totalCost: rental.totalCost,
                    messageCount: rental.messageCount,
                  },
                )}
              </span>
              <button
                type="button"
                onClick={() => {
                  localStorage.setItem(tipKey, '1')
                  queryClient.invalidateQueries({ queryKey: ['agent-chat-status', otherUser?.id] })
                }}
                className="shrink-0 text-warning hover:text-warning/80 font-bold"
              >
                ×
              </button>
            </div>
          )
        })()}

      {/* Message input */}
      <div className="px-4 pb-4 pt-1 shrink-0">
        {chatDisabled ? (
          <div className="flex items-center justify-center gap-2 px-4 py-3 bg-bg-tertiary/50 backdrop-blur-md rounded-xl border border-border-subtle text-text-muted text-sm">
            <span>
              {agentChatStatus?.reason === 'rented_out'
                ? t('dm.chatDisabledRentedOut', '该 Buddy 已出租给其他用户，暂时无法聊天')
                : agentChatStatus?.reason === 'expired'
                  ? t('dm.chatDisabledExpired', '使用权已到期，请续租后再使用')
                  : t('dm.chatDisabledListed', '该 Buddy 已在集市挂单中，暂时无法聊天')}
            </span>
          </div>
        ) : (
          <>
            {/* Reply preview */}
            {replyToId &&
              (() => {
                const replyMsg = messageMap.get(replyToId)
                return (
                  <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-primary/5 border-l-2 border-primary rounded-lg text-xs">
                    <Reply size={14} className="text-primary shrink-0" />
                    <span className="text-text-muted">{t('chat.replyingTo', '回复')}</span>
                    <span className="font-medium text-text-primary truncate">
                      {replyMsg?.author?.displayName ??
                        replyMsg?.author?.username ??
                        t('common.unknownUser')}
                    </span>
                    <span className="text-text-muted truncate max-w-[200px]">
                      {replyMsg?.content}
                    </span>
                    <button
                      type="button"
                      onClick={() => setReplyToId(null)}
                      className="ml-auto p-0.5 text-text-muted hover:text-text-primary transition shrink-0"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )
              })()}
            {/* Pending file previews */}
            {pendingFiles.length > 0 && (
              <div className="flex gap-2 mb-2 flex-wrap">
                {pendingFiles.map((file, i) => (
                  <div
                    key={i}
                    className="relative group bg-bg-secondary/80 rounded-2xl p-2 flex items-center gap-2 text-xs text-text-secondary"
                  >
                    {file.type.startsWith('image/') ? (
                      <img
                        src={URL.createObjectURL(file)}
                        alt={file.name}
                        className="w-12 h-12 object-cover rounded"
                      />
                    ) : (
                      <div className="w-12 h-12 bg-bg-modifier-hover rounded flex items-center justify-center text-text-muted">
                        <Paperclip size={16} />
                      </div>
                    )}
                    <span className="max-w-[120px] truncate">{file.name}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setPendingFiles((prev) => prev.filter((_, j) => j !== i))}
                      className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-danger text-white opacity-0 group-hover:opacity-100"
                    >
                      <X size={12} />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) {
                  setPendingFiles((prev) => [...prev, ...Array.from(e.target.files!)])
                  e.target.value = ''
                }
              }}
            />
            <InputValley className="flex items-end gap-2 rounded-[26px] bg-bg-primary/65">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => fileInputRef.current?.click()}
                className="h-8 w-8 ml-2 mb-2"
              >
                <Paperclip size={18} />
              </Button>
              <textarea
                ref={inputRef}
                value={messageText}
                onChange={(e) => {
                  setMessageText(e.target.value)
                  handleTyping()
                }}
                onKeyDown={(e) => {
                  if (
                    e.key === 'Enter' &&
                    !e.shiftKey &&
                    !e.nativeEvent.isComposing &&
                    e.keyCode !== 229
                  ) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                placeholder={
                  otherUser
                    ? t(
                        'dm.inputPlaceholder',
                        `给 @${otherUser.displayName ?? otherUser.username} 发送消息`,
                      )
                    : t('dm.inputPlaceholderDefault', '发送消息')
                }
                rows={1}
                className="flex-1 bg-transparent text-text-primary text-sm px-4 py-3 outline-none resize-none max-h-[160px]"
                style={{ minHeight: '44px' }}
              />
              <div className="flex items-center gap-1 px-2 pb-2">
                <div className="relative">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowEmoji(!showEmoji)}
                    className="h-8 w-8"
                  >
                    <Smile size={18} />
                  </Button>
                  {showEmoji && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowEmoji(false)} />
                      <div className="absolute bottom-10 right-0 z-50">
                        <EmojiPicker
                          onSelect={(emoji) => {
                            setMessageText((prev) => prev + emoji)
                            setShowEmoji(false)
                            inputRef.current?.focus()
                          }}
                          onClose={() => setShowEmoji(false)}
                        />
                      </div>
                    </>
                  )}
                </div>
                <Button
                  size="icon"
                  onClick={handleSend}
                  disabled={!messageText.trim() && pendingFiles.length === 0}
                  className="h-8 w-8 rounded-full bg-primary hover:bg-primary/80"
                >
                  <Send size={18} />
                </Button>
              </div>
            </InputValley>
          </>
        )}
      </div>
    </GlassPanel>
  )
}

/** Standalone DM chat page (used by router) */
export function DmChatPage() {
  const { dmChannelId } = useParams({ strict: false }) as { dmChannelId: string }
  const navigate = useNavigate()
  return <DmChatView dmChannelId={dmChannelId} onBack={() => navigate({ to: '/settings' })} />
}
