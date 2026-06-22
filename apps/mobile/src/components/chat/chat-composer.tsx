import type { BuddyInboxViewMode, CommerceProductCard } from '@shadowob/shared'
import { BlurView } from 'expo-blur'
import { Image } from 'expo-image'
import {
  AtSign,
  Camera,
  File,
  Image as ImageIcon,
  ListTodo,
  MessageSquare,
  Mic,
  Paperclip,
  Plus,
  Send,
  ShoppingBag,
  Smile,
  X,
} from 'lucide-react-native'
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Animated,
  Dimensions,
  Easing,
  FlatList,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  type TextInput,
  View,
} from 'react-native'
import { selectionHaptic, successHaptic } from '../../lib/haptics'
import { animateNextLayout } from '../../lib/layout-animation'
import {
  border,
  fontSize,
  iconSize,
  lineHeight,
  palette,
  radius,
  size,
  spacing,
  useColors,
} from '../../theme'
import type { Message } from '../../types/message'
import { formatCommercePrice } from '../common/price-display'
import {
  AppText,
  Button,
  ChatWorkIndicator,
  GlassHeader,
  IconBubble,
  IconButton,
  TextField,
} from '../ui'
import { TypelessMicButton } from './typeless-mic-button'

// Common emoji list for inline picker
const COMMON_EMOJIS = [
  '😀',
  '😃',
  '😄',
  '😁',
  '😆',
  '😅',
  '🤣',
  '😂',
  '🙂',
  '🙃',
  '😉',
  '😊',
  '😇',
  '🥰',
  '😍',
  '🤩',
  '😘',
  '😗',
  '😚',
  '😙',
  '😋',
  '😛',
  '😜',
  '🤪',
  '😝',
  '🤑',
  '🤗',
  '🤭',
  '🤫',
  '🤔',
  '🤐',
  '🤨',
  '😐',
  '😑',
  '😶',
  '😏',
  '😒',
  '🙄',
  '😬',
  '🤥',
  '😌',
  '😔',
  '😪',
  '🤤',
  '😴',
  '😷',
  '🤒',
  '🤕',
  '🤢',
  '🤮',
  '🤧',
  '🥵',
  '🥶',
  '🥴',
  '😵',
  '🤯',
  '🤠',
  '🥳',
  '😎',
  '🤓',
  '🧐',
  '😕',
  '😟',
  '🙁',
  '☹️',
  '😮',
  '😯',
  '😲',
  '😳',
  '🥺',
  '😦',
  '😧',
  '😨',
  '😰',
  '😥',
  '😢',
  '😭',
  '😱',
  '😖',
  '😣',
  '😞',
  '😓',
  '😩',
  '😫',
  '🥱',
  '😤',
  '😡',
  '😠',
  '🤬',
  '😈',
  '👿',
  '💀',
  '☠️',
  '💩',
  '🤡',
  '👹',
  '👺',
  '👻',
  '👽',
  '👾',
  '🤖',
  '😺',
  '😸',
  '😹',
  '😻',
  '😼',
  '😽',
  '🙀',
  '😿',
  '😾',
  '❤️',
  '🧡',
  '💛',
  '💚',
  '💙',
  '💜',
  '🖤',
  '🤍',
  '🤎',
  '💔',
  '❣️',
  '💕',
  '💞',
  '💓',
  '💗',
  '💖',
  '💘',
  '💝',
  '💟',
  '☮️',
  '✝️',
  '☪️',
  '🕉',
  '☸️',
  '✡️',
  '🔯',
  '🕎',
  '☯️',
  '☦️',
  '🛐',
  '⛎',
  '♈',
  '♉',
  '♊',
  '♋',
  '♌',
  '♍',
  '♎',
  '♏',
  '♐',
  '♑',
  '♒',
  '♓',
  '🆔',
  '⚛️',
  '🉑',
  '☢️',
  '☣️',
  '📴',
  '📳',
  '🈶',
  '🈚',
  '🈸',
  '🈺',
  '🈷',
  '✴️',
  '🆚',
  '💮',
  '🉐',
  '㊙️',
  '㊗️',
  '🈴',
  '🈵',
  '🈹',
  '🈲',
  '🅰️',
  '🅱️',
  '🆎',
  '🆑',
  '🅾️',
  '🆘',
  '❌',
  '⭕',
  '🛑',
  '⛔',
  '📛',
  '🚫',
  '💯',
  '💢',
  '♨️',
  '🚷',
  '🚯',
  '🚳',
  '🚱',
  '🔞',
  '📵',
  '🚭',
  '❗',
  '❕',
  '❓',
  '❔',
  '‼️',
  '⁉️',
  '🔅',
  '🔆',
  '〽️',
  '⚠️',
  '🚸',
  '🔱',
  '⚜️',
  '🔰',
  '♻️',
  '✅',
  '🈯',
  '💹',
  '❇️',
  '✳️',
  '❎',
  '🌐',
  '💠',
  'Ⓜ️',
  '🌀',
  '💤',
  '🏧',
  '🚾',
  '♿',
  '🅿️',
  '🈳',
  '🈂',
  '🛂',
  '🛃',
  '🛄',
  '🛅',
  '🛗',
  '🟰',
  '🌝',
  '🌚',
  '🌕',
  '🌖',
  '🌗',
]

