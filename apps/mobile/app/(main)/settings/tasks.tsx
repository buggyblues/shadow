import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Check,
  Circle,
  Gift,
  ListChecks,
  Sparkles,
  Target,
  Trophy,
  WalletCards,
  Zap,
} from 'lucide-react-native'
import { type ReactNode, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { LoadingScreen } from '../../../src/components/common/loading-screen'
import { PriceCompact } from '../../../src/components/common/price-display'
import { SettingsHeader } from '../../../src/components/common/settings-header'
import { ShrimpCoinIcon } from '../../../src/components/common/shrimp-coin'
import { BackgroundSurface, Spinner } from '../../../src/components/ui'
import { fetchApi } from '../../../src/lib/api'
import { selectionHaptic, successHaptic } from '../../../src/lib/haptics'
import { showToast } from '../../../src/lib/toast'
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

type TaskCenterTask = {
  key: string
  title: string
  description: string
  reward: number
  type: 'one_time' | 'repeatable'
  completed: boolean
  claimable: boolean
  claimedCount: number
}

type TaskCenterData = {
  wallet: { balance: number }
  summary: { totalTasks: number; claimableTasks: number; completedTasks: number }
  tasks: TaskCenterTask[]
}

export default function TaskCenterScreen() {
  const { t } = useTranslation()
  const colors = useColors()
  const queryClient = useQueryClient()
  const [claimingKey, setClaimingKey] = useState<string | null>(null)
  const [rewardCelebration, setRewardCelebration] = useState<{ id: number; amount: number } | null>(
    null,
  )
  const rewardPulse = useRef(new Animated.Value(1)).current
  const rewardBurst = useRef(new Animated.Value(0)).current

  const { data, isLoading } = useQuery({
    queryKey: ['task-center'],
    queryFn: () => fetchApi<TaskCenterData>('/api/tasks'),
  })

  const tasks = data?.tasks ?? []
  const totalTasks = data?.summary.totalTasks ?? 0
  const completedTasks = data?.summary.completedTasks ?? 0
  const claimableTasks = data?.summary.claimableTasks ?? 0
  const progress = totalTasks > 0 ? completedTasks / totalTasks : 0
  const progressPercent = Math.round(progress * 100)
  const nextReward =
    tasks.find((task) => task.claimable)?.reward ??
    tasks.find((task) => !task.completed)?.reward ??
    tasks[0]?.reward ??
    0
  const sortedTasks = useMemo(() => {
    const taskRank = (task: TaskCenterTask) => {
      if (task.claimable) return 0
      if (task.completed) return 2
      return 1
    }

    return [...tasks].sort((a, b) => taskRank(a) - taskRank(b))
  }, [tasks])

  const claimMutation = useMutation({
    mutationFn: (task: TaskCenterTask) =>
      fetchApi(`/api/tasks/${task.key}/claim`, { method: 'POST' }).then(() => task),
    onMutate: (task) => {
      setClaimingKey(task.key)
    },
    onSuccess: (task) => {
      successHaptic()
      setRewardCelebration({ id: Date.now(), amount: task.reward })
      rewardBurst.setValue(0)
      rewardPulse.setValue(1)
      Animated.parallel([
        Animated.sequence([
          Animated.spring(rewardPulse, {
            toValue: 1.07,
            useNativeDriver: true,
            speed: 16,
            bounciness: 12,
          }),
          Animated.spring(rewardPulse, {
            toValue: 1,
            useNativeDriver: true,
            speed: 18,
            bounciness: 8,
          }),
        ]),
        Animated.timing(rewardBurst, {
          toValue: 1,
          duration: 980,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) setRewardCelebration(null)
      })
      void queryClient.invalidateQueries({ queryKey: ['task-center'] })
    },
    onError: () => {
      showToast(t('taskCenter.claimFailed', '领取失败'), 'error')
    },
    onSettled: () => {
      setClaimingKey(null)
    },
  })

  const rewardOpacity = rewardBurst.interpolate({
    inputRange: [0, 0.12, 0.78, 1],
    outputRange: [0, 1, 1, 0],
  })
  const rewardTranslateY = rewardBurst.interpolate({
    inputRange: [0, 1],
    outputRange: [18, -58],
  })
  const rewardScale = rewardBurst.interpolate({
    inputRange: [0, 0.22, 1],
    outputRange: [0.72, 1.12, 0.92],
  })

  if (isLoading) return <LoadingScreen />

  return (
    <BackgroundSurface style={styles.container}>
      <SettingsHeader title={t('taskCenter.title', '任务中心')} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        bounces={false}
      >
        <View
          style={[
            styles.hero,
            { backgroundColor: colors.frostedPanelStrong, borderColor: colors.frostedBorder },
          ]}
        >
          <View style={styles.heroTop}>
            <View style={styles.heroIcon}>
              <Trophy size={iconSize['3xl']} color={palette.foundation} strokeWidth={2.8} />
            </View>
            <View style={styles.heroCopy}>
              <Text style={[styles.heroTitle, { color: colors.text }]}>
                {t('taskCenter.heroTitle', '今天也来赚虾币')}
              </Text>
              <Text style={[styles.heroSubtitle, { color: colors.textMuted }]}>
                {t('taskCenter.heroSubtitle', '完成任务，领取奖励并解锁更多玩法。')}
              </Text>
            </View>
            <Animated.View
              style={[
                styles.walletPill,
                { backgroundColor: colors.toneDangerSurface, transform: [{ scale: rewardPulse }] },
              ]}
            >
              <WalletCards size={iconSize.sm} color={colors.shrimpCoin} />
              <PriceCompact amount={data?.wallet.balance ?? 0} size={fontSize.sm} />
            </Animated.View>
          </View>

          <View style={styles.progressHeader}>
            <Text style={[styles.progressLabel, { color: colors.textMuted }]}>
              {t('taskCenter.progress', '进度')}
            </Text>
            <Text style={[styles.progressValue, { color: colors.text }]}>
              {t('taskCenter.progressValue', '{{completed}} / {{total}} 已完成', {
                completed: completedTasks,
                total: totalTasks,
              })}
            </Text>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: colors.inputBackground }]}>
            <View
              style={[
                styles.progressFill,
                {
                  width: progress > 0 ? `${Math.max(8, progressPercent)}%` : 0,
                  backgroundColor: palette.emerald,
                },
              ]}
            />
          </View>

          <View style={styles.statStrip}>
            <MetricPill
              label={t('taskCenter.claimable', '可领')}
              value={claimableTasks.toLocaleString()}
              color={palette.emerald}
              icon={<Gift size={iconSize.sm} color={palette.emerald} />}
            />
            <MetricPill
              label={t('taskCenter.completed', '已完成')}
              value={completedTasks.toLocaleString()}
              color={colors.primary}
              icon={<ListChecks size={iconSize.sm} color={colors.primary} />}
            />
            <MetricPill
              label={t('taskCenter.nextReward', '下一份奖励')}
              value={`+${nextReward.toLocaleString()}`}
              color={colors.shrimpCoin}
              icon={<ShrimpCoinIcon size={iconSize.sm} color={colors.shrimpCoin} />}
            />
          </View>
        </View>

        <View style={styles.pathHeader}>
          <View style={styles.pathTitleRow}>
            <Target size={iconSize.xl} color={colors.primary} />
            <Text style={[styles.pathTitle, { color: colors.text }]}>
              {t('taskCenter.questPath', '任务路线')}
            </Text>
          </View>
          <View style={[styles.percentPill, { backgroundColor: colors.activePill }]}>
            <Sparkles size={iconSize.xs} color={colors.primary} />
            <Text style={[styles.percentText, { color: colors.primary }]}>{progressPercent}%</Text>
          </View>
        </View>

        <View style={styles.taskPath}>
          {sortedTasks.map((task, index) => (
            <TaskQuestCard
              key={task.key}
              task={task}
              isLast={index === sortedTasks.length - 1}
              colors={colors}
              claiming={claimingKey === task.key}
              disabled={claimMutation.isPending}
              onClaim={() => {
                selectionHaptic()
                claimMutation.mutate(task)
              }}
              t={t}
            />
          ))}
        </View>
      </ScrollView>

      {rewardCelebration ? (
        <Animated.View
          key={rewardCelebration.id}
          pointerEvents="none"
          style={[
            styles.rewardToast,
            {
              opacity: rewardOpacity,
              transform: [{ translateY: rewardTranslateY }, { scale: rewardScale }],
            },
          ]}
        >
          <View style={styles.rewardHalo} />
          <ShrimpCoinIcon size={iconSize['3xl']} color={palette.foundation} />
          <Text style={styles.rewardToastText}>
            {t('taskCenter.rewardClaimed', '+{{amount}} 虾币', {
              amount: rewardCelebration.amount.toLocaleString(),
            })}
          </Text>
        </Animated.View>
      ) : null}
    </BackgroundSurface>
  )
}

