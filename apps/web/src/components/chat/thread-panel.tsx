import { Button, GlassPanel, TooltipIconButton } from '@shadowob/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { FileText, Hash, Loader2, MessageSquare, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSocketEvent } from '../../hooks/use-socket'
import { fetchApi } from '../../lib/api'
import { joinThread, leaveThread } from '../../lib/socket'
import { UserAvatar } from '../common/avatar'
import { type Message, MessageBubble } from './message-bubble'
import { DATE_FNS_LOCALE_MAP } from './message-bubble/constants'
import { MessageMarkdown } from './message-bubble/markdown'
import type { Attachment, MemberEntry } from './message-bubble/types'
import { useMessageMentionRenderer } from './message-bubble/use-message-mentions'
import { MessageInput } from './message-input'
import type { OAuthLinkPreview } from './oauth-link-card'

export interface Thread {
  id: string
  name: string
  channelId: string
  parentMessageId: string
  creatorId: string
  isArchived: boolean
  messageCount?: number
  createdAt: string
  updatedAt: string
}

interface ThreadPanelProps {
  thread: Thread
  parentMessage: Message | null
  currentUserId: string
  serverId?: string | null
  channelName?: string
  focusMessageId?: string | null
  focusRequestId?: number | null
  onClose: () => void
  onPreviewFile?: (attachment: Attachment) => void
  onPreviewOAuthLink?: (preview: OAuthLinkPreview) => void
  onSaveToWorkspace?: (attachment: Attachment) => void
  forceSheet?: boolean
}

function sortByCreatedAt(messages: Message[]) {
  return [...messages].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  )
}

