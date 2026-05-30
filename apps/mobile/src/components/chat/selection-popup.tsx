import { Fragment } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { fontSize, palette, radius, size, spacing } from '../../theme'

export interface PopupAction {
  label: string
  onPress: () => void
}

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥']

interface SelectionPopupProps {
  actions: PopupAction[]
  arrowDirection?: 'down' | 'up'
  onQuickReaction?: (emoji: string) => void
}

export function SelectionPopup({
  actions,
  arrowDirection = 'down',
  onQuickReaction,
}: SelectionPopupProps) {
  if (actions.length === 0) return null

  return (
    <View style={popupStyles.container}>
      {arrowDirection === 'up' && <View style={popupStyles.arrowUp} />}
      <View style={popupStyles.card}>
        {/* Quick emoji row */}
        {onQuickReaction && (
          <View style={popupStyles.emojiRow}>
            {QUICK_EMOJIS.map((emoji) => (
              <Pressable
                key={emoji}
                style={({ pressed }) => [
                  popupStyles.emojiBtn,
                  pressed && popupStyles.emojiBtnPressed,
                ]}
                onPress={() => onQuickReaction(emoji)}
              >
                <Text style={popupStyles.emojiText}>{emoji}</Text>
              </Pressable>
            ))}
          </View>
        )}
        {/* Action buttons */}
        <View style={popupStyles.actionRow}>
          {actions.map((action, i) => (
            <Fragment key={action.label}>
              {i > 0 && <View style={popupStyles.divider} />}
              <Pressable
                style={({ pressed }) => [popupStyles.action, pressed && popupStyles.actionPressed]}
                onPress={action.onPress}
              >
                <Text style={popupStyles.actionText}>{action.label}</Text>
              </Pressable>
            </Fragment>
          ))}
        </View>
      </View>
      {arrowDirection === 'down' && <View style={popupStyles.arrowDown} />}
    </View>
  )
}

const popupStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  card: {
    backgroundColor: palette.neutral600,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.neutral500,
  },
  emojiRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.tight,
  },
  emojiBtn: {
    width: size.iconButtonLg,
    height: size.iconButtonMd,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  emojiBtnPressed: {
    backgroundColor: palette.neutral600,
  },
  emojiText: {
    fontSize: fontSize.xl,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.neutral500,
  },
  action: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
  actionPressed: {
    backgroundColor: palette.neutral600,
  },
  actionText: {
    color: palette.white,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: size.badgeMd,
    backgroundColor: palette.neutral500,
  },
  arrowDown: {
    width: spacing.none,
    height: spacing.none,
    borderLeftWidth: spacing.sm,
    borderRightWidth: spacing.sm,
    borderTopWidth: spacing.sm,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: palette.neutral600,
  },
  arrowUp: {
    width: spacing.none,
    height: spacing.none,
    borderLeftWidth: spacing.sm,
    borderRightWidth: spacing.sm,
    borderBottomWidth: spacing.sm,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: palette.neutral600,
  },
})
