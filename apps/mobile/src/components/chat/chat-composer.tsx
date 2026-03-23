import { Image } from 'expo-image'
import { AtSign, Camera, ClipboardPaste, File, Image as ImageIcon, Mic, Plus, Smile, X } from 'lucide-react-native'
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
  TextInput,
  View,
} from 'react-native'
import { fontSize, radius, spacing, useColors } from '../../theme'
import type { Message } from '../../types/message'
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
  pendingFiles: Array<{ uri: string; name: string; type: string; size?: number }>
  onRemovePendingFile: (index: number) => void
  replyTo: Message | null
  onClearReply: () => void
  typingUsers: string[]
  isRecording?: boolean
  isHolding?: boolean
  voiceTranscript?: string
  keyboardVisible?: boolean
  insetsBottom: number
  panelHeight?: number
  canUseVoice: boolean
  onToggleVoice?: () => void
  onVoicePressIn?: () => void
  onVoicePressOut?: () => void
  showAtButton?: boolean
  onPressAt?: () => void
  showEmojiPicker: boolean
  setShowEmojiPicker: (value: boolean) => void
  showPlusMenu: boolean
  setShowPlusMenu: (value: boolean) => void
  onPickImage: () => void
  onPickFile: () => void
  onTakePhoto?: () => void
  onPaste?: () => void
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
      <View style={[styles.imageViewerOverlay, { backgroundColor: 'rgba(0,0,0,0.95)' }]}>
        <View style={styles.imageViewerHeader}>
          <Pressable onPress={onClose} hitSlop={8} style={styles.imageViewerCloseBtn}>
            <X size={24} color="#fff" />
          </Pressable>
          <Text style={styles.imageViewerTitle}>{t('chat.imagePreview', '图片预览')}</Text>
          <View style={{ width: 40 }} />
        </View>
        <Pressable style={styles.imageViewerContent} onPress={onClose}>
          <Image
            source={{ uri }}
            style={{ width: screenWidth, height: screenHeight * 0.7 }}
            contentFit="contain"
            transition={200}
          />
        </Pressable>
        <View style={styles.imageViewerHint}>
          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: fontSize.sm }}>
            {t('chat.tapToClose', '点击关闭')}
          </Text>
        </View>
      </View>
    </Modal>
  )
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
  keyboardVisible: _keyboardVisible = false,
  insetsBottom,
  panelHeight = 320,
  canUseVoice,
  onToggleVoice,
  onVoicePressIn,
  onVoicePressOut,
  showAtButton = false,
  onPressAt,
  showEmojiPicker,
  setShowEmojiPicker,
  showPlusMenu,
  setShowPlusMenu,
  onPickImage,
  onPickFile,
  onTakePhoto,
  onPaste,
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
  const panelRequested = showPlusMenu || showEmojiPicker

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
      const height = e.endCoordinates.height
      const duration = e.duration ?? 250
      // Close panels — keyboard takes over the bottom slot
      setShowPlusMenu(false)
      setShowEmojiPicker(false)
      animateBottomTo(height, duration)
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

  // Plus-button rotation animation
  const rotateAnim = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(rotateAnim, {
      toValue: panelRequested ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start()
  }, [panelRequested, rotateAnim])

  const rotateInterpolate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '45deg'],
  })

  return (
    <>
      {typingUsers.length > 0 && (
        <View style={styles.typingBar}>
          <Text style={{ color: colors.textMuted, fontSize: fontSize.xs }} numberOfLines={1}>
            {typingUsers.join(', ')}{' '}
            {typingUsers.length === 1 ? t('chat.isTyping') : t('chat.areTyping')}
          </Text>
        </View>
      )}

      {pendingFiles.length > 0 && (
        <View
          style={[
            styles.pendingFilesBar,
            { backgroundColor: colors.surface, borderTopColor: colors.border },
          ]}
        >
          {pendingFiles.map((file, idx) => (
            <View key={file.uri}>
              {file.type.startsWith('image/') ? (
                <Pressable
                  onPress={() => setViewingImageUri(file.uri)}
                  style={[styles.pendingImageChip, { backgroundColor: colors.inputBackground }]}
                >
                  <Image
                    source={{ uri: file.uri }}
                    style={styles.pendingImageThumb}
                    contentFit="contain"
                  />
                  <Pressable
                    onPress={() => onRemovePendingFile(idx)}
                    hitSlop={8}
                    style={styles.pendingImageRemoveBtn}
                  >
                    <X size={14} color="#fff" />
                  </Pressable>
                </Pressable>
              ) : (
                <View style={[styles.pendingFileChip, { backgroundColor: colors.inputBackground }]}>
                  <Text
                    style={[styles.pendingFileName, { color: colors.textSecondary }]}
                    numberOfLines={1}
                  >
                    📎 {file.name}
                  </Text>
                  <Pressable onPress={() => onRemovePendingFile(idx)} hitSlop={8}>
                    <X size={14} color={colors.textMuted} />
                  </Pressable>
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
        <View
          style={[
            styles.replyBar,
            { backgroundColor: colors.surface, borderTopColor: colors.border },
          ]}
        >
          <View style={[styles.replyBarAccent, { backgroundColor: colors.primary }]} />
          <View style={styles.replyBarContent}>
            <Text style={[styles.replyBarLabel, { color: colors.primary }]}>
              {t('chat.replyingTo')} {replyTo.author?.displayName || replyTo.author?.username}
            </Text>
            <Text style={[styles.replyBarPreview, { color: colors.textMuted }]} numberOfLines={1}>
              {replyTo.content}
            </Text>
          </View>
          <Pressable onPress={onClearReply} hitSlop={8}>
            <X size={18} color={colors.textMuted} />
          </Pressable>
        </View>
      )}

      <View
        style={[
          styles.inputBar,
          {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            paddingBottom: 8,
          },
        ]}
      >
        {showAtButton && onPressAt && (
          <Pressable
            style={[styles.actionBtn, { backgroundColor: colors.inputBackground }]}
            onPress={onPressAt}
          >
            <AtSign size={22} color={colors.textMuted} />
          </Pressable>
        )}

        <View style={[styles.inputWrapper, { backgroundColor: colors.inputBackground }]}>
          <TextInput
            ref={inputRef}
            style={[styles.textInput, { color: colors.text }]}
            value={inputText}
            onChangeText={onInputChange}
            placeholder={t('chat.messagePlaceholder')}
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={4000}
            blurOnSubmit={false}
            submitBehavior="submit"
            onSubmitEditing={onSend}
            returnKeyType="send"
            keyboardAppearance="dark"
          />
          {canUseVoice && onVoicePressIn && onVoicePressOut ? (
            <TypelessMicButton
              isRecording={isRecording}
              isHolding={isHolding}
              onPressIn={onVoicePressIn}
              onPressOut={onVoicePressOut}
            />
          ) : canUseVoice && onToggleVoice ? (
            <Pressable
              style={[styles.inputMicBtn, isRecording && { backgroundColor: colors.primary }]}
              onPress={onToggleVoice}
            >
              <Mic size={18} color={isRecording ? '#fff' : colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        <Pressable
          style={[
            styles.actionBtn,
            { borderColor: colors.border, borderWidth: 1.5, borderRadius: 23 },
          ]}
          onPress={() => {
            if (panelRequested) {
              // Panel → keyboard: focus input, keyboardWillShow handles the rest
              inputRef.current?.focus()
            } else if (keyboardUpRef.current) {
              // Keyboard → panel: tell hide-handler to keep slot height
              panelIntentRef.current = true
              setShowEmojiPicker(false)
              setShowPlusMenu(true)
              Keyboard.dismiss()
            } else {
              // Idle → panel
              setShowEmojiPicker(false)
              setShowPlusMenu(true)
            }
          }}
        >
          <Animated.View style={{ transform: [{ rotate: rotateInterpolate }] }}>
            <Plus size={22} color={panelRequested ? colors.primary : colors.textMuted} />
          </Animated.View>
        </Pressable>
      </View>

      {/* Bottom slot — always rendered; height tracks keyboard / panel / idle */}
      <Animated.View
        style={{
          height: bottomHeightAnim,
          overflow: 'hidden',
          backgroundColor: colors.surface,
        }}
      >
        {panelRequested && (
          <View style={[styles.plusPanel, { borderTopColor: colors.border, height: panelHeight }]}>
            {showEmojiPicker ? (
              <View style={styles.emojiPanelContainer}>
                <View style={styles.emojiPanelHeader}>
                  <Text style={[styles.emojiPanelTitle, { color: colors.text }]}>
                    {t('chat.emoji', '表情')}
                  </Text>
                  <Pressable
                    onPress={() => setShowEmojiPicker(false)}
                    style={styles.emojiPanelClose}
                  >
                    <X size={20} color={colors.textMuted} />
                  </Pressable>
                </View>
                <FlatList
                  data={COMMON_EMOJIS}
                  numColumns={8}
                  keyExtractor={(item, index) => `${item}-${index}`}
                  renderItem={({ item }) => (
                    <Pressable
                      style={({ pressed }) => [
                        styles.emojiItem,
                        pressed && { backgroundColor: colors.surfaceHover, borderRadius: 8 },
                      ]}
                      onPress={() => {
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
                  style={({ pressed }) => [styles.plusPanelItem, pressed && { opacity: 0.6 }]}
                  onPress={() => setShowEmojiPicker(true)}
                >
                  <View style={[styles.plusPanelIcon, { backgroundColor: '#fbbf2415' }]}>
                    <Smile size={28} color="#fbbf24" />
                  </View>
                  <Text style={[styles.plusPanelLabel, { color: colors.textSecondary }]}>
                    {t('chat.emoji', '表情')}
                  </Text>
                </Pressable>
                {onTakePhoto && (
                  <Pressable
                    style={({ pressed }) => [styles.plusPanelItem, pressed && { opacity: 0.6 }]}
                    onPress={() => {
                      setShowPlusMenu(false)
                      onTakePhoto()
                    }}
                  >
                    <View style={[styles.plusPanelIcon, { backgroundColor: '#10b98115' }]}>
                      <Camera size={28} color="#10b981" />
                    </View>
                    <Text style={[styles.plusPanelLabel, { color: colors.textSecondary }]}>
                      {t('chat.takePhoto', '拍摄')}
                    </Text>
                  </Pressable>
                )}
                <Pressable
                  style={({ pressed }) => [styles.plusPanelItem, pressed && { opacity: 0.6 }]}
                  onPress={() => {
                    setShowPlusMenu(false)
                    onPickImage()
                  }}
                >
                  <View style={[styles.plusPanelIcon, { backgroundColor: `${colors.primary}15` }]}>
                    <ImageIcon size={28} color={colors.primary} />
                  </View>
                  <Text style={[styles.plusPanelLabel, { color: colors.textSecondary }]}>
                    {t('chat.pickImage', '相册')}
                  </Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.plusPanelItem, pressed && { opacity: 0.6 }]}
                  onPress={() => {
                    setShowPlusMenu(false)
                    onPickFile()
                  }}
                >
                  <View style={[styles.plusPanelIcon, { backgroundColor: '#f59e0b15' }]}>
                    <File size={28} color="#f59e0b" />
                  </View>
                  <Text style={[styles.plusPanelLabel, { color: colors.textSecondary }]}>
                    {t('chat.pickFile', '文件')}
                  </Text>
                </Pressable>
                {onPaste && (
                  <Pressable
                    style={({ pressed }) => [styles.plusPanelItem, pressed && { opacity: 0.6 }]}
                    onPress={() => {
                      setShowPlusMenu(false)
                      onPaste()
                    }}
                  >
                    <View style={[styles.plusPanelIcon, { backgroundColor: '#8b5cf615' }]}>
                      <ClipboardPaste size={28} color="#8b5cf6" />
                    </View>
                    <Text style={[styles.plusPanelLabel, { color: colors.textSecondary }]}>
                      {t('chat.paste', '粘贴')}
                    </Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        )}
      </Animated.View>
    </>
  )
})

const styles = StyleSheet.create({
  typingBar: { paddingHorizontal: spacing.md, paddingVertical: 6 },
  pendingFilesBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  pendingFileChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
    maxWidth: 180,
  },
  pendingFileName: { fontSize: fontSize.xs, flexShrink: 1 },
  pendingImageChip: { borderRadius: radius.md, overflow: 'hidden', position: 'relative' },
  pendingImageThumb: { width: 80, height: 80, borderRadius: radius.md },
  pendingImageRemoveBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderTopWidth: 1,
    gap: spacing.sm,
  },
  replyBarAccent: { width: 3, height: '100%', borderRadius: 2 },
  replyBarContent: { flex: 1 },
  replyBarLabel: { fontSize: fontSize.xs, fontWeight: '600' },
  replyBarPreview: { fontSize: fontSize.xs },
  voiceRecordingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderTopWidth: 1,
    gap: 8,
  },
  voiceRecordingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ef4444' },
  voiceRecordingLabel: { fontSize: fontSize.xs, fontWeight: '600' },
  voiceTranscript: { flex: 1, fontSize: fontSize.sm },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.sm,
    paddingTop: 8,
    gap: 8,
    borderTopWidth: 1,
  },
  actionBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 0,
  },
  inputWrapper: {
    flex: 1,
    borderRadius: radius.xl,
    flexDirection: 'row',
    alignItems: 'flex-end',
    minHeight: 46,
    maxHeight: 120,
    position: 'relative',
  },
  textInput: {
    flex: 1,
    minHeight: 46,
    maxHeight: 120,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? 12 : spacing.md,
    fontSize: fontSize.md,
    paddingRight: 28,
  },
  inputMicBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    right: 4,
    bottom: 6,
  },
  plusPanel: { borderTopWidth: 1, paddingHorizontal: spacing.md, paddingTop: spacing.md },
  plusPanelGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  plusPanelItem: { alignItems: 'center', gap: spacing.xs, width: '22%', marginBottom: spacing.md },
  plusPanelIcon: {
    width: 60,
    height: 60,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusPanelLabel: { fontSize: fontSize.sm, marginTop: 4 },
  emojiPanelContainer: { flex: 1 },
  emojiPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
  },
  emojiPanelTitle: { fontSize: fontSize.md, fontWeight: '600' },
  emojiPanelClose: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  emojiList: { paddingHorizontal: spacing.sm },
  emojiItem: { width: '12.5%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  emojiText: { fontSize: 24 },
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
  imageViewerCloseBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  imageViewerTitle: { color: '#fff', fontSize: fontSize.md, fontWeight: '600' },
  imageViewerContent: { flex: 1, justifyContent: 'center', alignItems: 'center', width: '100%' },
  imageViewerHint: { paddingBottom: spacing.xl, alignItems: 'center' },
})
