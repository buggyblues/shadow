import { Check } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { changeLanguage, supportedLanguages } from '../../i18n'
import { fontSize, iconSize, radius, size, spacing, useColors } from '../../theme'

interface LanguageSwitcherProps {
  visible?: boolean
  onClose?: () => void
}

export function LanguageSwitcher({ visible, onClose }: LanguageSwitcherProps) {
  const { i18n } = useTranslation()
  const colors = useColors()

  // Inline mode: render language list directly
  if (visible === undefined) {
    return (
      <View style={{ borderRadius: radius.lg }}>
        {supportedLanguages.map((lang) => (
          <Pressable
            key={lang.code}
            style={[styles.item, { borderBottomColor: colors.border }]}
            onPress={() => changeLanguage(lang.code)}
          >
            <Text style={[styles.label, { color: colors.text }]}>{lang.label}</Text>
            {i18n.language === lang.code && <Check size={iconSize.md} color={colors.primary} />}
          </Pressable>
        ))}
      </View>
    )
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={[styles.overlay, { backgroundColor: colors.overlay }]} onPress={onClose}>
        <View
          style={[styles.sheet, { backgroundColor: colors.card }]}
          onStartShouldSetResponder={() => true}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <Text style={[styles.title, { color: colors.text }]}>🌐 Language</Text>
          <FlatList
            data={[...supportedLanguages]}
            keyExtractor={(item) => item.code}
            renderItem={({ item }) => {
              const isActive = i18n.language === item.code
              return (
                <Pressable
                  style={[
                    styles.item,
                    { backgroundColor: isActive ? colors.surfaceHover : colors.surface },
                  ]}
                  onPress={() => {
                    changeLanguage(item.code)
                    onClose?.()
                  }}
                >
                  <Text style={styles.flag}>{item.flag}</Text>
                  <Text style={[styles.label, { color: colors.text }]}>{item.label}</Text>
                  {isActive && <Check size={iconSize.lg} color={colors.primary} />}
                </Pressable>
              )
            }}
          />
        </View>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingBottom: spacing['3xl'],
    paddingHorizontal: spacing.lg,
  },
  handle: {
    width: size.iconButtonMd,
    height: size.dotXs,
    borderRadius: radius.xs,
    alignSelf: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    gap: spacing.md,
  },
  flag: {
    fontSize: fontSize.xl,
  },
  label: {
    flex: 1,
    fontSize: fontSize.md,
  },
})
