import { useMutation } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import * as Clipboard from 'expo-clipboard'
import * as FileSystem from 'expo-file-system/legacy'
import * as Haptics from 'expo-haptics'
import { Image } from 'expo-image'
import * as MediaLibrary from 'expo-media-library'
import { useRouter } from 'expo-router'
import * as Sharing from 'expo-sharing'
import {
  AlertCircle,
  Check,
  CheckSquare,
  ExternalLink,
  FileArchive,
  FileCode,
  FileText,
  Film,
  Music,
  RefreshCw,
  Save,
  Share2,
  Square as SquareIcon,
  X,
} from 'lucide-react-native'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Alert,
  Dimensions,
  type GestureResponderEvent,
  Keyboard,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import Animated, { ZoomIn } from 'react-native-reanimated'
import type { EmojiType } from 'rn-emoji-keyboard'
import RNEmojiPicker from 'rn-emoji-keyboard'
import { fetchApi, getImageUrl } from '../../lib/api'
import { showToast } from '../../lib/toast'
import { useAuthStore } from '../../stores/auth.store'
import { fontSize, radius, spacing, useColors } from '../../theme'
import type {
  Attachment,
  InteractiveBlock,
  InteractiveResponseMetadata,
  Message,
} from '../../types/message'
import { Avatar } from '../common/avatar'
import { MarkdownRenderer } from './markdown-renderer'
import type { PopupAction } from './selection-popup'
import { SelectionPopup } from './selection-popup'

const REACTION_ENTERING = ZoomIn.duration(120)

