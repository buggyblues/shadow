import type { PortfolioWithOwner } from '@shadowob/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Image } from 'expo-image'
import {
  Bookmark,
  Eye,
  FileText,
  Heart,
  Lock,
  MessageCircle,
  Music,
  Play,
} from 'lucide-react-native'
import { useState } from 'react'
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { fetchApi, getImageUrl } from '../../lib/api'
import { useAuthStore } from '../../stores/auth.store'
import { fontSize, radius, spacing, useColors } from '../../theme'
import { Avatar } from '../common/avatar'

interface PortfolioGridProps {
  userId: string
  isOwner?: boolean
}

interface PortfolioItem extends PortfolioWithOwner {
  isLiked?: boolean
  isFavorited?: boolean
}

export function PortfolioGrid({ userId, isOwner = false }: PortfolioGridProps) {
  const colors = useColors()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['portfolio', userId],
    queryFn: () => fetchApi<{ items: PortfolioItem[] }>(`/api/users/${userId}/portfolio`),
    enabled: !!userId,
  })

  const numColumns = 2
  const gap = spacing.sm
  const screenWidth = Dimensions.get('window').width
  const itemSize = (screenWidth - spacing.md * 2 - gap * (numColumns - 1)) / numColumns

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.surface }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    )
  }

  if (!data?.items?.length) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: colors.surface }]}>
        <FileText size={32} color={colors.textMuted} />
        <Text style={[styles.emptyText, { color: colors.textMuted }]}>
          {isOwner ? 'No works yet' : 'No public works'}
        </Text>
      </View>
    )
  }

  const selectedItem = selectedId ? data.items.find((i) => i.id === selectedId) : null

  return (
    <>
      <FlatList
        data={data.items}
        keyExtractor={(item) => item.id}
        numColumns={numColumns}
        scrollEnabled={false}
        contentContainerStyle={{ gap }}
        columnWrapperStyle={{ gap }}
        renderItem={({ item }) => (
          <PortfolioCard portfolio={item} size={itemSize} onPress={() => setSelectedId(item.id)} />
        )}
      />

      {selectedItem && (
        <PortfolioDetailModal portfolio={selectedItem} onClose={() => setSelectedId(null)} />
      )}
    </>
  )
}

interface PortfolioCardProps {
  portfolio: PortfolioItem
  size: number
  onPress: () => void
}

function PortfolioCard({ portfolio, size, onPress }: PortfolioCardProps) {
  const colors = useColors()
  const isImage = portfolio.fileType.startsWith('image/')
  const isVideo = portfolio.fileType.startsWith('video/')
  const isPrivate = portfolio.visibility === 'private'
  const thumbnailUrl = getImageUrl(portfolio.thumbnailUrl || portfolio.fileUrl)

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.card,
        {
          width: size,
          height: size,
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
      ]}
    >
      {isImage && thumbnailUrl ? (
        <Image source={{ uri: thumbnailUrl }} style={styles.thumbnail} contentFit="cover" />
      ) : isVideo ? (
        <View style={[styles.thumbnail, { backgroundColor: colors.background }]}>
          {portfolio.thumbnailUrl && getImageUrl(portfolio.thumbnailUrl) && (
            <Image
              source={{ uri: getImageUrl(portfolio.thumbnailUrl)! }}
              style={styles.thumbnail}
              contentFit="cover"
            />
          )}
          <View style={styles.playOverlay}>
            <Play size={24} color="white" />
          </View>
        </View>
      ) : (
        <View style={[styles.filePlaceholder, { backgroundColor: colors.background }]}>
          <FileText size={24} color={colors.textMuted} />
        </View>
      )}

      {isPrivate && (
        <View style={styles.privateOverlay}>
          <Lock size={16} color={colors.textMuted} />
        </View>
      )}

      <View style={styles.cardInfo}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {portfolio.title || portfolio.fileName}
        </Text>
        <View style={styles.cardStats}>
          <Heart size={10} color="white" />
          <Text style={styles.cardStatText}>{portfolio.likeCount}</Text>
        </View>
      </View>
    </Pressable>
  )
}

