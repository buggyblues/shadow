import { Button, cn } from '@shadowob/ui'
import { type InfiniteData, useQueryClient } from '@tanstack/react-query'
import { format, formatDistanceToNow, type Locale } from 'date-fns'
import { enUS, ja, ko, zhCN, zhTW } from 'date-fns/locale'
import {
  AlertCircle,
  Check,
  CheckSquare,
  Copy,
  ExternalLink,
  MoreHorizontal,
  Pencil,
  Reply,
  Smile,
  Square,
  Trash2,
  X,
} from 'lucide-react'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { fetchApi } from '../../lib/api'
import { useAuthStore } from '../../stores/auth.store'
import { useChatStore } from '../../stores/chat.store'
import { UserAvatar } from '../common/avatar'
import { useConfirmStore } from '../common/confirm-dialog'
import { EmojiPicker } from '../common/emoji-picker'
import { UserProfileCard } from '../common/user-profile-card'
import { FileCard } from './file-card'
import { ImageContextMenu } from './image-context-menu'

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

interface Attachment {
  id: string
  filename: string
  url: string
  contentType: string
  size: number
}

export interface Message {
  id: string
  content: string
  channelId?: string
  dmChannelId?: string
  authorId: string
  threadId?: string | null
  replyToId: string | null
  isEdited: boolean
  isPinned?: boolean
  createdAt: string
  updatedAt?: string
  author?: Author
  reactions?: ReactionGroup[]
  attachments?: Attachment[]
  /** Optional metadata blob — includes interactive blocks (Phase 2). */
  metadata?: {
    interactive?: InteractiveBlock
    interactiveResponse?: InteractiveResponseMetadata
    interactiveState?: InteractiveStateMetadata
    [key: string]: unknown
  }
  /** Optimistic send status — only set on client-side pending messages */
  sendStatus?: 'sending' | 'failed'
}

/** Phase 2 interactive block shape — mirrors server schema. */
export interface InteractiveButtonItem {
  id: string
  label: string
  style?: 'primary' | 'secondary' | 'destructive'
  value?: string
}
export interface InteractiveSelectItem {
  id: string
  label: string
  value: string
}
export interface InteractiveFormField {
  id: string
  kind: 'text' | 'textarea' | 'number' | 'checkbox' | 'select'
  label: string
  placeholder?: string
  defaultValue?: string
  required?: boolean
  options?: InteractiveSelectItem[]
  maxLength?: number
  min?: number
  max?: number
}
export interface InteractiveBlock {
  id: string
  kind: 'buttons' | 'select' | 'form' | 'approval'
  prompt?: string
  buttons?: InteractiveButtonItem[]
  options?: InteractiveSelectItem[]
  fields?: InteractiveFormField[]
  submitLabel?: string
  responsePrompt?: string
  approvalCommentLabel?: string
  oneShot?: boolean
}
export interface InteractiveResponseMetadata {
  blockId: string
  sourceMessageId: string
  actionId: string
  value: string
  values?: Record<string, string>
  submissionId?: string
  responseMessageId?: string | null
  submittedAt?: string
}
export interface InteractiveStateMetadata {
  sourceMessageId: string
  blockId: string
  submitted: boolean
  response?: InteractiveResponseMetadata
}

export type { Attachment, Author, ReactionGroup }

interface MessagesPage {
  messages: Message[]
  hasMore: boolean
}

export interface MessageBubbleProps {
  message: Message
  currentUserId: string
  /** 'channel' (default) enables server-member features; 'dm' disables them */
  variant?: 'channel' | 'dm'
  onReply?: (messageId: string) => void
  onReact?: (messageId: string, emoji: string) => void
  onMessageUpdate?: (msg: Message) => void
  onMessageDelete?: (msgId: string) => void
  onPreviewFile?: (attachment: Attachment) => void
  onSaveToWorkspace?: (attachment: Attachment) => void
  /** Custom edit API — defaults to PATCH /api/messages/:id */
  editApi?: (messageId: string, content: string) => Promise<Message>
  /** Custom delete API — defaults to DELETE /api/messages/:id */
  deleteApi?: (messageId: string) => Promise<void>
  highlight?: boolean
  replyToMessage?: Message | null
  /** Multi-select mode */
  selectionMode?: boolean
  isSelected?: boolean
  submittedInteractiveResponse?: InteractiveResponseMetadata | null
  onToggleSelect?: (messageId: string) => void
  onEnterSelectionMode?: (messageId: string) => void
  /** When true, this message is grouped with the previous message (same author, within 1 min) — hide avatar & name */
  isGrouped?: boolean
}

const quickEmojis = ['👍', '❤️', '😂', '🎉', '🤔', '👀']

function isImageType(contentType: string): boolean {
  return contentType.startsWith('image/')
}

function CodeBlockWithCopy({ children }: { children: React.ReactNode }) {
  const [copied, setCopied] = useState(false)

  const handleCopyCode = () => {
    const _codeEl = document.createElement('div')
    let text = ''
    const extractText = (node: React.ReactNode): string => {
      if (typeof node === 'string') return node
      if (typeof node === 'number') return String(node)
      if (!node) return ''
      if (Array.isArray(node)) return node.map(extractText).join('')
      if (
        typeof node === 'object' &&
        node !== null &&
        'props' in (node as unknown as Record<string, unknown>)
      ) {
        return extractText(
          (node as React.ReactElement<{ children?: React.ReactNode }>).props.children,
        )
      }
      return ''
    }
    text = extractText(children)
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative group">
      <pre className="!m-0">{children}</pre>
      <Button
        variant="ghost"
        size="xs"
        onClick={handleCopyCode}
        className="absolute top-2 right-2 !p-1.5 !h-auto !w-auto !rounded-md !font-normal !normal-case !tracking-normal opacity-0 group-hover:opacity-100 bg-bg-secondary/50 backdrop-blur-sm border border-white/10 text-text-muted hover:text-text-primary"
        title="Copy code"
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </Button>
    </div>
  )
}