function MetricPill({
  label,
  value,
  color,
  icon,
}: {
  label: string
  value: string
  color: string
  icon: ReactNode
}) {
  const colors = useColors()

  return (
    <View
      style={[
        styles.metricPill,
        { backgroundColor: colors.frostedPanelMuted, borderColor: colors.frostedBorder },
      ]}
    >
      {icon}
      <Text style={[styles.metricLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
    </View>
  )
}

function TaskQuestCard({
  task,
  isLast,
  colors,
  claiming,
  disabled,
  onClaim,
  t,
}: {
  task: TaskCenterTask
  isLast: boolean
  colors: ReturnType<typeof useColors>
  claiming: boolean
  disabled: boolean
  onClaim: () => void
  t: ReturnType<typeof useTranslation>['t']
}) {
  const isComplete = task.completed && !task.claimable
  const isReady = task.claimable
  const statusColor = isReady ? palette.emerald : isComplete ? colors.primary : colors.textMuted

  return (
    <View style={styles.questRow}>
      <View style={styles.questRail}>
        <View
          style={[
            styles.questDot,
            {
              borderColor: statusColor,
              backgroundColor: isComplete || isReady ? statusColor : colors.frostedPanelStrong,
            },
          ]}
        >
          {isComplete ? (
            <Check size={iconSize.sm} color={colors.background} strokeWidth={3.2} />
          ) : isReady ? (
            <Zap size={iconSize.sm} color={palette.foundation} fill={palette.foundation} />
          ) : (
            <Circle size={iconSize.xs} color={colors.textMuted} fill={colors.textMuted} />
          )}
        </View>
        {!isLast ? (
          <View
            style={[
              styles.questLine,
              {
                backgroundColor: isComplete || isReady ? colors.activePillStrong : colors.border,
              },
            ]}
          />
        ) : null}
      </View>

      <View
        style={[
          styles.questCard,
          {
            backgroundColor: isReady ? colors.toneSuccessSurface : colors.frostedPanelStrong,
            borderColor: isReady ? palette.emerald : colors.frostedBorder,
          },
        ]}
      >
        <View style={styles.questCardTop}>
          <View style={styles.rewardBadge}>
            <ShrimpCoinIcon size={iconSize.md} color={colors.shrimpCoin} />
            <Text style={[styles.rewardBadgeText, { color: colors.shrimpCoin }]}>
              +{task.reward.toLocaleString()}
            </Text>
          </View>
          <View style={[styles.typePill, { backgroundColor: colors.activePill }]}>
            <Text style={[styles.typePillText, { color: colors.primary }]}>
              {task.type === 'repeatable'
                ? t('taskCenter.repeatable', '可重复')
                : t('taskCenter.oneTime', '一次性')}
            </Text>
          </View>
        </View>

        <Text style={[styles.taskTitle, { color: colors.text }]} numberOfLines={2}>
          {task.title}
        </Text>
        <Text style={[styles.taskDescription, { color: colors.textMuted }]} numberOfLines={3}>
          {task.description}
        </Text>

        <View style={styles.questFooter}>
          <View style={styles.statusRow}>
            {isReady ? (
              <Gift size={iconSize.md} color={palette.emerald} />
            ) : isComplete ? (
              <Check size={iconSize.md} color={colors.primary} />
            ) : (
              <Target size={iconSize.md} color={colors.textMuted} />
            )}
            <Text style={[styles.statusText, { color: statusColor }]}>
              {isReady
                ? t('taskCenter.rewardReady', '奖励待领取')
                : isComplete
                  ? t('taskCenter.claimed', '已领取')
                  : t('taskCenter.incomplete', '未完成')}
            </Text>
          </View>

          {isReady ? (
            <Pressable
              accessibilityRole="button"
              disabled={disabled}
              onPress={onClaim}
              style={({ pressed }) => [
                styles.claimButton,
                pressed && !disabled ? styles.claimButtonPressed : null,
                disabled ? styles.claimButtonDisabled : null,
              ]}
            >
              {claiming ? <Spinner size="small" color={palette.foundation} /> : null}
              <Text style={styles.claimButtonText}>{t('taskCenter.claim', '领取')}</Text>
            </Pressable>
          ) : (
            <View
              style={[
                styles.passiveBadge,
                { borderColor: colors.frostedBorder, backgroundColor: colors.frostedPanelMuted },
              ]}
            >
              <Text style={[styles.passiveBadgeText, { color: colors.textMuted }]}>
                {isComplete
                  ? t('taskCenter.allDone', '已完成')
                  : t('taskCenter.keepGoing', '继续前进')}
              </Text>
            </View>
          )}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing['5xl'],
    gap: spacing.lg,
  },
  hero: {
    borderWidth: border.hairline,
    borderRadius: radius['2xl'],
    padding: spacing.md,
    gap: spacing.md,
    overflow: 'hidden',
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  heroIcon: {
    width: size.controlLg,
    height: size.controlLg,
    borderRadius: radius.xl,
    backgroundColor: palette.emerald,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: palette.emerald,
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: spacing.none, height: spacing.sm },
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
  },
  heroTitle: {
    fontSize: fontSize.lg,
    lineHeight: lineHeight.lg,
    fontWeight: '900',
  },
  heroSubtitle: {
    marginTop: spacing.xxs,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    fontWeight: '700',
  },
  walletPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.tight,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  progressLabel: {
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    fontWeight: '800',
  },
  progressValue: {
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    fontWeight: '900',
  },
  progressTrack: {
    height: size.dotLg,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.full,
  },
  statStrip: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  metricPill: {
    flex: 1,
    minHeight: size.listItemLg,
    borderWidth: border.hairline,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  metricLabel: {
    fontSize: fontSize.micro,
    lineHeight: lineHeight.micro,
    fontWeight: '900',
  },
  metricValue: {
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
    fontWeight: '900',
  },
  pathHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  pathTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  pathTitle: {
    fontSize: fontSize.lg,
    lineHeight: lineHeight.lg,
    fontWeight: '900',
  },
  percentPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  percentText: {
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    fontWeight: '900',
  },
  taskPath: {
    gap: spacing.md,
  },
  questRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: spacing.sm,
  },
  questRail: {
    width: size.iconButtonMd,
    alignItems: 'center',
  },
  questDot: {
    width: size.controlXs,
    height: size.controlXs,
    borderRadius: radius.full,
    borderWidth: border.active,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  questLine: {
    flex: 1,
    width: border.active,
    minHeight: size.thumbnailMd,
    marginTop: spacing.xs,
    borderRadius: radius.full,
  },
  questCard: {
    flex: 1,
    borderWidth: border.hairline,
    borderRadius: radius['2xl'],
    padding: spacing.md,
    gap: spacing.xs,
  },
  questCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  rewardBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  rewardBadgeText: {
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    fontWeight: '900',
  },
  typePill: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  typePillText: {
    fontSize: fontSize.micro,
    lineHeight: lineHeight.micro,
    fontWeight: '900',
  },
  taskTitle: {
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
    fontWeight: '900',
  },
  taskDescription: {
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    fontWeight: '700',
  },
  questFooter: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  statusRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  statusText: {
    flex: 1,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    fontWeight: '900',
  },
  claimButton: {
    minWidth: size.thumbnailMd,
    minHeight: size.controlSm,
    borderRadius: radius.full,
    backgroundColor: palette.emerald,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    shadowColor: palette.emerald,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: spacing.none, height: spacing.tight },
  },
  claimButtonPressed: {
    transform: [{ scale: 0.96 }],
  },
  claimButtonDisabled: {
    backgroundColor: palette.emeraldDark,
  },
  claimButtonText: {
    color: palette.foundation,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    fontWeight: '900',
  },
  passiveBadge: {
    minHeight: size.controlSm,
    justifyContent: 'center',
    borderRadius: radius.full,
    borderWidth: border.hairline,
    paddingHorizontal: spacing.md,
  },
  passiveBadgeText: {
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    fontWeight: '900',
  },
  rewardToast: {
    position: 'absolute',
    left: spacing['3xl'],
    right: spacing['3xl'],
    bottom: spacing['5xl'],
    minHeight: size.tabBar,
    borderRadius: radius.full,
    backgroundColor: palette.emerald,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    shadowColor: palette.emerald,
    shadowOpacity: 0.45,
    shadowRadius: 22,
    shadowOffset: { width: spacing.none, height: spacing.md },
    overflow: 'hidden',
  },
  rewardHalo: {
    position: 'absolute',
    width: size.voicePreviewWaveformMinWidth,
    height: size.voicePreviewWaveformMinWidth,
    borderRadius: radius.full,
    backgroundColor: palette.cyanSoft,
    right: spacing.lg,
  },
  rewardToastText: {
    color: palette.foundation,
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
    fontWeight: '900',
  },
})
