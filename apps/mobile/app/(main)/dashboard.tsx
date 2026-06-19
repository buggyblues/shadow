import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import type { LucideIcon } from 'lucide-react-native'
import {
  Bot,
  Calendar,
  ChevronRight,
  Clock,
  Coins,
  Gift,
  Globe,
  Heart,
  Home,
  Star,
  Target,
  Wallet,
} from 'lucide-react-native'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import Reanimated, { FadeInDown } from 'react-native-reanimated'
import { Avatar } from '../../src/components/common/avatar'
import { LoadingScreen } from '../../src/components/common/loading-screen'
import { PriceCompact } from '../../src/components/common/price-display'
import { ShrimpCoinIcon } from '../../src/components/common/shrimp-coin'
import { MobileBackButton, MobileNavigationBar } from '../../src/components/ui'
import { fetchApi } from '../../src/lib/api'
import { useAuthStore } from '../../src/stores/auth.store'
import {
  border,
  fontSize,
  iconSize,
  palette,
  radius,
  size,
  spacing,
  useColors,
} from '../../src/theme'

interface DashboardData {
  serversOwned: number
  serversJoined: number
  buddyCount: number
  buddyOnlineHours: number
  walletBalance: number
  tasksCompleted: number
  tasksTotal: number
  referralCount: number
  referralRewards: number
  memberSince: string | null
}

