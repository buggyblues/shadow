import { formatDistanceToNow, type Locale } from 'date-fns'
import { enUS, ja, ko, zhCN, zhTW } from 'date-fns/locale'
import { MoreHorizontal, Paperclip, Reply, Smile } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { UserAvatar } from '../common/avatar'
import { EmojiPicker } from '../common/emoji-picker'

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
  author?: Author
  reactions?: ReactionGroup[]
  attachments?: Attachment[]
}

interface MessageBubbleProps {
  message: Message
  currentUserId: string
  onReply?: (messageId: string) => void
  onReact?: (messageId: string, emoji: string) => void
}

const quickEmojis = ['👍', '❤️', '😂', '🎉', '🤔', '👀']

function isImageType(contentType: string): boolean {
  return contentType.startsWith('image/')
}

export function MessageBubble({ message, currentUserId, onReply, onReact }: MessageBubbleProps) {
  const { t, i18n } = useTranslation()
  const [showActions, setShowActions] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showFullPicker, setShowFullPicker] = useState(false)

  const dateFnsLocaleMap: Record<string, Locale> = {
    'zh-CN': zhCN,
    'zh-TW': zhTW,
    en: enUS,
    ja,
    ko,
  }
  const author = message.author
  const time = formatDistanceToNow(new Date(message.createdAt), {
    locale: dateFnsLocaleMap[i18n.language] ?? zhCN,
    addSuffix: true,
  })

  return (
    <div
      className="group relative flex gap-3 px-4 py-1.5 hover:bg-white/[0.02] transition"
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => {
        setShowActions(false)
        setShowEmojiPicker(false)
        setShowFullPicker(false)
      }}
    >
      {/* Avatar */}
      <UserAvatar
        userId={author?.id}
        avatarUrl={author?.avatarUrl}
        displayName={author?.displayName ?? author?.username}
        size="md"
        className="mt-0.5"
      />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span
            className={`font-semibold text-sm ${author?.isBot ? 'text-primary' : 'text-text-primary'}`}
          >
            {author?.displayName ?? author?.username ?? t('common.unknownUser')}
          </span>
          {author?.isBot && (
            <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-medium">
              {t('common.bot')}
            </span>
          )}
          <span className="text-xs text-text-muted">{time}</span>
          {message.isEdited && (
            <span className="text-[10px] text-text-muted">{t('chat.edited')}</span>
          )}
        </div>

        {/* Markdown content */}
        <div className="text-sm text-text-secondary leading-relaxed break-words msg-markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
        </div>

        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {message.attachments.map((att) =>
              isImageType(att.contentType) ? (
                <a
                  key={att.id}
                  href={att.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block max-w-xs rounded-lg overflow-hidden border border-white/10"
                >
                  <img src={att.url} alt={att.filename} className="max-h-60 object-contain" />
                </a>
              ) : (
                <a
                  key={att.id}
                  href={att.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-tertiary border border-white/10 text-sm text-text-secondary hover:text-text-primary transition"
                >
                  <Paperclip size={14} className="shrink-0" />
                  <span className="truncate max-w-[200px]">{att.filename}</span>
                  <span className="text-xs text-text-muted shrink-0">
                    {(att.size / 1024).toFixed(0)} KB
                  </span>
                </a>
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
                  r.userIds.includes(currentUserId)
                    ? 'bg-primary/20 border-primary/50 text-primary'
                    : 'bg-bg-tertiary border-white/5 text-text-muted hover:border-white/10'
                }`}
              >
                <span>{r.emoji}</span>
                <span>{r.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Hover actions */}
      {showActions && (
        <div className="absolute -top-3 right-4 flex items-center bg-bg-tertiary border border-white/10 rounded-lg shadow-lg">
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
          <button
            type="button"
            className="p-1.5 text-text-muted hover:text-text-primary transition"
            title={t('chat.more')}
          >
            <MoreHorizontal size={16} />
          </button>
        </div>
      )}

      {/* Quick emoji picker */}
      {showEmojiPicker && (
        <div className="absolute -top-10 right-4 flex items-center gap-1 bg-bg-tertiary border border-white/10 rounded-lg shadow-lg p-1">
          {quickEmojis.map((emoji) => (
            <button
              type="button"
              key={emoji}
              onClick={() => {
                onReact?.(message.id, emoji)
                setShowEmojiPicker(false)
              }}
              className="w-8 h-8 rounded hover:bg-white/10 flex items-center justify-center text-lg transition"
            >
              {emoji}
            </button>
          ))}
          <div className="w-px h-6 bg-white/10 mx-0.5" />
          <button
            type="button"
            onClick={() => {
              setShowEmojiPicker(false)
              setShowFullPicker(true)
            }}
            className="w-8 h-8 rounded hover:bg-white/10 flex items-center justify-center text-sm text-text-muted transition"
            title={t('chat.addEmoji')}
          >
            +
          </button>
        </div>
      )}

      {/* Full emoji picker */}
      {showFullPicker && (
        <div className="absolute -top-[440px] right-4 z-50">
          <EmojiPicker
            onSelect={(emoji) => {
              onReact?.(message.id, emoji)
            }}
            onClose={() => setShowFullPicker(false)}
            position="bottom"
          />
        </div>
      )}
    </div>
  )
}
