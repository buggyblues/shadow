import { useRouter } from 'expo-router'
import {
  AppWindow,
  ChevronRight,
  Cloud,
  type LucideIcon,
  Rss,
  Server,
  ShoppingBag,
} from 'lucide-react-native'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, View } from 'react-native'
import {
  AppText,
  BackgroundSurface,
  MobileNavigationBar,
  PageScroll,
} from '../../../src/components/ui'
import { selectionHaptic } from '../../../src/lib/haptics'
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
} from '../../../src/theme'

type DiscoverRoute =
  | '/(main)/discover/subscriptions'
  | '/(main)/discover/explore'
  | '/(main)/discover/apps'
  | '/(main)/discover/market'
  | '/(main)/discover/cloud'

interface DiscoverEntry {
  key: string
  label: string
  description: string
  icon: LucideIcon
  color: string
  href: DiscoverRoute
}

export default function SubscriptionsScreen() {
  const { t } = useTranslation()
  const colors = useColors()
  const router = useRouter()

  const entries = useMemo<DiscoverEntry[]>(
    () => [
      {
        key: 'subscriptions',
        label: t('contentFeed.title'),
        description: t('contentFeed.emptyDesc'),
        icon: Rss,
        color: colors.primary,
        href: '/(main)/discover/subscriptions',
      },
      {
        key: 'servers',
        label: t('discover.views.explore'),
        description: t('discover.laneDescriptions.communities'),
        icon: Server,
        color: palette.cyan,
        href: '/(main)/discover/explore',
      },
      {
        key: 'apps',
        label: t('discover.views.apps'),
        description: t('discover.laneDescriptions.apps'),
        icon: AppWindow,
        color: palette.indigo,
        href: '/(main)/discover/apps',
      },
      {
        key: 'market',
        label: t('discover.views.market'),
        description: t('discover.laneDescriptions.market'),
        icon: ShoppingBag,
        color: palette.warning,
        href: '/(main)/discover/market',
      },
      {
        key: 'cloud',
        label: t('discover.views.cloud'),
        description: t('discover.laneDescriptions.cloud'),
        icon: Cloud,
        color: palette.emerald,
        href: '/(main)/discover/cloud',
      },
    ],
    [colors.primary, t],
  )

  const openEntry = (href: DiscoverRoute) => {
    selectionHaptic()
    router.push(href as never)
  }

  return (
    <BackgroundSurface>
      <MobileNavigationBar title={t('discover.title')} />
      <PageScroll compact contentContainerStyle={styles.pageContent}>
        {entries.map((entry) => {
          const Icon = entry.icon
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={entry.label}
              key={entry.key}
              onPress={() => openEntry(entry.href)}
              style={({ pressed }) => [
                styles.card,
                {
                  backgroundColor: pressed ? colors.messageHover : colors.surface,
                  borderColor: colors.frostedBorder,
                },
                pressed ? styles.cardPressed : null,
              ]}
            >
              <View style={[styles.iconSlot, { backgroundColor: colors.frostedPanelMuted }]}>
                <Icon size={iconSize.lg} color={entry.color} strokeWidth={2.35} />
              </View>
              <View style={styles.cardBody}>
                <AppText variant="bodyStrong" numberOfLines={1} style={styles.label}>
                  {entry.label}
                </AppText>
                <AppText
                  variant="label"
                  tone="secondary"
                  numberOfLines={2}
                  style={styles.description}
                >
                  {entry.description}
                </AppText>
              </View>
              <ChevronRight size={iconSize.lg} color={colors.textMuted} strokeWidth={2.2} />
            </Pressable>
          )
        })}
      </PageScroll>
    </BackgroundSurface>
  )
}

const styles = StyleSheet.create({
  pageContent: {
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingBottom: size.tabBar + spacing['6xl'],
    gap: spacing.md,
  },
  card: {
    minHeight: size.settingsRowMinHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius['2lg'],
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  cardPressed: {
    transform: [{ scale: 0.99 }],
  },
  iconSlot: {
    width: size.controlSm,
    height: size.controlSm,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xxs,
  },
  label: {
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
  },
  description: {
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
  },
})
