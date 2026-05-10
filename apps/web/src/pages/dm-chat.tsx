import type { CommerceProductCard } from '@shadowob/shared'
import { Button, cn, GlassPanel, InputValley } from '@shadowob/ui'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  ArrowLeft,
  FileText,
  Gift,
  HandCoins,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Plus,
  Reply,
  Search,
  Send,
  ShoppingBag,
  Smile,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CHAT_SCROLLING_RESET_DELAY,
  CHAT_VIRTUAL_OVERSCAN,
  CHAT_VIRTUALIZE_THRESHOLD,
  estimateChatMessageSize,
  getChatMessageItemKey,
  isScrollNearBottom,
  shouldAdjustChatScrollPositionOnItemSizeChange,
} from '../components/chat/chat-virtualization'
import { FilePreviewPanel } from '../components/chat/file-preview-panel'
import { type Message, MessageBubble, type ReactionGroup } from '../components/chat/message-bubble'
import { UserAvatar } from '../components/common/avatar'
import { EmojiPicker } from '../components/common/emoji-picker'
import { CommunityEconomySendModal } from '../components/community-economy/community-economy-send-modal'
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
  metadata?: Message['metadata'] | null
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
    metadata: m.metadata ?? undefined,
  }
}

interface CommerceProductPickerGroup {
  key: string
  labelKey: string
  shopName?: string | null
  cards: CommerceProductCard[]
}

interface CommerceProductPickerResponse {
  cards: CommerceProductCard[]
  groups?: CommerceProductPickerGroup[]
}

