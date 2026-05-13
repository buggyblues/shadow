import { Check, Monitor, Moon, Sun, X, Zap } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { ImageBackground, ScrollView, StyleSheet, View } from 'react-native'
import { SettingsHeader } from '../../../src/components/common/settings-header'
import {
  AppSwitch,
  AppText,
  BackgroundSurface,
  CardPressable,
  GlassPanel,
} from '../../../src/components/ui'
import { BACKGROUND_OPTIONS, type BackgroundOption } from '../../../src/lib/backgrounds'
import { type ThemeMode, useUIStore } from '../../../src/stores/ui.store'
import { fontSize, radius, spacing, useColors } from '../../../src/theme'

export default function AppearanceSettingsScreen() {
  const { t } = useTranslation()
  const colors = useColors()
  const {
    theme,
    setTheme,
    backgroundImage,
    setBackgroundImage,
    enableBackgroundMovement,
    setEnableBackgroundMovement,
  } = useUIStore()

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
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <GlassPanel style={styles.section}>
          <AppText variant="label" tone="secondary" style={styles.sectionLabel}>
            {t('settings.themeLabel')}
          </AppText>
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
                      borderColor: active ? colors.primary : colors.glassLine,
                      backgroundColor: active ? `${colors.primary}20` : colors.glass,
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
                      <Check size={14} color="#FFFFFF" strokeWidth={3} />
                    </View>
                  ) : null}
                </CardPressable>
              )
            })}
          </View>
        </GlassPanel>

        <GlassPanel style={styles.section}>
          <AppText variant="label" tone="secondary" style={styles.sectionLabel}>
            {t('settings.backgroundLabel')}
          </AppText>
          <View style={styles.backgroundGrid}>
            {BACKGROUND_OPTIONS.map((option) => (
              <BackgroundTile
                key={option.id}
                option={option}
                active={backgroundImage === option.id}
                onPress={() => setBackgroundImage(option.id)}
              />
            ))}
          </View>

          <View style={[styles.divider, { backgroundColor: colors.glassLine }]} />

          <View style={styles.movementRow}>
            <View style={[styles.movementIcon, { backgroundColor: colors.inputBackground }]}>
              <Zap size={22} color={colors.textMuted} strokeWidth={2.4} />
            </View>
            <View style={styles.movementCopy}>
              <AppText variant="bodyStrong">{t('settings.backgroundMovementLabel')}</AppText>
              <AppText variant="label" tone="secondary">
                {t('settings.backgroundMovementDesc')}
              </AppText>
            </View>
            <AppSwitch
              value={enableBackgroundMovement}
              onValueChange={setEnableBackgroundMovement}
            />
          </View>
        </GlassPanel>
      </ScrollView>
    </BackgroundSurface>
  )
}

function BackgroundTile({
  option,
  active,
  onPress,
}: {
  option: BackgroundOption
  active: boolean
  onPress: () => void
}) {
  const { t } = useTranslation()
  const colors = useColors()
  const label = t(option.labelKey)

  return (
    <CardPressable
      active={active}
      variant="glassCard"
      padded={false}
      onPress={onPress}
      style={[
        styles.backgroundTile,
        {
          borderColor: active ? colors.primary : colors.glassLine,
          backgroundColor: option.source ? colors.inputBackground : colors.glassSoft,
        },
      ]}
    >
      {option.source ? (
        <ImageBackground
          source={option.source}
          resizeMode="cover"
          style={StyleSheet.absoluteFill}
          imageStyle={styles.backgroundImage}
        />
      ) : (
        <View style={[styles.noneTile, { backgroundColor: colors.inputBackground }]}>
          <X size={28} color={colors.textMuted} strokeWidth={2.2} />
        </View>
      )}
      <View style={styles.backgroundScrim} />
      <AppText variant="label" style={styles.backgroundLabel} numberOfLines={1}>
        {label}
      </AppText>
      {active ? (
        <View
          style={[styles.checkBubble, styles.backgroundCheck, { backgroundColor: colors.primary }]}
        >
          <Check size={13} color="#FFFFFF" strokeWidth={3} />
        </View>
      ) : null}
    </CardPressable>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing['4xl'],
    gap: spacing.lg,
  },
  section: {
    gap: spacing.lg,
    padding: spacing.lg,
  },
  sectionLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  themeGrid: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  themeTile: {
    flex: 1,
    minHeight: 150,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 2,
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
    width: 28,
    height: 28,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backgroundGrid: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  backgroundTile: {
    flex: 1,
    minHeight: 82,
    borderWidth: 2,
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  backgroundImage: {
    borderRadius: radius.xl,
  },
  noneTile: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backgroundScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
  },
  backgroundLabel: {
    position: 'absolute',
    left: spacing.sm,
    right: spacing.sm,
    bottom: spacing.sm,
    color: '#FFFFFF',
    fontSize: fontSize.xs,
    fontWeight: '900',
  },
  backgroundCheck: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  movementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  movementIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  movementCopy: {
    flex: 1,
    minWidth: 0,
  },
})