interface ChatComposerProps {
  inputText: string
  onInputChange: (text: string) => void
  onSend: () => void
  inputRef: React.RefObject<TextInput | null>
  pendingFiles: Array<{
    uri: string
    name: string
    type: string
    size?: number
    kind?: 'file' | 'image' | 'voice'
    durationMs?: number
    waveformPeaks?: number[]
  }>
  onRemovePendingFile: (index: number) => void
  replyTo: Message | null
  onClearReply: () => void
  typingUsers: string[]
  isRecording?: boolean
  isHolding?: boolean
  isVoiceMessageRecording?: boolean
  voiceMessageRecordingMs?: number
  voiceTranscript?: string
  keyboardVisible?: boolean
  insetsBottom: number
  panelHeight?: number
  canUseVoice: boolean
  onToggleVoice?: () => void
  onVoicePressIn?: () => void
  onVoicePressOut?: () => void
  onStartVoiceMessageRecording?: () => void
  onFinishVoiceMessageRecording?: (cancel?: boolean) => void
  showAtButton?: boolean
  onPressAt?: () => void
  showEmojiPicker: boolean
  setShowEmojiPicker: (value: boolean) => void
  showPlusMenu: boolean
  setShowPlusMenu: (value: boolean) => void
  onPickImage: () => void
  onPickFile: () => void
  onTakePhoto?: () => void
  onPasteImage?: (imageDataUri: string) => void
  commerceCards?: CommerceProductCard[]
  onOpenProductPicker?: () => void
  enableTaskCards?: boolean
  inboxViewMode?: BuddyInboxViewMode
  onInboxViewModeChange?: (mode: BuddyInboxViewMode) => void
  taskDraft?: string
  onTaskDraftChange?: (text: string) => void
  taskPriority?: 'low' | 'normal' | 'medium' | 'high'
  onTaskPriorityChange?: (priority: 'low' | 'normal' | 'medium' | 'high') => void
  taskTags?: string
  onTaskTagsChange?: (text: string) => void
  creatingTask?: boolean
  canCreateTask?: boolean
  onCreateTask?: () => void
  onRemoveCommerceCard?: (cardId: string) => void
}

function ImageViewerModal({
  uri,
  visible,
  onClose,
}: {
  uri: string
  visible: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const screenWidth = Dimensions.get('window').width
  const screenHeight = Dimensions.get('window').height

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={[styles.imageViewerOverlay, { backgroundColor: palette.black }]}>
        <View style={styles.imageViewerHeader}>
          <IconButton
            icon={X}
            variant="ghost"
            iconColor={palette.white}
            iconSize={iconSize['3xl']}
            style={styles.imageViewerCloseBtn}
            onPress={() => {
              selectionHaptic()
              onClose()
            }}
          />
          <Text style={styles.imageViewerTitle}>{t('chat.imagePreview', '图片预览')}</Text>
          <View style={{ width: size.iconButtonLg }} />
        </View>
        <Pressable
          style={styles.imageViewerContent}
          onPress={() => {
            selectionHaptic()
            onClose()
          }}
        >
          <Image
            source={{ uri }}
            style={{ width: screenWidth, height: screenHeight * 0.7 }}
            contentFit="contain"
            transition={200}
          />
        </Pressable>
        <View style={styles.imageViewerHint}>
          <Text style={{ color: palette.white, fontSize: fontSize.sm }}>
            {t('chat.tapToClose', '点击关闭')}
          </Text>
        </View>
      </View>
    </Modal>
  )
}

function formatVoiceDuration(durationMs: number) {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function ComposerBlurBackdrop() {
  const colors = useColors()
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <BlurView
        intensity={colors.mode === 'dark' ? 36 : 52}
        tint={colors.mode === 'dark' ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
      />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.composerBackground }]} />
    </View>
  )
}

const RECORDING_PREVIEW_PEAKS = [
  22, 36, 18, 44, 72, 30, 86, 58, 28, 64, 46, 24, 52, 34, 26, 42, 28, 36, 24, 32, 26, 30,
]

type TaskDraftPriority = 'low' | 'normal' | 'medium' | 'high'

const taskPriorityOptions: TaskDraftPriority[] = ['low', 'normal', 'medium', 'high']

function getTaskDraftTitle(value: string) {
  return value
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find(Boolean)
}

