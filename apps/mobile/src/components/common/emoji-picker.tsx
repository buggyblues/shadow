import { useCallback, useState } from 'react'
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { fontSize, radius, spacing, useColors } from '../../theme'

interface EmojiPickerProps {
  visible: boolean
  onSelect: (emoji: string) => void
  onClose: () => void
}

const CATEGORIES: { key: string; label: string; icon: string; emojis: string[] }[] = [
  {
    key: 'frequent',
    label: '常用',
    icon: '🕐',
    emojis: [
      '👍',
      '❤️',
      '😂',
      '🎉',
      '🤔',
      '👀',
      '🔥',
      '💯',
      '😍',
      '🥺',
      '😭',
      '🙏',
      '😊',
      '👏',
      '🤝',
      '✅',
      '❌',
      '⭐',
      '💪',
      '🤣',
    ],
  },
  {
    key: 'smileys',
    label: '表情',
    icon: '😀',
    emojis: [
      '😀',
      '😃',
      '😄',
      '😁',
      '😆',
      '😅',
      '🤣',
      '😂',
      '🙂',
      '😊',
      '😇',
      '🥰',
      '😍',
      '🤩',
      '😘',
      '😗',
      '😚',
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
      '😐',
      '😑',
      '😶',
      '😏',
      '😒',
      '🙄',
      '😬',
      '😮‍💨',
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
      '😵',
      '🤯',
      '🤠',
      '🥳',
      '🥸',
      '😎',
      '🤓',
      '😤',
      '😡',
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
      '🤖',
    ],
  },
  {
    key: 'gestures',
    label: '手势',
    icon: '👋',
    emojis: [
      '👋',
      '🤚',
      '🖐️',
      '✋',
      '🖖',
      '👌',
      '🤌',
      '🤏',
      '✌️',
      '🤞',
      '🤟',
      '🤘',
      '🤙',
      '👈',
      '👉',
      '👆',
      '🖕',
      '👇',
      '☝️',
      '👍',
      '👎',
      '✊',
      '👊',
      '🤛',
      '🤜',
      '👏',
      '🙌',
      '👐',
      '🤲',
      '🤝',
      '🙏',
      '💪',
      '🦾',
      '🖋️',
    ],
  },
  {
    key: 'hearts',
    label: '爱心',
    icon: '❤️',
    emojis: [
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
    ],
  },
  {
    key: 'nature',
    label: '自然',
    icon: '🌸',
    emojis: [
      '🐶',
      '🐱',
      '🐭',
      '🐹',
      '🐰',
      '🦊',
      '🐻',
      '🐼',
      '🐨',
      '🐯',
      '🦁',
      '🐮',
      '🐷',
      '🐸',
      '🐵',
      '🙈',
      '🙉',
      '🙊',
      '🐔',
      '🐧',
      '🐦',
      '🦆',
      '🦅',
      '🦉',
      '🦇',
      '🐺',
      '🐗',
      '🐴',
      '🦄',
      '🐝',
      '🌸',
      '🌺',
      '🌻',
      '🌹',
      '🌷',
      '🌿',
      '🍀',
      '🌳',
      '🌲',
      '⭐',
      '🌙',
      '☀️',
      '🌈',
      '🔥',
      '💧',
      '❄️',
      '🌊',
    ],
  },
  {
    key: 'food',
    label: '食物',
    icon: '🍔',
    emojis: [
      '🍎',
      '🍊',
      '🍋',
      '🍌',
      '🍉',
      '🍇',
      '🍓',
      '🫐',
      '🍑',
      '🥭',
      '🍍',
      '🥥',
      '🥝',
      '🍅',
      '🥑',
      '🍔',
      '🍟',
      '🍕',
      '🌭',
      '🥪',
      '🌮',
      '🍣',
      '🍜',
      '🍝',
      '🍰',
      '🎂',
      '🍩',
      '🍪',
      '🍫',
      '🍬',
      '☕',
      '🍵',
      '🥤',
      '🍺',
      '🍷',
      '🥂',
    ],
  },
  {
    key: 'objects',
    label: '物品',
    icon: '💡',
    emojis: [
      '⚽',
      '🏀',
      '🏈',
      '⚾',
      '🎾',
      '🏐',
      '🎱',
      '🏓',
      '🎮',
      '🕹️',
      '🎲',
      '🧩',
      '🎯',
      '🎨',
      '🎬',
      '🎤',
      '🎧',
      '🎸',
      '🎹',
      '🎺',
      '💡',
      '📱',
      '💻',
      '⌨️',
      '🖥️',
      '📷',
      '🔑',
      '🔒',
      '📦',
      '📌',
      '📎',
      '🔧',
      '🔨',
      '⚙️',
      '💰',
      '💎',
      '🏆',
      '🥇',
      '🥈',
      '🥉',
    ],
  },
  {
    key: 'symbols',
    label: '符号',
    icon: '✅',
    emojis: [
      '✅',
      '❌',
      '❓',
      '❗',
      '💯',
      '🔴',
      '🟠',
      '🟡',
      '🟢',
      '🔵',
      '🟣',
      '⚫',
      '⚪',
      '🟤',
      '🔺',
      '🔻',
      '💠',
      '🔶',
      '🔷',
      '▶️',
      '⏸️',
      '⏹️',
      '⏭️',
      '🔀',
      '🔁',
      '🔂',
      '➕',
      '➖',
      '➗',
      '✖️',
      '♻️',
      '🔔',
      '🔕',
      '📢',
      '💬',
      '💭',
      '🏳️',
      '🏴',
      '🚩',
    ],
  },
]

