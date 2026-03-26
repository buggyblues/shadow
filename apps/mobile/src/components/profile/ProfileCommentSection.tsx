import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { MessageSquare, MoreHorizontal, Reply, Send, Trash2 } from 'lucide-react-native'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { fetchApi } from '../../lib/api'
import { useAuthStore } from '../../stores/auth.store'
import { fontSize, radius, spacing, useColors } from '../../theme'
import { Avatar } from '../common/avatar'

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
  const colors = useColors()
  const currentUser = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()
  const [newComment, setNewComment] = useState('')
  const [replyTo, setReplyTo] = useState<Comment | null>(null)
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set())
  const [selectedCommentForEmoji, setSelectedCommentForEmoji] = useState<string | null>(null)

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
  })

  // Delete comment mutation
  const deleteCommentMutation = useMutation({
    mutationFn: (id: string) => fetchApi(`/api/profile-comments/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile-comments', profileUserId] })
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
      setSelectedCommentForEmoji(null)
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

  const handleToggleReaction = useCallback(
    (commentId: string, emoji: string, reacted: boolean) => {
      if (!currentUser) return
      if (reacted) {
        removeReactionMutation.mutate({ commentId, emoji })
      } else {
        addReactionMutation.mutate({ commentId, emoji })
      }
    },
    [currentUser, addReactionMutation, removeReactionMutation],
  )

  const handleSubmit = useCallback(() => {
    if (!newComment.trim()) return
    createCommentMutation.mutate({
      content: newComment.trim(),
      parentId: replyTo?.id,
    })
  }, [newComment, replyTo, createCommentMutation])

  const toggleReplies = useCallback((commentId: string) => {
    setExpandedReplies((prev) => {
      const next = new Set(prev)
      if (next.has(commentId)) {
        next.delete(commentId)
      } else {
        next.add(commentId)
      }
      return next
    })
  }, [])

  const renderComment = useCallback(
    ({ item }: { item: Comment }) => (
      <CommentItem
        comment={item}
        currentUserId={currentUser?.id ?? null}
        onReply={() => setReplyTo(item)}
        onDelete={() => deleteCommentMutation.mutate(item.id)}
        onToggleReaction={handleToggleReaction}
        showReplies={expandedReplies.has(item.id)}
        onToggleReplies={() => toggleReplies(item.id)}
        showEmojiPicker={selectedCommentForEmoji === item.id}
        onShowEmojiPicker={() =>
          setSelectedCommentForEmoji(selectedCommentForEmoji === item.id ? null : item.id)
        }
        onCloseEmojiPicker={() => setSelectedCommentForEmoji(null)}
      />
    ),
    [
      currentUser,
      deleteCommentMutation,
      handleToggleReaction,
      expandedReplies,
      toggleReplies,
      selectedCommentForEmoji,
    ],
  )

  return (
    <View style={[styles.container, { borderTopColor: `${colors.border}60` }]}>
      {/* Header */}
      <View style={styles.header}>
        <MessageSquare size={18} color={colors.textMuted} />
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {t('profile.comments', '留言板')}
        </Text>
        <Text style={[styles.headerCount, { color: colors.textMuted }]}>({comments.length})</Text>
      </View>

      {/* Reaction Stats */}
      {reactionStats.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.statsScroll}
          contentContainerStyle={styles.statsContent}
        >
          {reactionStats.map((stat) => (
            <View key={stat.emoji} style={[styles.statItem, { backgroundColor: colors.surface }]}>
              <Text style={styles.statEmoji}>{stat.emoji}</Text>
              <Text style={[styles.statCount, { color: colors.textSecondary }]}>{stat.count}</Text>
            </View>
          ))}
        </ScrollView>
      )}

      {/* New Comment Form */}
      {currentUser && (
        <View style={styles.inputContainer}>
          {replyTo && (
            <View style={[styles.replyIndicator, { backgroundColor: `${colors.primary}15` }]}>
              <Reply size={12} color={colors.primary} />
              <Text style={[styles.replyText, { color: colors.primary }]}>
                {t('profile.replyingTo', '回复')} {replyTo.author.displayName}
              </Text>
              <Pressable onPress={() => setReplyTo(null)}>
                <Text style={[styles.replyCancel, { color: colors.textMuted }]}>✕</Text>
              </Pressable>
            </View>
          )}
          <View style={[styles.inputRow, { backgroundColor: colors.inputBackground }]}>
            <Avatar
              uri={currentUser.avatarUrl}
              name={currentUser.displayName}
              size={32}
              userId={currentUser.id}
            />
            <TextInput
              style={[styles.input, { color: colors.text }]}
              value={newComment}
              onChangeText={setNewComment}
              placeholder={t('profile.commentPlaceholder', '写下你的留言...')}
              placeholderTextColor={colors.textMuted}
              maxLength={500}
              multiline
            />
            <Pressable
              style={[
                styles.sendBtn,
                {
                  backgroundColor: newComment.trim() ? colors.primary : colors.inputBackground,
                },
              ]}
              onPress={handleSubmit}
              disabled={!newComment.trim() || createCommentMutation.isPending}
            >
              {createCommentMutation.isPending ? (
                <ActivityIndicator size="small" color={colors.textMuted} />
              ) : (
                <Send size={18} color={newComment.trim() ? '#fff' : colors.textMuted} />
              )}
            </Pressable>
          </View>
        </View>
      )}

      {/* Comments List */}
      {isLoading ? (
        <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
      ) : comments.length === 0 ? (
        <Text style={[styles.emptyText, { color: colors.textMuted }]}>
          {t('profile.noComments', '暂无留言，成为第一个留言的人吧！')}
        </Text>
      ) : (
        <FlatList
          data={comments}
          renderItem={renderComment}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
        />
      )}
    </View>
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
  showEmojiPicker: boolean
  onShowEmojiPicker: () => void
  onCloseEmojiPicker: () => void
}

function CommentItem({
  comment,
  currentUserId,
  onReply,
  onDelete,
  onToggleReaction,
  showReplies,
  onToggleReplies,
  showEmojiPicker,
  onShowEmojiPicker,
  onCloseEmojiPicker,
}: CommentItemProps) {
  const colors = useColors()
  const { t } = useTranslation()
  const [showMenu, setShowMenu] = useState(false)

  // Fetch replies when expanded
  const { data: replies = [] } = useQuery({
    queryKey: ['profile-comment-replies', comment.id],
    queryFn: () => fetchApi<Comment[]>(`/api/profile-comments/replies/${comment.id}`),
    enabled: showReplies,
  })

  const isOwner = currentUserId === comment.authorId

  return (
    <View style={[styles.commentItem, { borderBottomColor: `${colors.border}30` }]}>
      <View style={styles.commentMain}>
        <Avatar
          uri={comment.author.avatarUrl}
          name={comment.author.displayName}
          size={36}
          userId={comment.author.id}
        />
        <View style={styles.commentContent}>
          <View style={styles.commentHeader}>
            <Text style={[styles.authorName, { color: colors.text }]}>
              {comment.author.displayName}
            </Text>
            {comment.author.isBot && (
              <View style={[styles.botBadge, { backgroundColor: `${colors.primary}20` }]}>
                <Text style={[styles.botBadgeText, { color: colors.primary }]}>Buddy</Text>
              </View>
            )}
            <Text style={[styles.timeAgo, { color: colors.textMuted }]}>
              {formatDistanceToNow(new Date(comment.createdAt), {
                addSuffix: true,
                locale: zhCN,
              })}
            </Text>
          </View>

          <Text style={[styles.commentText, { color: colors.textSecondary }]}>
            {comment.content}
          </Text>

          {/* Reactions */}
          <View style={styles.reactionsRow}>
            {/* Emoji picker button */}
            {currentUserId && (
              <Pressable
                style={[styles.emojiBtn, { backgroundColor: colors.inputBackground }]}
                onPress={onShowEmojiPicker}
              >
                <Text style={styles.emojiBtnText}>+😊</Text>
              </Pressable>
            )}

            {/* Existing reactions */}
            {comment.reactions.map((reaction) => (
              <Pressable
                key={reaction.emoji}
                style={[
                  styles.reactionBtn,
                  {
                    backgroundColor: reaction.reacted
                      ? `${colors.primary}20`
                      : colors.inputBackground,
                  },
                ]}
                onPress={() => onToggleReaction(comment.id, reaction.emoji, reaction.reacted)}
              >
                <Text style={styles.reactionEmoji}>{reaction.emoji}</Text>
                <Text
                  style={[
                    styles.reactionCount,
                    { color: reaction.reacted ? colors.primary : colors.textSecondary },
                  ]}
                >
                  {reaction.count}
                </Text>
              </Pressable>
            ))}

            {/* Reply button */}
            {currentUserId && (
              <Pressable
                style={[styles.actionBtn, { backgroundColor: colors.inputBackground }]}
                onPress={onReply}
              >
                <Reply size={14} color={colors.textMuted} />
              </Pressable>
            )}

            {/* Reply count */}
            {comment.replyCount && comment.replyCount > 0 && (
              <Pressable onPress={onToggleReplies}>
                <Text style={[styles.replyCountBtn, { color: colors.primary }]}>
                  {showReplies
                    ? t('profile.hideReplies', '收起回复')
                    : `${comment.replyCount} ${t('profile.replies', '条回复')}`}
                </Text>
              </Pressable>
            )}
          </View>

          {/* Emoji picker */}
          {showEmojiPicker && (
            <View style={[styles.emojiPicker, { backgroundColor: colors.surface }]}>
              {ALLOWED_EMOJIS.map((emoji) => (
                <Pressable
                  key={emoji}
                  style={styles.emojiOption}
                  onPress={() => {
                    onToggleReaction(comment.id, emoji, false)
                    onCloseEmojiPicker()
                  }}
                >
                  <Text style={styles.emojiOptionText}>{emoji}</Text>
                </Pressable>
              ))}
            </View>
          )}

          {/* Replies */}
          {showReplies && replies.length > 0 && (
            <View style={[styles.repliesContainer, { borderLeftColor: colors.border }]}>
              {replies.map((reply) => (
                <View key={reply.id} style={styles.replyItem}>
                  <Avatar
                    uri={reply.author.avatarUrl}
                    name={reply.author.displayName}
                    size={24}
                    userId={reply.author.id}
                  />
                  <View style={styles.replyContent}>
                    <View style={styles.replyHeader}>
                      <Text style={[styles.replyAuthor, { color: colors.text }]}>
                        {reply.author.displayName}
                      </Text>
                      <Text style={[styles.replyTime, { color: colors.textMuted }]}>
                        {formatDistanceToNow(new Date(reply.createdAt), {
                          addSuffix: true,
                          locale: zhCN,
                        })}
                      </Text>
                    </View>
                    <Text style={[styles.replyTextContent, { color: colors.textSecondary }]}>
                      {reply.content}
                    </Text>
                    {/* Reply reactions */}
                    {reply.reactions.length > 0 && (
                      <View style={styles.replyReactionsRow}>
                        {reply.reactions.map((reaction) => (
                          <Pressable
                            key={reaction.emoji}
                            style={[
                              styles.reactionBtnSmall,
                              {
                                backgroundColor: reaction.reacted
                                  ? `${colors.primary}20`
                                  : colors.inputBackground,
                              },
                            ]}
                            onPress={() =>
                              onToggleReaction(reply.id, reaction.emoji, reaction.reacted)
                            }
                          >
                            <Text style={styles.reactionEmojiSmall}>{reaction.emoji}</Text>
                            <Text
                              style={[
                                styles.reactionCountSmall,
                                { color: reaction.reacted ? colors.primary : colors.textMuted },
                              ]}
                            >
                              {reaction.count}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Actions menu */}
        {isOwner && (
          <View style={styles.menuContainer}>
            <Pressable style={styles.menuBtn} onPress={() => setShowMenu(!showMenu)}>
              <MoreHorizontal size={18} color={colors.textMuted} />
            </Pressable>
            {showMenu && (
              <View style={[styles.menuDropdown, { backgroundColor: colors.surface }]}>
                <Pressable
                  style={[styles.menuItem, { backgroundColor: colors.surfaceHover }]}
                  onPress={() => {
                    onDelete()
                    setShowMenu(false)
                  }}
                >
                  <Trash2 size={16} color="#ef4444" />
                  <Text style={[styles.menuItemText, { color: '#ef4444' }]}>
                    {t('common.delete', '删除')}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  headerCount: {
    fontSize: fontSize.sm,
  },
  statsScroll: {
    marginBottom: spacing.md,
  },
  statsContent: {
    gap: spacing.xs,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  statEmoji: {
    fontSize: fontSize.lg,
  },
  statCount: {
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  inputContainer: {
    marginBottom: spacing.md,
  },
  replyIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    marginBottom: spacing.xs,
  },
  replyText: {
    fontSize: fontSize.xs,
    flex: 1,
  },
  replyCancel: {
    fontSize: fontSize.sm,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.lg,
  },
  input: {
    flex: 1,
    fontSize: fontSize.md,
    minHeight: 36,
    maxHeight: 100,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loader: {
    marginVertical: spacing.xl,
  },
  emptyText: {
    textAlign: 'center',
    fontSize: fontSize.md,
    paddingVertical: spacing.xl,
  },
  commentItem: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  commentMain: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  commentContent: {
    flex: 1,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: 2,
  },
  authorName: {
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  botBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 3,
  },
  botBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  timeAgo: {
    fontSize: fontSize.xs,
    marginLeft: spacing.xs,
  },
  commentText: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  reactionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
    flexWrap: 'wrap',
  },
  emojiBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  emojiBtnText: {
    fontSize: fontSize.xs,
  },
  reactionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  reactionEmoji: {
    fontSize: fontSize.md,
  },
  reactionCount: {
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  actionBtn: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  replyCountBtn: {
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  emojiPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.lg,
  },
  emojiOption: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  emojiOptionText: {
    fontSize: fontSize.xl,
  },
  repliesContainer: {
    marginTop: spacing.sm,
    paddingLeft: spacing.md,
    borderLeftWidth: 2,
    gap: spacing.sm,
  },
  replyItem: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  replyContent: {
    flex: 1,
  },
  replyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  replyAuthor: {
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  replyTime: {
    fontSize: fontSize.xs,
  },
  replyTextContent: {
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  replyReactionsRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  reactionBtnSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  reactionEmojiSmall: {
    fontSize: fontSize.sm,
  },
  reactionCountSmall: {
    fontSize: 10,
    fontWeight: '600',
  },
  menuContainer: {
    position: 'relative',
  },
  menuBtn: {
    padding: spacing.xs,
  },
  menuDropdown: {
    position: 'absolute',
    right: 0,
    top: 28,
    borderRadius: radius.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
    overflow: 'hidden',
    minWidth: 100,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  menuItemText: {
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
})
