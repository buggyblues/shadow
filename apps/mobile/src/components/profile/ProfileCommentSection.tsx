import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { MessageSquare, MoreHorizontal, Reply, Send, Trash2, X } from 'lucide-react-native'
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
    })
  }, [newComment, createCommentMutation])

  const handleCreateReply = useCallback(
    (parentId: string, content: string) => {
      createCommentMutation.mutate({
        content,
        parentId,
      })
    },
    [createCommentMutation],
  )

  const handleDeleteComment = useCallback(
    (id: string) => {
      deleteCommentMutation.mutate(id)
    },
    [deleteCommentMutation],
  )

  const renderComment = useCallback(
    ({ item }: { item: Comment }) => (
      <CommentItem
        comment={item}
        currentUserId={currentUser?.id ?? null}
        currentAvatarUrl={currentUser?.avatarUrl ?? null}
        currentDisplayName={currentUser?.displayName ?? ''}
        onDelete={handleDeleteComment}
        onToggleReaction={handleToggleReaction}
        onCreateReply={handleCreateReply}
        isSubmitting={createCommentMutation.isPending}
      />
    ),
    [
      currentUser,
      handleDeleteComment,
      handleToggleReaction,
      handleCreateReply,
      createCommentMutation.isPending,
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
          <View style={[styles.inputRow, { backgroundColor: colors.inputBackground }]}>
            <Avatar
              uri={currentUser.avatarUrl}
              name={currentUser.displayName ?? currentUser.username}
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
  const colors = useColors()
  const { t } = useTranslation()
  const [showMenu, setShowMenu] = useState(false)
  const [showReplies, setShowReplies] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showReplyInput, setShowReplyInput] = useState(false)
  const [replyContent, setReplyContent] = useState('')

  // Fetch replies when expanded
  const { data: replies = [] } = useQuery({
    queryKey: ['profile-comment-replies', comment.id],
    queryFn: () => fetchApi<Comment[]>(`/api/profile-comments/replies/${comment.id}`),
    enabled: showReplies,
  })

  const isOwner = currentUserId === comment.authorId

  const handleReplySubmit = useCallback(() => {
    if (!replyContent.trim()) return
    onCreateReply(comment.id, replyContent.trim())
    setReplyContent('')
    setShowReplyInput(false)
  }, [comment.id, replyContent, onCreateReply])

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
          {/* Header row */}
          <View style={styles.commentHeader}>
            <View style={styles.commentHeaderLeft}>
              <Text style={[styles.authorName, { color: colors.text }]} numberOfLines={1}>
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
            {/* Delete button - right side */}
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
                        onDelete(comment.id)
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

          <Text style={[styles.commentText, { color: colors.textSecondary }]}>
            {comment.content}
          </Text>

          {/* Reactions */}
          <View style={styles.reactionsRow}>
            {/* Emoji picker button */}
            {currentUserId && (
              <Pressable
                style={[styles.emojiBtn, { backgroundColor: colors.inputBackground }]}
                onPress={() => setShowEmojiPicker(!showEmojiPicker)}
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
                onPress={() => setShowReplyInput(!showReplyInput)}
              >
                <Reply size={14} color={colors.textMuted} />
              </Pressable>
            )}

            {/* Reply count */}
            {comment.replyCount && comment.replyCount > 0 && (
              <Pressable onPress={() => setShowReplies(!showReplies)}>
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
                    setShowEmojiPicker(false)
                  }}
                >
                  <Text style={styles.emojiOptionText}>{emoji}</Text>
                </Pressable>
              ))}
            </View>
          )}

          {/* Reply Input - Independent for each comment */}
          {showReplyInput && currentUserId && (
            <View style={styles.replyInputContainer}>
              <Avatar
                uri={currentAvatarUrl}
                name={currentDisplayName}
                size={28}
                userId={currentUserId}
              />
              <View
                style={[
                  styles.replyInputRow,
                  { backgroundColor: colors.inputBackground, borderColor: colors.border },
                ]}
              >
                <TextInput
                  style={[styles.replyInput, { color: colors.text }]}
                  value={replyContent}
                  onChangeText={setReplyContent}
                  placeholder={`${t('profile.replyTo', '回复')} ${comment.author.displayName}...`}
                  placeholderTextColor={colors.textMuted}
                  maxLength={500}
                  multiline
                />
                <Pressable
                  style={[
                    styles.replySendBtn,
                    { backgroundColor: replyContent.trim() ? colors.primary : 'transparent' },
                  ]}
                  onPress={handleReplySubmit}
                  disabled={!replyContent.trim() || isSubmitting}
                >
                  <Send size={16} color={replyContent.trim() ? '#fff' : colors.textMuted} />
                </Pressable>
                <Pressable
                  style={styles.replyCancelBtn}
                  onPress={() => {
                    setShowReplyInput(false)
                    setReplyContent('')
                  }}
                >
                  <X size={16} color={colors.textMuted} />
                </Pressable>
              </View>
            </View>
          )}

          {/* Replies */}
          {showReplies && replies.length > 0 && (
            <View style={[styles.repliesContainer, { borderLeftColor: colors.border }]}>
              {replies.map((reply) => (
                <ReplyItem
                  key={reply.id}
                  reply={reply}
                  currentUserId={currentUserId}
                  onToggleReaction={onToggleReaction}
                  onDelete={onDelete}
                />
              ))}
            </View>
          )}
        </View>
      </View>
    </View>
  )
}

