import { useQueryClient } from '@tanstack/react-query'
import { format, formatDistanceToNow, type Locale } from 'date-fns'
import { enUS, ja, ko, zhCN, zhTW } from 'date-fns/locale'
import {
  Check,
  Copy,
  ExternalLink,
  MoreHorizontal,
  Pencil,
  Reply,
  Smile,
  Trash2,
  X,
} from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'
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
  attachments?: Attachment[]
}

interface MessageBubbleProps {
  message: Message
  currentUserId: string
  onReply?: (messageId: string) => void
  onReact?: (messageId: string, emoji: string) => void
  onMessageUpdate?: (msg: Message) => void
  onMessageDelete?: (msgId: string) => void
  onPreviewFile?: (attachment: Attachment) => void
  onSaveToWorkspace?: (attachment: Attachment) => void
  highlight?: boolean
  replyToMessage?: Message | null
}

const quickEmojis = ['👍', '❤️', '😂', '🎉', '🤔', '👀']

function isImageType(contentType: string): boolean {
  return contentType.startsWith('image/')
}

export function MessageBubble({
  message,
  currentUserId,
  onReply,
  onReact,
  onMessageUpdate,
  onMessageDelete,
  onPreviewFile,
  onSaveToWorkspace,
  highlight,
  replyToMessage,
}: MessageBubbleProps) {
  const { t, i18n } = useTranslation()
  const [showActions, setShowActions] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showFullPicker, setShowFullPicker] = useState(false)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [copied, setCopied] = useState(false)
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
      const updated = await fetchApi<Message>(`/api/messages/${message.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ content: editContent.trim() }),
      })
      onMessageUpdate?.(updated)
      setIsEditing(false)
    } catch {
      /* keep editing on error */
    }
  }, [editContent, message.id, message.content, onMessageUpdate])

  const handleDelete = useCallback(async () => {
    setShowMoreMenu(false)
    const ok = await useConfirmStore.getState().confirm({
      title: t('chat.deleteMessage'),
      message: t('chat.deleteConfirm'),
    })
    if (!ok) return
    try {
      await fetchApi(`/api/messages/${message.id}`, { method: 'DELETE' })
      onMessageDelete?.(message.id)
    } catch {
      /* ignore */
    }
  }, [message.id, onMessageDelete, t])

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

  // Look up member info from cache for role/buddy metadata
  const membersList = queryClient.getQueryData<MemberEntry[]>(['members', activeServerId]) ?? []
  const authorMember = membersList.find((m: MemberEntry) => m.userId === author?.id)
  const buddyAgentsList =
    queryClient.getQueryData<BuddyAgentEntry[]>(['members-buddy-agents', activeServerId]) ?? []
  const buddyAgent = author?.isBot
    ? buddyAgentsList.find((a: BuddyAgentEntry) => a.botUser?.id === author.id)
    : undefined
  const currentMember = membersList.find((m: MemberEntry) => m.userId === currentUser?.id)
  const canKick = currentMember?.role === 'owner' || currentMember?.role === 'admin'
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
   * Process React children to highlight @username mention patterns.
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

  return (
    <div
      ref={messageRef}
      id={`msg-${message.id}`}
      className={`group relative flex gap-4 px-4 py-1.5 message-row ${highlight ? 'bg-primary/10 animate-pulse' : 'mt-[2px]'}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => {
        if (!showMoreMenu) {
          setShowActions(false)
          setShowEmojiPicker(false)
          setShowFullPicker(false)
        }
      }}
      onTouchStart={() => {
        longPressTimerRef.current = setTimeout(() => {
          setShowActions(true)
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
      {/* Avatar container */}
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

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Reply reference */}
        {replyToMessage && (
          <button
            type="button"
            onClick={() => {
              const el = document.getElementById(`msg-${replyToMessage.id}`)
              el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }}
            className="flex items-center gap-1.5 mb-1 text-xs text-text-muted hover:text-text-secondary transition"
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
        <div className="flex items-baseline gap-2 leading-none mb-1">
          <span
            className={`font-medium text-[15px] hover:underline cursor-pointer ${author?.isBot ? 'text-primary' : 'text-text-primary'}`}
          >
            {author?.displayName ?? author?.username ?? t('common.unknownUser')}
          </span>
          {author?.isBot && (
            <span className="text-[10px] bg-[#5865F2] text-white px-1.5 py-0.5 rounded-[3px] font-semibold flex items-center gap-1">
              <Check size={8} className="text-white" />
              {t('common.bot')}
            </span>
          )}
          <span className="text-xs text-text-muted ml-0.5">{time}</span>
          {message.isEdited && (
            <span
              className="text-[10px] text-text-muted cursor-help"
              title={format(new Date(message.updatedAt ?? message.createdAt), 'PPpp', {
                locale: dateFnsLocaleMap[i18n.language] ?? zhCN,
              })}
            >
              {t('chat.edited')}
            </span>
          )}
        </div>

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
              className="w-full bg-bg-tertiary text-text-primary rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary resize-none"
              rows={Math.min(editContent.split('\n').length + 1, 8)}
            />
            <div className="flex items-center gap-2 mt-1 text-xs text-text-muted">
              <span>Esc {t('common.cancel')}</span>
              <span>·</span>
              <span>Enter {t('common.save')}</span>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="p-1 text-text-muted hover:text-text-primary transition"
              >
                <X size={14} />
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                className="p-1 text-primary hover:text-primary-hover transition"
              >
                <Check size={14} />
              </button>
            </div>
          </div>
        ) : (
          /* Markdown content — hide zero-width space placeholder for file-only messages */
          message.content &&
          message.content !== '\u200B' && (
            <div className="text-[15px] text-text-primary leading-[1.375] break-words msg-markdown pt-[2px]">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  img: ({ src, alt }) => (
                    <a href={src} target="_blank" rel="noopener noreferrer">
                      <img src={src} alt={alt ?? ''} loading="lazy" />
                    </a>
                  ),
                  a: ({ href, children }) => (
                    <a href={href} target="_blank" rel="noopener noreferrer">
                      {children}
                    </a>
                  ),
                  p: ({ children }) => <p>{renderMentions(children)}</p>,
                  li: ({ children }) => <li>{renderMentions(children)}</li>,
                  td: ({ children }) => <td>{renderMentions(children)}</td>,
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
                    className="block max-w-xs rounded-lg overflow-hidden border border-border-dim"
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

        {/* Reactions */}
        {message.reactions && message.reactions.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {message.reactions.map((r) => (
              <button
                type="button"
                key={r.emoji}
                onClick={() => onReact?.(message.id, r.emoji)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition ${
                  (r.userIds ?? []).includes(currentUserId)
                    ? 'bg-primary/20 border-primary/50 text-primary'
                    : 'bg-bg-tertiary border-border-subtle text-text-muted hover:border-border-dim'
                }`}
              >
                <span>{r.emoji}</span>
                <span>{r.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Hover actions (portal to avoid virtual list clipping) */}
      {/* Click-outside backdrop to close More menu */}
      {showMoreMenu &&
        createPortal(
          <div
            className="fixed inset-0 z-[69]"
            onClick={() => {
              setShowMoreMenu(false)
              setShowActions(false)
              setShowEmojiPicker(false)
              setShowFullPicker(false)
            }}
          />,
          document.body,
        )}

      {showActions &&
        messageRef.current &&
        createPortal(
          (() => {
            const rect = messageRef.current!.getBoundingClientRect()
            return (
              <div
                className="fixed flex items-center bg-bg-tertiary border border-border-dim rounded-lg shadow-lg z-[70]"
                style={{ top: rect.top - 6, right: window.innerWidth - rect.right + 16 }}
                onMouseEnter={() => setShowActions(true)}
                onMouseLeave={() => {
                  if (!showMoreMenu) {
                    setShowActions(false)
                    setShowEmojiPicker(false)
                    setShowFullPicker(false)
                  }
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className="p-1.5 text-text-muted hover:text-text-primary transition"
                  title={t('chat.addEmoji')}
                >
                  <Smile size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => onReply?.(message.id)}
                  className="p-1.5 text-text-muted hover:text-text-primary transition"
                  title={t('chat.reply')}
                >
                  <Reply size={16} />
                </button>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowMoreMenu(!showMoreMenu)}
                    className="p-1.5 text-text-muted hover:text-text-primary transition"
                    title={t('chat.more')}
                  >
                    <MoreHorizontal size={16} />
                  </button>
                  {/* More dropdown menu */}
                  {showMoreMenu && (
                    <div className="absolute top-full right-0 mt-1 bg-bg-tertiary border border-border-dim rounded-lg shadow-xl py-1 min-w-[160px] z-50">
                      {isOwn && (
                        <button
                          type="button"
                          onClick={handleEdit}
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-text-secondary hover:bg-bg-primary/50 hover:text-text-primary transition"
                        >
                          <Pencil size={14} />
                          {t('chat.editMessage')}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleCopy}
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-text-secondary hover:bg-bg-primary/50 hover:text-text-primary transition"
                      >
                        <Copy size={14} />
                        {copied ? t('common.copied') : t('chat.copyMessage')}
                      </button>
                      <button
                        type="button"
                        onClick={handleShareLink}
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-text-secondary hover:bg-bg-primary/50 hover:text-text-primary transition"
                      >
                        <ExternalLink size={14} />
                        {t('chat.shareLink')}
                      </button>
                      {canDelete && (
                        <>
                          <div className="h-px bg-border-subtle my-1" />
                          <button
                            type="button"
                            onClick={handleDelete}
                            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition"
                          >
                            <Trash2 size={14} />
                            {t('chat.deleteMessage')}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })(),
          document.body,
        )}

      {/* Quick emoji picker (portal) */}
      {showEmojiPicker &&
        messageRef.current &&
        createPortal(
          (() => {
            const rect = messageRef.current!.getBoundingClientRect()
            return (
              <div
                className="fixed flex items-center gap-1 bg-bg-tertiary border border-border-dim rounded-lg shadow-lg p-1 z-[70]"
                style={{ top: rect.top - 34, right: window.innerWidth - rect.right + 16 }}
                onMouseEnter={() => setShowActions(true)}
                onMouseLeave={() => {
                  setShowActions(false)
                  setShowEmojiPicker(false)
                }}
              >
                {quickEmojis.map((emoji) => (
                  <button
                    type="button"
                    key={emoji}
                    onClick={() => {
                      onReact?.(message.id, emoji)
                      setShowEmojiPicker(false)
                    }}
                    className="w-8 h-8 rounded hover:bg-bg-modifier-active flex items-center justify-center text-lg transition"
                  >
                    {emoji}
                  </button>
                ))}
                <div className="w-px h-6 bg-border-dim mx-0.5" />
                <button
                  type="button"
                  onClick={() => {
                    setShowEmojiPicker(false)
                    setShowFullPicker(true)
                  }}
                  className="w-8 h-8 rounded hover:bg-bg-modifier-active flex items-center justify-center text-sm text-text-muted transition"
                  title={t('chat.addEmoji')}
                >
                  +
                </button>
              </div>
            )
          })(),
          document.body,
        )}

      {/* Full emoji picker (portal) */}
      {showFullPicker &&
        messageRef.current &&
        createPortal(
          (() => {
            const rect = messageRef.current!.getBoundingClientRect()
            const top = Math.max(8, rect.top - 440)
            return (
              <div
                className="fixed z-[70]"
                style={{ top, right: window.innerWidth - rect.right + 16 }}
                onMouseLeave={() => {
                  setShowFullPicker(false)
                  setShowActions(false)
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
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
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
              className="fixed z-[61] bg-bg-tertiary border border-border-dim rounded-lg shadow-xl py-1 min-w-[160px]"
              style={{ left: avatarContextMenu.x, top: avatarContextMenu.y }}
            >
              <button
                type="button"
                onClick={() => {
                  setAvatarContextMenu(null)
                  handleAvatarClick()
                }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-text-secondary hover:bg-bg-primary/50 hover:text-text-primary transition"
              >
                {t('member.viewProfile')}
              </button>
              {canKick && author?.id !== currentUser?.id && authorMember?.role !== 'owner' && (
                <>
                  <div className="h-px bg-border-subtle my-1" />
                  <button
                    type="button"
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
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition"
                  >
                    {author?.isBot ? t('member.removeBot') : t('member.kickMember')}
                  </button>
                </>
              )}
            </div>
          </>,
          document.body,
        )}
    </div>
  )
}

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
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
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
              className="fixed z-[61] bg-bg-tertiary border border-border-dim rounded-lg shadow-xl py-1 min-w-[160px]"
              style={{ left: ctxMenu.x, top: ctxMenu.y }}
            >
              <button
                type="button"
                onClick={() => {
                  setCtxMenu(null)
                  handleClick()
                }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-text-secondary hover:bg-bg-primary/50 hover:text-text-primary transition"
              >
                {t('member.viewProfile')}
              </button>
              {canKick && user?.id !== currentUser?.id && member?.role !== 'owner' && (
                <>
                  <div className="h-px bg-border-subtle my-1" />
                  <button
                    type="button"
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
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition"
                  >
                    {user?.isBot ? t('member.removeBot') : t('member.kickMember')}
                  </button>
                </>
              )}
            </div>
          </>,
          document.body,
        )}
    </>
  )
}