interface MessageBubbleProps {
  message: Message
  onReply: () => void
  onRetry?: (message: Message) => void
  channelId: string
  allMessages?: Message[]
  isGrouped?: boolean
  variant?: 'channel' | 'dm'
  dmChannelId?: string
  selectionMode?: boolean
  isSelected?: boolean
  onToggleSelect?: (messageId: string) => void
  onEnterSelectionMode?: (messageId: string) => void
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
  selectionMode,
  isSelected,
  onToggleSelect,
  onEnterSelectionMode,
}: MessageBubbleProps) {
  const { t } = useTranslation()
  const colors = useColors()
  const router = useRouter()
  const currentUser = useAuthStore((s) => s.user)
  const bubbleRef = useRef<View>(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState(message.content)
  const [showPopup, setShowPopup] = useState(false)
  const [popupPosition, setPopupPosition] = useState<{
    touchX: number
    touchY: number
  } | null>(null)
  const [attachmentAction, setAttachmentAction] = useState<{
    url: string
    filename: string
  } | null>(null)
  const buildLocalFileUri = useCallback((filename: string) => {
    const extMatch = filename.match(/\.[A-Za-z0-9]+$/)
    const ext = extMatch?.[0] ?? ''
    const safeBase = filename.replace(/\.[A-Za-z0-9]+$/, '').replace(/[/\\?#%:*"<>|\s]/g, '_')
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    return `${FileSystem.cacheDirectory}${safeBase || 'file'}-${unique}${ext}`
  }, [])

  // Download remote file to local cache for sharing
  const downloadToLocal = useCallback(
    async (url: string, filename: string): Promise<string> => {
      const localUri = buildLocalFileUri(filename)
      const token = useAuthStore.getState().accessToken
      const { uri } = await FileSystem.downloadAsync(url, localUri, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      return uri
    },
    [buildLocalFileUri],
  )

  // Attachment long-press actions
  const handleAttachmentSave = useCallback(async () => {
    if (!attachmentAction) return
    const resolved = getImageUrl(attachmentAction.url) ?? attachmentAction.url
    const lower = attachmentAction.filename.toLowerCase()
    const isMedia =
      /\.(png|jpe?g|gif|webp|heic|heif|bmp|mp4|mov|m4v|avi|mkv|mp3|wav|m4a|aac|ogg)$/i.test(lower)
    try {
      const localUri = await downloadToLocal(resolved, attachmentAction.filename)
      if (isMedia) {
        const { status } = await MediaLibrary.requestPermissionsAsync()
        if (status !== 'granted') {
          showToast(t('chat.permissionDenied', 'Permission denied'), 'error')
          return
        }
        await MediaLibrary.saveToLibraryAsync(localUri)
        showToast(t('chat.imageSaved', 'File saved to library'), 'success')
      } else if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(localUri)
      } else {
        showToast(t('chat.shareUnavailable', 'Sharing is not available on this device'), 'error')
      }
    } catch (err) {
      console.error('Save failed:', err)
      showToast(t('chat.saveFailed', 'Failed to save file'), 'error')
    }
    setAttachmentAction(null)
  }, [attachmentAction, t, downloadToLocal])

  const handleAttachmentShare = useCallback(async () => {
    if (!attachmentAction) return
    const resolved = getImageUrl(attachmentAction.url) ?? attachmentAction.url
    try {
      const localUri = await downloadToLocal(resolved, attachmentAction.filename)
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(localUri)
      } else {
        showToast(t('chat.shareUnavailable', 'Sharing is not available on this device'), 'error')
      }
    } catch (err) {
      console.error('Share failed:', err)
      showToast(t('chat.shareFailed', 'Failed to share file'), 'error')
    }
    setAttachmentAction(null)
  }, [attachmentAction, t, downloadToLocal])

  const handleAttachmentCopyUrl = useCallback(async () => {
    if (!attachmentAction) return
    const resolved = getImageUrl(attachmentAction.url) ?? attachmentAction.url
    await Clipboard.setStringAsync(resolved)
    showToast(t('common.copied', '已复制'), 'success')
    setAttachmentAction(null)
  }, [attachmentAction, t])

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

  const handleSaveEdit = () => {
    const trimmed = editText.trim()
    if (trimmed && trimmed !== message.content) {
      editMutation.mutate(trimmed)
    } else {
      setIsEditing(false)
    }
  }

  // --- Long-press popup (WeChat-style) ---

  const handleLongPress = useCallback(
    (event: GestureResponderEvent) => {
      if (selectionMode) return
      Haptics.selectionAsync()
      const { pageX, pageY } = event.nativeEvent
      setPopupPosition({ touchX: pageX, touchY: pageY })
      setShowPopup(true)
    },
    [selectionMode],
  )

  const dismissPopup = useCallback(() => {
    setShowPopup(false)
    setPopupPosition(null)
  }, [])

  const handleCopyMessage = useCallback(async () => {
    await Clipboard.setStringAsync(message.content)
    dismissPopup()
  }, [message.content, dismissPopup])

  const handleReplyAction = useCallback(() => {
    dismissPopup()
    onReply()
  }, [dismissPopup, onReply])

  const handleReaction = useCallback(
    (emoji: string) => {
      reactionMutation.mutate(emoji)
    },
    [reactionMutation],
  )

  const handleQuickReaction = useCallback(
    (emoji: string) => {
      dismissPopup()
      reactionMutation.mutate(emoji)
    },
    [dismissPopup, reactionMutation],
  )

  const handleEnterMultiSelect = useCallback(() => {
    dismissPopup()
    onEnterSelectionMode?.(message.id)
  }, [dismissPopup, onEnterSelectionMode, message.id])

  const handleDeleteMessage = useCallback(() => {
    dismissPopup()
    Alert.alert(
      t('chat.deleteMessage', '删除消息'),
      t('chat.deleteMessageConfirm', '确定要删除这条消息吗？'),
      [
        { text: t('common.cancel', '取消'), style: 'cancel' },
        {
          text: t('common.delete', '删除'),
          style: 'destructive',
          onPress: () => deleteMutation.mutate(),
        },
      ],
    )
  }, [dismissPopup, t, deleteMutation])

  const POPUP_HEIGHT_EST = 90
  const screenHeight = Dimensions.get('window').height
  const popupAbove = (popupPosition?.touchY ?? 100) > POPUP_HEIGHT_EST + 40
  const isOwnMessage = currentUser ? message.authorId === currentUser.id : false

  const popupActions = useMemo<PopupAction[]>(() => {
    const actions: PopupAction[] = [
      { label: t('chat.copy', '复制'), onPress: handleCopyMessage },
      { label: t('chat.reply', '回复'), onPress: handleReplyAction },
    ]
    if (onEnterSelectionMode) {
      actions.push({
        label: t('chat.multiSelect', '多选'),
        onPress: handleEnterMultiSelect,
      })
    }
    if (isOwnMessage) {
      actions.push({
        label: t('common.delete', '删除'),
        onPress: handleDeleteMessage,
      })
    }
    return actions
  }, [
    t,
    handleCopyMessage,
    handleReplyAction,
    handleEnterMultiSelect,
    handleDeleteMessage,
    onEnterSelectionMode,
    isOwnMessage,
  ])

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
        isSelected && { backgroundColor: `${colors.primary}18` },
      ]}
      onPress={selectionMode ? () => onToggleSelect?.(message.id) : () => Keyboard.dismiss()}
      onLongPress={selectionMode ? undefined : handleLongPress}
      delayLongPress={300}
    >
      {/* Reply reference */}
      {replyTarget && (
        <View
          style={[
            styles.replyRef,
            { borderLeftColor: colors.primary },
            selectionMode && { marginLeft: 0 },
          ]}
        >
          <Text style={[styles.replyRefAuthor, { color: colors.primary }]}>
            {replyTarget.author?.displayName || replyTarget.author?.username}
          </Text>
          <Text style={[styles.replyRefText, { color: colors.textMuted }]} numberOfLines={1}>
            {replyTarget.content}
          </Text>
        </View>
      )}

      <View style={styles.row}>
        {selectionMode && (
          <View style={{ paddingTop: 8, paddingRight: 8, paddingLeft: 4 }}>
            {isSelected ? (
              <CheckSquare size={20} color={colors.primary} />
            ) : (
              <SquareIcon size={20} color={colors.textMuted} />
            )}
          </View>
        )}
        {isGrouped ? (
          <View style={styles.groupedGutter} />
        ) : (
          <Pressable
            disabled={selectionMode}
            onPress={() => router.push(`/(main)/profile/${message.authorId}` as never)}
          >
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
                disabled={selectionMode}
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
            <View ref={bubbleRef} pointerEvents={selectionMode ? 'none' : 'box-none'}>
              <MarkdownRenderer
                content={message.content}
                mentionMap={mentionMap}
                selectable={!selectionMode}
              />
            </View>
          )}

          {/* Attachments */}
          {message.attachments?.map((att) => {
            const contentType = getAttachmentContentType(att)
            if (isImageAtt(att)) {
              return (
                <Pressable
                  key={att.id}
                  style={styles.imageAttachment}
                  disabled={selectionMode}
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
                    style={[
                      styles.attachmentImage,
                      att.width && att.height && att.width > 0 && att.height > 0
                        ? {
                            width: Math.min(260, att.width),
                            height: Math.min(
                              320,
                              Math.min(260, att.width) / (att.width / att.height),
                            ),
                          }
                        : null,
                    ]}
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
                disabled={selectionMode}
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
              </Pressable>
            )
          })}

          {/* Phase 2 — interactive block (buttons / select) */}
          {message.metadata?.interactive && (
            <InteractiveBlockRenderer
              block={message.metadata.interactive}
              messageId={message.id}
              disabled={selectionMode}
              submittedResponse={message.metadata.interactiveState?.response}
            />
          )}

          {/* Reactions */}
          {message.reactions && message.reactions.length > 0 && (
            <View style={styles.reactions}>
              {message.reactions.map((r) => {
                const isReacted = currentUser ? r.userIds.includes(currentUser.id) : false
                return (
                  <Animated.View key={r.emoji} entering={REACTION_ENTERING}>
                    <Pressable
                      disabled={selectionMode}
                      style={[
                        styles.reaction,
                        {
                          backgroundColor: isReacted ? `${colors.primary}20` : colors.surface,
                          borderColor: isReacted ? colors.primary : colors.border,
                        },
                      ]}
                      onPress={() => {
                        Haptics.selectionAsync()
                        handleReaction(r.emoji)
                      }}
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
                  </Animated.View>
                )
              })}
              <Pressable
                disabled={selectionMode}
                style={[
                  styles.reactionAdd,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
                onPress={() => {
                  Haptics.selectionAsync()
                  setShowEmojiPicker(true)
                }}
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

      {/* Long-press popup (WeChat-style) */}
      <Modal visible={showPopup} transparent animationType="fade" onRequestClose={dismissPopup}>
        <Pressable style={styles.popupOverlay} onPress={dismissPopup}>
          {popupPosition && (
            <View
              style={[
                styles.popupPositioner,
                popupAbove
                  ? { bottom: screenHeight - popupPosition.touchY + 12 }
                  : { top: popupPosition.touchY + 12 },
                { left: 0, right: 0 },
              ]}
            >
              <SelectionPopup
                actions={popupActions}
                arrowDirection={popupAbove ? 'down' : 'up'}
                onQuickReaction={handleQuickReaction}
              />
            </View>
          )}
        </Pressable>
      </Modal>

      {/* Emoji picker */}
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
    prev.onRetry === next.onRetry &&
    prev.selectionMode === next.selectionMode &&
    prev.isSelected === next.isSelected &&
    prev.onToggleSelect === next.onToggleSelect &&
    prev.onEnterSelectionMode === next.onEnterSelectionMode
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
  // Long-press popup overlay
  popupOverlay: {
    flex: 1,
  },
  popupPositioner: {
    position: 'absolute',
    alignItems: 'center',
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
  // Attachment action sheet
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
  // Interactive block (Phase 2)
  interactive: {
    marginTop: 6,
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 8,
  },
  interactivePrompt: {
    fontSize: fontSize.sm,
  },
  interactiveRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  interactiveButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  interactiveButtonText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  interactiveError: {
    fontSize: fontSize.xs,
  },
})

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
  const colors = useColors()
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState<string | null>(submittedResponse?.actionId ?? null)
  const [error, setError] = useState<string | null>(null)
  const submittingRef = useRef(false)

  useEffect(() => {
    if (submittedResponse?.actionId) setDone(submittedResponse.actionId)
  }, [submittedResponse?.actionId])

  const send = useCallback(
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
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      } catch (e) {
        if (block.oneShot !== false) setDone(previousDone)
        setError(e instanceof Error ? e.message : t('chat.interactiveSubmitFailed'))
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {})
      } finally {
        submittingRef.current = false
        setSubmitting(false)
      }
    },
    [block.id, block.oneShot, done, messageId, t],
  )

  const isLocked = !!disabled || submitting || (block.oneShot !== false && done !== null)

  const isFormLike = block.kind === 'form' || block.kind === 'approval'

  const items = isFormLike
    ? []
    : block.kind === 'select'
      ? (block.options ?? []).map((o) => ({
          id: o.id,
          label: o.label,
          value: o.value,
          style: undefined as undefined | 'primary' | 'secondary' | 'destructive',
        }))
      : (block.buttons ?? []).map((b) => ({
          id: b.id,
          label: b.label,
          value: b.value ?? b.id,
          style: b.style,
        }))

  return (
    <View
      style={[styles.interactive, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      {block.prompt ? (
        <Text style={[styles.interactivePrompt, { color: colors.textSecondary }]}>
          {block.prompt}
        </Text>
      ) : null}

      {isFormLike ? (
        <InteractiveFormBody
          block={block}
          isLocked={isLocked}
          colors={colors}
          submittedValues={submittedResponse?.values}
          onSubmit={(actionId, label, values) => send(actionId, actionId, label, values)}
        />
      ) : (
        <View style={styles.interactiveRow}>
          {items.map((it) => {
            const isPicked = done === it.id
            const isDanger = it.style === 'destructive'
            const isPrimary = it.style === 'primary' || isPicked
            const bg = isDanger ? `${colors.error}20` : isPrimary ? colors.primary : 'transparent'
            const fg = isDanger ? colors.error : isPrimary ? '#ffffff' : colors.text
            const borderColor = isDanger ? colors.error : isPrimary ? colors.primary : colors.border
            return (
              <Pressable
                key={it.id}
                disabled={isLocked && !isPicked}
                style={[
                  styles.interactiveButton,
                  { backgroundColor: bg, borderColor, opacity: isLocked && !isPicked ? 0.5 : 1 },
                ]}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {})
                  send(it.id, it.value, it.label)
                }}
              >
                <Text style={[styles.interactiveButtonText, { color: fg }]}>
                  {isPicked ? `✓ ${it.label}` : it.label}
                </Text>
              </Pressable>
            )
          })}
        </View>
      )}

      {error ? (
        <Text style={[styles.interactiveError, { color: colors.error }]}>{error}</Text>
      ) : null}
    </View>
  )
}

