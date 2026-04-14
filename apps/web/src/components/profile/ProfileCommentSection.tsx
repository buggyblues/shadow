import { Button } from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { MessageSquare, MoreHorizontal, Reply, Send, Trash2, X } from 'lucide-react'
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
    })
  }

  const handleCreateReply = (parentId: string, content: string) => {
    createCommentMutation.mutate({
      content,
      parentId,
    })
  }

  const handleDeleteComment = (id: string) => {
    deleteCommentMutation.mutate(id)
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
          <div className="flex gap-3">
            <UserAvatar
              userId={currentUser.id}
              avatarUrl={currentUser.avatarUrl}
              displayName={currentUser.displayName ?? currentUser.username}
              size="sm"
            />
            <div className="flex-1 flex gap-2">
              <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder={t('profile.commentPlaceholder', '写下你的留言...')}
                className="flex-1 px-4 py-2 bg-bg-tertiary border border-border-subtle rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary"
                maxLength={500}
              />
              <Button
                variant="primary"
                size="sm"
                type="submit"
                disabled={!newComment.trim() || createCommentMutation.isPending}
              >
                <Send className="w-4 h-4" />
              </Button>
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
              currentAvatarUrl={currentUser?.avatarUrl ?? null}
              currentDisplayName={currentUser?.displayName ?? ''}
              onDelete={handleDeleteComment}
              onToggleReaction={handleToggleReaction}
              onCreateReply={handleCreateReply}
              isSubmitting={createCommentMutation.isPending}
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
  currentAvatarUrl: string | null
  currentDisplayName: string
  onDelete: (id: string) => void
  onToggleReaction: (commentId: string, emoji: string, reacted: boolean) => void
  onCreateReply: (parentId: string, content: string) => void
  isSubmitting: boolean
}

function CommentItem({
  comment,
  currentUserId,
  currentAvatarUrl,
  currentDisplayName,
  onDelete,
  onToggleReaction,
  onCreateReply,
  isSubmitting,
}: CommentItemProps) {
  const { t } = useTranslation()
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [showReplies, setShowReplies] = useState(false)
  const [showReplyInput, setShowReplyInput] = useState(false)
  const [replyContent, setReplyContent] = useState('')
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

  const handleReplySubmit = () => {
    if (!replyContent.trim()) return
    onCreateReply(comment.id, replyContent.trim())
    setReplyContent('')
    setShowReplyInput(false)
  }

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
          {/* Header with name, bot badge, time and delete button */}
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-text-primary truncate">
                {comment.author.displayName}
              </span>
              {comment.author.isBot && (
                <span className="text-[11px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-medium">
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
            {/* Delete button - always visible for owner, no wrap */}
            {isOwner && (
              <div className="relative shrink-0" ref={menuRef}>
                <button
                  type="button"
                  onClick={() => setShowMenu(!showMenu)}
                  className="p-1 text-text-muted hover:text-text-primary transition rounded hover:bg-bg-tertiary"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
                {showMenu && (
                  <div className="absolute right-0 top-6 z-10 bg-bg-secondary border border-border-subtle rounded-lg shadow-lg overflow-hidden min-w-[80px]">
                    <button
                      type="button"
                      onClick={() => {
                        onDelete(comment.id)
                        setShowMenu(false)
                      }}
                      className="flex items-center gap-2 px-3 py-2 text-sm text-danger hover:bg-danger/10 w-full whitespace-nowrap"
                    >
                      <Trash2 className="w-4 h-4" />
                      {t('common.delete', '删除')}
                    </button>
                  </div>
                )}
              </div>
            )}
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
                  <div className="absolute left-0 top-6 z-10 bg-bg-secondary border border-border-subtle rounded-lg p-2 shadow-lg">
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
                onClick={() => setShowReplyInput(!showReplyInput)}
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
                onClick={() => setShowReplies(!showReplies)}
                className="text-xs px-2 py-1 text-primary hover:underline transition"
              >
                {showReplies
                  ? t('profile.hideReplies', '收起回复')
                  : `${comment.replyCount} ${t('profile.replies', '条回复')}`}
              </button>
            )}
          </div>

          {/* Reply Input - Independent box for each comment */}
          {showReplyInput && currentUserId && (
            <div className="mt-3 pl-2">
              <div className="flex gap-2">
                <UserAvatar
                  userId={currentUserId}
                  avatarUrl={currentAvatarUrl}
                  displayName={currentDisplayName}
                  size="sm"
                />
                <div className="flex-1 flex gap-2">
                  <input
                    type="text"
                    value={replyContent}
                    onChange={(e) => setReplyContent(e.target.value)}
                    placeholder={`${t('profile.replyTo', '回复')} ${comment.author.displayName}...`}
                    className="flex-1 px-3 py-1.5 text-sm bg-bg-tertiary border border-border-subtle rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary"
                    maxLength={500}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleReplySubmit()
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleReplySubmit}
                    disabled={!replyContent.trim() || isSubmitting}
                    className="px-3 py-1.5 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition text-sm"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowReplyInput(false)
                      setReplyContent('')
                    }}
                    className="px-2 py-1.5 text-text-muted hover:text-text-primary transition"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Replies */}
          {showReplies && replies.length > 0 && (
            <div className="mt-3 space-y-3 pl-4 border-l-2 border-border-subtle">
              {replies.map((reply) => (
                <ReplyItem
                  key={reply.id}
                  reply={reply}
                  currentUserId={currentUserId}
                  onToggleReaction={onToggleReaction}
                  onDelete={onDelete}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface ReplyItemProps {
  reply: Comment
  currentUserId: string | null
  onToggleReaction: (commentId: string, emoji: string, reacted: boolean) => void
  onDelete: (id: string) => void
}

function ReplyItem({ reply, currentUserId, onToggleReaction, onDelete }: ReplyItemProps) {
  const { t } = useTranslation()
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const isOwner = currentUserId === reply.authorId

  return (
    <div className="flex gap-2 group">
      <UserAvatar
        userId={reply.author.id}
        avatarUrl={reply.author.avatarUrl}
        displayName={reply.author.displayName}
        size="xs"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-text-primary truncate">
              {reply.author.displayName}
            </span>
            {reply.author.isBot && (
              <span className="text-[11px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-medium">
                Buddy
              </span>
            )}
            <span className="text-xs text-text-muted">
              {formatDistanceToNow(new Date(reply.createdAt), {
                addSuffix: true,
                locale: zhCN,
              })}
            </span>
          </div>
          {/* Delete button for reply */}
          {isOwner && (
            <div className="relative shrink-0" ref={menuRef}>
              <button
                type="button"
                onClick={() => setShowMenu(!showMenu)}
                className="p-1 text-text-muted hover:text-text-primary transition opacity-0 group-hover:opacity-100"
              >
                <MoreHorizontal className="w-3 h-3" />
              </button>
              {showMenu && (
                <div className="absolute right-0 top-5 z-10 bg-bg-secondary border border-border-subtle rounded-lg shadow-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => {
                      onDelete(reply.id)
                      setShowMenu(false)
                    }}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-danger hover:bg-danger/10 w-full whitespace-nowrap"
                  >
                    <Trash2 className="w-3 h-3" />
                    {t('common.delete', '删除')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        <p className="text-sm text-text-secondary">{reply.content}</p>
        {/* Reply reactions */}
        {reply.reactions.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mt-1">
            {reply.reactions.map((reaction) => (
              <button
                key={reaction.emoji}
                type="button"
                onClick={() => onToggleReaction(reply.id, reaction.emoji, reaction.reacted)}
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
        )}
      </div>
    </div>
  )
}