function ThreadSourceMessage({
  message,
  serverId,
  time,
  onPreviewFile,
}: {
  message: Message
  serverId?: string | null
  time: string
  onPreviewFile?: (attachment: Attachment) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const author = message.author
  const content = message.content.trim()
  const membersList = useMemo(
    () => (serverId ? (queryClient.getQueryData<MemberEntry[]>(['members', serverId]) ?? []) : []),
    [queryClient, serverId],
  )
  const renderMentions = useMessageMentionRenderer({
    membersList,
    messageMetadata: message.metadata,
    queryClient,
    serverId: serverId ?? undefined,
  })

  return (
    <div className="rounded-2xl border border-border-subtle bg-bg-secondary/35 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex items-start gap-3">
        <UserAvatar
          userId={author?.id}
          avatarUrl={author?.avatarUrl}
          displayName={author?.displayName ?? author?.username}
          size="md"
        />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
            <span
              className={`min-w-0 max-w-[min(14rem,48vw)] truncate text-[15px] font-black ${author?.isBot ? 'text-primary' : 'text-text-primary'}`}
            >
              {author?.displayName ?? author?.username ?? t('common.unknownUser')}
            </span>
            <span className="shrink-0 text-xs font-semibold text-text-muted">{time}</span>
          </div>
          {content && <MessageMarkdown content={content} renderMentions={renderMentions} />}
          {message.attachments && message.attachments.length > 0 && (
            <div className="mt-3 flex flex-col gap-2">
              {message.attachments.map((attachment) => {
                const attachmentNode = (
                  <>
                    <FileText size={16} className="shrink-0 text-text-muted" />
                    <span className="min-w-0 truncate text-sm font-semibold text-text-primary">
                      {attachment.filename}
                    </span>
                  </>
                )
                if (!onPreviewFile) {
                  return (
                    <div
                      key={attachment.id}
                      className="flex min-w-0 items-center gap-2 rounded-xl border border-border-subtle bg-bg-primary/45 px-3 py-2"
                    >
                      {attachmentNode}
                    </div>
                  )
                }
                return (
                  <button
                    key={attachment.id}
                    type="button"
                    onClick={() => onPreviewFile(attachment)}
                    className="flex min-w-0 items-center gap-2 rounded-xl border border-border-subtle bg-bg-primary/45 px-3 py-2 text-left transition hover:border-primary/35 hover:bg-primary/8"
                  >
                    {attachmentNode}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function ThreadPanel({
  thread,
  parentMessage,
  currentUserId,
  serverId,
  channelName,
  focusMessageId,
  focusRequestId,
  onClose,
  onPreviewFile,
  onPreviewOAuthLink,
  onSaveToWorkspace,
  forceSheet = false,
}: ThreadPanelProps) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const scrollRef = useRef<HTMLDivElement>(null)
  const highlightClearTimerRef = useRef<number | null>(null)
  const handledFocusRequestRef = useRef<string | null>(null)
  const [replyToId, setReplyToId] = useState<string | null>(null)
  const [highlightMessageId, setHighlightMessageId] = useState<string | null>(null)
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === 'undefined' ? 1440 : window.innerWidth,
  )
  const messagesKey = useMemo(() => ['thread-messages', thread.id] as const, [thread.id])

  const { data: rawMessages = [], isLoading } = useQuery({
    queryKey: messagesKey,
    queryFn: () => fetchApi<Message[]>(`/api/threads/${thread.id}/messages?limit=100`),
    staleTime: 15_000,
  })

  const messages = useMemo(() => sortByCreatedAt(rawMessages), [rawMessages])
  const visibleMessageCount = messages.length + (parentMessage ? 1 : 0)
  const messageCount = Math.max(thread.messageCount ?? 0, visibleMessageCount)
  const messageMap = useMemo(() => {
    const map = new Map<string, Message>()
    if (parentMessage) map.set(parentMessage.id, parentMessage)
    for (const message of messages) map.set(message.id, message)
    return map
  }, [messages, parentMessage])

  useEffect(() => {
    joinThread(thread.id)
    return () => leaveThread(thread.id)
  }, [thread.id])

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth)
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages.length])

  useEffect(() => {
    if (!focusMessageId) return
    const focusToken = `${focusRequestId ?? 'initial'}:${focusMessageId}`
    if (handledFocusRequestRef.current === focusToken) return
    if (!messages.some((message) => message.id === focusMessageId)) return

    handledFocusRequestRef.current = focusToken
    setHighlightMessageId(focusMessageId)

    const animationFrame = window.requestAnimationFrame(() => {
      document
        .getElementById(`msg-${focusMessageId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })

    if (highlightClearTimerRef.current !== null) {
      window.clearTimeout(highlightClearTimerRef.current)
    }
    highlightClearTimerRef.current = window.setTimeout(() => {
      setHighlightMessageId((current) => (current === focusMessageId ? null : current))
      highlightClearTimerRef.current = null
    }, 3000)

    return () => window.cancelAnimationFrame(animationFrame)
  }, [focusMessageId, focusRequestId, messages])

  useEffect(() => {
    return () => {
      if (highlightClearTimerRef.current !== null) {
        window.clearTimeout(highlightClearTimerRef.current)
        highlightClearTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (visibleMessageCount <= (thread.messageCount ?? 0)) return
    queryClient.setQueryData<Thread[]>(['threads', thread.channelId], (old) =>
      (old ?? []).map((item) =>
        item.id === thread.id ? { ...item, messageCount: visibleMessageCount } : item,
      ),
    )
  }, [queryClient, thread.channelId, thread.id, thread.messageCount, visibleMessageCount])

  useSocketEvent<Message>(
    'message:new',
    useCallback(
      (message) => {
        if (message.threadId !== thread.id) return
        queryClient.setQueryData<Message[]>(messagesKey, (old) => {
          const existing = old ?? []
          if (existing.some((item) => item.id === message.id)) {
            return existing.map((item) => (item.id === message.id ? message : item))
          }
          return [...existing, message]
        })
      },
      [messagesKey, queryClient, thread.id],
    ),
  )

  useSocketEvent<Message>(
    'message:updated',
    useCallback(
      (message) => {
        if (message.threadId !== thread.id) return
        queryClient.setQueryData<Message[]>(messagesKey, (old) =>
          (old ?? []).map((item) => (item.id === message.id ? message : item)),
        )
      },
      [messagesKey, queryClient, thread.id],
    ),
  )

  useSocketEvent<{ id: string }>(
    'message:deleted',
    useCallback(
      ({ id }) => {
        queryClient.setQueryData<Message[]>(messagesKey, (old) =>
          (old ?? []).filter((message) => message.id !== id),
        )
      },
      [messagesKey, queryClient],
    ),
  )

  useSocketEvent<{ messageId: string; reactions: Message['reactions'] }>(
    'reaction:updated',
    useCallback(
      ({ messageId, reactions }) => {
        queryClient.setQueryData<Message[]>(messagesKey, (old) =>
          (old ?? []).map((message) =>
            message.id === messageId ? { ...message, reactions } : message,
          ),
        )
      },
      [messagesKey, queryClient],
    ),
  )

  const handleReact = useCallback(async (messageId: string, emoji: string) => {
    await fetchApi(`/api/messages/${messageId}/reactions`, {
      method: 'POST',
      body: JSON.stringify({ emoji }),
    })
  }, [])

  const handleMessageUpdate = useCallback(
    (updated: Message) => {
      queryClient.setQueryData<Message[]>(messagesKey, (old) =>
        (old ?? []).map((message) => (message.id === updated.id ? updated : message)),
      )
    },
    [messagesKey, queryClient],
  )

  const handleMessageDelete = useCallback(
    (messageId: string) => {
      queryClient.setQueryData<Message[]>(messagesKey, (old) =>
        (old ?? []).filter((message) => message.id !== messageId),
      )
    },
    [messagesKey, queryClient],
  )

  const threadTitle = thread.name || t('chat.thread')
  const sourceTime = useMemo(() => {
    if (!parentMessage) return ''
    return formatDistanceToNow(new Date(parentMessage.createdAt), {
      locale: DATE_FNS_LOCALE_MAP[i18n.language],
      addSuffix: true,
    })
  }, [i18n.language, parentMessage])
  const shouldUseSheet = forceSheet || viewportWidth < 1440
  const isNarrowSheet = shouldUseSheet && viewportWidth < 720
  const panelClasses = shouldUseSheet
    ? `${isNarrowSheet ? 'fixed inset-2' : 'fixed inset-y-3 right-3 w-[min(92vw,420px)]'} z-40 flex min-w-0 shrink-0 flex-col overflow-hidden rounded-3xl border border-border-subtle shadow-[0_24px_80px_rgba(0,0,0,0.38)] animate-slide-in-right`
    : 'relative mr-3 ml-2 flex h-full w-[min(34vw,420px)] min-w-[360px] shrink-0 flex-col overflow-hidden rounded-3xl border border-border-subtle shadow-[0_24px_80px_rgba(0,0,0,0.32)] animate-slide-in-right'
  const panelStyle = {
    background: shouldUseSheet
      ? 'var(--color-bg-primary)'
      : 'color-mix(in srgb, var(--glass-bg) 88%, transparent)',
    backdropFilter: shouldUseSheet ? 'none' : 'blur(20px)',
    WebkitBackdropFilter: shouldUseSheet ? 'none' : 'blur(20px)',
  }

  return (
    <>
      {shouldUseSheet && (
        <button
          type="button"
          aria-label={t('common.close')}
          className="fixed inset-0 z-30 bg-bg-deep/35 backdrop-blur-[2px]"
          onClick={onClose}
        />
      )}
      <GlassPanel className={panelClasses} style={panelStyle}>
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border-subtle px-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
            <MessageSquare size={17} strokeWidth={2.5} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-black text-text-primary">{threadTitle}</div>
            <div className="flex min-w-0 items-center gap-1 text-xs font-semibold text-text-muted">
              <Hash size={12} />
              <span className="truncate">{channelName ?? t('chat.channelFallback')}</span>
              <span className="shrink-0 text-text-muted/70">·</span>
              <span className="shrink-0 font-black text-text-secondary">{messageCount}</span>
            </div>
          </div>
          <TooltipIconButton
            label={t('common.close')}
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={onClose}
          >
            <X size={18} />
          </TooltipIconButton>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden py-2">
          {parentMessage && (
            <>
              <div className="px-4 pb-3 pt-2">
                <div className="mb-2 flex items-center gap-2 text-xs font-black text-text-muted">
                  <span className="h-px flex-1 bg-border-subtle" />
                  <span>{t('chat.threadSource')}</span>
                  <span className="h-px flex-1 bg-border-subtle" />
                </div>
                <ThreadSourceMessage
                  message={parentMessage}
                  serverId={serverId}
                  time={sourceTime}
                  onPreviewFile={onPreviewFile}
                />
              </div>
              <div className="mx-4 mb-2 flex items-center gap-2 text-xs font-black text-text-muted">
                <span className="h-px flex-1 bg-border-subtle" />
                <span>{t('chat.threadReplies')}</span>
                <span className="h-px flex-1 bg-border-subtle" />
              </div>
            </>
          )}

          {isLoading ? (
            <div className="flex h-28 items-center justify-center text-text-muted">
              <Loader2 size={16} className="animate-spin text-primary" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center gap-2 px-6 text-center text-sm text-text-muted">
              <MessageSquare size={22} className="text-primary/80" />
              <span>{t('chat.threadEmpty')}</span>
            </div>
          ) : (
            messages.map((message, index) => {
              const previous = messages[index - 1]
              const isGrouped =
                previous !== undefined &&
                previous.authorId === message.authorId &&
                !message.replyToId &&
                Math.abs(
                  new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime(),
                ) < 60_000
              return (
                <MessageBubble
                  key={message.id}
                  message={message}
                  currentUserId={currentUserId}
                  serverId={serverId ?? undefined}
                  isGrouped={isGrouped}
                  onReply={(messageId) => setReplyToId(messageId)}
                  onReact={handleReact}
                  onMessageUpdate={handleMessageUpdate}
                  onMessageDelete={handleMessageDelete}
                  onPreviewFile={onPreviewFile}
                  onPreviewOAuthLink={onPreviewOAuthLink}
                  onSaveToWorkspace={onSaveToWorkspace}
                  replyToMessage={
                    message.replyToId ? (messageMap.get(message.replyToId) ?? null) : null
                  }
                  highlight={highlightMessageId === message.id}
                  enableSlashCommandActions={index === messages.length - 1}
                />
              )
            })
          )}
        </div>

        <MessageInput
          channelId={thread.channelId}
          channelName={channelName}
          threadId={thread.id}
          threadName={threadTitle}
          replyToId={replyToId}
          replyToMessage={replyToId ? (messageMap.get(replyToId) ?? null) : null}
          onClearReply={() => setReplyToId(null)}
          onMessageSent={() => setReplyToId(null)}
        />
      </GlassPanel>
    </>
  )
}
