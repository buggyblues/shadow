import { useMutation, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import * as Clipboard from 'expo-clipboard'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import * as Sharing from 'expo-sharing'
import {
  AlertCircle,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileArchive,
  FileCode,
  FileText,
  Film,
  Music,
  Pencil,
  RefreshCw,
  Reply,
  Save,
  Share2,
  Trash2,
  X,
} from 'lucide-react-native'
import { memo, useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import type { EmojiType } from 'rn-emoji-keyboard'
import RNEmojiPicker from 'rn-emoji-keyboard'
import { fetchApi, getImageUrl } from '../../lib/api'
import { useAuthStore } from '../../stores/auth.store'
import { fontSize, radius, spacing, useColors } from '../../theme'
import type { Attachment, Message } from '../../types/message'
import { Avatar } from '../common/avatar'
import { MarkdownRenderer } from './markdown-renderer'

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🎉', '🤔', '👀']

interface MessageBubbleProps {
  message: Message
  onReply: () => void
  onRetry?: (message: Message) => void
  channelId: string
  allMessages?: Message[]
  isGrouped?: boolean
  variant?: 'channel' | 'dm'
  dmChannelId?: string
}

function MessageBubbleInner({
  message,
  onReply,
  onRetry,
  channelId: _channelId,
  allMessages = [],
  isGrouped = false,
  variant = 'channel',
  dmChannelId,
}: MessageBubbleProps) {
  const { t } = useTranslation()
  const colors = useColors()
  const router = useRouter()
  const currentUser = useAuthStore((s) => s.user)
  const _queryClient = useQueryClient()
  const [showActions, setShowActions] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState(message.content)
  const [attachmentAction, setAttachmentAction] = useState<{
    url: string
    filename: string
  } | null>(null)
  const isOwn = currentUser?.id === message.authorId

  // Attachment long-press actions
  const handleAttachmentSave = useCallback(async () => {
    if (!attachmentAction) return
    const resolved = getImageUrl(attachmentAction.url) ?? attachmentAction.url
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(resolved)
      }
    } catch {
      Alert.alert(t('common.error', 'Error'), t('chat.saveFailed', 'Failed to save file'))
    }
    setAttachmentAction(null)
  }, [attachmentAction, t])

  const handleAttachmentShare = useCallback(async () => {
    if (!attachmentAction) return
    const resolved = getImageUrl(attachmentAction.url) ?? attachmentAction.url
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(resolved)
      }
    } catch {
      Alert.alert(t('common.error', 'Error'), t('chat.shareFailed', 'Failed to share file'))
    }
    setAttachmentAction(null)
  }, [attachmentAction, t])

  const handleAttachmentCopyUrl = useCallback(async () => {
    if (!attachmentAction) return
    const resolved = getImageUrl(attachmentAction.url) ?? attachmentAction.url
    await Clipboard.setStringAsync(resolved)
    setAttachmentAction(null)
  }, [attachmentAction])

  // Resolve reply reference
  const replyTarget = useMemo(() => {
    if (!message.replyToId) return null
    return allMessages.find((m) => m.id === message.replyToId) ?? null
  }, [message.replyToId, allMessages])

  const deleteMutation = useMutation({
    mutationFn: () =>
      variant === 'dm' && dmChannelId
        ? fetchApi(`/api/dm/channels/${dmChannelId}/messages/${message.id}`, { method: 'DELETE' })
        : fetchApi(`/api/messages/${message.id}`, { method: 'DELETE' }),
  })

  const editMutation = useMutation({
    mutationFn: (content: string) =>
      variant === 'dm' && dmChannelId
        ? fetchApi(`/api/dm/channels/${dmChannelId}/messages/${message.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ content }),
          })
        : fetchApi(`/api/messages/${message.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ content }),
          }),
    onSuccess: () => setIsEditing(false),
  })

  const reactionMutation = useMutation({
    mutationFn: (emoji: string) =>
      variant === 'dm'
        ? fetchApi(`/api/dm/messages/${message.id}/reactions`, {
            method: 'POST',
            body: JSON.stringify({ emoji }),
          })
        : fetchApi(`/api/messages/${message.id}/reactions`, {
            method: 'POST',
            body: JSON.stringify({ emoji }),
          }),
  })

  const handleLongPress = () => setShowActions(true)

  const handleCopy = async () => {
    await Clipboard.setStringAsync(message.content)
    setShowActions(false)
  }

  const handleDelete = () => {
    Alert.alert(t('chat.deleteMessage'), t('chat.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => deleteMutation.mutate() },
    ])
    setShowActions(false)
  }

  const handleEdit = () => {
    setEditText(message.content)
    setIsEditing(true)
    setShowActions(false)
  }

  const handleSaveEdit = () => {
    const trimmed = editText.trim()
    if (trimmed && trimmed !== message.content) {
      editMutation.mutate(trimmed)
    } else {
      setIsEditing(false)
    }
  }

  const handleReaction = (emoji: string) => {
    reactionMutation.mutate(emoji)
    setShowActions(false)
  }

  const displayName = message.author?.displayName || message.author?.username || '?'
  const timeAgo = formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })
  const isBot = message.author?.isBot ?? false

  const getAttachmentContentType = (att: Attachment) =>
    att.contentType ?? att.mimeType ?? 'application/octet-stream'

  const isImageAtt = (att: Attachment) => getAttachmentContentType(att).startsWith('image/')

  const getFileIcon = (contentType: string) => {
    if (contentType.startsWith('audio/')) return Music
    if (contentType.startsWith('video/')) return Film
    if (
      contentType.includes('zip') ||
      contentType.includes('archive') ||
      contentType.includes('tar') ||
      contentType.includes('rar')
    )
      return FileArchive
    if (
      contentType.includes('json') ||
      contentType.includes('javascript') ||
      contentType.includes('typescript') ||
      contentType.includes('xml') ||
      contentType.includes('html') ||
      contentType.includes('css') ||
      contentType.includes('python') ||
      contentType.includes('java') ||
      contentType.includes('ruby') ||
      contentType.includes('go') ||
      contentType.includes('rust') ||
      contentType.includes('swift') ||
      contentType.includes('kotlin')
    )
      return FileCode
    return FileText
  }

  const getFileAccentColor = (contentType: string) => {
    if (contentType.startsWith('audio/')) return '#E879F9'
    if (contentType.startsWith('video/')) return '#F97316'
    if (
      contentType.includes('zip') ||
      contentType.includes('archive') ||
      contentType.includes('tar') ||
      contentType.includes('rar')
    )
      return '#FBBF24'
    if (contentType.includes('pdf')) return '#EF4444'
    if (
      contentType.includes('json') ||
      contentType.includes('javascript') ||
      contentType.includes('typescript') ||
      contentType.includes('xml') ||
      contentType.includes('html') ||
      contentType.includes('css') ||
      contentType.includes('python') ||
      contentType.includes('java')
    )
      return '#22D3EE'
    if (
      contentType.includes('word') ||
      contentType.includes('document') ||
      contentType.includes('text/')
    )
      return '#3B82F6'
    if (contentType.includes('spreadsheet') || contentType.includes('excel')) return '#22C55E'
    return colors.primary
  }

  const getFileExtension = (filename: string) => {
    const parts = filename.split('.')
    return parts.length > 1 ? parts[parts.length - 1]!.toUpperCase() : ''
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  // @mention map for markdown renderer
  const mentionMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const m of allMessages) {
      if (m.author?.username) {
        map.set(m.author.username, m.author.id ?? m.authorId)
      }
    }
    return map
  }, [allMessages])

  return (
    <Pressable
      style={[
        styles.container,
        isGrouped && styles.containerGrouped,
        showActions && { backgroundColor: colors.messageHover },
      ]}
      onLongPress={handleLongPress}
      onPress={() => showActions && setShowActions(false)}
    >
      {/* Reply reference */}
      {replyTarget && (
        <View style={[styles.replyRef, { borderLeftColor: colors.primary }]}>
          <Text style={[styles.replyRefAuthor, { color: colors.primary }]}>
            {replyTarget.author?.displayName || replyTarget.author?.username}
          </Text>
          <Text style={[styles.replyRefText, { color: colors.textMuted }]} numberOfLines={1}>
            {replyTarget.content}
          </Text>
        </View>
      )}

      <View style={styles.row}>
        {isGrouped ? (
          <View style={styles.groupedGutter} />
        ) : (
          <Pressable onPress={() => router.push(`/(main)/profile/${message.authorId}` as never)}>
            <Avatar
              uri={message.author?.avatarUrl}
              name={displayName}
              size={36}
              userId={message.authorId}
            />
          </Pressable>
        )}
        <View style={styles.bubble}>
          {!isGrouped && (
            <View style={styles.header}>
              <Pressable
                onPress={() => router.push(`/(main)/profile/${message.authorId}` as never)}
              >
                <Text style={[styles.username, { color: colors.text }]}>{displayName}</Text>
              </Pressable>
              {isBot && (
                <View style={[styles.botBadge, { backgroundColor: colors.primary }]}>
                  <Text style={styles.botBadgeText}>Buddy</Text>
                </View>
              )}
              <Text style={[styles.time, { color: colors.textMuted }]}>{timeAgo}</Text>
              {message.isEdited && (
                <Text style={[styles.edited, { color: colors.textMuted }]}>
                  ({t('chat.edited')})
                </Text>
              )}
            </View>
          )}

          {/* Content or editing */}
          {isEditing ? (
            <View style={styles.editContainer}>
              <TextInput
                style={[
                  styles.editInput,
                  {
                    backgroundColor: colors.inputBackground,
                    color: colors.text,
                    borderColor: colors.primary,
                  },
                ]}
                value={editText}
                onChangeText={setEditText}
                multiline
                autoFocus
              />
              <View style={styles.editActions}>
                <Pressable onPress={() => setIsEditing(false)} style={styles.editBtn}>
                  <X size={16} color={colors.textMuted} />
                </Pressable>
                <Pressable onPress={handleSaveEdit} style={styles.editBtn}>
                  <Check size={16} color={colors.success} />
                </Pressable>
              </View>
            </View>
          ) : (
            <MarkdownRenderer content={message.content} mentionMap={mentionMap} />
          )}

          {/* Attachments */}
          {message.attachments?.map((att) => {
            const contentType = getAttachmentContentType(att)
            if (isImageAtt(att)) {
              return (
                <Pressable
                  key={att.id}
                  style={styles.imageAttachment}
                  onPress={() => {
                    router.push({
                      pathname: '/(main)/media-preview',
                      params: {
                        url: att.url,
                        filename: att.filename,
                        contentType,
                      },
                    })
                  }}
                  onLongPress={() => setAttachmentAction({ url: att.url, filename: att.filename })}
                >
                  <Image
                    source={{ uri: getImageUrl(att.url) ?? att.url }}
                    style={styles.attachmentImage}
                    contentFit="cover"
                    transition={200}
                  />
                </Pressable>
              )
            }
            const FileIcon = getFileIcon(contentType)
            const accentColor = getFileAccentColor(contentType)
            const ext = getFileExtension(att.filename)
            return (
              <Pressable
                key={att.id}
                style={[
                  styles.fileCard,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
                onPress={() => {
                  router.push({
                    pathname: '/(main)/media-preview',
                    params: {
                      url: att.url,
                      filename: att.filename,
                      contentType,
                    },
                  })
                }}
                onLongPress={() => setAttachmentAction({ url: att.url, filename: att.filename })}
              >
                <View style={[styles.fileIconWrap, { backgroundColor: `${accentColor}18` }]}>
                  <FileIcon size={20} color={accentColor} />
                </View>
                <View style={styles.fileInfo}>
                  <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={1}>
                    {att.filename}
                  </Text>
                  <View style={styles.fileMetaRow}>
                    {ext ? (
                      <Text style={[styles.fileExt, { color: accentColor }]}>{ext}</Text>
                    ) : null}
                    <Text style={[styles.fileMeta, { color: colors.textMuted }]}>
                      {formatSize(att.size)}
                    </Text>
                  </View>
                </View>
                <Download size={16} color={colors.textMuted} />
              </Pressable>
            )
          })}

          {/* Reactions */}
          {message.reactions && message.reactions.length > 0 && (
            <View style={styles.reactions}>
              {message.reactions.map((r) => {
                const isReacted = currentUser ? r.userIds.includes(currentUser.id) : false
                return (
                  <Pressable
                    key={r.emoji}
                    style={[
                      styles.reaction,
                      {
                        backgroundColor: isReacted ? `${colors.primary}20` : colors.surface,
                        borderColor: isReacted ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => handleReaction(r.emoji)}
                  >
                    <Text style={styles.reactionEmoji}>{r.emoji}</Text>
                    <Text
                      style={[
                        styles.reactionCount,
                        { color: isReacted ? colors.primary : colors.textSecondary },
                      ]}
                    >
                      {r.count}
                    </Text>
                  </Pressable>
                )
              })}
              <Pressable
                style={[
                  styles.reactionAdd,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
                onPress={() => setShowActions(true)}
              >
                <Text style={[styles.reactionAddText, { color: colors.textMuted }]}>+</Text>
              </Pressable>
            </View>
          )}
          {/* Send status indicator — only show on failure */}
          {message.sendStatus === 'failed' && (
            <View style={styles.sendStatus}>
              <AlertCircle size={12} color={colors.error} />
              <Text style={[styles.sendStatusText, { color: colors.error }]}>
                {t('chat.sendFailed', '发送失败')}
              </Text>
              <Pressable
                style={[styles.retryBtn, { backgroundColor: `${colors.error}15` }]}
                onPress={() => onRetry?.(message)}
                hitSlop={8}
              >
                <RefreshCw size={12} color={colors.error} />
                <Text style={[styles.retryText, { color: colors.error }]}>
                  {t('chat.retry', '重试')}
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>

      {/* Action bar */}
      {showActions && (
        <View
          style={[
            styles.actionsOverlay,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          {/* Quick emoji row */}
          <View style={styles.quickEmojiRow}>
            {QUICK_EMOJIS.map((emoji) => (
              <Pressable
                key={emoji}
                style={styles.quickEmojiBtn}
                onPress={() => handleReaction(emoji)}
              >
                <Text style={styles.quickEmoji}>{emoji}</Text>
              </Pressable>
            ))}
            <Pressable
              style={[styles.quickEmojiBtn, { backgroundColor: colors.inputBackground }]}
              onPress={() => {
                setShowActions(false)
                setShowEmojiPicker(true)
              }}
            >
              <Text style={styles.quickEmoji}>+</Text>
            </Pressable>
          </View>
          <View style={[styles.actionDivider, { backgroundColor: colors.border }]} />
          {/* Action buttons */}
          <View style={styles.actionRow}>
            <Pressable
              style={styles.actionBtn}
              onPress={() => {
                onReply()
                setShowActions(false)
              }}
            >
              <Reply size={18} color={colors.textSecondary} />
              <Text style={[styles.actionLabel, { color: colors.textSecondary }]}>
                {t('chat.reply')}
              </Text>
            </Pressable>
            <Pressable style={styles.actionBtn} onPress={handleCopy}>
              <Copy size={18} color={colors.textSecondary} />
              <Text style={[styles.actionLabel, { color: colors.textSecondary }]}>
                {t('chat.copy')}
              </Text>
            </Pressable>
            {isOwn && (
              <Pressable style={styles.actionBtn} onPress={handleEdit}>
                <Pencil size={18} color={colors.textSecondary} />
                <Text style={[styles.actionLabel, { color: colors.textSecondary }]}>
                  {t('chat.edit')}
                </Text>
              </Pressable>
            )}
            {isOwn && (
              <Pressable style={styles.actionBtn} onPress={handleDelete}>
                <Trash2 size={18} color={colors.error} />
                <Text style={[styles.actionLabel, { color: colors.error }]}>
                  {t('common.delete')}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      )}

      {/* Full emoji picker (rn-emoji-keyboard) */}
      <RNEmojiPicker
        open={showEmojiPicker}
        onClose={() => setShowEmojiPicker(false)}
        onEmojiSelected={(emoji: EmojiType) => handleReaction(emoji.emoji)}
        enableSearchBar
        enableRecentlyUsed
        categoryPosition="top"
      />

      {/* Attachment long-press action sheet */}
      <Modal
        visible={!!attachmentAction}
        transparent
        animationType="fade"
        onRequestClose={() => setAttachmentAction(null)}
      >
        <Pressable style={styles.actionSheetOverlay} onPress={() => setAttachmentAction(null)}>
          <View style={[styles.actionSheet, { backgroundColor: colors.surface }]}>
            <Text style={[styles.actionSheetTitle, { color: colors.text }]} numberOfLines={1}>
              {attachmentAction?.filename}
            </Text>
            <Pressable
              style={({ pressed }) => [styles.actionSheetItem, { opacity: pressed ? 0.7 : 1 }]}
              onPress={handleAttachmentSave}
            >
              <Save size={18} color={colors.text} />
              <Text style={[styles.actionSheetLabel, { color: colors.text }]}>
                {t('chat.saveFile', '保存文件')}
              </Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.actionSheetItem, { opacity: pressed ? 0.7 : 1 }]}
              onPress={handleAttachmentShare}
            >
              <Share2 size={18} color={colors.text} />
              <Text style={[styles.actionSheetLabel, { color: colors.text }]}>
                {t('common.share', '分享')}
              </Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.actionSheetItem, { opacity: pressed ? 0.7 : 1 }]}
              onPress={handleAttachmentCopyUrl}
            >
              <ExternalLink size={18} color={colors.text} />
              <Text style={[styles.actionSheetLabel, { color: colors.text }]}>
                {t('chat.copyLink', '复制链接')}
              </Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.actionSheetCancel,
                { backgroundColor: colors.background, opacity: pressed ? 0.7 : 1 },
              ]}
              onPress={() => setAttachmentAction(null)}
            >
              <Text style={[styles.actionSheetLabel, { color: colors.textMuted }]}>
                {t('common.cancel', '取消')}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </Pressable>
  )
}

export const MessageBubble = memo(MessageBubbleInner, (prev, next) => {
  return (
    prev.message === next.message &&
    prev.channelId === next.channelId &&
    prev.isGrouped === next.isGrouped &&
    prev.allMessages === next.allMessages &&
    prev.onRetry === next.onRetry
  )
})

const styles = StyleSheet.create({
  container: {
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    marginBottom: 1,
  },
  containerGrouped: {
    paddingVertical: 0,
    marginBottom: 0,
  },
  // Reply reference
  replyRef: {
    borderLeftWidth: 2,
    paddingLeft: spacing.sm,
    marginLeft: 44,
    marginBottom: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  replyRefAuthor: {
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  replyRefText: {
    fontSize: fontSize.xs,
    flex: 1,
  },
  // Message row
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  bubble: {
    flex: 1,
  },
  groupedGutter: {
    width: 36,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: 1,
  },
  username: {
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  botBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  botBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
  },
  time: {
    fontSize: fontSize.xs,
  },
  edited: {
    fontSize: fontSize.xs,
    fontStyle: 'italic',
  },
  content: {
    fontSize: fontSize.md,
    lineHeight: 22,
  },
  // Editing
  editContainer: {
    marginTop: spacing.xs,
  },
  editInput: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.sm,
    fontSize: fontSize.md,
    minHeight: 36,
    maxHeight: 120,
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  editBtn: {
    padding: spacing.xs,
  },
  // Attachments
  imageAttachment: {
    marginTop: spacing.xs,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  attachmentImage: {
    width: 250,
    height: 180,
    borderRadius: radius.lg,
  },
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.lg,
    marginTop: spacing.xs,
    borderWidth: 1,
    gap: spacing.sm,
  },
  fileIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  fileMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 2,
  },
  fileExt: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  fileMeta: {
    fontSize: fontSize.xs,
  },
  // Reactions
  reactions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  reaction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  reactionEmoji: {
    fontSize: 14,
  },
  reactionCount: {
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  reactionAdd: {
    width: 28,
    height: 24,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  reactionAddText: {
    fontSize: 14,
  },
  // Actions overlay
  actionsOverlay: {
    position: 'absolute',
    top: 0,
    right: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    zIndex: 10,
  },
  quickEmojiRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  quickEmojiBtn: {
    padding: 4,
  },
  quickEmoji: {
    fontSize: 20,
  },
  actionDivider: {
    height: 1,
  },
  actionRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  actionBtn: {
    alignItems: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    gap: 2,
  },
  actionLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  actionSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  actionSheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.md,
    paddingBottom: 34,
    gap: 4,
  },
  actionSheetTitle: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: spacing.sm,
  },
  actionSheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  actionSheetLabel: {
    fontSize: fontSize.md,
    fontWeight: '500',
  },
  actionSheetCancel: {
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: radius.md,
    marginTop: spacing.sm,
  },
  // Send status
  sendStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  sendStatusText: {
    fontSize: fontSize.xs,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    marginLeft: 4,
  },
  retryText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
})