interface ReplyItemProps {
  reply: Comment
  currentUserId: string | null
  onToggleReaction: (commentId: string, emoji: string, reacted: boolean) => void
  onDelete: (id: string) => void
}

function ReplyItem({ reply, currentUserId, onToggleReaction, onDelete }: ReplyItemProps) {
  const colors = useColors()
  const { t } = useTranslation()
  const [showMenu, setShowMenu] = useState(false)

  const isOwner = currentUserId === reply.authorId

  return (
    <View style={styles.replyItem}>
      <Avatar
        uri={reply.author.avatarUrl}
        name={reply.author.displayName}
        size={24}
        userId={reply.author.id}
      />
      <View style={styles.replyContent}>
        <View style={styles.replyHeader}>
          <View style={styles.replyHeaderLeft}>
            <Text style={[styles.replyAuthor, { color: colors.text }]}>
              {reply.author.displayName}
            </Text>
            {reply.author.isBot && (
              <View style={[styles.botBadgeSmall, { backgroundColor: `${colors.primary}20` }]}>
                <Text style={[styles.botBadgeSmallText, { color: colors.primary }]}>Buddy</Text>
              </View>
            )}
            <Text style={[styles.replyTime, { color: colors.textMuted }]}>
              {formatDistanceToNow(new Date(reply.createdAt), {
                addSuffix: true,
                locale: zhCN,
              })}
            </Text>
          </View>
          {/* Delete for reply owner */}
          {isOwner && (
            <View style={styles.replyMenuContainer}>
              <Pressable onPress={() => setShowMenu(!showMenu)}>
                <MoreHorizontal size={14} color={colors.textMuted} />
              </Pressable>
              {showMenu && (
                <View style={[styles.replyMenuDropdown, { backgroundColor: colors.surface }]}>
                  <Pressable
                    style={[styles.menuItem, { backgroundColor: colors.surfaceHover }]}
                    onPress={() => {
                      onDelete(reply.id)
                      setShowMenu(false)
                    }}
                  >
                    <Trash2 size={14} color="#ef4444" />
                    <Text style={[styles.menuItemText, { color: '#ef4444' }]}>
                      {t('common.delete', '删除')}
                    </Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}
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
                onPress={() => onToggleReaction(reply.id, reaction.emoji, reaction.reacted)}
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
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  commentHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flex: 1,
  },
  authorName: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    flexShrink: 1,
  },
  botBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 3,
    flexShrink: 0,
  },
  botBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  timeAgo: {
    fontSize: fontSize.xs,
    flexShrink: 0,
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
  replyInputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingLeft: spacing.xs,
  },
  replyInputRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  replyInput: {
    flex: 1,
    fontSize: fontSize.sm,
    minHeight: 28,
    maxHeight: 80,
    paddingVertical: spacing.xs,
  },
  replySendBtn: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  replyCancelBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
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
    justifyContent: 'space-between',
  },
  replyHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flex: 1,
  },
  replyAuthor: {
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  botBadgeSmall: {
    paddingHorizontal: 4,
    paddingVertical: 0,
    borderRadius: 2,
  },
  botBadgeSmallText: {
    fontSize: 9,
    fontWeight: '700',
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
    flexShrink: 0,
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
    minWidth: 80,
  },
  replyMenuContainer: {
    position: 'relative',
    flexShrink: 0,
  },
  replyMenuDropdown: {
    position: 'absolute',
    right: 0,
    top: 18,
    borderRadius: radius.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 5,
    overflow: 'hidden',
    minWidth: 70,
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