function MessageBubbleInner({
  message,
  currentUserId,
  variant = 'channel',
  onReply,
  onReact,
  onMessageUpdate,
  onMessageDelete,
  onPreviewFile,
  onSaveToWorkspace,
  editApi,
  deleteApi,
  highlight,
  replyToMessage,
  selectionMode,
  isSelected,
  submittedInteractiveResponse,
  onToggleSelect,
  onEnterSelectionMode,
  isGrouped = false,
}: MessageBubbleProps) {
  const { t, i18n } = useTranslation()
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showFullPicker, setShowFullPicker] = useState(false)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [copied, setCopied] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const editInputRef = useRef<HTMLTextAreaElement>(null)
  const avatarRef = useRef<HTMLDivElement>(null)
  const messageRef = useRef<HTMLDivElement>(null)
  const [avatarHover, setAvatarHover] = useState(false)
  const [avatarPinned, setAvatarPinned] = useState(false)
  const [avatarCardPos, setAvatarCardPos] = useState<{ left: number; top: number } | null>(null)
  const [avatarContextMenu, setAvatarContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [imageContextMenu, setImageContextMenu] = useState<{
    x: number
    y: number
    att: Attachment
  } | null>(null)
  const avatarHoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const actionsRef = useRef<HTMLDivElement>(null)

  const showActions = isHovered && !selectionMode

  // Close all menus on scroll (find nearest scrollable ancestor)
  useEffect(() => {
    if (!showActions && !showEmojiPicker && !showFullPicker && !showMoreMenu) return
    const scrollParent = messageRef.current?.closest(
      '[class*="overflow-y-auto"]',
    ) as HTMLElement | null
    if (!scrollParent) return
    const handleScroll = () => {
      setShowEmojiPicker(false)
      setShowFullPicker(false)
      setShowMoreMenu(false)
    }
    scrollParent.addEventListener('scroll', handleScroll, { passive: true })
    return () => scrollParent.removeEventListener('scroll', handleScroll)
  }, [showActions, showEmojiPicker, showFullPicker, showMoreMenu])

  const activateHover = useCallback(() => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
    setIsHovered(true)
  }, [])

  const deactivateHover = useCallback(() => {
    if (showMoreMenu || showEmojiPicker || showFullPicker) return
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovered(false)
      setShowEmojiPicker(false)
      setShowFullPicker(false)
    }, 150)
  }, [showMoreMenu, showEmojiPicker, showFullPicker])

  const isOwn = message.authorId === currentUserId
  const currentUser = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()
  const { activeServerId } = useChatStore()
  const author = message.author

  const handleEdit = useCallback(() => {
    setEditContent(message.content)
    setIsEditing(true)
    setShowMoreMenu(false)
    setTimeout(() => editInputRef.current?.focus(), 50)
  }, [message.content])

  const handleSaveEdit = useCallback(async () => {
    if (!editContent.trim() || editContent.trim() === message.content) {
      setIsEditing(false)
      return
    }
    try {
      const updated = editApi
        ? await editApi(message.id, editContent.trim())
        : await fetchApi<Message>(`/api/messages/${message.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ content: editContent.trim() }),
          })
      onMessageUpdate?.(updated)
      setIsEditing(false)
    } catch {
      /* keep editing on error */
    }
  }, [editContent, message.id, message.content, onMessageUpdate, editApi])

  const handleDelete = useCallback(async () => {
    setShowMoreMenu(false)
    const ok = await useConfirmStore.getState().confirm({
      title: t('chat.deleteMessage'),
      message: t('chat.deleteConfirm'),
    })
    if (!ok) return
    try {
      if (deleteApi) {
        await deleteApi(message.id)
      } else {
        await fetchApi(`/api/messages/${message.id}`, { method: 'DELETE' })
      }
      onMessageDelete?.(message.id)
    } catch {
      /* ignore */
    }
  }, [message.id, onMessageDelete, deleteApi, t])

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(message.content)
    setCopied(true)
    setShowMoreMenu(false)
    setTimeout(() => setCopied(false), 2000)
  }, [message.content])

  const handleShareLink = useCallback(() => {
    const url = `${window.location.origin}${window.location.pathname}?msg=${message.id}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setShowMoreMenu(false)
    setTimeout(() => setCopied(false), 2000)
  }, [message.id])

  // Avatar hover handlers
  const handleAvatarMouseEnter = useCallback(() => {
    if (avatarPinned) return
    if (avatarHoverTimerRef.current) clearTimeout(avatarHoverTimerRef.current)
    avatarHoverTimerRef.current = setTimeout(() => {
      if (avatarRef.current) {
        const rect = avatarRef.current.getBoundingClientRect()
        setAvatarCardPos({
          left: rect.right + 12,
          top: Math.max(8, Math.min(rect.top, window.innerHeight - 280)),
        })
        setAvatarHover(true)
      }
    }, 350)
  }, [avatarPinned])

  const handleAvatarMouseLeave = useCallback(() => {
    if (avatarPinned) return
    if (avatarHoverTimerRef.current) clearTimeout(avatarHoverTimerRef.current)
    avatarHoverTimerRef.current = setTimeout(() => setAvatarHover(false), 200)
  }, [avatarPinned])

  const handleAvatarClick = useCallback(() => {
    if (author) {
      setAvatarPinned(true)
      setAvatarHover(true)
      if (avatarRef.current) {
        const rect = avatarRef.current.getBoundingClientRect()
        setAvatarCardPos({
          left: rect.right + 12,
          top: Math.max(8, Math.min(rect.top, window.innerHeight - 280)),
        })
      }
    }
  }, [author])

  const handleAvatarContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setAvatarContextMenu({ x: e.clientX, y: e.clientY })
  }, [])

  const closeAvatarCard = useCallback(() => {
    setAvatarPinned(false)
    setAvatarHover(false)
  }, [])

  // Look up member info from cache for role/buddy metadata (channel mode only)
  const membersList =
    variant === 'channel'
      ? (queryClient.getQueryData<MemberEntry[]>(['members', activeServerId]) ?? [])
      : []
  const authorMember = membersList.find((m: MemberEntry) => m.userId === author?.id)
  const buddyAgentsList =
    variant === 'channel'
      ? (queryClient.getQueryData<BuddyAgentEntry[]>(['members-buddy-agents', activeServerId]) ??
        [])
      : []
  const buddyAgent = author?.isBot
    ? buddyAgentsList.find((a: BuddyAgentEntry) => a.botUser?.id === author.id)
    : undefined
  const currentMember = membersList.find((m: MemberEntry) => m.userId === currentUser?.id)
  const canKick =
    variant === 'channel' && (currentMember?.role === 'owner' || currentMember?.role === 'admin')
  // Allow deletion for own messages OR messages from a bot owned by the current user
  const canDelete = isOwn || (author?.isBot && buddyAgent?.ownerId === currentUser?.id)

  const dateFnsLocaleMap: Record<string, Locale> = {
    'zh-CN': zhCN,
    'zh-TW': zhTW,
    en: enUS,
    ja,
    ko,
  }
  const time = formatDistanceToNow(new Date(message.createdAt), {
    locale: dateFnsLocaleMap[i18n.language] ?? zhCN,
    addSuffix: true,
  })

  const resolveMentionLabel = useCallback(
    (mention: string) => {
      if (!mention.startsWith('@')) return mention
      const username = mention.slice(1)
      const member = membersList.find(
        (m: MemberEntry) => m.user?.username === username || m.user?.displayName === username,
      )
      const display = member?.user?.displayName ?? member?.user?.username
      return display ? `@${display}` : mention
    },
    [membersList],
  )

  /**
   * Process react children to highlight @username mention patterns.
   */
  const renderMentions = (children: React.ReactNode): React.ReactNode => {
    if (!children) return children
    const childArray = Array.isArray(children) ? children : [children]
    return childArray.map((child, idx) => {
      if (typeof child !== 'string') return child
      const parts = child.split(/(@[A-Za-z0-9_-]+)/g)
      if (parts.length === 1) return child
      return parts.map((part, pi) => {
        if (/^@[A-Za-z0-9_-]+$/.test(part)) {
          return (
            <MentionSpan key={`${idx}-${pi}`} mention={part} label={resolveMentionLabel(part)} />
          )
        }
        return part
      })
    })
  }

  const markdownContent = useMemo(() => message.content, [message.content])

  const isDmOwn = variant === 'dm' && isOwn

  return (
    <div
      ref={messageRef}
      id={`msg-${message.id}`}
      className={`group relative flex gap-4 px-4 ${isGrouped ? 'py-0.5 pl-[72px]' : 'py-2'} mx-1 message-row hover:bg-bg-tertiary/20 ${isDmOwn ? 'flex-row-reverse' : ''} ${highlight ? 'bg-primary/10 animate-pulse' : 'mt-[2px]'} ${isSelected ? 'bg-primary/10' : ''} ${selectionMode ? 'cursor-pointer' : ''}`}
      onMouseEnter={activateHover}
      onMouseLeave={deactivateHover}
      onClick={selectionMode ? () => onToggleSelect?.(message.id) : undefined}
      onTouchStart={() => {
        longPressTimerRef.current = setTimeout(() => {
          setIsHovered(true)
        }, 500)
      }}
      onTouchEnd={() => {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current)
          longPressTimerRef.current = null
        }
      }}
      onTouchMove={() => {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current)
          longPressTimerRef.current = null
        }
      }}
    >
      {/* Selection checkbox */}
      {selectionMode && (
        <div className="flex-shrink-0 flex items-center mr-[-8px]">
          {isSelected ? (
            <CheckSquare size={18} className="text-primary" />
          ) : (
            <Square size={18} className="text-text-muted" />
          )}
        </div>
      )}
      {/* Avatar container — hidden in grouped mode */}
      {!isGrouped && (
        <div
          ref={avatarRef}
          className={`flex-shrink-0 ${replyToMessage ? 'mt-6' : 'mt-0.5'} cursor-pointer`}
          onMouseEnter={handleAvatarMouseEnter}
          onMouseLeave={handleAvatarMouseLeave}
          onClick={handleAvatarClick}
          onContextMenu={handleAvatarContextMenu}
        >
          <UserAvatar
            userId={author?.id}
            avatarUrl={author?.avatarUrl}
            displayName={author?.displayName ?? author?.username}
            size="md"
          />
        </div>
      )}

      {/* Content */}
      <div className={`flex-1 min-w-0 ${isDmOwn ? 'text-right' : ''}`}>
        {/* Reply reference */}
        {replyToMessage && (
          <button
            type="button"
            onClick={() => {
              const el = document.getElementById(`msg-${replyToMessage.id}`)
              el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }}
            className={`flex items-center gap-1.5 mb-1 text-xs text-text-muted hover:text-text-secondary transition bg-primary/5 border-l-2 border-primary rounded-r-lg px-2 py-1 ${isDmOwn ? 'ml-auto flex-row-reverse' : ''}`}
          >
            <Reply size={12} className="shrink-0" />
            <span className="font-medium">
              {replyToMessage.author?.displayName ??
                replyToMessage.author?.username ??
                t('common.unknownUser')}
            </span>
            <span className="truncate max-w-[300px] opacity-70">{replyToMessage.content}</span>
          </button>
        )}
        {/* Author line — hidden in grouped mode */}
        {!isGrouped && (
          <div
            className={`flex items-baseline gap-2 leading-none mb-1 ${isDmOwn ? 'flex-row-reverse' : ''}`}
          >
            <span
              className={`font-bold text-[15px] hover:underline cursor-pointer ${author?.isBot ? 'text-primary' : 'text-text-primary'}`}
            >
              {author?.displayName ?? author?.username ?? t('common.unknownUser')}
            </span>
            {author?.isBot && (
              <span className="text-[11px] bg-primary/10 text-primary rounded-full px-2 py-0.5 font-black uppercase tracking-widest flex items-center gap-1">
                <Check size={8} />
                {t('common.bot')}
              </span>
            )}
            <span className="text-xs text-text-muted ml-0.5">{time}</span>
            {message.isEdited && (
              <span
                className="text-[11px] text-text-muted cursor-help"
                title={format(new Date(message.updatedAt ?? message.createdAt), 'PPpp', {
                  locale: dateFnsLocaleMap[i18n.language] ?? zhCN,
                })}
              >
                {t('chat.edited')}
              </span>
            )}
          </div>
        )}

        {/* Inline edit mode */}
        {isEditing ? (
          <div className="mt-1">
            <textarea
              ref={editInputRef}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === 'Enter' &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing &&
                  e.keyCode !== 229
                ) {
                  e.preventDefault()
                  handleSaveEdit()
                } else if (e.key === 'Escape') {
                  setIsEditing(false)
                }
              }}
              className="w-full bg-bg-secondary/80 text-text-primary rounded-2xl px-3 py-2 text-sm outline-none border-2 border-border-subtle focus:ring-2 focus:ring-primary/20 resize-none"
              rows={Math.min(editContent.split('\n').length + 1, 8)}
            />
            <div className="flex items-center gap-2 mt-1 text-xs text-text-muted">
              <span>Esc {t('common.cancel')}</span>
              <span>·</span>
              <span>Enter {t('common.save')}</span>
              <div className="flex-1" />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditing(false)}
                className="!p-1 !h-auto !w-auto !font-normal !normal-case !tracking-normal"
              >
                <X size={14} />
              </Button>
              <Button
                size="sm"
                onClick={handleSaveEdit}
                className="!p-1 !h-auto !w-auto !font-normal !normal-case !tracking-normal"
              >
                <Check size={14} />
              </Button>
            </div>
          </div>
        ) : (
          /* Markdown content — hide zero-width space placeholder for file-only messages */
          message.content &&
          message.content !== '\u200B' && (
            <div className="text-[15px] text-text-primary leading-[1.6] tracking-[0.01em] break-words msg-markdown pt-[2px]">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  img: ({ src, alt }) => (
                    <a href={src} target="_blank" rel="noopener noreferrer">
                      <img src={src} alt={alt ?? ''} loading="lazy" />
                    </a>
                  ),
                  a: ({ href, children }) => {
                    const handleClick = (e: React.MouseEvent) => {
                      e.preventDefault()
                      if (href) {
                        window.open(href, '_blank', 'noopener,noreferrer')
                      }
                    }
                    return (
                      <a
                        href={href}
                        onClick={handleClick}
                        className="text-primary hover:underline cursor-pointer"
                        rel="noopener noreferrer"
                      >
                        {children}
                      </a>
                    )
                  },
                  p: ({ children }) => <p>{renderMentions(children)}</p>,
                  li: ({ children }) => <li>{renderMentions(children)}</li>,
                  td: ({ children }) => <td>{renderMentions(children)}</td>,
                  code: ({ className, children, ...props }) => {
                    if (className) {
                      return (
                        <code className={className} {...props}>
                          {children}
                        </code>
                      )
                    }
                    return (
                      <code className="bg-bg-modifier-hover rounded px-1.5" {...props}>
                        {children}
                      </code>
                    )
                  },
                  pre: ({ children }) => <CodeBlockWithCopy>{children}</CodeBlockWithCopy>,
                }}
              >
                {markdownContent}
              </ReactMarkdown>
            </div>
          )
        )}

        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-col gap-2 mt-2">
            {message.attachments.map((att) =>
              isImageType(att.contentType) ? (
                <div key={att.id} className="relative">
                  <a
                    href={att.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block max-w-xs rounded-xl overflow-hidden border border-border-subtle"
                    onContextMenu={(e) => {
                      e.preventDefault()
                      setImageContextMenu({ x: e.clientX, y: e.clientY, att })
                    }}
                  >
                    <img src={att.url} alt={att.filename} className="max-h-60 object-contain" />
                  </a>
                  {imageContextMenu?.att.id === att.id &&
                    createPortal(
                      <ImageContextMenu
                        x={imageContextMenu.x}
                        y={imageContextMenu.y}
                        attachment={att}
                        onClose={() => setImageContextMenu(null)}
                        onSaveToWorkspace={
                          onSaveToWorkspace ? () => onSaveToWorkspace(att) : undefined
                        }
                      />,
                      document.body,
                    )}
                </div>
              ) : (
                <FileCard
                  key={att.id}
                  filename={att.filename}
                  url={att.url}
                  contentType={att.contentType}
                  size={att.size}
                  onClick={() => onPreviewFile?.(att)}
                  onSaveToWorkspace={onSaveToWorkspace ? () => onSaveToWorkspace(att) : undefined}
                />
              ),
            )}
          </div>
        )}

        {/* Interactive block (Phase 2 POC — buttons / select) */}
        {message.metadata?.interactive && (
          <InteractiveBlockRenderer
            block={message.metadata.interactive}
            messageId={message.id}
            disabled={message.sendStatus === 'sending'}
            submittedResponse={submittedInteractiveResponse}
          />
        )}

        {/* Reactions */}
        {message.reactions && message.reactions.length > 0 && (
          <div className={`flex flex-wrap gap-1 mt-1.5 ${isDmOwn ? 'justify-end' : ''}`}>
            {message.reactions.map((r) => (
              <Button
                variant="ghost"
                size="sm"
                key={r.emoji}
                onClick={() => onReact?.(message.id, r.emoji)}
                className={cn(
                  '!rounded-[10px] !h-[26px] !px-2 !font-normal !normal-case !tracking-normal !text-xs hover:!translate-y-0 transition-colors',
                  (r.userIds ?? []).includes(currentUserId)
                    ? 'bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20'
                    : 'bg-white/5 dark:bg-[#1A1D24]/50 border border-black/5 dark:border-white/5 text-text-secondary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/10',
                )}
              >
                <span className="mr-1">{r.emoji}</span>
                <span className="font-medium opacity-80">{r.count}</span>
              </Button>
            ))}
          </div>
        )}

        {/* Send status indicator — only show on failure */}
        {message.sendStatus === 'failed' && (
          <div className="flex items-center gap-1.5 mt-1 text-xs text-danger">
            <AlertCircle size={12} />
            <span>{t('chat.sendFailed', '发送失败')}</span>
            <button
              type="button"
              onClick={() => {
                const channelId = message.channelId ?? message.dmChannelId
                if (!channelId) return
                queryClient.setQueryData<InfiniteData<MessagesPage>>(
                  ['messages', channelId],
                  (old) => {
                    if (!old) return old
                    return {
                      ...old,
                      pages: old.pages.map((page) => ({
                        ...page,
                        messages: page.messages.filter((m) => m.id !== message.id),
                      })),
                    }
                  },
                )
                const tempId = `temp-${Date.now()}`
                const retryMsg = { ...message, id: tempId, sendStatus: 'sending' as const }
                queryClient.setQueryData<InfiniteData<MessagesPage>>(
                  ['messages', channelId],
                  (old) => {
                    if (!old || old.pages.length === 0) return old
                    const pages = [...old.pages]
                    const firstPage = pages[0]!
                    pages[0] = { ...firstPage, messages: [...firstPage.messages, retryMsg] }
                    return { ...old, pages }
                  },
                )
                fetchApi(`/api/channels/${channelId}/messages`, {
                  method: 'POST',
                  body: JSON.stringify({ content: message.content, replyToId: message.replyToId }),
                }).catch(() => {
                  queryClient.setQueryData<InfiniteData<MessagesPage>>(
                    ['messages', channelId],
                    (old) => {
                      if (!old) return old
                      return {
                        ...old,
                        pages: old.pages.map((page) => ({
                          ...page,
                          messages: page.messages.map((m) =>
                            m.id === tempId ? { ...m, sendStatus: 'failed' as const } : m,
                          ),
                        })),
                      }
                    },
                  )
                })
              }}
              className="ml-1 px-2 py-0.5 bg-danger/10 hover:bg-danger/20 rounded text-danger text-xs font-medium transition"
            >
              {t('chat.retry', '重试')}
            </button>
          </div>
        )}
      </div>

      {/* Hover actions — positioned absolutely within the message row to follow scroll */}
      {showActions && (
        <div
          ref={actionsRef}
          className="absolute flex items-center bg-white/90 dark:bg-[#1A1D24]/90 backdrop-blur-xl rounded-[14px] border border-black/5 dark:border-white/10 shadow-[0_4px_24px_rgba(0,0,0,0.08)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.4)] p-0.5 z-40 transition-all"
          style={isDmOwn ? { top: '-16px', left: '16px' } : { top: '-16px', right: '16px' }}
          onMouseEnter={activateHover}
          onMouseLeave={deactivateHover}
        >
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="!w-8 !h-8 !p-0 !rounded-[10px] !font-normal !normal-case !tracking-normal text-text-secondary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            title={t('chat.addEmoji')}
          >
            <Smile size={18} strokeWidth={2} />
          </Button>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => onReply?.(message.id)}
            className="!w-8 !h-8 !p-0 !rounded-[10px] !font-normal !normal-case !tracking-normal text-text-secondary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            title={t('chat.reply')}
          >
            <Reply size={18} strokeWidth={2} />
          </Button>
          <div className="relative">
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              className={`!w-8 !h-8 !p-0 !rounded-[10px] !font-normal !normal-case !tracking-normal transition-colors ${showMoreMenu ? 'bg-black/5 dark:bg-white/10 text-text-primary' : 'text-text-secondary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/10'}`}
              title={t('chat.more')}
            >
              <MoreHorizontal size={18} strokeWidth={2} />
            </Button>
            {/* More dropdown menu */}
            {showMoreMenu && (
              <div className="absolute top-[calc(100%+4px)] right-0 bg-white/95 dark:bg-[#1A1D24]/95 backdrop-blur-2xl rounded-[16px] border border-black/5 dark:border-white/10 shadow-[0_12px_48px_rgba(0,0,0,0.12)] dark:shadow-[0_12px_48px_rgba(0,0,0,0.5)] py-2 min-w-[180px] z-50 flex flex-col gap-0.5 px-1.5 animate-in fade-in zoom-in-95 duration-100 origin-top-right">
                {isOwn && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleEdit}
                    className="!w-full !justify-start !rounded-[10px] !font-medium !normal-case !tracking-normal !px-3 !py-2.5 !text-[14px] !h-auto text-text-primary hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                  >
                    <Pencil size={16} strokeWidth={2} className="mr-1.5 opacity-70" />
                    {t('chat.editMessage')}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopy}
                  className="!w-full !justify-start !rounded-[10px] !font-medium !normal-case !tracking-normal !px-3 !py-2.5 !text-[14px] !h-auto text-text-primary hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                >
                  <Copy size={16} strokeWidth={2} className="mr-1.5 opacity-70" />
                  {copied ? t('common.copied') : t('chat.copyMessage')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleShareLink}
                  className="!w-full !justify-start !rounded-[10px] !font-medium !normal-case !tracking-normal !px-3 !py-2.5 !text-[14px] !h-auto text-text-primary hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                >
                  <ExternalLink size={16} strokeWidth={2} className="mr-1.5 opacity-70" />
                  {t('chat.shareLink')}
                </Button>
                {onEnterSelectionMode && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowMoreMenu(false)
                      onEnterSelectionMode(message.id)
                    }}
                    className="!w-full !justify-start !rounded-[10px] !font-medium !normal-case !tracking-normal !px-3 !py-2.5 !text-[14px] !h-auto text-text-primary hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                  >
                    <CheckSquare size={16} strokeWidth={2} className="mr-1.5 opacity-70" />
                    {t('chat.selectMessages', '多选消息')}
                  </Button>
                )}
                {canDelete && (
                  <>
                    <div className="h-px bg-black/5 dark:bg-white/10 mx-2 my-1" />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleDelete}
                      className="!w-full !justify-start !rounded-[10px] !font-medium !normal-case !tracking-normal !px-3 !py-2.5 !text-[14px] !h-auto text-danger hover:!bg-danger/10 hover:text-danger transition-colors group"
                    >
                      <Trash2
                        size={16}
                        strokeWidth={2}
                        className="mr-1.5 opacity-80 group-hover:opacity-100"
                      />
                      {t('chat.deleteMessage')}
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Quick emoji picker — positioned absolutely within message row */}
      {showEmojiPicker && (
        <div
          className="absolute flex items-center bg-white/90 dark:bg-[#1A1D24]/90 backdrop-blur-xl rounded-[14px] border border-black/5 dark:border-white/10 shadow-[0_4px_24px_rgba(0,0,0,0.08)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.4)] p-0.5 z-40 transition-all"
          style={isDmOwn ? { top: '-44px', left: '16px' } : { top: '-44px', right: '16px' }}
          onMouseEnter={activateHover}
          onMouseLeave={() => {
            hoverTimeoutRef.current = setTimeout(() => {
              setIsHovered(false)
              setShowEmojiPicker(false)
            }, 150)
          }}
        >
          {quickEmojis.map((emoji) => (
            <Button
              variant="ghost"
              size="xs"
              key={emoji}
              onClick={() => {
                onReact?.(message.id, emoji)
                setShowEmojiPicker(false)
              }}
              className="!w-8 !h-8 !rounded-[10px] !px-0 !font-normal !normal-case !tracking-normal text-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            >
              {emoji}
            </Button>
          ))}
          <div className="w-px h-5 bg-black/5 dark:bg-white/10 mx-0.5 shrink-0" />
          <Button
            variant="ghost"
            size="xs"
            onClick={() => {
              setShowEmojiPicker(false)
              setShowFullPicker(true)
            }}
            className="!w-8 !h-8 !rounded-[10px] !px-0 !font-normal !normal-case !tracking-normal text-sm text-text-secondary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            title={t('chat.addEmoji')}
          >
            +
          </Button>
        </div>
      )}

      {/* Full emoji picker — still needs portal due to size and overflow */}
      {showFullPicker &&
        messageRef.current &&
        createPortal(
          (() => {
            const rect = messageRef.current.getBoundingClientRect()
            const top = Math.max(8, rect.top - 440)
            const fullPickerPosStyle = isDmOwn
              ? { top, left: rect.left + 16 }
              : { top, right: window.innerWidth - rect.right + 16 }
            return (
              <div
                className="fixed z-[70]"
                style={fullPickerPosStyle}
                onMouseLeave={() => {
                  setShowFullPicker(false)
                  hoverTimeoutRef.current = setTimeout(() => {
                    setIsHovered(false)
                  }, 150)
                }}
              >
                <EmojiPicker
                  onSelect={(emoji) => {
                    onReact?.(message.id, emoji)
                  }}
                  onClose={() => setShowFullPicker(false)}
                  position="bottom"
                />
              </div>
            )
          })(),
          document.body,
        )}

      {/* Avatar hover card (portal) */}
      {avatarHover &&
        !avatarPinned &&
        author &&
        avatarCardPos &&
        createPortal(
          <div
            className="fixed z-[80]"
            style={{ left: avatarCardPos.left, top: avatarCardPos.top }}
            onMouseEnter={() => {
              if (avatarHoverTimerRef.current) clearTimeout(avatarHoverTimerRef.current)
            }}
            onMouseLeave={handleAvatarMouseLeave}
          >
            <UserProfileCard
              user={author}
              role={(authorMember?.role as 'owner' | 'admin' | 'member') ?? null}
              ownerName={buddyAgent?.owner?.displayName ?? buddyAgent?.owner?.username}
              description={
                typeof buddyAgent?.config?.description === 'string'
                  ? buddyAgent.config.description
                  : undefined
              }
            />
          </div>,
          document.body,
        )}

      {/* Avatar pinned card (modal overlay) */}
      {avatarPinned &&
        avatarHover &&
        author &&
        createPortal(
          <div
            className="fixed inset-0 bg-bg-deep/60 flex items-center justify-center z-50"
            onClick={closeAvatarCard}
          >
            <div onClick={(e) => e.stopPropagation()}>
              <UserProfileCard
                user={author}
                role={(authorMember?.role as 'owner' | 'admin' | 'member') ?? null}
                ownerName={buddyAgent?.owner?.displayName ?? buddyAgent?.owner?.username}
                description={
                  typeof buddyAgent?.config?.description === 'string'
                    ? buddyAgent.config.description
                    : undefined
                }
              />
            </div>
          </div>,
          document.body,
        )}

      {/* Avatar right-click context menu */}
      {avatarContextMenu &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[60]"
              onClick={() => setAvatarContextMenu(null)}
              onContextMenu={(e) => {
                e.preventDefault()
                setAvatarContextMenu(null)
              }}
            />
            <div
              className="fixed z-[61] bg-bg-primary/95 backdrop-blur-xl rounded-[24px] border border-border-subtle shadow-[0_16px_64px_rgba(0,0,0,0.4)] py-1.5 min-w-[160px]"
              style={{ left: avatarContextMenu.x, top: avatarContextMenu.y }}
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setAvatarContextMenu(null)
                  handleAvatarClick()
                }}
                className="!w-full !justify-start !rounded-none !font-normal !normal-case !tracking-normal !px-3 !py-2 !text-sm !h-auto text-text-secondary hover:text-text-primary"
              >
                {t('member.viewProfile')}
              </Button>
              {canKick && author?.id !== currentUser?.id && authorMember?.role !== 'owner' && (
                <>
                  <div className="h-px bg-border-subtle my-1" />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      const name = author?.displayName ?? author?.username
                      const confirmKey = author?.isBot
                        ? 'member.removeBotConfirm'
                        : 'member.kickConfirm'
                      const titleKey = author?.isBot ? 'member.removeBot' : 'member.kickMember'
                      const ok = await useConfirmStore.getState().confirm({
                        title: t(titleKey),
                        message: t(confirmKey, { name }),
                      })
                      if (ok) {
                        fetchApi(`/api/servers/${activeServerId}/members/${author?.id}`, {
                          method: 'DELETE',
                        }).then(() => {
                          queryClient.invalidateQueries({
                            queryKey: ['members', activeServerId],
                          })
                        })
                      }
                      setAvatarContextMenu(null)
                    }}
                    className="!w-full !justify-start !rounded-none !font-normal !normal-case !tracking-normal !px-3 !py-2 !text-sm !h-auto text-danger hover:!bg-danger/10"
                  >
                    {author?.isBot ? t('member.removeBot') : t('member.kickMember')}
                  </Button>
                </>
              )}
            </div>
          </>,
          document.body,
        )}
    </div>
  )
}

