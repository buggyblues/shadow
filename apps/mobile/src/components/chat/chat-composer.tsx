import { AtSign, Camera, File, Image as ImageIcon, Mic, Plus, Smile, X } from 'lucide-react-native'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { Keyboard, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import type { EmojiType } from 'rn-emoji-keyboard'
import EmojiPicker from 'rn-emoji-keyboard'
import { fontSize, radius, spacing, useColors } from '../../theme'
import type { Message } from '../../types/message'

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
  isRecording: boolean
  voiceTranscript: string
  keyboardVisible?: boolean
  insetsBottom: number
  canUseVoice: boolean
  onToggleVoice: () => void
  showAtButton?: boolean
  onPressAt?: () => void
  showEmojiPicker: boolean
  setShowEmojiPicker: (value: boolean) => void
  showPlusMenu: boolean
  setShowPlusMenu: (value: boolean) => void
  onPickImage: () => void
  onPickFile: () => void
  onTakePhoto?: () => void
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
  isRecording,
  voiceTranscript,
  keyboardVisible = false,
  insetsBottom,
  canUseVoice,
  onToggleVoice,
  showAtButton = false,
  onPressAt,
  showEmojiPicker,
  setShowEmojiPicker,
  showPlusMenu,
  setShowPlusMenu,
  onPickImage,
  onPickFile,
  onTakePhoto,
}: ChatComposerProps) {
  const colors = useColors()
  const { t } = useTranslation()

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
            <View
              key={`${file.uri}-${idx}`}
              style={[styles.pendingFileChip, { backgroundColor: colors.inputBackground }]}
            >
              <Text
                style={[styles.pendingFileName, { color: colors.textSecondary }]}
                numberOfLines={1}
              >
                {file.type.startsWith('image/') ? '🖼 ' : '📎 '}
                {file.name}
              </Text>
              <Pressable onPress={() => onRemovePendingFile(idx)} hitSlop={8}>
                <X size={14} color={colors.textMuted} />
              </Pressable>
            </View>
          ))}
        </View>
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

      {isRecording && (
        <View
          style={[
            styles.voiceRecordingBar,
            { backgroundColor: colors.surface, borderTopColor: colors.border },
          ]}
        >
          <View style={styles.voiceRecordingDot} />
          <Text style={[styles.voiceRecordingLabel, { color: colors.error }]}>
            {t('chat.recording', '正在录音...')}
          </Text>
          {voiceTranscript ? (
            <Text style={[styles.voiceTranscript, { color: colors.text }]} numberOfLines={1}>
              {voiceTranscript}
            </Text>
          ) : (
            <Text style={[styles.voiceTranscript, { color: colors.textMuted }]}>
              {t('chat.speakNow', '请说话...')}
            </Text>
          )}
          <Pressable onPress={onToggleVoice} hitSlop={12}>
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
            paddingBottom: keyboardVisible ? 6 : Math.max(6, insetsBottom + 2),
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
          {canUseVoice && (
            <Pressable
              style={[styles.inputMicBtn, isRecording && { backgroundColor: colors.primary }]}
              onPress={onToggleVoice}
            >
              <Mic size={18} color={isRecording ? '#fff' : colors.textMuted} />
            </Pressable>
          )}
        </View>

        <Pressable
          style={styles.actionBtn}
          onPress={() => {
            setShowPlusMenu(false)
            setShowEmojiPicker(true)
          }}
        >
          <Smile size={24} color={showEmojiPicker ? colors.primary : colors.textMuted} />
        </Pressable>

        <Pressable
          style={[
            styles.actionBtn,
            { borderColor: colors.border, borderWidth: 1.5, borderRadius: 23 },
          ]}
          onPress={() => {
            if (showPlusMenu) {
              setShowPlusMenu(false)
              inputRef.current?.focus()
            } else {
              Keyboard.dismiss()
              setShowEmojiPicker(false)
              setShowPlusMenu(true)
            }
          }}
        >
          <Plus size={22} color={showPlusMenu ? colors.primary : colors.textMuted} />
        </Pressable>
      </View>

      {showEmojiPicker && (
        <EmojiPicker
          open={showEmojiPicker}
          onClose={() => setShowEmojiPicker(false)}
          onEmojiSelected={(emoji: EmojiType) => {
            onInputChange(inputText + emoji.emoji)
            setTimeout(() => inputRef.current?.focus(), 100)
          }}
          enableSearchBar
          enableRecentlyUsed
          categoryPosition="top"
          theme={{
            backdrop: 'rgba(0,0,0,0.3)',
            knob: colors.textMuted,
            container: colors.surface,
            header: colors.text,
            category: {
              icon: colors.textMuted,
              iconActive: colors.primary,
              container: colors.surface,
              containerActive: colors.surfaceHover,
            },
            search: {
              background: colors.inputBackground,
              text: colors.text,
              placeholder: colors.textMuted,
              icon: colors.textMuted,
            },
            emoji: { selected: colors.surfaceHover },
          }}
        />
      )}

      {showPlusMenu && (
        <View
          style={[
            styles.plusPanel,
            {
              backgroundColor: colors.surface,
              borderTopColor: colors.border,
              paddingBottom: Math.max(insetsBottom, 16),
            },
          ]}
        >
          <View style={styles.plusPanelGrid}>
            {onTakePhoto && (
              <Pressable
                style={({ pressed }) => [styles.plusPanelItem, pressed && { opacity: 0.6 }]}
                onPress={() => {
                  setShowPlusMenu(false)
                  onTakePhoto()
                }}
              >
                <View style={[styles.plusPanelIcon, { backgroundColor: '#10b98115' }]}>
                  <Camera size={24} color="#10b981" />
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
                <ImageIcon size={24} color={colors.primary} />
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
                <File size={24} color="#f59e0b" />
              </View>
              <Text style={[styles.plusPanelLabel, { color: colors.textSecondary }]}>
                {t('chat.pickFile', '文件')}
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </>
  )
})

const styles = StyleSheet.create({
  typingBar: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
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
  pendingFileName: {
    fontSize: fontSize.xs,
    flexShrink: 1,
  },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderTopWidth: 1,
    gap: spacing.sm,
  },
  replyBarAccent: {
    width: 3,
    height: '100%',
    borderRadius: 2,
  },
  replyBarContent: {
    flex: 1,
  },
  replyBarLabel: {
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  replyBarPreview: {
    fontSize: fontSize.xs,
  },
  voiceRecordingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderTopWidth: 1,
    gap: 8,
  },
  voiceRecordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
  },
  voiceRecordingLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  voiceTranscript: {
    flex: 1,
    fontSize: fontSize.sm,
  },
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
  plusPanel: {
    borderTopWidth: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  plusPanelGrid: {
    flexDirection: 'row',
    gap: spacing.xl,
  },
  plusPanelItem: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  plusPanelIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusPanelLabel: {
    fontSize: fontSize.xs,
  },
})