const COLS = 8

export function EmojiPicker({ visible, onSelect, onClose }: EmojiPickerProps) {
  const colors = useColors()
  const insets = useSafeAreaInsets()
  const [activeCategory, setActiveCategory] = useState('frequent')

  const activeEmojis = CATEGORIES.find((c) => c.key === activeCategory)?.emojis ?? []

  const handleSelect = useCallback(
    (emoji: string) => {
      onSelect(emoji)
      onClose()
    },
    [onSelect, onClose],
  )

  const renderEmoji = useCallback(
    ({ item }: { item: string }) => (
      <Pressable style={styles.emojiCell} onPress={() => handleSelect(item)}>
        <Text style={styles.emojiText}>{item}</Text>
      </Pressable>
    ),
    [handleSelect],
  )

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View
        style={[
          styles.container,
          {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            paddingBottom: Math.max(spacing.sm, insets.bottom),
          },
        ]}
      >
        {/* Category tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryBar}
          contentContainerStyle={styles.categoryContent}
        >
          {CATEGORIES.map((cat) => (
            <Pressable
              key={cat.key}
              style={[
                styles.categoryBtn,
                activeCategory === cat.key && {
                  backgroundColor: `${colors.primary}20`,
                  borderBottomColor: colors.primary,
                  borderBottomWidth: 2,
                },
              ]}
              onPress={() => setActiveCategory(cat.key)}
            >
              <Text style={styles.categoryIcon}>{cat.icon}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Emoji grid */}
        <FlatList
          data={activeEmojis}
          renderItem={renderEmoji}
          keyExtractor={(item) => item}
          numColumns={COLS}
          style={styles.grid}
          contentContainerStyle={styles.gridContent}
          showsVerticalScrollIndicator={false}
        />
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
  },
  container: {
    borderTopWidth: 1,
    maxHeight: 320,
  },
  categoryBar: {
    maxHeight: 44,
  },
  categoryContent: {
    paddingHorizontal: spacing.xs,
    gap: spacing.xs,
  },
  categoryBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  categoryIcon: {
    fontSize: 20,
  },
  grid: {
    flex: 1,
  },
  gridContent: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  emojiCell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: `${100 / COLS}%`,
  },
  emojiText: {
    fontSize: fontSize['2xl'],
  },
})