/**
 * Phase 2 POC — renders interactive controls (buttons / select) attached to
 * a message and POSTs the user's choice to the server, which echoes a
 * follow-up reply that the buddy agent receives via normal chat flow.
 */
function InteractiveBlockRenderer({
  block,
  messageId,
  disabled,
  submittedResponse,
}: {
  block: InteractiveBlock
  messageId: string
  disabled?: boolean
  submittedResponse?: InteractiveResponseMetadata | null
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const activeChannelId = useChatStore((s) => s.activeChannelId)
  const [submitting, setSubmitting] = React.useState(false)
  const [done, setDone] = React.useState<string | null>(submittedResponse?.actionId ?? null)
  const [error, setError] = React.useState<string | null>(null)
  const submittingRef = React.useRef(false)

  React.useEffect(() => {
    if (submittedResponse?.actionId) {
      setDone(submittedResponse.actionId)
    }
  }, [submittedResponse?.actionId])

  const send = React.useCallback(
    async (actionId: string, value: string, label: string, values?: Record<string, string>) => {
      if (submittingRef.current || (block.oneShot !== false && done)) return
      submittingRef.current = true
      const previousDone = done
      setSubmitting(true)
      if (block.oneShot !== false) setDone(actionId)
      setError(null)
      try {
        await fetchApi(`/api/messages/${messageId}/interactive`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            blockId: block.id,
            actionId,
            value,
            label,
            ...(values ? { values } : {}),
          }),
        })
        setDone(actionId)
        if (activeChannelId) {
          queryClient.invalidateQueries({ queryKey: ['messages', activeChannelId] })
        }
      } catch (e) {
        if (block.oneShot !== false) setDone(previousDone)
        setError(e instanceof Error ? e.message : t('chat.interactiveSubmitFailed'))
      } finally {
        submittingRef.current = false
        setSubmitting(false)
      }
    },
    [activeChannelId, block.id, block.oneShot, done, messageId, queryClient, submitting, t],
  )

  const isLocked =
    disabled || submitting || (block.oneShot !== false && (done !== null || !!submittedResponse))

  return (
    <div className="mt-2 flex flex-col gap-2 rounded-lg border border-border-subtle bg-black/5 dark:bg-white/5 p-3">
      {block.prompt && (
        <div className="text-sm text-text-secondary whitespace-pre-wrap">{block.prompt}</div>
      )}

      {block.kind === 'buttons' && block.buttons && (
        <div className="flex flex-wrap gap-2">
          {block.buttons.map((b) => {
            const value = b.value ?? b.id
            const isPicked = done === b.id
            return (
              <Button
                key={b.id}
                size="sm"
                variant={
                  b.style === 'destructive'
                    ? 'danger'
                    : b.style === 'primary' || isPicked
                      ? 'primary'
                      : 'outline'
                }
                disabled={isLocked}
                onClick={() => send(b.id, value, b.label)}
              >
                {isPicked ? (
                  <>
                    <Check size={14} />
                    <span>{b.label}</span>
                  </>
                ) : (
                  b.label
                )}
              </Button>
            )
          })}
        </div>
      )}

      {block.kind === 'select' && block.options && (
        <select
          className="rounded-md border border-border-subtle bg-background px-2 py-1 text-sm"
          disabled={isLocked}
          value={done ?? ''}
          onChange={(e) => {
            const id = e.target.value
            if (!id) return
            const opt = block.options?.find((o) => o.id === id)
            if (opt) send(opt.id, opt.value, opt.label)
          }}
        >
          <option value="" disabled>
            {t('chat.interactiveChoose')}
          </option>
          {block.options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      )}

      {(block.kind === 'form' || block.kind === 'approval') && (
        <InteractiveFormBody
          block={block}
          isLocked={isLocked}
          submittedValues={submittedResponse?.values}
          onSubmit={(actionId, label, values) => send(actionId, actionId, label, values)}
        />
      )}

      {error && <div className="text-xs text-danger">{error}</div>}
    </div>
  )
}