export const ChatComposer = memo(function ChatComposer({
  inputText,
  onInputChange,
  onSend,
  inputRef,
  pendingFiles,
  onRemovePendingFile,
  replyTo,
  onClearReply,
  typingUsers,
  isRecording = false,
  isHolding = false,
  isVoiceMessageRecording = false,
  voiceMessageRecordingMs = 0,
  keyboardVisible: _keyboardVisible = false,
  insetsBottom,
  panelHeight = 320,
  canUseVoice,
  onToggleVoice,
  onVoicePressIn,
  onVoicePressOut,
  onStartVoiceMessageRecording,
  onFinishVoiceMessageRecording,
  showAtButton = false,
  onPressAt,
  showEmojiPicker,
  setShowEmojiPicker,
  showPlusMenu,
  setShowPlusMenu,
  onPickImage,
  onPickFile,
  onTakePhoto,
  commerceCards = [],
  onOpenProductPicker,
  enableTaskCards = false,
  inboxViewMode,
  onInboxViewModeChange,
  taskDraft = '',
  onTaskDraftChange,
  taskPriority = 'normal',
  onTaskPriorityChange,
  taskTags = '',
  onTaskTagsChange,
  creatingTask = false,
  canCreateTask = false,
  onCreateTask,
  onRemoveCommerceCard,
}: ChatComposerProps) {
  const colors = useColors()
  const { t } = useTranslation()
  const [viewingImageUri, setViewingImageUri] = useState<string | null>(null)

  // ── Bottom-slot state machine ──
  // A single always-rendered Animated.View at the bottom whose height
  // smoothly tracks whichever occupant is active:
  //   idle    → insetsBottom  (safe-area only)
  //   keyboard → keyboard height  (system keyboard visible)
  //   panel   → panelHeight   (plus-menu / emoji picker)
  const panelIntentRef = useRef(false)
  const keyboardUpRef = useRef(false)
  const bottomHeightAnim = useRef(new Animated.Value(insetsBottom)).current
  const lastTargetRef = useRef(insetsBottom)
  const showInboxComposerControls =
    enableTaskCards && Boolean(inboxViewMode && onInboxViewModeChange)
  const isInboxTaskMode = showInboxComposerControls && inboxViewMode === 'tasks'
  const taskTitle = getTaskDraftTitle(taskDraft)
  const panelRequested = !isInboxTaskMode && (showPlusMenu || showEmojiPicker)

  const animateBottomTo = useCallback(
    (toValue: number, duration: number) => {
      if (Math.abs(lastTargetRef.current - toValue) < 1) return
      lastTargetRef.current = toValue
      Animated.timing(bottomHeightAnim, {
        toValue,
        duration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start()
    },
    [bottomHeightAnim],
  )

  // Keyboard listeners — drive the bottom-slot height in lockstep with iOS keyboard animation
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'

    const showSub = Keyboard.addListener(showEvent, (e) => {
      keyboardUpRef.current = true
      panelIntentRef.current = false
      // Prefer native keyboard height to avoid over-lifting the input bar.
      // Fallback to screenY delta only when native height is unavailable.
      const screenHeight = Dimensions.get('window').height
      const keyboardHeight = e.endCoordinates.height
      const fallbackHeight = Math.max(0, screenHeight - e.endCoordinates.screenY)
      const actualHeight = keyboardHeight > 0 ? keyboardHeight : fallbackHeight
      const duration = e.duration ?? 250
      // Close panels — keyboard takes over the bottom slot
      setShowPlusMenu(false)
      setShowEmojiPicker(false)
      animateBottomTo(actualHeight, duration)
    })

    const hideSub = Keyboard.addListener(hideEvent, (e) => {
      keyboardUpRef.current = false
      const duration = e.duration ?? 250
      if (panelIntentRef.current) {
        // Keyboard → panel: keep slot at panel height so input bar stays put
        panelIntentRef.current = false
        animateBottomTo(panelHeight, duration)
      } else {
        // Keyboard → idle
        animateBottomTo(insetsBottom, duration)
      }
    })

    return () => {
      showSub.remove()
      hideSub.remove()
    }
  }, [panelHeight, insetsBottom, animateBottomTo, setShowPlusMenu, setShowEmojiPicker])

  // Non-keyboard transitions (idle ↔ panel)
  useEffect(() => {
    if (panelIntentRef.current || keyboardUpRef.current) return
    if (panelRequested) {
      animateBottomTo(panelHeight, 250)
    } else {
      animateBottomTo(insetsBottom, 200)
    }
  }, [panelRequested, panelHeight, insetsBottom, animateBottomTo])

  return (
    <>
      {typingUsers.length > 0 && (
        <View style={styles.typingBar}>
          <ChatWorkIndicator
            items={[
              {
                label: `${typingUsers.join(', ')} ${
                  typingUsers.length === 1 ? t('chat.isTyping') : t('chat.areTyping')
                }`,
              },
            ]}
          />
        </View>
      )}

      {(pendingFiles.length > 0 || commerceCards.length > 0) && (
        <View
          style={[
            styles.pendingFilesBar,
            { backgroundColor: colors.frostedPanelStrong, borderTopColor: colors.frostedBorder },
          ]}
        >
          {commerceCards.map((card) => (
            <View
              key={card.id}
              style={[
                styles.pendingProductChip,
                { backgroundColor: colors.inputBackground, borderColor: colors.border },
              ]}
            >
              <View style={[styles.pendingProductIcon, { backgroundColor: colors.surfaceHover }]}>
                <ShoppingBag size={iconSize.lg} color={colors.primary} />
              </View>
              <View style={styles.pendingProductText}>
                <Text style={[styles.pendingProductName, { color: colors.text }]} numberOfLines={1}>
                  {card.snapshot.name}
                </Text>
                <Text style={[styles.pendingProductPrice, { color: colors.textMuted }]}>
                  {formatCommercePrice(card.snapshot.price, card.snapshot.currency, t)}
                </Text>
              </View>
              {onRemoveCommerceCard && (
                <IconButton
                  icon={X}
                  variant="ghost"
                  iconColor={colors.textMuted}
                  iconSize={iconSize.sm}
                  style={styles.inlineRemoveBtn}
                  onPress={() => {
                    selectionHaptic()
                    animateNextLayout()
                    onRemoveCommerceCard(card.id)
                  }}
                />
              )}
            </View>
          ))}
          {pendingFiles.map((file, idx) => (
            <View key={file.uri}>
              {file.kind === 'voice' ? (
                <View
                  style={[styles.pendingVoiceChip, { backgroundColor: colors.inputBackground }]}
                >
                  <Mic size={iconSize.sm} color={colors.primary} />
                  <View style={styles.pendingVoiceWaveform}>
                    {(file.waveformPeaks ?? []).slice(0, 24).map((peak, index) => (
                      <View
                        key={`${file.uri}-${index}`}
                        style={[
                          styles.pendingVoiceBar,
                          {
                            height: Math.max(5, Math.round(peak * 0.16)),
                            backgroundColor: colors.primary,
                          },
                        ]}
                      />
                    ))}
                  </View>
                  <Text style={[styles.pendingFileName, { color: colors.textSecondary }]}>
                    {formatVoiceDuration(file.durationMs ?? 0)}
                  </Text>
                  <IconButton
                    icon={X}
                    variant="ghost"
                    iconColor={colors.textMuted}
                    iconSize={iconSize.sm}
                    style={styles.inlineRemoveBtn}
                    onPress={() => {
                      selectionHaptic()
                      animateNextLayout()
                      onRemovePendingFile(idx)
                    }}
                  />
                </View>
              ) : file.type.startsWith('image/') ? (
                <Pressable
                  onPress={() => {
                    selectionHaptic()
                    setViewingImageUri(file.uri)
                  }}
                  style={[styles.pendingImageChip, { backgroundColor: colors.inputBackground }]}
                >
                  <Image
                    source={{ uri: file.uri }}
                    style={styles.pendingImageThumb}
                    contentFit="contain"
                  />
                  <IconButton
                    icon={X}
                    variant="danger"
                    iconSize={iconSize.sm}
                    onPress={() => {
                      selectionHaptic()
                      animateNextLayout()
                      onRemovePendingFile(idx)
                    }}
                    containerStyle={styles.pendingImageRemovePosition}
                    style={styles.pendingImageRemoveBtn}
                  />
                </Pressable>
              ) : (
                <View style={[styles.pendingFileChip, { backgroundColor: colors.inputBackground }]}>
                  <Paperclip size={iconSize.sm} color={colors.textMuted} />
                  <Text
                    style={[styles.pendingFileName, { color: colors.textSecondary }]}
                    numberOfLines={1}
                  >
                    {file.name}
                  </Text>
                  <IconButton
                    icon={X}
                    variant="ghost"
                    iconColor={colors.textMuted}
                    iconSize={iconSize.sm}
                    style={styles.inlineRemoveBtn}
                    onPress={() => {
                      selectionHaptic()
                      animateNextLayout()
                      onRemovePendingFile(idx)
                    }}
                  />
                </View>
              )}
            </View>
          ))}
        </View>
      )}

      {viewingImageUri && (
        <ImageViewerModal
          uri={viewingImageUri}
          visible={!!viewingImageUri}
          onClose={() => setViewingImageUri(null)}
        />
      )}

      {replyTo && (
        <GlassHeader style={styles.replyBar}>
          <View style={[styles.replyBarAccent, { backgroundColor: colors.primary }]} />
          <View style={styles.replyBarContent}>
            <AppText variant="label" tone="primary">
              {t('chat.replyingTo')} {replyTo.author?.displayName || replyTo.author?.username}
            </AppText>
            <AppText
              variant="label"
              tone="secondary"
              style={styles.replyBarPreview}
              numberOfLines={1}
            >
              {replyTo.content}
            </AppText>
          </View>
          <Button
            variant="ghost"
            size="icon"
            icon={X}
            iconSize={iconSize.lg}
            iconColor={colors.textMuted}
            onPress={() => {
              selectionHaptic()
              animateNextLayout()
              onClearReply()
            }}
            hitSlop={spacing.sm}
          />
        </GlassHeader>
      )}

      {showInboxComposerControls && (
        <View
          style={[
            styles.inboxComposerBar,
            { backgroundColor: colors.composerBackground, borderTopColor: colors.frostedBorder },
          ]}
        >
          <View style={[styles.inboxSegment, { backgroundColor: colors.inputBackground }]}>
            {(['chat', 'tasks'] as const).map((mode) => {
              const selected = inboxViewMode === mode
              const ModeIcon = mode === 'chat' ? MessageSquare : ListTodo
              return (
                <Pressable
                  key={mode}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  style={[
                    styles.inboxSegmentButton,
                    selected && { backgroundColor: colors.primary },
                  ]}
                  onPress={() => {
                    selectionHaptic()
                    onInboxViewModeChange?.(mode)
                    setShowPlusMenu(false)
                    setShowEmojiPicker(false)
                  }}
                >
                  <ModeIcon
                    size={iconSize.sm}
                    color={selected ? colors.background : colors.textMuted}
                  />
                  <Text
                    style={[
                      styles.inboxSegmentText,
                      { color: selected ? colors.background : colors.textMuted },
                    ]}
                  >
                    {t(`inbox.mode.${mode}`)}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </View>
      )}

      {isInboxTaskMode ? (
        <View
          style={[
            styles.taskInputBar,
            {
              backgroundColor: colors.composerBackground,
              borderColor: colors.frostedBorder,
              paddingBottom: spacing.sm,
              paddingTop: spacing.sm,
            },
          ]}
        >
          <ComposerBlurBackdrop />
          <View style={styles.taskInputHeader}>
            <View style={[styles.taskInputIcon, { backgroundColor: colors.tonePrimarySurface }]}>
              <ListTodo size={iconSize.lg} color={colors.primary} />
            </View>
            <AppText variant="label" style={styles.taskInputTitle} numberOfLines={1}>
              {taskTitle || t('inbox.task.new')}
            </AppText>
          </View>
          <TextField
            value={taskDraft}
            onChangeText={onTaskDraftChange}
            placeholder={t('inbox.task.quickPlaceholder')}
            multiline
            style={styles.taskTextField}
            inputStyle={styles.taskTextInput}
          />
          <View
            style={[
              styles.taskPriorityRow,
              { backgroundColor: colors.inputBackground, borderColor: colors.border },
            ]}
          >
            {taskPriorityOptions.map((priority) => {
              const selected = taskPriority === priority
              const priorityColor =
                priority === 'high'
                  ? colors.error
                  : priority === 'medium'
                    ? colors.warning
                    : priority === 'normal'
                      ? colors.success
                      : colors.textMuted
              return (
                <Pressable
                  key={priority}
                  onPress={() => {
                    selectionHaptic()
                    onTaskPriorityChange?.(priority)
                  }}
                  style={[
                    styles.taskPriorityButton,
                    selected && { backgroundColor: colors.surfaceHover },
                  ]}
                >
                  <Text
                    style={[
                      styles.taskPriorityButtonText,
                      { color: selected ? priorityColor : colors.textMuted },
                    ]}
                  >
                    {t(`inbox.task.priority.${priority}`)}
                  </Text>
                </Pressable>
              )
            })}
          </View>
          <TextField
            value={taskTags}
            onChangeText={onTaskTagsChange}
            placeholder={t('inbox.task.tagsPlaceholder')}
            style={styles.taskTagsField}
            inputStyle={styles.taskTagsInput}
          />
          <View style={styles.taskInputActions}>
            <Button
              variant="primary"
              size="sm"
              icon={ListTodo}
              loading={creatingTask}
              disabled={!canCreateTask || creatingTask}
              onPress={() => {
                selectionHaptic()
                onCreateTask?.()
              }}
            >
              {t('inbox.task.create')}
            </Button>
          </View>
        </View>
      ) : isVoiceMessageRecording && onFinishVoiceMessageRecording ? (
        <View
          style={[
            styles.inputBar,
            styles.voiceRecordingInputBar,
            {
              backgroundColor: colors.composerBackground,
              borderColor: colors.frostedBorder,
              paddingBottom: spacing.sm,
              paddingTop: spacing.sm,
            },
          ]}
        >
          <ComposerBlurBackdrop />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('chat.voiceCancelRecording')}
            onPress={() => {
              selectionHaptic()
              animateNextLayout()
              onFinishVoiceMessageRecording(true)
            }}
            style={({ pressed }) => [
              styles.voiceRecordingCancelButton,
              { backgroundColor: pressed ? colors.surfaceHover : colors.inputBackground },
            ]}
          >
            <X size={iconSize.lg} color={colors.textMuted} />
          </Pressable>
          <View style={[styles.voiceRecordingPill, { backgroundColor: colors.inputBackground }]}>
            <Mic size={iconSize.lg} color={colors.primary} />
            <View style={styles.voiceRecordingWaveform}>
              {RECORDING_PREVIEW_PEAKS.map((peak, index) => (
                <View
                  key={`recording-${index}`}
                  style={[
                    styles.voiceRecordingBar,
                    {
                      height: Math.max(6, Math.round(peak * 0.24)),
                      backgroundColor: colors.primary,
                      opacity:
                        0.45 + ((index + Math.floor(voiceMessageRecordingMs / 220)) % 5) * 0.12,
                    },
                  ]}
                />
              ))}
            </View>
            <Text style={[styles.voiceRecordingDuration, { color: colors.textSecondary }]}>
              {formatVoiceDuration(voiceMessageRecordingMs)}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('chat.voiceSendRecording')}
            onPress={() => {
              successHaptic()
              animateNextLayout()
              onFinishVoiceMessageRecording(false)
            }}
            style={({ pressed }) => [
              styles.voiceRecordingSendButton,
              { backgroundColor: pressed ? colors.primaryDark : colors.success },
            ]}
          >
            <Send size={iconSize.lg} color={palette.foundation} />
          </Pressable>
        </View>
      ) : (
        <View
          style={[
            styles.inputBar,
            {
              backgroundColor: colors.composerBackground,
              borderColor: colors.frostedBorder,
            },
          ]}
        >
          <ComposerBlurBackdrop />
          {showAtButton && onPressAt && (
            <Pressable
              accessibilityRole="button"
              hitSlop={spacing.sm}
              style={styles.edgeActionBtn}
              onPress={() => {
                selectionHaptic()
                onPressAt()
              }}
            >
              <AtSign size={iconSize['2xl']} color={colors.textMuted} strokeWidth={2.5} />
            </Pressable>
          )}

          <TextField
            ref={inputRef}
            containerStyle={styles.inputField}
            style={styles.inputWrapper}
            inputStyle={styles.textInput}
            value={inputText}
            onChangeText={onInputChange}
            placeholder={t('chat.messagePlaceholder')}
            multiline
            maxLength={4000}
            blurOnSubmit={false}
            submitBehavior="submit"
            onSubmitEditing={onSend}
            returnKeyType="send"
            right={
              canUseVoice && onVoicePressIn && onVoicePressOut ? (
                <TypelessMicButton
                  isRecording={isRecording}
                  isHolding={isHolding}
                  onPressIn={onVoicePressIn}
                  onPressOut={onVoicePressOut}
                />
              ) : canUseVoice && onToggleVoice ? (
                <IconButton
                  icon={Mic}
                  variant={isRecording ? 'primary' : 'ghost'}
                  iconColor={isRecording ? palette.foundation : colors.textMuted}
                  iconSize={iconSize.lg}
                  style={styles.inputMicBtn}
                  onPress={() => {
                    selectionHaptic()
                    onToggleVoice()
                  }}
                />
              ) : null
            }
          />

          <Pressable
            accessibilityRole="button"
            hitSlop={spacing.sm}
            style={styles.edgeActionBtn}
            onPress={() => {
              selectionHaptic()
              if (panelRequested) {
                // Panel → keyboard: focus input, keyboardWillShow handles the rest
                inputRef.current?.focus()
              } else if (keyboardUpRef.current) {
                // Keyboard → panel: tell hide-handler to keep slot height
                animateNextLayout()
                panelIntentRef.current = true
                setShowEmojiPicker(false)
                setShowPlusMenu(true)
                Keyboard.dismiss()
              } else {
                // Idle → panel
                animateNextLayout()
                setShowEmojiPicker(false)
                setShowPlusMenu(true)
              }
            }}
          >
            <Plus
              size={iconSize['2xl']}
              color={panelRequested ? colors.primary : colors.textMuted}
              strokeWidth={2.5}
            />
          </Pressable>
        </View>
      )}

      {/* Bottom slot — always rendered; height tracks keyboard / panel / idle */}
      <Animated.View
        style={{
          height: bottomHeightAnim,
          overflow: 'hidden',
          backgroundColor: 'transparent',
        }}
      >
        {panelRequested && (
          <View
            style={[
              styles.plusPanel,
              {
                backgroundColor: colors.composerBackground,
                borderTopColor: colors.frostedBorder,
                height: panelHeight,
              },
            ]}
          >
            {showEmojiPicker ? (
              <View style={styles.emojiPanelContainer}>
                <View style={styles.emojiPanelHeader}>
                  <Text style={[styles.emojiPanelTitle, { color: colors.text }]}>
                    {t('chat.emoji', '表情')}
                  </Text>
                  <IconButton
                    icon={X}
                    variant="ghost"
                    iconColor={colors.textMuted}
                    iconSize={iconSize.xl}
                    onPress={() => {
                      selectionHaptic()
                      animateNextLayout()
                      setShowEmojiPicker(false)
                    }}
                    style={styles.emojiPanelClose}
                  />
                </View>
                <FlatList
                  data={COMMON_EMOJIS}
                  numColumns={8}
                  keyExtractor={(item, index) => `${item}-${index}`}
                  renderItem={({ item }) => (
                    <Pressable
                      style={({ pressed }) => [
                        styles.emojiItem,
                        pressed && {
                          backgroundColor: colors.surfaceHover,
                          borderRadius: radius.md,
                        },
                      ]}
                      onPress={() => {
                        selectionHaptic()
                        onInputChange(inputText + item)
                        inputRef.current?.focus()
                      }}
                      android_ripple={{ color: colors.surfaceHover }}
                    >
                      <Text style={styles.emojiText}>{item}</Text>
                    </Pressable>
                  )}
                  contentContainerStyle={styles.emojiList}
                />
              </View>
            ) : (
              <View style={styles.plusPanelGrid}>
                <Pressable
                  style={({ pressed }) => [
                    styles.plusPanelItem,
                    pressed && styles.plusPanelPressed,
                  ]}
                  onPress={() => {
                    selectionHaptic()
                    animateNextLayout()
                    setShowEmojiPicker(true)
                  }}
                >
                  <IconBubble
                    icon={Smile}
                    tone="warning"
                    size={iconSize['4xl']}
                    style={styles.plusPanelIcon}
                  />
                  <Text style={[styles.plusPanelLabel, { color: colors.textSecondary }]}>
                    {t('chat.emoji', '表情')}
                  </Text>
                </Pressable>
                {onOpenProductPicker && (
                  <Pressable
                    style={({ pressed }) => [
                      styles.plusPanelItem,
                      pressed && styles.plusPanelPressed,
                    ]}
                    onPress={() => {
                      selectionHaptic()
                      animateNextLayout()
                      setShowPlusMenu(false)
                      onOpenProductPicker()
                    }}
                  >
                    <IconBubble
                      icon={ShoppingBag}
                      tone="primary"
                      size={iconSize['4xl']}
                      style={styles.plusPanelIcon}
                    />
                    <Text style={[styles.plusPanelLabel, { color: colors.textSecondary }]}>
                      {t('chat.productPicker')}
                    </Text>
                  </Pressable>
                )}
                {onTakePhoto && (
                  <Pressable
                    style={({ pressed }) => [
                      styles.plusPanelItem,
                      pressed && styles.plusPanelPressed,
                    ]}
                    onPress={() => {
                      selectionHaptic()
                      animateNextLayout()
                      setShowPlusMenu(false)
                      onTakePhoto()
                    }}
                  >
                    <IconBubble
                      icon={Camera}
                      tone="success"
                      size={iconSize['4xl']}
                      style={styles.plusPanelIcon}
                    />
                    <Text style={[styles.plusPanelLabel, { color: colors.textSecondary }]}>
                      {t('chat.takePhoto', '拍摄')}
                    </Text>
                  </Pressable>
                )}
                {onStartVoiceMessageRecording && (
                  <Pressable
                    style={({ pressed }) => [
                      styles.plusPanelItem,
                      pressed && styles.plusPanelPressed,
                    ]}
                    onPress={() => {
                      selectionHaptic()
                      animateNextLayout()
                      setShowPlusMenu(false)
                      onStartVoiceMessageRecording()
                    }}
                  >
                    <IconBubble
                      icon={Mic}
                      tone="success"
                      size={iconSize['4xl']}
                      style={styles.plusPanelIcon}
                    />
                    <Text style={[styles.plusPanelLabel, { color: colors.textSecondary }]}>
                      {t('chat.voiceRecord')}
                    </Text>
                  </Pressable>
                )}
                <Pressable
                  style={({ pressed }) => [
                    styles.plusPanelItem,
                    pressed && styles.plusPanelPressed,
                  ]}
                  onPress={() => {
                    selectionHaptic()
                    animateNextLayout()
                    setShowPlusMenu(false)
                    onPickImage()
                  }}
                >
                  <IconBubble
                    icon={ImageIcon}
                    tone="primary"
                    size={iconSize['4xl']}
                    style={styles.plusPanelIcon}
                  />
                  <Text style={[styles.plusPanelLabel, { color: colors.textSecondary }]}>
                    {t('chat.pickImage', '相册')}
                  </Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.plusPanelItem,
                    pressed && styles.plusPanelPressed,
                  ]}
                  onPress={() => {
                    selectionHaptic()
                    animateNextLayout()
                    setShowPlusMenu(false)
                    onPickFile()
                  }}
                >
                  <IconBubble
                    icon={File}
                    tone="warning"
                    size={iconSize['4xl']}
                    style={styles.plusPanelIcon}
                  />
                  <Text style={[styles.plusPanelLabel, { color: colors.textSecondary }]}>
                    {t('chat.pickFile', '文件')}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        )}
      </Animated.View>
    </>
  )
})

const styles = StyleSheet.create({
  typingBar: { paddingHorizontal: spacing.md, paddingVertical: spacing.tight },
  pendingFilesBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.tight,
  },
  pendingFileChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
    maxWidth: size.chipMaxWidth,
  },
  pendingFileName: { fontSize: fontSize.xs, flexShrink: 1 },
  pendingImageChip: { borderRadius: radius.md, overflow: 'hidden', position: 'relative' },
  pendingImageThumb: { width: size.thumbnailMd, height: size.thumbnailMd, borderRadius: radius.md },
  pendingImageRemovePosition: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
  },
  pendingImageRemoveBtn: {
    width: size.avatarXs,
    height: size.avatarXs,
  },
  inlineRemoveBtn: { width: size.controlXs, height: size.controlXs },
  pendingVoiceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
    maxWidth: size.commerceChipMaxWidth,
  },
  pendingVoiceWaveform: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    minWidth: size.voicePreviewWaveformMinWidth,
  },
  pendingVoiceBar: {
    width: size.dividerAccent,
    borderRadius: radius.full,
  },
  pendingProductChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.tight,
    maxWidth: size.commerceChipMaxWidth,
  },
  pendingProductIcon: {
    width: size.iconBubble,
    height: size.iconBubble,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingProductText: { minWidth: 0, flex: 1 },
  pendingProductName: { fontSize: fontSize.sm, fontWeight: '700' },
  pendingProductPrice: { fontSize: fontSize.xs, marginTop: spacing.xxs },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderTopWidth: border.hairline,
    gap: spacing.sm,
  },
  replyBarAccent: { width: size.dividerAccent, height: '100%', borderRadius: radius.xs },
  replyBarContent: { flex: 1 },
  replyBarLabel: { fontSize: fontSize.xs, fontWeight: '600' },
  replyBarPreview: { fontSize: fontSize.xs },
  inboxComposerBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: border.hairline,
  },
  inboxSegment: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.full,
    padding: spacing.xxs,
    gap: spacing.xxs,
  },
  inboxSegmentButton: {
    minHeight: size.controlSm,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  inboxSegmentText: {
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
  taskInputBar: {
    marginHorizontal: spacing.md,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
    gap: spacing.sm,
    borderWidth: border.hairline,
    borderRadius: radius['3xl'],
    overflow: 'hidden',
  },
  taskInputHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  taskInputIcon: {
    width: size.iconBubble,
    height: size.iconBubble,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskInputTitle: { flex: 1 },
  taskTextField: {
    minHeight: size.textareaMin,
    borderRadius: radius.lg,
  },
  taskTextInput: {
    minHeight: size.textareaMin,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    textAlignVertical: 'top',
  },
  taskPriorityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    borderWidth: border.hairline,
    borderRadius: radius.lg,
    padding: spacing.xs,
  },
  taskPriorityButton: {
    minHeight: size.controlSm,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskPriorityButtonText: {
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
  taskTagsField: {
    height: size.controlLg,
    borderRadius: radius.lg,
  },
  taskTagsInput: {
    fontSize: fontSize.sm,
  },
  taskInputActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  voiceRecordingInputBar: {
    alignItems: 'center',
  },
  voiceRecordingCancelButton: {
    width: size.controlLg,
    height: size.controlLg,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceRecordingPill: {
    flex: 1,
    minHeight: size.controlLg,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  voiceRecordingWaveform: {
    flex: 1,
    minWidth: 0,
    height: size.controlSm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
  },
  voiceRecordingBar: {
    width: size.dividerAccent,
    borderRadius: radius.full,
  },
  voiceRecordingDuration: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    minWidth: size.iconTile,
    textAlign: 'right',
  },
  voiceRecordingSendButton: {
    width: size.controlLg,
    height: size.controlLg,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginHorizontal: spacing.md,
    marginTop: spacing.xs,
    minHeight: size.controlLg,
    paddingHorizontal: spacing.none,
    paddingVertical: spacing.none,
    gap: spacing.xs,
    borderWidth: border.hairline,
    borderRadius: radius['3xl'],
    overflow: 'hidden',
  },
  edgeActionBtn: {
    width: size.controlLg,
    minHeight: size.controlLg,
    paddingBottom: spacing.xxs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputField: {
    flex: 1,
  },
  inputWrapper: {
    flex: 1,
    borderRadius: radius.none,
    borderWidth: spacing.none,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.none,
    minHeight: size.controlLg,
    maxHeight: size.composerInputMaxHeight,
    backgroundColor: 'transparent',
    paddingHorizontal: spacing.none,
    paddingRight: spacing.xxs,
    paddingVertical: spacing.none,
    position: 'relative',
  },
  textInput: {
    flex: 1,
    minHeight: size.controlLg - spacing.xs,
    maxHeight: size.composerInputMaxHeight,
    paddingLeft: spacing.sm,
    paddingRight: spacing.xs,
    paddingVertical: spacing.tight,
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
    textAlignVertical: 'top',
    includeFontPadding: false,
  },
  inputMicBtn: {
    width: size.controlMd,
    height: size.controlMd,
    marginBottom: spacing.xs,
  },
  plusPanel: {
    borderTopWidth: border.hairline,
    borderTopLeftRadius: radius['3xl'],
    borderTopRightRadius: radius['3xl'],
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  plusPanelGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  plusPanelItem: { alignItems: 'center', gap: spacing.xs, width: '22%', marginBottom: spacing.md },
  plusPanelPressed: { transform: [{ scale: 0.98 }] },
  plusPanelIcon: {
    width: size.plusPanelIconLg,
    height: size.plusPanelIconLg,
    borderRadius: radius['2lg'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusPanelLabel: { fontSize: fontSize.sm, marginTop: spacing.xs },
  emojiPanelContainer: { flex: 1 },
  emojiPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
  },
  emojiPanelTitle: { fontSize: fontSize.md, fontWeight: '600' },
  emojiPanelClose: {
    width: size.iconButtonSm,
    height: size.iconButtonSm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiList: { paddingHorizontal: spacing.sm },
  emojiItem: { width: '12.5%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  emojiText: { fontSize: fontSize['2xl'] },
  imageViewerOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  imageViewerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: Platform.OS === 'ios' ? 50 : spacing.xl,
    paddingBottom: spacing.md,
    width: '100%',
  },
  imageViewerCloseBtn: {
    width: size.iconButtonLg,
    height: size.iconButtonLg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageViewerTitle: { color: palette.white, fontSize: fontSize.md, fontWeight: '600' },
  imageViewerContent: { flex: 1, justifyContent: 'center', alignItems: 'center', width: '100%' },
  imageViewerHint: { paddingBottom: spacing.xl, alignItems: 'center' },
})
