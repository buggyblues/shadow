import { Check, Monitor, Moon, Sun } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { SettingsHeader } from '../../../src/components/common/settings-header'
import {
  AppText,
  BackgroundSurface,
  CardPressable,
  PageScroll,
  Section,
} from '../../../src/components/ui'
import { type ThemeMode, useUIStore } from '../../../src/stores/ui.store'
import { border, iconSize, palette, radius, size, spacing, useColors } from '../../../src/theme'

export default function AppearanceSettingsScreen() {
  const { t } = useTranslation()
  const colors = useColors()
  const { theme, setTheme } = useUIStore()

  const themes: Array<{
    key: ThemeMode
    icon: typeof Moon
    label: string
    description: string
  }> = [
    {
      key: 'light',
      icon: Sun,
      label: t('settings.themeLight'),
      description: t('settings.themeLightDesc'),
    },
    {
      key: 'dark',
      icon: Moon,
      label: t('settings.themeDark'),
      description: t('settings.themeDarkDesc'),
    },
    {
      key: 'system',
      icon: Monitor,
      label: t('settings.themeSystem'),
      description: t('settings.themeSystemDesc'),
    },
  ]

  return (
    <BackgroundSurface style={styles.container}>
      <SettingsHeader title={t('settings.tabAppearance')} />
      <PageScroll compact>
        <Section title={t('settings.themeLabel')} padded cardStyle={styles.section}>
          <View style={styles.themeGrid}>
            {themes.map(({ key, icon: Icon, label, description }) => {
              const active = theme === key
              return (
                <CardPressable
                  key={key}
                  active={active}
                  variant="glassCard"
                  padded={false}
                  onPress={() => setTheme(key)}
                  style={[
                    styles.themeTile,
                    {
                      borderColor: active ? colors.primary : colors.border,
                      backgroundColor: active ? colors.surfaceHover : colors.surface,
                    },
                  ]}
                >
                  <Icon
                    size={30}
                    color={active ? colors.primary : colors.textMuted}
                    strokeWidth={2.4}
                  />
                  <AppText
                    variant="bodyStrong"
                    tone={active ? 'primary' : 'primaryText'}
                    style={styles.themeTitle}
                  >
                    {label}
                  </AppText>
                  <AppText variant="label" tone="secondary" style={styles.themeDescription}>
                    {description}
                  </AppText>
                  {active ? (
                    <View style={[styles.checkBubble, { backgroundColor: colors.primary }]}>
                      <Check size={iconSize.sm} color={palette.white} strokeWidth={3} />
                    </View>
                  ) : null}
                </CardPressable>
              )
            })}
          </View>
        </Section>
      </PageScroll>
    </BackgroundSurface>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  section: {
    gap: spacing.lg,
  },
  themeGrid: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  themeTile: {
    flex: 1,
    minHeight: size.profileHeroMinHeight - size.thumbnailMd,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: border.active,
    borderRadius: radius['2xl'],
    paddingHorizontal: spacing.sm,
  },
  themeTitle: {
    textAlign: 'center',
  },
  themeDescription: {
    textAlign: 'center',
  },
  checkBubble: {
    width: size.controlXs,
    height: size.controlXs,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
