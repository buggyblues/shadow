import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import {
  Bell,
  Bot,
  ChevronRight,
  Code2,
  Globe2,
  Link2,
  LogOut,
  Paintbrush,
  Shield,
  Target,
  User,
} from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native'
import { Avatar } from '../../../src/components/common/avatar'
import { LoadingScreen } from '../../../src/components/common/loading-screen'
import { ShrimpCoinIcon } from '../../../src/components/common/shrimp-coin'
import {
  AppText,
  BackgroundSurface,
  Badge,
  Button,
  IconBubble,
  MobileNavigationBar,
  PageScroll,
  SurfaceList,
  SurfaceListItem,
  type Tone,
} from '../../../src/components/ui'
import { fetchApi } from '../../../src/lib/api'
import { disconnectSocket } from '../../../src/lib/socket'
import { useAuthStore } from '../../../src/stores/auth.store'
import { border, iconSize, radius, size, spacing, useColors } from '../../../src/theme'

type SectionItem = {
  key: string
  icon: typeof User
  label: string
  tone: Tone
  route: string
}

declare const __DEV__: boolean

export default function SettingsScreen() {
  const { t } = useTranslation()
  const colors = useColors()
  const router = useRouter()
  const { user, logout } = useAuthStore()
  const showDeveloperPanel = Platform.OS === 'ios' && __DEV__

  const { data: wallet } = useQuery({
    queryKey: ['wallet'],
    queryFn: () => fetchApi<{ balance: number }>('/api/wallet'),
    enabled: !!user,
  })

  const handleLogout = () => {
    Alert.alert(t('settings.logoutConfirmTitle'), t('settings.logoutConfirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.logout'),
        style: 'destructive',
        onPress: () => {
          disconnectSocket()
          logout()
          router.replace('/(auth)/login')
        },
      },
    ])
  }

  if (!user) return <LoadingScreen />

  const userSettings: SectionItem[] = [
    {
      key: 'profile',
      icon: User,
      label: t('settings.tabProfile'),
      tone: 'primary',
      route: '/(main)/settings/profile',
    },
    {
      key: 'appearance',
      icon: Paintbrush,
      label: t('settings.tabAppearance'),
      tone: 'primary',
      route: '/(main)/settings/appearance',
    },
    {
      key: 'notification',
      icon: Bell,
      label: t('settings.tabNotification'),
      tone: 'warning',
      route: '/(main)/settings/notifications',
    },
  ]

  const activitySettings: SectionItem[] = [
    {
      key: 'tasks',
      icon: Target,
      label: t('settings.tabTasks'),
      tone: 'danger',
      route: '/(main)/settings/tasks',
    },
    {
      key: 'buddy',
      icon: Bot,
      label: t('settings.tabBuddy'),
      tone: 'primary',
      route: '/(main)/buddy-management',
    },
  ]

  const accountSettings: SectionItem[] = [
    {
      key: 'server',
      icon: Globe2,
      label: t('settings.serverUrlTitle'),
      tone: 'primary',
      route: '/(main)/settings/server',
    },
    {
      key: 'account',
      icon: Shield,
      label: t('settings.tabAccount'),
      tone: 'danger',
      route: '/(main)/settings/account',
    },
    {
      key: 'invite',
      icon: Link2,
      label: t('settings.tabInvite'),
      tone: 'success',
      route: '/(main)/settings/invite',
    },
  ]

  const developerSettings: SectionItem[] = [
    {
      key: 'developer',
      icon: Code2,
      label: t('settings.tabDeveloper'),
      tone: 'primary',
      route: '/(main)/settings/developer',
    },
  ]

  const renderGroup = (title: string, items: SectionItem[]) => (
    <View style={styles.group}>
      <AppText variant="bodyStrong" style={styles.groupTitle}>
        {title}
      </AppText>
      <SurfaceList style={styles.groupList}>
        {items.map((item, index) => {
          const Icon = item.icon
          return (
            <SurfaceListItem
              key={item.key}
              last={index === items.length - 1}
              onPress={() => router.push(item.route as never)}
              style={styles.groupRow}
            >
              <IconBubble
                icon={Icon}
                tone={item.tone}
                size={iconSize.lg}
                style={styles.groupRowIcon}
              />
              <AppText variant="bodyStrong" style={styles.groupRowLabel} numberOfLines={1}>
                {item.label}
              </AppText>
              <ChevronRight size={iconSize.lg} color={colors.textMuted} strokeWidth={2.5} />
            </SurfaceListItem>
          )
        })}
      </SurfaceList>
    </View>
  )

  return (
    <BackgroundSurface>
      <MobileNavigationBar title={t('nav.me')} />
      <PageScroll compact edgeToEdge contentContainerStyle={styles.scrollContent}>
        <Pressable
          onPress={() => router.push('/(main)/settings/profile' as never)}
          style={({ pressed }) => [
            styles.profileHeader,
            {
              backgroundColor: pressed ? colors.surfaceHover : colors.surface,
              borderBottomColor: colors.border,
            },
          ]}
        >
          <View style={styles.profileBody}>
            <View style={styles.profileMainRow}>
              <Avatar
                uri={user.avatarUrl}
                name={user.displayName || user.username}
                size={size.avatarXl}
                userId={user.id}
                status={user.status ?? 'offline'}
                showStatus
              />
              <View style={styles.profileInfo}>
                <View style={styles.profileTitleRow}>
                  <AppText variant="headline" style={styles.profileName} numberOfLines={1}>
                    {user.displayName || user.username}
                  </AppText>
                  <Badge variant="primary" size="md">
                    {t('settings.tabProfile')}
                  </Badge>
                </View>
                <AppText variant="label" tone="secondary" numberOfLines={1}>
                  @{user.username}
                </AppText>

                <View style={styles.profileStatsRow}>
                  {wallet ? (
                    <View
                      style={[
                        styles.profileStat,
                        {
                          backgroundColor: colors.inputBackground,
                          borderColor: colors.cardBorder,
                        },
                      ]}
                    >
                      <ShrimpCoinIcon size={iconSize.md} color={colors.shrimpCoin} />
                      <AppText variant="label" style={{ color: colors.shrimpCoin }}>
                        {wallet.balance}
                      </AppText>
                    </View>
                  ) : null}
                  <View
                    style={[
                      styles.profileStat,
                      { backgroundColor: colors.inputBackground, borderColor: colors.border },
                    ]}
                  >
                    <AppText variant="label" tone="secondary" numberOfLines={1}>
                      {user.email}
                    </AppText>
                  </View>
                </View>
              </View>
            </View>
          </View>
        </Pressable>

        {renderGroup(t('settings.tabProfile').toUpperCase(), userSettings)}
        {renderGroup(t('settings.activityGroup'), activitySettings)}
        {renderGroup(t('settings.tabAccount').toUpperCase(), accountSettings)}
        {showDeveloperPanel ? renderGroup(t('settings.developerGroup'), developerSettings) : null}

        <View style={styles.logoutPanel}>
          <Button variant="danger" size="lg" icon={LogOut} onPress={handleLogout}>
            {t('settings.logout')}
          </Button>
        </View>
      </PageScroll>
    </BackgroundSurface>
  )
}

const styles = StyleSheet.create({
  scrollContent: {
    gap: spacing.none,
  },
  profileHeader: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  profileBody: {
    minHeight: size.listItemLg + spacing['3xl'],
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
    justifyContent: 'center',
  },
  profileMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  profileInfo: {
    flex: 1,
    minWidth: 0,
  },
  profileTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  profileName: {
    flexShrink: 1,
  },
  profileStatsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
    flexWrap: 'wrap',
  },
  profileStat: {
    minHeight: size.sectionCompactIcon,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    borderWidth: border.hairline,
    maxWidth: '100%',
  },
  group: {
    paddingTop: spacing.xl,
  },
  groupTitle: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.sm,
  },
  groupList: {
    width: '100%',
  },
  groupRow: {
    minHeight: size.settingsRowMinHeight,
  },
  groupRowIcon: {
    width: size.controlLg,
    height: size.controlLg,
    borderRadius: radius.xl,
  },
  groupRowLabel: {
    flex: 1,
  },
  logoutPanel: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
  },
})