export default function DashboardScreen() {
  const colors = useColors()
  const router = useRouter()
  const user = useAuthStore((s) => s.user)

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => fetchApi<DashboardData>('/api/auth/dashboard'),
  })

  if (isLoading || !user) return <LoadingScreen />

  const memberDays = data?.memberSince
    ? Math.floor((Date.now() - new Date(data.memberSince).getTime()) / 86400000)
    : 0

  const stats: {
    label: string
    value: string | number
    Icon: LucideIcon
    color: string
    isShrimpCoin?: boolean
  }[] = [
    { label: '创建服务器', value: data?.serversOwned ?? 0, Icon: Home, color: palette.indigo },
    { label: '加入服务器', value: data?.serversJoined ?? 0, Icon: Globe, color: palette.indigo },
    { label: 'Buddy 数量', value: data?.buddyCount ?? 0, Icon: Bot, color: palette.cyan },
    {
      label: 'Buddy 在线',
      value: `${data?.buddyOnlineHours ?? 0}h`,
      Icon: Clock,
      color: palette.emerald,
    },
    {
      label: '虾币余额',
      value: data?.walletBalance ?? 0,
      Icon: Coins,
      color: palette.crimson,
      isShrimpCoin: true,
    },
    {
      label: '任务完成',
      value: `${data?.tasksCompleted ?? 0}/${data?.tasksTotal ?? 0}`,
      Icon: Target,
      color: palette.crimson,
    },
    { label: '邀请好友', value: data?.referralCount ?? 0, Icon: Heart, color: palette.crimson },
    { label: '邀请奖励', value: data?.referralRewards ?? 0, Icon: Gift, color: palette.emerald },
  ]

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <MobileNavigationBar
        title="个人看板"
        left={<MobileBackButton onPress={() => router.back()} />}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Profile hero */}
        <Reanimated.View entering={FadeInDown.delay(100).springify()}>
          <View style={[styles.heroCard, { backgroundColor: colors.surface }]}>
            <View style={[styles.heroBanner, { backgroundColor: colors.inputBackground }]} />
            <View style={styles.heroBody}>
              <Avatar
                uri={user.avatarUrl}
                name={user.displayName || user.username || ''}
                size={iconSize.hero}
                userId={user.id || ''}
              />
              <View style={styles.heroInfo}>
                <Text style={[styles.heroName, { color: colors.text }]}>
                  {user.displayName || user.username}
                </Text>
                <Text style={[styles.heroSub, { color: colors.textMuted }]}>@{user.username}</Text>
              </View>
            </View>
            {/* Days active badge */}
            <View style={[styles.daysBadge, { backgroundColor: colors.inputBackground }]}>
              <Calendar size={iconSize.md} color={colors.primary} />
              <Text style={[styles.daysText, { color: colors.primary }]}>
                已活跃 {memberDays} 天
              </Text>
            </View>
          </View>
        </Reanimated.View>

        {/* Stats grid */}
        <View style={styles.statsGrid}>
          {stats.map((stat, idx) => (
            <Reanimated.View
              key={stat.label}
              entering={FadeInDown.delay(150 + idx * 60).springify()}
              style={{ width: '48%' }}
            >
              <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
                <View style={[styles.statIconWrap, { backgroundColor: colors.inputBackground }]}>
                  {stat.isShrimpCoin ? (
                    <ShrimpCoinIcon size={iconSize['2xl']} color={stat.color} />
                  ) : (
                    <stat.Icon size={iconSize['2xl']} color={stat.color} />
                  )}
                </View>
                {stat.isShrimpCoin ? (
                  <View
                    style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm }}
                  >
                    <PriceCompact amount={Number(stat.value)} size={fontSize.lg} />
                  </View>
                ) : (
                  <Text style={[styles.statValue, { color: colors.text }]}>{stat.value}</Text>
                )}
                <Text style={[styles.statLabel, { color: colors.textMuted }]}>{stat.label}</Text>
              </View>
            </Reanimated.View>
          ))}
        </View>

        {/* Level & Progress */}
        <Reanimated.View entering={FadeInDown.delay(700).springify()}>
          <View style={[styles.levelCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>成长等级</Text>
            <View style={styles.levelRow}>
              <View style={[styles.levelBadge, { backgroundColor: colors.inputBackground }]}>
                <Star size={iconSize['3xl']} color={colors.primary} />
                <Text style={[styles.levelNum, { color: colors.primary }]}>
                  Lv.{Math.min(Math.floor((data?.tasksCompleted ?? 0) / 2) + 1, 99)}
                </Text>
              </View>
              <View style={styles.levelInfo}>
                <Text style={[styles.levelHint, { color: colors.textSecondary }]}>
                  完成任务和邀请好友可以提升等级
                </Text>
                <View style={[styles.progressBg, { backgroundColor: colors.inputBackground }]}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        backgroundColor: colors.primary,
                        width: `${Math.min(((data?.tasksCompleted ?? 0) % 2) * 50 + (data?.referralCount ?? 0) * 10, 100)}%`,
                      },
                    ]}
                  />
                </View>
              </View>
            </View>
          </View>
        </Reanimated.View>

        {/* Quick links */}
        <Reanimated.View entering={FadeInDown.delay(800).springify()}>
          <View style={[styles.linksCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>快捷入口</Text>
            {(
              [
                {
                  label: '任务中心',
                  Icon: Target,
                  color: palette.crimson,
                  route: '/(main)/settings/tasks',
                },
                {
                  label: '邀请好友',
                  Icon: Heart,
                  color: palette.crimson,
                  route: '/(main)/settings/invite',
                },
                {
                  label: 'Buddy 管理',
                  Icon: Bot,
                  color: palette.cyan,
                  route: '/(main)/buddy-management',
                },
                {
                  label: '钱包明细',
                  Icon: Wallet,
                  color: colors.primary,
                  route: '/(main)/settings/tasks',
                },
              ] as const
            ).map((link, idx) => (
              <Pressable
                key={link.label}
                style={({ pressed }) => [
                  styles.linkRow,
                  { borderBottomColor: colors.border },
                  idx === 3 && { borderBottomWidth: border.none },
                  pressed && { backgroundColor: colors.surfaceHover },
                ]}
                onPress={() => router.push(link.route as never)}
              >
                <link.Icon size={iconSize.md} color={link.color} />
                <Text style={[styles.linkLabel, { color: colors.text }]}>{link.label}</Text>
                <ChevronRight size={iconSize.sm} color={colors.textMuted} />
              </Pressable>
            ))}
          </View>
        </Reanimated.View>

        <View style={{ height: size.iconButtonLg }} />
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    padding: spacing.md,
    gap: spacing.md,
    paddingBottom: spacing.xl * 2,
  },
  heroCard: {
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  heroBanner: {
    height: size.controlLg,
  },
  heroBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    marginTop: -spacing.xl,
  },
  heroInfo: {
    flex: 1,
  },
  heroName: {
    fontSize: fontSize.xl,
    fontWeight: '800',
  },
  heroSub: {
    fontSize: fontSize.sm,
    marginTop: spacing.xxs,
  },
  daysBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    alignSelf: 'flex-start',
  },
  daysText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  statCard: {
    padding: spacing.lg,
    borderRadius: radius.xl,
    alignItems: 'center',
    gap: spacing.xs,
  },
  statIconWrap: {
    width: size.controlMd,
    height: size.controlMd,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  statValue: {
    fontSize: fontSize.xl,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  levelCard: {
    padding: spacing.lg,
    borderRadius: radius.xl,
  },
  sectionTitle: {
    fontSize: fontSize.md,
    fontWeight: '800',
    marginBottom: spacing.md,
  },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  levelBadge: {
    width: size.avatarXl,
    height: size.avatarXl,
    borderRadius: radius['3xl'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelNum: {
    fontSize: fontSize.xs,
    fontWeight: '800',
    marginTop: spacing.xxs,
  },
  levelInfo: {
    flex: 1,
    gap: spacing.sm,
  },
  levelHint: {
    fontSize: fontSize.sm,
  },
  progressBg: {
    height: size.dotMd,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.sm,
  },
  linksCard: {
    padding: spacing.lg,
    borderRadius: radius.xl,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  linkLabel: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
})