/**
 * Mobile renderer for `kind: 'form' | 'approval'` interactive blocks.
 * Uses controlled TextInput / option-pill rows; checkbox is a toggle pill.
 */
function InteractiveFormBody({
  block,
  isLocked,
  colors,
  submittedValues,
  onSubmit,
}: {
  block: InteractiveBlock
  isLocked: boolean
  colors: ReturnType<typeof useColors>
  submittedValues?: Record<string, string>
  onSubmit: (actionId: string, label: string, values: Record<string, string>) => void
}) {
  const { t } = useTranslation()
  const initial = useMemo<Record<string, string>>(() => {
    const out: Record<string, string> = {}
    for (const f of block.fields ?? []) {
      out[f.id] =
        submittedValues?.[f.id] ?? f.defaultValue ?? (f.kind === 'checkbox' ? 'false' : '')
    }
    return out
  }, [block.fields, submittedValues])
  const [values, setValues] = useState<Record<string, string>>(initial)
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    if (submittedValues) setValues(initial)
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
    <View style={{ gap: 8 }}>
      {(block.fields ?? []).map((f) => {
        const v = values[f.id] ?? ''
        const showError = touched && f.required && !v.trim()
        return (
          <View key={f.id} style={{ gap: 4 }}>
            <Text style={[styles.interactivePrompt, { color: colors.textSecondary }]}>
              {f.label}
              {f.required ? <Text style={{ color: colors.error }}> *</Text> : null}
            </Text>
            {f.kind === 'checkbox' ? (
              <Pressable
                disabled={isLocked}
                onPress={() => setField(f.id, v === 'true' ? 'false' : 'true')}
                style={[
                  styles.interactiveButton,
                  {
                    alignSelf: 'flex-start',
                    backgroundColor: v === 'true' ? colors.primary : 'transparent',
                    borderColor: v === 'true' ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.interactiveButtonText,
                    { color: v === 'true' ? '#ffffff' : colors.text },
                  ]}
                >
                  {v === 'true' ? `✓ ${t('chat.interactiveOn')}` : t('chat.interactiveOff')}
                </Text>
              </Pressable>
            ) : f.kind === 'select' ? (
              <View style={styles.interactiveRow}>
                {(f.options ?? []).map((o) => {
                  const picked = v === o.value
                  return (
                    <Pressable
                      key={o.id}
                      disabled={isLocked}
                      onPress={() => setField(f.id, o.value)}
                      style={[
                        styles.interactiveButton,
                        {
                          backgroundColor: picked ? colors.primary : 'transparent',
                          borderColor: picked ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.interactiveButtonText,
                          { color: picked ? '#ffffff' : colors.text },
                        ]}
                      >
                        {o.label}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            ) : (
              <TextInput
                value={v}
                onChangeText={(t) => setField(f.id, t)}
                editable={!isLocked}
                placeholder={f.placeholder}
                placeholderTextColor={colors.textMuted}
                keyboardType={f.kind === 'number' ? 'numeric' : 'default'}
                multiline={f.kind === 'textarea'}
                maxLength={f.maxLength}
                style={{
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: radius.sm,
                  paddingHorizontal: 8,
                  paddingVertical: 6,
                  color: colors.text,
                  minHeight: f.kind === 'textarea' ? 60 : undefined,
                  textAlignVertical: f.kind === 'textarea' ? 'top' : 'center',
                }}
              />
            )}
            {showError ? (
              <Text style={[styles.interactiveError, { color: colors.error }]}>
                {t('chat.interactiveRequired')}
              </Text>
            ) : null}
          </View>
        )
      })}

      <View style={styles.interactiveRow}>
        {block.kind === 'form' ? (
          <Pressable
            disabled={isLocked}
            onPress={() => submit('submit', block.submitLabel ?? t('chat.interactiveSubmit'))}
            style={[
              styles.interactiveButton,
              {
                backgroundColor: colors.primary,
                borderColor: colors.primary,
                opacity: isLocked ? 0.5 : 1,
              },
            ]}
          >
            <Text style={[styles.interactiveButtonText, { color: '#ffffff' }]}>
              {block.submitLabel ?? t('chat.interactiveSubmit')}
            </Text>
          </Pressable>
        ) : (
          <>
            <Pressable
              disabled={isLocked}
              onPress={() => submit('approve', t('chat.interactiveApprove'))}
              style={[
                styles.interactiveButton,
                {
                  backgroundColor: colors.primary,
                  borderColor: colors.primary,
                  opacity: isLocked ? 0.5 : 1,
                },
              ]}
            >
              <Text style={[styles.interactiveButtonText, { color: '#ffffff' }]}>
                ✓ {t('chat.interactiveApprove')}
              </Text>
            </Pressable>
            <Pressable
              disabled={isLocked}
              onPress={() => submit('reject', t('chat.interactiveReject'))}
              style={[
                styles.interactiveButton,
                {
                  backgroundColor: `${colors.error}20`,
                  borderColor: colors.error,
                  opacity: isLocked ? 0.5 : 1,
                },
              ]}
            >
              <Text style={[styles.interactiveButtonText, { color: colors.error }]}>
                ✗ {t('chat.interactiveReject')}
              </Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  )
}
