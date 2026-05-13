import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import {
  Bell,
  Bot,
  ChevronRight,
  Compass,
  Link2,
  LogOut,
  Paintbrush,
  QrCode,
  Shield,
  Target,
  User,
} from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { Alert, ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Avatar } from '../../../src/components/common/avatar'
import { LoadingScreen } from '../../../src/components/common/loading-screen'
import { ShrimpCoinIcon } from '../../../src/components/common/shrimp-coin'
import {
  ActionTile,
  AppText,
  BackgroundSurface,
  Badge,
  Button,
  CardPressable,
  GlassPanel,
  MenuItem,
  Separator,
  type Tone,
} from '../../../src/components/ui'
import { fetchApi } from '../../../src/lib/api'
import { disconnectSocket } from '../../../src/lib/socket'
import { useAuthStore } from '../../../src/stores/auth.store'
import { radius, spacing, useColors } from '../../../src/theme'

type SectionItem = {
  key: string
  icon: typeof User
  label: string
  tone: Tone
  route: string
}

export default function SettingsScreen() {
  const { t } = useTranslation()
  const colors = useColors()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { user, logout } = useAuthStore()

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
      tone: 'accent',
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
      route: '/(main)/settings/buddy',
    },
  ]

  const accountSettings: SectionItem[] = [
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

  const renderGroup = (title: string, items: SectionItem[]) => (
    <View style={styles.group}>
      <AppText variant="label" tone="secondary" style={styles.groupTitle}>
        {title}
      </AppText>
      <GlassPanel padded={false} style={styles.sectionGroup}>
        {items.map((item, index) => {
          const isLast = index === items.length - 1
          return (
            <View key={item.key}>
              <MenuItem
                icon={item.icon}
                title={item.label}
                tone={item.tone}
                right={<ChevronRight size={16} color={colors.textMuted} strokeWidth={2.5} />}
                onPress={() => router.push(item.route as never)}
              />
              {!isLast ? <Separator style={styles.separator} /> : null}
            </View>
          )
        })}
      </GlassPanel>
    </View>
  )

  return (
    <BackgroundSurface>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 96 }]}
      >
        <CardPressable
          variant="glassPanel"
          padded={false}
          style={styles.profileCard}
          onPress={() => router.push('/(main)/settings/profile' as never)}
        >
          <View style={[styles.profileBanner, { backgroundColor: `${colors.primary}20` }]} />
          <View style={styles.profileBody}>
            <View style={styles.profileAvatarRow}>
              <Avatar
                uri={user.avatarUrl}
                name={user.displayName || user.username}
                size={68}
                userId={user.id}
                status="online"
                showStatus
              />
              <Badge variant="primary" size="md">
                {t('settings.tabProfile')}
              </Badge>
            </View>
            <AppText variant="headline" style={styles.profileName} numberOfLines={1}>
              {user.displayName || user.username}
            </AppText>
            <AppText variant="label" tone="secondary" numberOfLines={1}>
              @{user.username}
            </AppText>

            <View style={styles.profileStatsRow}>
              {wallet ? (
                <View
                  style={[
                    styles.profileStat,
                    {
                      backgroundColor: `${colors.shrimpCoin}18`,
                      borderColor: `${colors.shrimpCoin}35`,
                    },
                  ]}
                >
                  <ShrimpCoinIcon size={16} color={colors.shrimpCoin} />
                  <AppText variant="label" style={{ color: colors.shrimpCoin }}>
                    {wallet.balance}
                  </AppText>
                </View>
              ) : null}
              <View
                style={[
                  styles.profileStat,
                  { backgroundColor: colors.glassSoft, borderColor: colors.glassLine },
                ]}
              >
                <AppText variant="label" tone="secondary" numberOfLines={1}>
                  {user.email}
                </AppText>
              </View>
            </View>
          </View>
        </CardPressable>

        <View style={styles.quickActionRow}>
          <ActionTile
            icon={Compass}
            label={t('guide.discoverTitle')}
            tone="primary"
            onPress={() => router.push('/(main)/discover' as never)}
          />
          <ActionTile
            icon={Bot}
            label={t('settings.tabBuddy')}
            tone="primary"
            onPress={() => router.push('/(main)/settings/buddy' as never)}
          />
          <ActionTile
            icon={Target}
            label={t('settings.tabTasks')}
            tone="danger"
            onPress={() => router.push('/(main)/settings/tasks' as never)}
          />
          <ActionTile
            icon={QrCode}
            label={t('settings.qrCard')}
            tone="success"
            onPress={() => router.push(`/(main)/profile/${user.id}` as never)}
          />
        </View>

        {renderGroup(t('settings.tabProfile').toUpperCase(), userSettings)}
        {renderGroup(t('settings.activityGroup'), activitySettings)}
        {renderGroup(t('settings.tabAccount').toUpperCase(), accountSettings)}

        <GlassPanel style={styles.logoutPanel}>
          <Button variant="danger" size="lg" icon={LogOut} onPress={handleLogout}>
            {t('settings.logout')}
          </Button>
        </GlassPanel>
      </ScrollView>
    </BackgroundSurface>
  )
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingTop: spacing.md,
    gap: spacing.lg,
  },
  profileCard: {
    marginHorizontal: spacing.md,
    borderRadius: radius['3xl'],
  },
  profileBanner: {
    height: 68,
  },
  profileBody: {
    padding: spacing.lg,
    paddingTop: 0,
    marginTop: -28,
  },
  profileAvatarRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  profileName: {
    marginTop: spacing.md,
  },
  profileStatsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    flexWrap: 'wrap',
  },
  profileStat: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    borderWidth: 1,
    maxWidth: '100%',
  },
  quickActionRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  group: {
    gap: spacing.sm,
  },
  groupTitle: {
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: spacing.xl,
  },
  sectionGroup: {
    marginHorizontal: spacing.md,
    borderRadius: radius['2xl'],
    overflow: 'hidden',
  },
  separator: {
    marginLeft: 62,
  },
  logoutPanel: {
    marginHorizontal: spacing.md,
    padding: spacing.md,
  },
})
