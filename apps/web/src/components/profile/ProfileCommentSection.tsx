import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { MessageSquare, MoreHorizontal, Reply, Send, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../lib/api'
import { showToast } from '../../lib/toast'
import { useAuthStore } from '../../stores/auth.store'
import { UserAvatar } from '../common/avatar'

interface Reaction {
  emoji: string
  count: number
  reacted: boolean
}

interface Comment {
  id: string
  profileUserId: string
  authorId: string
  content: string
  parentId: string | null
  createdAt: string
  updatedAt: string
  author: {
    id: string
    username: string
    displayName: string
    avatarUrl: string | null
    isBot: boolean
  }
  reactions: Reaction[]
  replyCount?: number
}

interface ReactionStats {
  emoji: string
  count: number
}

const ALLOWED_EMOJIS = ['👍', '👎', '❤️', '😂', '🎉', '👀', '🔥', '👣', '🙏', '💪'] as const

interface ProfileCommentSectionProps {
  profileUserId: string
}

export function ProfileCommentSection({ profileUserId }: ProfileCommentSectionProps) {
  const { t } = useTranslation()
  const currentUser = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()
  const [newComment, setNewComment] = useState('')
  const [replyTo, setReplyTo] = useState<Comment | null>(null)
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set())

  // Fetch comments
  const { data: comments = [], isLoading } = useQuery({
    queryKey: ['profile-comments', profileUserId],
    queryFn: () => fetchApi<Comment[]>(`/api/profile-comments/${profileUserId}`),
    enabled: !!profileUserId,
  })

  // Fetch reaction stats
  const { data: reactionStats = [] } = useQuery({
    queryKey: ['profile-reaction-stats', profileUserId],
    queryFn: () => fetchApi<ReactionStats[]>(`/api/profile-comments/${profileUserId}/stats`),
    enabled: !!profileUserId,
  })

  // Create comment mutation
  const createCommentMutation = useMutation({
    mutationFn: (data: { content: string; parentId?: string }) =>
      fetchApi<Comment>('/api/profile-comments', {
        method: 'POST',
        body: JSON.stringify({
          profileUserId,
          content: data.content,
          parentId: data.parentId,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile-comments', profileUserId] })
      setNewComment('')
      setReplyTo(null)
    },
    onError: (err: Error) => {
      showToast(err.message || t('common.error', '操作失败'), 'error')
    },
  })

  // Delete comment mutation
  const deleteCommentMutation = useMutation({
    mutationFn: (id: string) => fetchApi(`/api/profile-comments/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile-comments', profileUserId] })
    },
    onError: (err: Error) => {
      showToast(err.message || t('common.error', '操作失败'), 'error')
    },
  })

  // Add reaction mutation
  const addReactionMutation = useMutation({
    mutationFn: ({ commentId, emoji }: { commentId: string; emoji: string }) =>
      fetchApi(`/api/profile-comments/${commentId}/reactions`, {
        method: 'POST',
        body: JSON.stringify({ emoji }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile-comments', profileUserId] })
    },
  })

  // Remove reaction mutation
  const removeReactionMutation = useMutation({
    mutationFn: ({ commentId, emoji }: { commentId: string; emoji: string }) =>
      fetchApi(`/api/profile-comments/${commentId}/reactions`, {
        method: 'DELETE',
        body: JSON.stringify({ emoji }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile-comments', profileUserId] })
    },
  })

  const handleToggleReaction = (commentId: string, emoji: string, reacted: boolean) => {
    if (!currentUser) return
    if (reacted) {
      removeReactionMutation.mutate({ commentId, emoji })
    } else {
      addReactionMutation.mutate({ commentId, emoji })
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newComment.trim()) return
    createCommentMutation.mutate({
      content: newComment.trim(),
      parentId: replyTo?.id,
    })
  }

  const toggleReplies = (commentId: string) => {
    setExpandedReplies((prev) => {
      const next = new Set(prev)
      if (next.has(commentId)) {
        next.delete(commentId)
      } else {
        next.add(commentId)
      }
      return next
    })
  }

  return (
    <div className="mt-8 pt-6 border-t border-border-subtle">
      <div className="flex items-center gap-2 mb-4">
        <MessageSquare className="w-5 h-5 text-text-muted" />
        <h2 className="text-lg font-bold text-text-primary">{t('profile.comments', '留言板')}</h2>
        <span className="text-sm text-text-muted">({comments.length})</span>
      </div>

      {/* Reaction Stats */}
      {reactionStats.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4 p-3 bg-bg-tertiary rounded-lg">
          {reactionStats.map((stat) => (
            <div
              key={stat.emoji}
              className="flex items-center gap-1 px-2 py-1 bg-bg-secondary rounded-full"
            >
              <span className="text-lg">{stat.emoji}</span>
              <span className="text-sm font-medium text-text-secondary">{stat.count}</span>
            </div>
          ))}
        </div>
      )}

      {/* New Comment Form */}
      {currentUser && (
        <form onSubmit={handleSubmit} className="mb-6">
          {replyTo && (
            <div className="flex items-center gap-2 mb-2 text-sm text-text-muted">
              <Reply className="w-4 h-4" />
              <span>
                {t('profile.replyingTo', '回复')} {replyTo.author.displayName}
              </span>
              <button
                type="button"
                onClick={() => setReplyTo(null)}
                className="text-text-muted hover:text-text-primary"
              >
                ✕
              </button>
            </div>
          )}
          <div className="flex gap-3">
            <UserAvatar
              userId={currentUser.id}
              avatarUrl={currentUser.avatarUrl}
              displayName={currentUser.displayName}
              size="sm"
            />
            <div className="flex-1 flex gap-2">
              <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder={t('profile.commentPlaceholder', '写下你的留言...')}
                className="flex-1 px-4 py-2 bg-bg-tertiary border border-border-dim rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary"
                maxLength={500}
              />
              <button
                type="submit"
                disabled={!newComment.trim() || createCommentMutation.isPending}
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Comments List */}
      {isLoading ? (
        <div className="text-center py-8 text-text-muted">{t('common.loading', '加载中...')}</div>
      ) : comments.length === 0 ? (
        <div className="text-center py-8 text-text-muted">
          {t('profile.noComments', '暂无留言，成为第一个留言的人吧！')}
        </div>
      ) : (
        <div className="space-y-4">
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              currentUserId={currentUser?.id ?? null}
              onReply={() => setReplyTo(comment)}
              onDelete={() => deleteCommentMutation.mutate(comment.id)}
              onToggleReaction={handleToggleReaction}
              showReplies={expandedReplies.has(comment.id)}
              onToggleReplies={() => toggleReplies(comment.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface CommentItemProps {
  comment: Comment
  currentUserId: string | null
  onReply: () => void
  onDelete: () => void
  onToggleReaction: (commentId: string, emoji: string, reacted: boolean) => void
  showReplies: boolean
  onToggleReplies: () => void
}

function CommentItem({
  comment,
  currentUserId,
  onReply,
  onDelete,
  onToggleReaction,
  showReplies,
  onToggleReplies,
}: CommentItemProps) {
  const { t } = useTranslation()
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const emojiPickerRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close emoji picker and menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false)
      }
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Fetch replies when expanded
  const { data: replies = [] } = useQuery({
    queryKey: ['profile-comment-replies', comment.id],
    queryFn: () => fetchApi<Comment[]>(`/api/profile-comments/replies/${comment.id}`),
    enabled: showReplies,
  })

  const isOwner = currentUserId === comment.authorId

  return (
    <div className="group">
      <div className="flex gap-3 p-3 rounded-xl hover:bg-bg-modifier-hover transition">
        <UserAvatar
          userId={comment.author.id}
          avatarUrl={comment.author.avatarUrl}
          displayName={comment.author.displayName}
          size="sm"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-text-primary truncate">
              {comment.author.displayName}
            </span>
            {comment.author.isBot && (
              <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-medium">
                Buddy
              </span>
            )}
            <span className="text-xs text-text-muted">
              {formatDistanceToNow(new Date(comment.createdAt), {
                addSuffix: true,
                locale: zhCN,
              })}
            </span>
          </div>

          <p className="text-sm text-text-secondary whitespace-pre-wrap break-words">
            {comment.content}
          </p>

          {/* Reactions */}
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {/* Emoji picker button */}
            {currentUserId && (
              <div className="relative" ref={emojiPickerRef}>
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className="text-xs px-2 py-1 text-text-muted hover:text-text-secondary hover:bg-bg-tertiary rounded transition"
                >
                  +😊
                </button>
                {showEmojiPicker && (
                  <div className="absolute left-0 top-6 z-10 bg-bg-secondary border border-border-dim rounded-lg p-2 shadow-lg">
                    <div className="flex gap-1">
                      {ALLOWED_EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => {
                            onToggleReaction(comment.id, emoji, false)
                            setShowEmojiPicker(false)
                          }}
                          className="w-8 h-8 flex items-center justify-center hover:bg-bg-tertiary rounded transition"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Existing reactions */}
            {comment.reactions.map((reaction) => (
              <button
                key={reaction.emoji}
                type="button"
                onClick={() => onToggleReaction(comment.id, reaction.emoji, reaction.reacted)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition ${
                  reaction.reacted
                    ? 'bg-primary/20 text-primary'
                    : 'bg-bg-tertiary text-text-secondary hover:bg-bg-modifier-hover'
                }`}
              >
                <span>{reaction.emoji}</span>
                <span className="font-medium">{reaction.count}</span>
              </button>
            ))}

            {/* Reply button */}
            {currentUserId && (
              <button
                type="button"
                onClick={onReply}
                className="text-xs px-2 py-1 text-text-muted hover:text-text-secondary hover:bg-bg-tertiary rounded transition flex items-center gap-1"
              >
                <Reply className="w-3 h-3" />
                {t('profile.reply', '回复')}
              </button>
            )}

            {/* Reply count */}
            {comment.replyCount && comment.replyCount > 0 && (
              <button
                type="button"
                onClick={onToggleReplies}
                className="text-xs px-2 py-1 text-primary hover:underline transition"
              >
                {showReplies
                  ? t('profile.hideReplies', '收起回复')
                  : `${comment.replyCount} ${t('profile.replies', '条回复')}`}
              </button>
            )}
          </div>

          {/* Replies */}
          {showReplies && replies.length > 0 && (
            <div className="mt-3 space-y-3 pl-4 border-l-2 border-border-dim">
              {replies.map((reply) => (
                <div key={reply.id} className="flex gap-2">
                  <UserAvatar
                    userId={reply.author.id}
                    avatarUrl={reply.author.avatarUrl}
                    displayName={reply.author.displayName}
                    size="xs"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-text-primary truncate">
                        {reply.author.displayName}
                      </span>
                      <span className="text-xs text-text-muted">
                        {formatDistanceToNow(new Date(reply.createdAt), {
                          addSuffix: true,
                          locale: zhCN,
                        })}
                      </span>
                    </div>
                    <p className="text-sm text-text-secondary">{reply.content}</p>
                    {/* Reply reactions */}
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      {reply.reactions.map((reaction) => (
                        <button
                          key={reaction.emoji}
                          type="button"
                          onClick={() =>
                            onToggleReaction(reply.id, reaction.emoji, reaction.reacted)
                          }
                          className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition ${
                            reaction.reacted
                              ? 'bg-primary/20 text-primary'
                              : 'bg-bg-tertiary text-text-secondary hover:bg-bg-modifier-hover'
                          }`}
                        >
                          <span>{reaction.emoji}</span>
                          <span className="font-medium">{reaction.count}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions menu */}
        {isOwner && (
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setShowMenu(!showMenu)}
              className="opacity-0 group-hover:opacity-100 p-1 text-text-muted hover:text-text-primary transition"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-6 z-10 bg-bg-secondary border border-border-dim rounded-lg shadow-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => {
                    onDelete()
                    setShowMenu(false)
                  }}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 w-full"
                >
                  <Trash2 className="w-4 h-4" />
                  {t('common.delete', '删除')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