/**
 * Renders a `kind: 'form' | 'approval'` block as a controlled mini-form.
 * - 'form': renders fields + Submit button (single action 'submit').
 * - 'approval': renders fields (typically a single comment textarea) + Approve / Reject pair.
 */
function InteractiveFormBody({
  block,
  isLocked,
  submittedValues,
  onSubmit,
}: {
  block: InteractiveBlock
  isLocked: boolean
  submittedValues?: Record<string, string>
  onSubmit: (actionId: string, label: string, values: Record<string, string>) => void
}) {
  const { t } = useTranslation()
  const initial = React.useMemo<Record<string, string>>(() => {
    const out: Record<string, string> = {}
    for (const f of block.fields ?? []) {
      out[f.id] =
        submittedValues?.[f.id] ?? f.defaultValue ?? (f.kind === 'checkbox' ? 'false' : '')
    }
    return out
  }, [block.fields, submittedValues])
  const [values, setValues] = React.useState<Record<string, string>>(initial)
  const [touched, setTouched] = React.useState(false)

  React.useEffect(() => {
    if (submittedValues) {
      setValues(initial)
    }
  }, [initial, submittedValues])

  const setField = (id: string, v: string) => setValues((prev) => ({ ...prev, [id]: v }))

  const missingRequired = (block.fields ?? []).some((f) => f.required && !values[f.id]?.trim())

  const submit = (actionId: string, label: string) => {
    if (isLocked) return
    setTouched(true)
    if (missingRequired) return
    onSubmit(actionId, label, values)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex max-h-80 flex-col gap-2 overflow-y-auto pr-1">
        {(block.fields ?? []).map((f) => {
          const v = values[f.id] ?? ''
          const showError = touched && f.required && !v.trim()
          return (
            <label key={f.id} className="flex flex-col gap-1 text-sm">
              <span className="text-text-secondary">
                {f.label}
                {f.required ? <span className="text-danger ml-0.5">*</span> : null}
              </span>
              {f.kind === 'textarea' ? (
                <textarea
                  className="rounded-md border border-border-subtle bg-background px-2 py-1 text-sm min-h-[60px]"
                  placeholder={f.placeholder}
                  maxLength={f.maxLength}
                  value={v}
                  disabled={isLocked}
                  onChange={(e) => setField(f.id, e.target.value)}
                />
              ) : f.kind === 'select' ? (
                <select
                  className="rounded-md border border-border-subtle bg-background px-2 py-1 text-sm"
                  value={v}
                  disabled={isLocked}
                  onChange={(e) => setField(f.id, e.target.value)}
                >
                  <option value="" disabled>
                    {t('chat.interactiveChoose')}
                  </option>
                  {(f.options ?? []).map((o) => (
                    <option key={o.id} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : f.kind === 'checkbox' ? (
                <input
                  type="checkbox"
                  className="self-start"
                  checked={v === 'true'}
                  disabled={isLocked}
                  onChange={(e) => setField(f.id, e.target.checked ? 'true' : 'false')}
                />
              ) : (
                <input
                  type={f.kind === 'number' ? 'number' : 'text'}
                  className="rounded-md border border-border-subtle bg-background px-2 py-1 text-sm"
                  placeholder={f.placeholder}
                  maxLength={f.maxLength}
                  min={f.min}
                  max={f.max}
                  value={v}
                  disabled={isLocked}
                  onChange={(e) => setField(f.id, e.target.value)}
                />
              )}
              {showError && (
                <span className="text-xs text-danger">{t('chat.interactiveRequired')}</span>
              )}
            </label>
          )
        })}
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        {block.kind === 'form' ? (
          <Button
            size="sm"
            variant="primary"
            disabled={isLocked}
            onClick={() => submit('submit', block.submitLabel ?? t('chat.interactiveSubmit'))}
          >
            {block.submitLabel ?? t('chat.interactiveSubmit')}
          </Button>
        ) : (
          <>
            <Button
              size="sm"
              variant="primary"
              disabled={isLocked}
              onClick={() => submit('approve', t('chat.interactiveApprove'))}
            >
              <Check size={14} />
              <span>{t('chat.interactiveApprove')}</span>
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={isLocked}
              onClick={() => submit('reject', t('chat.interactiveReject'))}
            >
              <X size={14} />
              <span>{t('chat.interactiveReject')}</span>
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

function interactiveValuesEqual(
  prev?: Record<string, string>,
  next?: Record<string, string>,
): boolean {
  const prevKeys = Object.keys(prev ?? {})
  const nextKeys = Object.keys(next ?? {})
  if (prevKeys.length !== nextKeys.length) return false
  for (const key of prevKeys) {
    if (prev?.[key] !== next?.[key]) return false
  }
  return true
}

function interactiveResponseEqual(
  prev?: InteractiveResponseMetadata | null,
  next?: InteractiveResponseMetadata | null,
): boolean {
  if (!prev && !next) return true
  if (!prev || !next) return false
  return (
    prev.blockId === next.blockId &&
    prev.sourceMessageId === next.sourceMessageId &&
    prev.actionId === next.actionId &&
    prev.value === next.value &&
    prev.submissionId === next.submissionId &&
    prev.responseMessageId === next.responseMessageId &&
    interactiveValuesEqual(prev.values, next.values)
  )
}

/** Memoized MessageBubble — prevents unnecessary re-renders when props haven't changed. */
export const MessageBubble = React.memo(MessageBubbleInner, (prev, next) => {
  // Shallow compare all props. For stable references from parent (useCallback),
  // this prevents re-rendering when sibling messages update.
  if (prev.message.id !== next.message.id) return false
  if (prev.message.content !== next.message.content) return false
  if (prev.message.isEdited !== next.message.isEdited) return false
  if (prev.message.sendStatus !== next.message.sendStatus) return false
  if (prev.message.updatedAt !== next.message.updatedAt) return false
  if (prev.currentUserId !== next.currentUserId) return false
  if (prev.variant !== next.variant) return false
  if (prev.highlight !== next.highlight) return false
  if (prev.isGrouped !== next.isGrouped) return false
  if (prev.selectionMode !== next.selectionMode) return false
  if (prev.isSelected !== next.isSelected) return false
  if (
    !interactiveResponseEqual(prev.submittedInteractiveResponse, next.submittedInteractiveResponse)
  ) {
    return false
  }

  // Deep compare reactions (frequently updated via WS)
  const prevReactions = prev.message.reactions
  const nextReactions = next.message.reactions
  if (prevReactions?.length !== nextReactions?.length) return false
  if (prevReactions && nextReactions) {
    for (let i = 0; i < prevReactions.length; i++) {
      const prevReaction = prevReactions[i]
      const nextReaction = nextReactions[i]
      if (!prevReaction || !nextReaction) return false
      if (prevReaction.emoji !== nextReaction.emoji) return false
      if (prevReaction.count !== nextReaction.count) return false
    }
  }

  // Deep compare replyToMessage
  if (prev.replyToMessage?.id !== next.replyToMessage?.id) return false
  if (prev.replyToMessage?.content !== next.replyToMessage?.content) return false

  // Deep compare attachments
  const prevAtt = prev.message.attachments
  const nextAtt = next.message.attachments
  if (prevAtt?.length !== nextAtt?.length) return false
  if (prevAtt && nextAtt) {
    for (let i = 0; i < prevAtt.length; i++) {
      const prevAttachment = prevAtt[i]
      const nextAttachment = nextAtt[i]
      if (!prevAttachment || !nextAttachment) return false
      if (prevAttachment.id !== nextAttachment.id) return false
      if (prevAttachment.url !== nextAttachment.url) return false
    }
  }

  return true
})

MessageBubble.displayName = 'MessageBubble'

/* ── MentionSpan — @username with hover card ──────────────── */

interface MemberUser {
  id: string
  username: string
  displayName: string
  avatarUrl: string | null
  status: string
  isBot: boolean
}

interface MemberEntry {
  id: string
  userId: string
  role: string
  user?: MemberUser
}

interface BuddyAgentEntry {
  id: string
  ownerId: string
  config?: Record<string, unknown>
  owner?: {
    id: string
    username: string
    displayName: string | null
  } | null
  botUser?: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
  } | null
}

function MentionSpan({ mention, label }: { mention: string; label?: string }) {
  const { t } = useTranslation()
  const [showCard, setShowCard] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [cardPos, setCardPos] = useState<{ left: number; top: number } | null>(null)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const spanRef = useRef<HTMLSpanElement>(null)
  const { activeServerId } = useChatStore()
  const currentUser = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()

  const username = mention.startsWith('@') ? mention.slice(1) : undefined

  // Look up user from cached members query
  const members = queryClient.getQueryData<MemberEntry[]>(['members', activeServerId]) ?? []
  const member = members.find(
    (m) => m.user?.username === username || m.user?.displayName === username,
  )
  const user = member?.user

  // Buddy metadata
  const buddyAgentsList =
    queryClient.getQueryData<BuddyAgentEntry[]>(['members-buddy-agents', activeServerId]) ?? []
  const buddyAgent = user?.isBot
    ? buddyAgentsList.find((a: BuddyAgentEntry) => a.botUser?.id === user.id)
    : undefined

  // Current user's role for kick/remove ability
  const currentMember = members.find((m: MemberEntry) => m.userId === currentUser?.id)
  const canKick = currentMember?.role === 'owner' || currentMember?.role === 'admin'

  const computeCardPos = () => {
    if (!spanRef.current) return
    const rect = spanRef.current.getBoundingClientRect()
    setCardPos({
      left: rect.left,
      top: Math.max(8, rect.top - 280),
    })
  }

  const handleMouseEnter = () => {
    if (pinned) return
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      computeCardPos()
      setShowCard(true)
    }, 300)
  }

  const handleMouseLeave = () => {
    if (pinned) return
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setShowCard(false), 200)
  }

  const handleClick = () => {
    if (user) {
      setPinned(true)
      setShowCard(true)
      computeCardPos()
    }
  }

  const handleClose = () => {
    setPinned(false)
    setShowCard(false)
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY })
  }

  return (
    <>
      <span
        ref={spanRef}
        className="relative inline-block bg-primary/20 text-primary rounded px-1 cursor-pointer hover:bg-primary/30 transition"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      >
        {label ?? mention}
      </span>

      {/* Hover card (portal to body to avoid clipping) */}
      {showCard &&
        !pinned &&
        user &&
        cardPos &&
        createPortal(
          <div
            className="fixed z-[80]"
            style={{ left: cardPos.left, top: cardPos.top }}
            onMouseEnter={() => {
              if (timeoutRef.current) clearTimeout(timeoutRef.current)
            }}
            onMouseLeave={handleMouseLeave}
          >
            <UserProfileCard
              user={user}
              role={(member?.role as 'owner' | 'admin' | 'member') ?? null}
              ownerName={buddyAgent?.owner?.displayName ?? buddyAgent?.owner?.username}
              description={
                typeof buddyAgent?.config?.description === 'string'
                  ? buddyAgent.config.description
                  : undefined
              }
            />
          </div>,
          document.body,
        )}

      {/* Pinned profile card as a centered overlay */}
      {pinned &&
        showCard &&
        user &&
        createPortal(
          <div
            className="fixed inset-0 bg-bg-deep/60 flex items-center justify-center z-50"
            onClick={handleClose}
          >
            <div onClick={(e) => e.stopPropagation()}>
              <UserProfileCard
                user={user}
                role={(member?.role as 'owner' | 'admin' | 'member') ?? null}
                ownerName={buddyAgent?.owner?.displayName ?? buddyAgent?.owner?.username}
                description={
                  typeof buddyAgent?.config?.description === 'string'
                    ? buddyAgent.config.description
                    : undefined
                }
              />
            </div>
          </div>,
          document.body,
        )}

      {/* Right-click context menu */}
      {ctxMenu &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[60]"
              onClick={() => setCtxMenu(null)}
              onContextMenu={(e) => {
                e.preventDefault()
                setCtxMenu(null)
              }}
            />
            <div
              className="fixed z-[61] bg-white/95 dark:bg-[#1A1D24]/95 backdrop-blur-2xl rounded-[16px] border border-black/5 dark:border-white/10 shadow-[0_12px_48px_rgba(0,0,0,0.12)] dark:shadow-[0_12px_48px_rgba(0,0,0,0.5)] py-2 min-w-[180px] animate-in fade-in zoom-in-95 duration-100 flex flex-col gap-0.5 px-1.5"
              style={{ left: ctxMenu.x, top: ctxMenu.y }}
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCtxMenu(null)
                  handleClick()
                }}
                className="!w-full !justify-start !rounded-[10px] !font-medium !normal-case !tracking-normal !px-3 !py-2.5 !text-[14px] !h-auto text-text-primary hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              >
                {t('member.viewProfile')}
              </Button>
              {canKick && user?.id !== currentUser?.id && member?.role !== 'owner' && (
                <>
                  <div className="h-px bg-black/5 dark:bg-white/10 mx-2 my-1 shrink-0" />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      const name = user?.displayName ?? user?.username
                      const confirmKey = user?.isBot
                        ? 'member.removeBotConfirm'
                        : 'member.kickConfirm'
                      const titleKey = user?.isBot ? 'member.removeBot' : 'member.kickMember'
                      const ok = await useConfirmStore.getState().confirm({
                        title: t(titleKey),
                        message: t(confirmKey, { name }),
                      })
                      if (ok) {
                        fetchApi(`/api/servers/${activeServerId}/members/${user?.id}`, {
                          method: 'DELETE',
                        }).then(() => {
                          queryClient.invalidateQueries({
                            queryKey: ['members', activeServerId],
                          })
                        })
                      }
                      setCtxMenu(null)
                    }}
                    className="!w-full !justify-start !rounded-[10px] !font-medium !normal-case !tracking-normal !px-3 !py-2.5 !text-[14px] !h-auto text-danger hover:!bg-danger/10 hover:text-danger transition-colors group"
                  >
                    {user?.isBot ? t('member.removeBot') : t('member.kickMember')}
                  </Button>
                </>
              )}
            </div>
          </>,
          document.body,
        )}
    </>
  )
}