interface PortfolioDetailModalProps {
  portfolio: PortfolioItem
  onClose: () => void
}

function PortfolioDetailModal({ portfolio, onClose }: PortfolioDetailModalProps) {
  const colors = useColors()
  const _currentUser = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()
  const [_commentText, _setCommentText] = useState('')

  const isImage = portfolio.fileType.startsWith('image/')
  const isVideo = portfolio.fileType.startsWith('video/')
  const isAudio = portfolio.fileType.startsWith('audio/')
  const fileUrl = getImageUrl(portfolio.fileUrl)

  // Record view
  useMutation({
    mutationFn: () => fetchApi(`/api/portfolios/${portfolio.id}/view`, { method: 'POST' }),
  }).mutate()

  // Like mutation
  const likeMutation = useMutation({
    mutationFn: () =>
      fetchApi<{ liked: boolean }>(`/api/portfolios/${portfolio.id}/like`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['portfolio'] }),
  })

  // Favorite mutation
  const favoriteMutation = useMutation({
    mutationFn: () =>
      fetchApi<{ favorited: boolean }>(`/api/portfolios/${portfolio.id}/favorite`, {
        method: 'POST',
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['portfolio'] }),
  })

  // Comments
  const { data: commentsData } = useQuery({
    queryKey: ['portfolio-comments', portfolio.id],
    queryFn: () =>
      fetchApi<{
        items: Array<{
          id: string
          content: string
          createdAt: string
          author: {
            id: string
            username: string
            displayName: string | null
            avatarUrl: string | null
          }
        }>
      }>(`/api/portfolios/${portfolio.id}/comments?limit=20`),
  })

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.8)' }]}>
        <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
          {/* Close button */}
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Text style={{ color: colors.text, fontSize: 24 }}>×</Text>
          </Pressable>

          {/* Preview */}
          <View style={styles.previewContainer}>
            {isImage && fileUrl ? (
              <Image source={{ uri: fileUrl }} style={styles.preview} contentFit="contain" />
            ) : isVideo ? (
              <View style={[styles.preview, { alignItems: 'center', justifyContent: 'center' }]}>
                <Play size={48} color={colors.text} />
              </View>
            ) : isAudio ? (
              <View style={[styles.preview, { alignItems: 'center', justifyContent: 'center' }]}>
                <Music size={48} color={colors.primary} />
              </View>
            ) : (
              <View style={[styles.preview, { alignItems: 'center', justifyContent: 'center' }]}>
                <FileText size={48} color={colors.textMuted} />
                <Text style={{ color: colors.textMuted, marginTop: spacing.sm }}>
                  {portfolio.fileName}
                </Text>
              </View>
            )}
          </View>

          {/* Info */}
          <ScrollView style={styles.infoScroll}>
            <View style={styles.infoSection}>
              <View style={styles.ownerRow}>
                <Avatar
                  uri={portfolio.owner.avatarUrl}
                  userId={portfolio.owner.id}
                  name={portfolio.owner.displayName || portfolio.owner.username}
                  size={32}
                />
                <View style={{ flex: 1, marginLeft: spacing.sm }}>
                  <Text style={{ color: colors.text, fontWeight: '600' }}>
                    {portfolio.owner.displayName || portfolio.owner.username}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: fontSize.xs }}>
                    {formatDate(portfolio.createdAt)}
                  </Text>
                </View>
              </View>

              {portfolio.title && (
                <Text style={[styles.title, { color: colors.text }]}>{portfolio.title}</Text>
              )}
              {portfolio.description && (
                <Text style={[styles.description, { color: colors.textSecondary }]}>
                  {portfolio.description}
                </Text>
              )}

              {/* Stats */}
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Eye size={16} color={colors.textMuted} />
                  <Text style={[styles.statText, { color: colors.textMuted }]}>
                    {portfolio.viewCount}
                  </Text>
                </View>
                <View style={styles.statItem}>
                  <Heart size={16} color={colors.textMuted} />
                  <Text style={[styles.statText, { color: colors.textMuted }]}>
                    {portfolio.likeCount}
                  </Text>
                </View>
                <View style={styles.statItem}>
                  <MessageCircle size={16} color={colors.textMuted} />
                  <Text style={[styles.statText, { color: colors.textMuted }]}>
                    {portfolio.commentCount}
                  </Text>
                </View>
              </View>

              {/* Actions */}
              <View style={styles.actionsRow}>
                <Pressable
                  onPress={() => likeMutation.mutate()}
                  style={[
                    styles.actionBtn,
                    { backgroundColor: portfolio.isLiked ? '#ef4444' + '20' : colors.surface },
                  ]}
                >
                  <Heart
                    size={20}
                    color={portfolio.isLiked ? '#ef4444' : colors.textSecondary}
                    fill={portfolio.isLiked ? '#ef4444' : 'transparent'}
                  />
                  <Text
                    style={{
                      color: portfolio.isLiked ? '#ef4444' : colors.textSecondary,
                      marginLeft: spacing.xs,
                    }}
                  >
                    Like
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => favoriteMutation.mutate()}
                  style={[
                    styles.actionBtn,
                    { backgroundColor: portfolio.isFavorited ? '#eab308' + '20' : colors.surface },
                  ]}
                >
                  <Bookmark
                    size={20}
                    color={portfolio.isFavorited ? '#eab308' : colors.textSecondary}
                    fill={portfolio.isFavorited ? '#eab308' : 'transparent'}
                  />
                  <Text
                    style={{
                      color: portfolio.isFavorited ? '#eab308' : colors.textSecondary,
                      marginLeft: spacing.xs,
                    }}
                  >
                    Save
                  </Text>
                </Pressable>
              </View>

              {/* Comments */}
              <View style={styles.commentsSection}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  Comments ({portfolio.commentCount})
                </Text>
                {commentsData?.items?.length ? (
                  commentsData.items.map((comment) => (
                    <View key={comment.id} style={styles.commentItem}>
                      <Avatar
                        uri={comment.author.avatarUrl}
                        userId={comment.author.id}
                        name={comment.author.displayName || comment.author.username}
                        size={28}
                      />
                      <View style={{ flex: 1, marginLeft: spacing.sm }}>
                        <Text
                          style={{ color: colors.text, fontWeight: '600', fontSize: fontSize.xs }}
                        >
                          {comment.author.displayName || comment.author.username}
                        </Text>
                        <Text style={{ color: colors.textSecondary, fontSize: fontSize.xs }}>
                          {comment.content}
                        </Text>
                      </View>
                    </View>
                  ))
                ) : (
                  <Text
                    style={{
                      color: colors.textMuted,
                      textAlign: 'center',
                      paddingVertical: spacing.md,
                    }}
                  >
                    No comments yet
                  </Text>
                )}
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  loadingContainer: {
    padding: spacing.xl,
    alignItems: 'center',
    borderRadius: radius.lg,
  },
  emptyContainer: {
    padding: spacing.xl * 2,
    alignItems: 'center',
    borderRadius: radius.lg,
  },
  emptyText: {
    marginTop: spacing.sm,
    fontSize: fontSize.sm,
  },
  card: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  filePlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  privateOverlay: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: radius.full,
    padding: spacing.xs,
  },
  cardInfo: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  cardTitle: {
    color: 'white',
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  cardStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: 4,
  },
  cardStatText: {
    color: 'white',
    fontSize: 10,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
    height: '85%',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  closeButton: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    zIndex: 10,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewContainer: {
    height: 280,
    backgroundColor: 'black',
  },
  preview: {
    width: '100%',
    height: '100%',
  },
  infoScroll: {
    flex: 1,
  },
  infoSection: {
    padding: spacing.md,
  },
  ownerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  description: {
    fontSize: fontSize.sm,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginBottom: spacing.md,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  statText: {
    fontSize: fontSize.sm,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
  },
  commentsSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.1)',
    paddingTop: spacing.md,
  },
  sectionTitle: {
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  commentItem: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
})