function getCommerceCardPrice(
  card: CommerceProductCard,
  t?: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (card.snapshot.currency === 'shrimp_coin') {
    const unit = t?.('common.shrimpCoin') ?? 'shrimp_coin'
    return `${card.snapshot.price.toLocaleString()} ${unit}`
  }
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: card.snapshot.currency,
    maximumFractionDigits: 2,
  }).format(card.snapshot.price / 100)
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
  const [showProductPicker, setShowProductPicker] = useState(false)
  const [economyModal, setEconomyModal] = useState<'tip' | 'gift' | null>(null)
  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const [productQuery, setProductQuery] = useState('')
  const [selectedCommerceCards, setSelectedCommerceCards] = useState<CommerceProductCard[]>([])
  const [previewFile, setPreviewFile] = useState<{
    id: string
    filename: string
    url: string
    contentType: string
    size: number
  } | null>(null)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [replyToId, setReplyToId] = useState<string | null>(null)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const lastTypingSent = useRef(0)
  const initialScrollDoneRef = useRef(false)
  const prevMessageCountRef = useRef(0)
  const shouldStickToBottomRef = useRef(true)
  const stickyScrollRafRef = useRef<number | null>(null)
  const pendingPrependRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null)

  const openFileDialog = useCallback((accept?: string) => {
    const input = fileInputRef.current
    if (!input) return
    input.accept = accept ?? ''
    input.click()
    setShowAttachMenu(false)
  }, [])

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

  const { data: productPickerData, isFetching: isFetchingProducts } = useQuery({
    queryKey: ['commerce-product-picker', 'dm', dmChannelId, productQuery],
    queryFn: () =>
      fetchApi<CommerceProductPickerResponse>(
        `/api/commerce/product-picker?target=dm&dmChannelId=${encodeURIComponent(dmChannelId)}&keyword=${encodeURIComponent(productQuery.trim())}`,
      ),
    enabled: Boolean(dmChannelId && showProductPicker),
    staleTime: 15_000,
  })

  const productCards = productPickerData?.cards ?? []
  const productPickerGroups = useMemo<CommerceProductPickerGroup[]>(() => {
    const groups = productPickerData?.groups?.filter((group) => group.cards.length > 0)
    if (groups?.length) return groups
    return productCards.length
      ? [{ key: 'all', labelKey: 'chat.productPickerGroupAll', cards: productCards }]
      : []
  }, [productPickerData?.groups, productCards])

  const addCommerceCard = useCallback((card: CommerceProductCard) => {
    setSelectedCommerceCards((prev) => {
      if (
        prev.some(
          (item) =>
            (item.offerId && item.offerId === card.offerId) ||
            (item.productId === card.productId && item.skuId === card.skuId),
        )
      ) {
        return prev
      }
      return [...prev, card].slice(0, 3)
    })
    setShowProductPicker(false)
    inputRef.current?.focus()
  }, [])

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

  const shouldVirtualize = timelineItems.length > CHAT_VIRTUALIZE_THRESHOLD

  // Virtual list setup
  const virtualizer = useVirtualizer({
    count: timelineItems.length,
    enabled: shouldVirtualize,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => {
      const item = timelineItems[index]
      return estimateChatMessageSize(item?.message ?? { id: '', content: '' }, item?.isGrouped)
    },
    getItemKey: (index) => getChatMessageItemKey(timelineItems[index]?.message, index),
    overscan: CHAT_VIRTUAL_OVERSCAN,
    paddingStart: 8,
    paddingEnd: 16,
    scrollPaddingEnd: 16,
    isScrollingResetDelay: CHAT_SCROLLING_RESET_DELAY,
    useFlushSync: true,
  })

  useLayoutEffect(() => {
    virtualizer.shouldAdjustScrollPositionOnItemSizeChange =
      shouldAdjustChatScrollPositionOnItemSizeChange
    return () => {
      virtualizer.shouldAdjustScrollPositionOnItemSizeChange = undefined
    }
  }, [virtualizer])

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
    const scrollEl = scrollRef.current
    const wasNearBottom = scrollEl ? isScrollNearBottom(scrollEl, 160) : true
    queryClient.setQueryData(['dm-messages', dmChannelId], (old: DmPages | undefined) => {
      if (!old) return old
      const newPages = [...old.pages]
      newPages[0] = [msg, ...(newPages[0] ?? [])]
      return { ...old, pages: newPages }
    })
    shouldStickToBottomRef.current = wasNearBottom || shouldStickToBottomRef.current
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

  const scrollToBottom = useCallback(
    (behavior: 'auto' | 'smooth' = 'auto') => {
      if (timelineItems.length === 0) return
      const scrollEl = scrollRef.current
      if (!scrollEl) return
      if (!shouldVirtualize) {
        scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior })
        return
      }
      virtualizer.scrollToIndex(timelineItems.length - 1, { align: 'end', behavior })
      requestAnimationFrame(() => {
        if (!shouldStickToBottomRef.current) return
        scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior: 'auto' })
      })
    },
    [timelineItems.length, shouldVirtualize, virtualizer],
  )

  // Keep the viewport anchored on initial load, prepends, and bottom-stick appends.
  useLayoutEffect(() => {
    const prevCount = prevMessageCountRef.current
    const currentCount = timelineItems.length
    if (currentCount === 0 || isLoading) return

    const pendingPrepend = pendingPrependRef.current
    if (pendingPrepend) {
      prevMessageCountRef.current = currentCount
      requestAnimationFrame(() => {
        const scrollEl = scrollRef.current
        if (!scrollEl) {
          pendingPrependRef.current = null
          return
        }
        const heightDelta = scrollEl.scrollHeight - pendingPrepend.scrollHeight
        scrollEl.scrollTop = pendingPrepend.scrollTop + Math.max(0, heightDelta)
        pendingPrependRef.current = null
        shouldStickToBottomRef.current = isScrollNearBottom(scrollEl)
      })
      return
    }

    if (!initialScrollDoneRef.current) {
      initialScrollDoneRef.current = true
      prevMessageCountRef.current = currentCount
      scrollToBottom('auto')
      return
    }

    if (currentCount !== prevCount && shouldStickToBottomRef.current) {
      scrollToBottom('auto')
    }

    prevMessageCountRef.current = currentCount
  }, [timelineItems.length, isLoading, scrollToBottom])

  // Reset scroll flag on channel change
  useEffect(() => {
    initialScrollDoneRef.current = false
    prevMessageCountRef.current = 0
    shouldStickToBottomRef.current = true
    pendingPrependRef.current = null
  }, [dmChannelId])

  useEffect(() => {
    return () => {
      if (stickyScrollRafRef.current !== null) {
        window.cancelAnimationFrame(stickyScrollRafRef.current)
        stickyScrollRafRef.current = null
      }
    }
  }, [])

  // Load more on scroll to top
  useEffect(() => {
    const scrollEl = scrollRef.current
    if (!scrollEl) return
    const handleScroll = () => {
      if (
        scrollEl.scrollTop < 200 &&
        hasNextPage &&
        !isFetchingNextPage &&
        !pendingPrependRef.current
      ) {
        pendingPrependRef.current = {
          scrollHeight: scrollEl.scrollHeight,
          scrollTop: scrollEl.scrollTop,
        }
        void fetchNextPage()
      }
      shouldStickToBottomRef.current = isScrollNearBottom(scrollEl, 96)
    }
    scrollEl.addEventListener('scroll', handleScroll, { passive: true })
    return () => scrollEl.removeEventListener('scroll', handleScroll)
  }, [fetchNextPage, hasNextPage, isFetchingNextPage])

  // Send message (with optional attachments)
  const handleSend = useCallback(async () => {
    const content = messageText.trim()
    if (!content && pendingFiles.length === 0 && selectedCommerceCards.length === 0) return
    const metadata =
      selectedCommerceCards.length > 0 ? { commerceCards: selectedCommerceCards } : undefined

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
            ...(metadata ? { metadata } : {}),
          }),
        })
        playSendSound()
      } else {
        sendDmMessage({
          dmChannelId,
          content: content || '\u200B',
          replyToId: replyToId ?? undefined,
          metadata,
        })
        playSendSound()
      }
    } catch (err) {
      console.error('Failed to send DM:', err)
    }

    setMessageText('')
    setReplyToId(null)
    setPendingFiles([])
    setSelectedCommerceCards([])
    inputRef.current?.focus()
  }, [messageText, pendingFiles, selectedCommerceCards, dmChannelId, replyToId])

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

  const virtualItems = shouldVirtualize ? virtualizer.getVirtualItems() : []
  const renderMessageBubble = (msg: Message, isGrouped: boolean) => (
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
      onPreviewFile={(attachment) => setPreviewFile(attachment)}
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
  )

  return (
    <div className="flex flex-1 min-w-0 h-full">
      <GlassPanel
        className="chat-panel flex flex-1 min-h-0 flex-col overflow-hidden"
        style={{
          background: 'var(--chat-panel-bg)',
          backdropFilter: 'none',
          WebkitBackdropFilter: 'none',
        }}
      >
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
              {otherUser?.displayName ?? otherUser?.username ?? t('friends.chat')}
            </h3>
            {otherUser?.isBot && (
              <span className="text-[11px] font-black text-primary bg-primary/10 rounded-full px-1.5 py-0.5">
                Buddy
              </span>
            )}
          </div>
          {otherUser?.id && (
            <div className="flex items-center gap-1.5 sm:hidden">
              <Button
                variant="ghost"
                size="icon"
                type="button"
                icon={HandCoins}
                aria-label={t('communityEconomy.sendTip')}
                onClick={() => setEconomyModal('tip')}
              />
              <Button
                variant="ghost"
                size="icon"
                type="button"
                icon={Gift}
                aria-label={t('communityEconomy.sendGift')}
                onClick={() => setEconomyModal('gift')}
              />
            </div>
          )}
          {otherUser?.id && (
            <div className="hidden items-center gap-2 sm:flex">
              <Button
                variant="ghost"
                size="sm"
                type="button"
                icon={HandCoins}
                onClick={() => setEconomyModal('tip')}
              >
                {t('communityEconomy.sendTip')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                icon={Gift}
                onClick={() => setEconomyModal('gift')}
              >
                {t('communityEconomy.sendGift')}
              </Button>
            </div>
          )}
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
              <p className="text-sm">{t('dm.noMessages')}</p>
            </div>
          ) : shouldVirtualize ? (
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
                    key={virtualItem.key}
                    data-index={virtualItem.index}
                    ref={virtualizer.measureElement}
                    style={{
                      position: 'absolute',
                      top: `${virtualItem.start}px`,
                      left: 0,
                      width: '100%',
                    }}
                  >
                    {renderMessageBubble(msg, isGrouped)}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex flex-col py-2">
              {timelineItems.map(({ message: msg, isGrouped }) => (
                <div key={msg.id}>{renderMessageBubble(msg, isGrouped)}</div>
              ))}
            </div>
          )}
        </div>

        {/* Typing indicator */}
        {typingUsers.length > 0 && (
          <div className="px-4 py-1 text-[12px] text-text-muted">
            <span className="font-medium text-primary">{typingUsers.join(', ')}</span>{' '}
            {t('chat.typing')}
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
                  {t('dm.rentalCostTip', {
                    baseDailyRate: rental.baseDailyRate,
                    messageFee: rental.messageFee,
                    totalCost: rental.totalCost,
                    messageCount: rental.messageCount,
                  })}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    localStorage.setItem(tipKey, '1')
                    queryClient.invalidateQueries({
                      queryKey: ['agent-chat-status', otherUser?.id],
                    })
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
                  ? t('dm.chatDisabledRentedOut')
                  : agentChatStatus?.reason === 'expired'
                    ? t('dm.chatDisabledExpired')
                    : t('dm.chatDisabledListed')}
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
                      <span className="text-text-muted">{t('chat.replyingTo')}</span>
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
              {(pendingFiles.length > 0 || selectedCommerceCards.length > 0) && (
                <div className="flex gap-2 mb-2 flex-wrap">
                  {selectedCommerceCards.map((card) => (
                    <div
                      key={card.id}
                      className="relative flex items-center gap-2 rounded-2xl border border-border-subtle bg-bg-secondary/80 px-3 py-2 pr-8 text-xs text-text-secondary"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                        <ShoppingBag size={17} />
                      </span>
                      <span className="min-w-0">
                        <span className="block max-w-[150px] truncate font-bold text-text-primary">
                          {card.snapshot.name}
                        </span>
                        <span className="block text-[11px] text-text-muted">
                          {getCommerceCardPrice(card, t)}
                        </span>
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setSelectedCommerceCards((prev) =>
                            prev.filter((item) => item.id !== card.id),
                          )
                        }
                        className="absolute -right-1 -top-1 h-5 w-5 rounded-full bg-danger text-white"
                      >
                        <X size={12} />
                      </Button>
                    </div>
                  ))}
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
                    e.target.accept = ''
                  }
                }}
              />
              <InputValley className="flex items-end gap-2 rounded-[26px] bg-bg-primary/65">
                <div className="relative ml-2 mb-2 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowAttachMenu((open) => !open)}
                    className={cn('h-8 w-8', showAttachMenu && 'bg-primary/10 text-primary')}
                    title={t('chat.addMenu')}
                    aria-label={t('chat.addMenu')}
                  >
                    <Plus size={18} />
                  </Button>
                  {showAttachMenu && (
                    <>
                      <button
                        type="button"
                        className="fixed inset-0 z-40 cursor-default"
                        aria-label={t('common.close')}
                        onClick={() => setShowAttachMenu(false)}
                      />
                      <div className="absolute bottom-10 left-0 z-50 w-[260px] rounded-2xl border border-border-subtle bg-bg-primary p-2 shadow-2xl">
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-bg-secondary"
                          onClick={() => openFileDialog()}
                        >
                          <FileText size={17} className="text-primary" />
                          <span className="min-w-0">
                            <span className="block text-sm font-bold text-text-primary">
                              {t('chat.uploadFile')}
                            </span>
                            <span className="block truncate text-xs text-text-muted">
                              {t('chat.addMenuUploadFileDesc')}
                            </span>
                          </span>
                        </button>
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-bg-secondary"
                          onClick={() => openFileDialog('image/*')}
                        >
                          <ImageIcon size={17} className="text-primary" />
                          <span className="min-w-0">
                            <span className="block text-sm font-bold text-text-primary">
                              {t('chat.uploadImage')}
                            </span>
                            <span className="block truncate text-xs text-text-muted">
                              {t('chat.addMenuUploadImageDesc')}
                            </span>
                          </span>
                        </button>
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-bg-secondary"
                          onClick={() => {
                            setShowAttachMenu(false)
                            setShowProductPicker(true)
                          }}
                        >
                          <ShoppingBag size={17} className="text-primary" />
                          <span className="min-w-0">
                            <span className="block text-sm font-bold text-text-primary">
                              {t('chat.productPicker')}
                            </span>
                            <span className="block truncate text-xs text-text-muted">
                              {t('chat.addMenuProductDesc')}
                            </span>
                          </span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
                <textarea
                  ref={inputRef}
                  value={messageText}
                  onChange={(e) => {
                    const value = e.target.value
                    const cursorPos = e.target.selectionStart
                    if (/(?:^|\s)\+$/u.test(value.slice(0, cursorPos))) {
                      const next = `${value.slice(0, cursorPos - 1)}${value.slice(cursorPos)}`
                      setMessageText(next)
                      setShowAttachMenu(true)
                      requestAnimationFrame(() => {
                        inputRef.current?.focus()
                        inputRef.current?.setSelectionRange(cursorPos - 1, cursorPos - 1)
                      })
                    } else {
                      setMessageText(value)
                    }
                    handleTyping()
                  }}
                  onKeyDown={(e) => {
                    if (
                      (messageText.trim() === '/product' || messageText.trim() === '/shop') &&
                      (e.key === 'Enter' || e.key === 'Tab')
                    ) {
                      e.preventDefault()
                      setMessageText('')
                      setShowProductPicker(true)
                      return
                    }
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
                      ? t('dm.inputPlaceholderToUser', {
                          name: otherUser.displayName ?? otherUser.username,
                        })
                      : t('dm.inputPlaceholderDefault')
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
                    disabled={
                      !messageText.trim() &&
                      pendingFiles.length === 0 &&
                      selectedCommerceCards.length === 0
                    }
                    className="h-8 w-8 rounded-full bg-primary hover:bg-primary/80"
                  >
                    <Send size={18} />
                  </Button>
                </div>
              </InputValley>
            </>
          )}
        </div>
        {showProductPicker && (
          <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/30 px-4 pb-6 pt-20 sm:items-center">
            <div className="w-full max-w-lg rounded-2xl border border-border-subtle bg-bg-primary shadow-2xl">
              <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-bold text-text-primary">
                  <ShoppingBag size={18} className="text-primary" />
                  {t('chat.productPicker')}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setShowProductPicker(false)}
                >
                  <X size={16} />
                </Button>
              </div>
              <div className="border-b border-border-subtle p-3">
                <label className="flex items-center gap-2 rounded-xl border border-border-subtle bg-bg-secondary px-3 py-2 text-sm text-text-primary">
                  <Search size={16} className="text-text-muted" />
                  <input
                    value={productQuery}
                    onChange={(e) => setProductQuery(e.target.value)}
                    placeholder={t('chat.productPickerSearch')}
                    className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-text-muted"
                    autoFocus
                  />
                </label>
              </div>
              <div className="max-h-[420px] overflow-y-auto p-2">
                {isFetchingProducts ? (
                  <div className="px-4 py-8 text-center text-sm text-text-muted">
                    {t('chat.productPickerLoading')}
                  </div>
                ) : productCards.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-text-muted">
                    {t('chat.productPickerEmpty')}
                  </div>
                ) : (
                  productPickerGroups.map((group) => (
                    <div key={group.key} className="py-1">
                      <div className="flex items-center gap-2 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">
                        <ShoppingBag size={13} />
                        <span>{t(group.labelKey)}</span>
                        {group.shopName && (
                          <span className="min-w-0 truncate normal-case tracking-normal">
                            {group.shopName}
                          </span>
                        )}
                      </div>
                      {group.cards.map((card) => (
                        <button
                          key={card.id}
                          type="button"
                          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-bg-secondary"
                          onClick={() => addCommerceCard(card)}
                        >
                          {card.snapshot.imageUrl ? (
                            <img
                              src={card.snapshot.imageUrl}
                              alt=""
                              className="h-12 w-12 rounded-lg object-cover"
                            />
                          ) : (
                            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                              <ShoppingBag size={20} />
                            </span>
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-bold text-text-primary">
                              {card.snapshot.name}
                            </span>
                            {card.snapshot.summary && (
                              <span className="block truncate text-xs text-text-muted">
                                {card.snapshot.summary}
                              </span>
                            )}
                          </span>
                          <span className="shrink-0 text-sm font-bold text-primary">
                            {getCommerceCardPrice(card, t)}
                          </span>
                        </button>
                      ))}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </GlassPanel>
      {previewFile && (
        <FilePreviewPanel attachment={previewFile} onClose={() => setPreviewFile(null)} />
      )}
      <CommunityEconomySendModal
        open={economyModal !== null}
        mode={economyModal ?? 'tip'}
        recipient={
          otherUser
            ? {
                id: otherUser.id,
                username: otherUser.username,
                displayName: otherUser.displayName,
                avatarUrl: otherUser.avatarUrl,
              }
            : undefined
        }
        onClose={() => setEconomyModal(null)}
      />
    </div>
  )
}

/** Standalone DM chat page (used by router) */
export function DmChatPage() {
  const { dmChannelId } = useParams({ strict: false }) as { dmChannelId: string }
  const navigate = useNavigate()
  return <DmChatView dmChannelId={dmChannelId} onBack={() => navigate({ to: '/settings' })} />
}
