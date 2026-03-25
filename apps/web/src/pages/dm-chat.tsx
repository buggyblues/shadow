import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from '@tanstack/react-router'
import { ArrowLeft, Loader2, Paperclip, Reply, Send, Smile, X } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
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

  const allMessages = (messagesData?.pages.flat() ?? []).slice().reverse()

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
    // Auto-scroll to bottom
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
    })
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

  // Scroll to bottom on initial load
  useEffect(() => {
    if (!isLoading && allMessages.length > 0) {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
      })
    }
  }, [isLoading, allMessages.length])

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

  // Load more on scroll to top
  const handleScroll = useCallback(() => {
    if (
      scrollRef.current &&
      scrollRef.current.scrollTop < 200 &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      fetchNextPage()
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage])

  const statusColor: Record<string, string> = {
    online: 'bg-[#23a559]',
    idle: 'bg-amber-500',
    dnd: 'bg-danger',
    offline: 'bg-text-muted',
  }

  return (
    <div className="flex-1 flex flex-col bg-bg-primary min-h-0">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border-subtle bg-bg-primary shrink-0 shadow-sm">
        <button
          onClick={() => onBack?.()}
          className="md:hidden w-8 h-8 rounded-full hover:bg-bg-modifier-hover flex items-center justify-center text-text-secondary"
        >
          <ArrowLeft size={18} />
        </button>
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
          <h3 className="font-semibold text-text-primary text-sm truncate">
            {otherUser?.displayName ?? otherUser?.username ?? t('friends.chat', '聊天')}
          </h3>
          {otherUser?.isBot && (
            <span className="text-[10px] font-bold text-primary bg-primary/10 rounded px-1 py-0.5">
              Buddy
            </span>
          )}
        </div>
      </div>

      {/* Messages Area */}
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 py-4">
        {isFetchingNextPage && (
          <div className="flex justify-center py-3">
            <Loader2 size={20} className="animate-spin text-text-muted" />
          </div>
        )}

        {/* DM Welcome  */}
        {!hasNextPage && otherUser && (
          <div className="mb-8 pt-8">
            <UserAvatar
              userId={otherUser.id}
              avatarUrl={otherUser.avatarUrl}
              displayName={otherUser.displayName ?? otherUser.username}
              size="xl"
            />
            <h2 className="text-xl font-bold text-text-primary mt-3">
              {otherUser.displayName ?? otherUser.username}
            </h2>
            <p className="text-text-muted text-sm mt-1">{otherUser.username}</p>
            <p className="text-text-secondary text-sm mt-2">
              {t(
                'dm.welcomeMessage',
                `这是你与 ${otherUser.displayName ?? otherUser.username} 的聊天记录的开始。`,
              )}
            </p>
            <div className="w-full h-px bg-border-subtle mt-6" />
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 size={32} className="animate-spin text-text-muted" />
          </div>
        ) : allMessages.length === 0 ? (
          <div className="text-center py-8 text-text-muted text-sm">
            {t('dm.noMessages', '还没有消息，发送第一条消息开始聊天吧！')}
          </div>
        ) : (
          <div className="space-y-0.5">
            {allMessages.map((raw, idx) => {
              const msg = toMessage(raw)

              return (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  currentUserId={user?.id ?? ''}
                  variant="dm"
                  onReply={(id) => {
                    setReplyToId(id)
                    inputRef.current?.focus()
                  }}
                  onReact={(messageId, emoji) => {
                    addDmReaction({ dmChannelId, dmMessageId: messageId, emoji })
                  }}
                  onMessageUpdate={(updated) => {
                    // Convert back to DmMessageRaw for cache
                    const rawUpdated: DmMessageRaw = {
                      ...raw,
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
                  replyToMessage={
                    msg.replyToId
                      ? (allMessages.map(toMessage).find((m) => m.id === msg.replyToId) ?? null)
                      : null
                  }
                />
              )
            })}
          </div>
        )}
      </div>

      {/* Typing indicator */}
      {typingUsers.length > 0 && (
        <div className="px-4 py-1 text-[12px] text-text-muted">
          <span className="font-medium">{typingUsers.join(', ')}</span>{' '}
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
            <div className="mx-4 mb-1 flex items-center justify-between gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
              <span>
                {t(
                  'dm.rentalCostTip',
                  '🦐 今日费用提醒：基础日费 {{baseDailyRate}}🦐 + 消息费 {{messageFee}}🦐/条，累计花费 {{totalCost}}🦐，已发送 {{messageCount}} 条消息',
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
                className="shrink-0 text-amber-600 hover:text-amber-800 font-bold"
              >
                ×
              </button>
            </div>
          )
        })()}

      {/* Message input */}
      <div className="px-4 pb-4 pt-1 shrink-0">
        {chatDisabled ? (
          <div className="flex items-center justify-center gap-2 px-4 py-3 bg-bg-secondary rounded-lg border border-border-subtle text-text-muted text-sm">
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
                const replyMsg = allMessages.find((m) => m.id === replyToId)
                return (
                  <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-bg-secondary border border-border-subtle rounded-lg text-xs">
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
                    className="relative group bg-bg-secondary border border-border-subtle rounded-lg p-2 flex items-center gap-2 text-xs text-text-secondary"
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
                    <button
                      onClick={() => setPendingFiles((prev) => prev.filter((_, j) => j !== i))}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-danger text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                    >
                      <X size={12} />
                    </button>
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
            <div className="flex items-end gap-2 bg-bg-secondary rounded-lg border border-border-subtle">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-8 h-8 ml-2 mb-2 rounded hover:bg-bg-modifier-hover flex items-center justify-center text-text-muted hover:text-text-primary transition shrink-0"
              >
                <Paperclip size={18} />
              </button>
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
                  <button
                    onClick={() => setShowEmoji(!showEmoji)}
                    className="w-8 h-8 rounded hover:bg-bg-modifier-hover flex items-center justify-center text-text-muted hover:text-text-primary transition"
                  >
                    <Smile size={18} />
                  </button>
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
                <button
                  onClick={handleSend}
                  disabled={!messageText.trim() && pendingFiles.length === 0}
                  className="w-8 h-8 rounded hover:bg-primary/10 flex items-center justify-center text-primary disabled:text-text-muted disabled:hover:bg-transparent transition"
                >
                  <Send size={18} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/** Standalone DM chat page (used by router) */
export function DmChatPage() {
  const { dmChannelId } = useParams({ strict: false }) as { dmChannelId: string }
  const navigate = useNavigate()
  return <DmChatView dmChannelId={dmChannelId} onBack={() => navigate({ to: '/settings' })} />
}
