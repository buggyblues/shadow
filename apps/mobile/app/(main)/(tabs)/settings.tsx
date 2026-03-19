import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import {
  Bell,
  Bot,
  ChevronRight,
  Compass,
  Heart,
  Link2,
  LogOut,
  Paintbrush,
  Shield,
  Target,
  User,
} from 'lucide-react-native'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Avatar } from '../../../src/components/common/avatar'
import { DottedBackground } from '../../../src/components/common/dotted-background'
import { PriceCompact } from '../../../src/components/common/price-display'
import { LoadingScreen } from '../../../src/components/common/loading-screen'
import { ShrimpCoinIcon } from '../../../src/components/common/shrimp-coin'
import { fetchApi } from '../../../src/lib/api'
import { disconnectSocket } from '../../../src/lib/socket'
import { useAuthStore } from '../../../src/stores/auth.store'
import { fontSize, radius, spacing, useColors } from '../../../src/theme'

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

  type SectionItem = {
    key: string
    icon: typeof User
    label: string
    color: string
    route: string
  }

  const userSettings: SectionItem[] = [
    {
      key: 'profile',
      icon: User,
      label: t('settings.tabProfile'),
      color: '#5865f2',
      route: '/(main)/settings/profile',
    },
    {
      key: 'appearance',
      icon: Paintbrush,
      label: t('settings.tabAppearance'),
      color: '#fee75c',
      route: '/(main)/settings/appearance',
    },
    {
      key: 'notification',
      icon: Bell,
      label: '通知',
      color: '#f0b132',
      route: '/(main)/settings/notifications',
    },
  ]

  const activitySettings: SectionItem[] = [
    {
      key: 'tasks',
      icon: Target,
      label: '任务中心',
      color: '#ed4245',
      route: '/(main)/settings/tasks',
    },
    {
      key: 'buddy',
      icon: Bot,
      label: t('settings.tabBuddy'),
      color: '#00c8d6',
      route: '/(main)/settings/buddy',
    },
  ]

  const accountSettings: SectionItem[] = [
    {
      key: 'account',
      icon: Shield,
      label: t('settings.tabAccount'),
      color: '#eb459e',
      route: '/(main)/settings/account',
    },
    {
      key: 'invite',
      icon: Link2,
      label: t('settings.tabInvite'),
      color: '#23a559',
      route: '/(main)/settings/invite',
    },
  ]

  const glassCardStyle = {
    backgroundColor: `${colors.surface}E6`,
    borderColor: colors.border,
    borderWidth: 2,
    borderRadius: 24,
  }

  const renderGroup = (title: string, items: SectionItem[]) => (
    <>
      <Text style={[styles.groupTitle, { color: colors.textMuted }]}>{title}</Text>
      <View
        style={[
          styles.sectionGroup,
          glassCardStyle,
          { backgroundColor: colors.surface, overflow: 'hidden', paddingVertical: 4 },
        ]}
      >
        {items.map((item, idx) => {
          const Icon = item.icon
          const isLast = idx === items.length - 1
          return (
            <React.Fragment key={item.key}>
              {/* biome-ignore lint/suspicious/noExplicitAny: Expo Router route typing */}
              <Pressable style={styles.sectionRow} onPress={() => router.push(item.route as any)}>
                <View style={[styles.sectionIconCircle, { backgroundColor: `${item.color}15` }]}>
                  <Icon size={16} color={item.color} />
                </View>
                <Text style={[styles.sectionLabel, { color: colors.text }]}>{item.label}</Text>
                <ChevronRight size={16} color={colors.textMuted} />
              </Pressable>
              {!isLast && <View style={[styles.separator, { backgroundColor: colors.border }]} />}
            </React.Fragment>
          )
        })}
      </View>
    </>
  )

  return (
    <DottedBackground>
      <View style={[styles.container]}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ── User profile card ─────────────────────── */}
          <Pressable
            style={({ pressed }) => [
              styles.profileCard,
              glassCardStyle,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              },
            ]}
            // biome-ignore lint/suspicious/noExplicitAny: Expo Router route typing
            onPress={() => router.push('/(main)/settings/profile' as any)}
          >
            <View style={[styles.profileBanner, { backgroundColor: `${colors.primary}30` }]} />
            <View style={styles.profileBody}>
              <View style={styles.profileAvatarRow}>
                <Avatar
                  uri={user.avatarUrl}
                  name={user.displayName || user.username}
                  size={64}
                  userId={user.id}
                />
                <View style={[styles.editProfileBtn, { borderColor: colors.border }]}>
                  <Text style={{ color: colors.primary, fontWeight: '700', fontSize: fontSize.xs }}>
                    {t('settings.tabProfile')}
                  </Text>
                  <ChevronRight size={12} color={colors.primary} />
                </View>
              </View>
              <Text style={[styles.profileName, { color: colors.text }]}>
                {user.displayName || user.username}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: fontSize.sm }}>
                @{user.username}
              </Text>

              {/* Wallet + Stats */}
              <View style={styles.profileStatsRow}>
                {wallet && (
                  <View style={[styles.profileStat, { backgroundColor: `${colors.shrimpCoin}15` }]}>
                    <ShrimpCoinIcon size={16} color={colors.shrimpCoin} />
                    <Text
                      style={{ color: colors.shrimpCoin, fontWeight: '800', fontSize: fontSize.sm }}
                    >
                      {wallet.balance}
                    </Text>
                  </View>
                )}
                <View style={[styles.profileStat, { backgroundColor: `${colors.text}08` }]}>
                  <Text style={{ color: colors.textMuted, fontSize: fontSize.xs }}>
                    {user.email}
                  </Text>
                </View>
              </View>
            </View>
          </Pressable>

          {/* ── Quick actions ─────────────────────────── */}
          <View style={styles.quickActionRow}>
            <Pressable
              style={({ pressed }) => [
                styles.quickAction,
                glassCardStyle,
                { backgroundColor: colors.surface, transform: [{ scale: pressed ? 0.98 : 1 }] },
              ]}
              onPress={() => router.push('/(main)/discover')}
            >
              <View style={[styles.quickIconCircle, { backgroundColor: '#5865f220' }]}>
                <Compass size={18} color="#5865f2" />
              </View>
              <Text style={[styles.quickLabel, { color: colors.textSecondary }]}>
                {t('guide.discoverTitle')}
              </Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.quickAction,
                glassCardStyle,
                { backgroundColor: colors.surface, transform: [{ scale: pressed ? 0.98 : 1 }] },
              ]}
              onPress={() => router.push('/(main)/buddies')}
            >
              <View style={[styles.quickIconCircle, { backgroundColor: '#00c8d620' }]}>
                <Bot size={18} color="#00c8d6" />
              </View>
              <Text style={[styles.quickLabel, { color: colors.textSecondary }]}>Buddy</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.quickAction,
                glassCardStyle,
                { backgroundColor: colors.surface, transform: [{ scale: pressed ? 0.98 : 1 }] },
              ]}
              // biome-ignore lint/suspicious/noExplicitAny: Expo Router route typing
              onPress={() => router.push('/(main)/settings/tasks' as any)}
            >
              <View style={[styles.quickIconCircle, { backgroundColor: '#ed424520' }]}>
                <Target size={18} color="#ed4245" />
              </View>
              <Text style={[styles.quickLabel, { color: colors.textSecondary }]}>任务</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.quickAction,
                glassCardStyle,
                { backgroundColor: colors.surface, transform: [{ scale: pressed ? 0.98 : 1 }] },
              ]}
              // biome-ignore lint/suspicious/noExplicitAny: Expo Router route typing
              onPress={() => router.push('/(main)/settings/invite' as any)}
            >
              <View style={[styles.quickIconCircle, { backgroundColor: '#23a55920' }]}>
                <Heart size={18} color="#23a559" />
              </View>
              <Text style={[styles.quickLabel, { color: colors.textSecondary }]}>邀请</Text>
            </Pressable>
          </View>

          {/* ── Section groups ──────────────────────── */}
          {renderGroup(t('settings.tabProfile').toUpperCase(), userSettings)}
          {renderGroup('任务 & BUDDY', activitySettings)}
          {renderGroup(t('settings.tabAccount').toUpperCase(), accountSettings)}

          {/* ── Logout ────────────────────────────────── */}
          <Pressable
            style={({ pressed }) => [
              styles.logoutCard,
              glassCardStyle,
              { backgroundColor: colors.surface, transform: [{ scale: pressed ? 0.98 : 1 }] },
            ]}
            onPress={handleLogout}
          >
            <LogOut size={18} color="#f23f43" />
            <Text style={{ color: '#f23f43', fontWeight: '700', fontSize: fontSize.md }}>
              {t('settings.logout')}
            </Text>
          </Pressable>

          <View style={{ height: insets.bottom + 100 }} />
        </ScrollView>
      </View>
    </DottedBackground>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingBottom: spacing.xl },
  profileCard: {
    overflow: 'hidden',
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    borderRadius: radius.xl,
  },
  profileBanner: { height: 60 },
  profileBody: { padding: spacing.lg, marginTop: -20 },
  profileAvatarRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  editProfileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 99,
    borderWidth: 1,
  },
  profileName: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    marginTop: spacing.sm,
  },
  profileStatsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    flexWrap: 'wrap',
  },
  profileStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 99,
  },
  quickActionRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  quickAction: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.xl,
    gap: 4,
  },
  quickIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: { fontSize: fontSize.xs, fontWeight: '600' },
  groupTitle: {
    fontSize: fontSize.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  sectionGroup: {
    marginHorizontal: spacing.md,
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
  },
  sectionIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionLabel: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 60,
  },
  logoutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginTop: spacing.lg,
    paddingVertical: spacing.lg,
    borderRadius: radius.xl,
  },
})
