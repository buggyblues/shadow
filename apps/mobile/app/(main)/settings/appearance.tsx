import { Check, Monitor, Moon, Sun } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SettingsHeader } from '../../../src/components/common/settings-header'
import { type ThemeMode, useUIStore } from '../../../src/stores/ui.store'
import { fontSize, radius, spacing, useColors } from '../../../src/theme'

export default function AppearanceSettingsScreen() {
  const { t } = useTranslation()
  const colors = useColors()
  const { theme, setTheme } = useUIStore()

  const themes: { key: ThemeMode; icon: typeof Moon; label: string }[] = [
    { key: 'dark', icon: Moon, label: t('settings.darkTheme') },
    { key: 'light', icon: Sun, label: t('settings.lightTheme') },
    { key: 'system', icon: Monitor, label: t('settings.systemTheme') },
  ]

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SettingsHeader title={t('settings.tabAppearance')} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        <Text style={[styles.groupTitle, { color: colors.textMuted }]}>
          {t('settings.tabAppearance').toUpperCase()}
        </Text>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          {themes.map(({ key, icon: Icon, label }) => {
            const active = theme === key
            return (
              <Pressable
                key={key}
                style={[
                  styles.themeRow,
                  { borderBottomColor: colors.border },
                  key === 'system' && { borderBottomWidth: 0 },
                ]}
                onPress={() => setTheme(key)}
              >
                <View
                  style={[
                    styles.iconCircle,
                    { backgroundColor: active ? `${colors.primary}15` : colors.inputBackground },
                  ]}
                >
                  <Icon size={18} color={active ? colors.primary : colors.textMuted} />
                </View>
                <Text style={[styles.label, { color: active ? colors.primary : colors.text }]}>
                  {label}
                </Text>
                {active && <Check size={18} color={colors.primary} />}
              </Pressable>
            )
          })}
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: spacing.xl * 2 },
  groupTitle: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  card: { marginHorizontal: spacing.md, borderRadius: radius.xl, overflow: 'hidden' },
  themeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { flex: 1, fontSize: fontSize.md, fontWeight: '600' },
})
