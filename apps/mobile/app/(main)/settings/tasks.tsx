import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ClipboardList, Gift, ListChecks, WalletCards } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
import { LoadingScreen } from '../../../src/components/common/loading-screen'
import { PriceCompact } from '../../../src/components/common/price-display'
import { SettingsHeader } from '../../../src/components/common/settings-header'
import { ShrimpCoinIcon } from '../../../src/components/common/shrimp-coin'
import {
  BackgroundSurface,
  Button,
  Card,
  IconBubble,
  PageScroll,
  Section,
  Typography,
} from '../../../src/components/ui'
import { fetchApi } from '../../../src/lib/api'
import { border, fontSize, iconSize, palette, spacing, useColors } from '../../../src/theme'

export default function TaskCenterScreen() {
  const { t } = useTranslation()
  const colors = useColors()
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['task-center'],
    queryFn: () =>
      fetchApi<{
        wallet: { balance: number }
        summary: { totalTasks: number; claimableTasks: number; completedTasks: number }
        tasks: Array<{
          key: string
          title: string
          description: string
          reward: number
          type: 'one_time' | 'repeatable'
          completed: boolean
          claimable: boolean
          claimedCount: number
        }>
      }>('/api/tasks'),
  })

  const claimMutation = useMutation({
    mutationFn: (taskKey: string) => fetchApi(`/api/tasks/${taskKey}/claim`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['task-center'] }),
  })

  if (isLoading) return <LoadingScreen />

  return (
    <BackgroundSurface style={styles.container}>
      <SettingsHeader title={t('taskCenter.title', '任务中心')} />
      <PageScroll compact>
        <View style={styles.statsRow}>
          <Card variant="stat" style={styles.statCard}>
            <IconBubble icon={ClipboardList} size={iconSize.md} />
            <Typography variant="micro">{t('taskCenter.total', '总数')}</Typography>
            <Text style={{ color: colors.text, fontSize: fontSize.lg, fontWeight: '900' }}>
              {data?.summary.totalTasks ?? 0}
            </Text>
          </Card>
          <Card variant="stat" style={styles.statCard}>
            <IconBubble icon={Gift} tone="success" size={iconSize.md} />
            <Typography variant="micro">{t('taskCenter.claimable', '可领')}</Typography>
            <Text style={{ color: palette.emerald, fontSize: fontSize.lg, fontWeight: '800' }}>
              {data?.summary.claimableTasks ?? 0}
            </Text>
          </Card>
          <Card variant="stat" style={styles.statCard}>
            <IconBubble icon={ListChecks} tone="primary" size={iconSize.md} />
            <Typography variant="micro">{t('taskCenter.completed', '已完成')}</Typography>
            <Text style={{ color: colors.primary, fontSize: fontSize.lg, fontWeight: '800' }}>
              {data?.summary.completedTasks ?? 0}
            </Text>
          </Card>
          <Card variant="stat" style={styles.statCard}>
            <IconBubble icon={WalletCards} tone="primary" size={iconSize.md} />
            <Typography variant="micro">{t('taskCenter.wallet', '虾币')}</Typography>
            <PriceCompact amount={data?.wallet.balance ?? 0} size={fontSize.lg} />
          </Card>
        </View>

        <Section title={t('taskCenter.title', '任务中心')}>
          {data?.tasks.map((task, idx) => (
            <View
              key={task.key}
              style={[
                styles.taskRow,
                { borderBottomColor: colors.border },
                idx === (data?.tasks.length ?? 0) - 1 && { borderBottomWidth: border.none },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSize.sm }}>
                  {task.title}
                </Text>
                <Text
                  style={{ color: colors.textMuted, fontSize: fontSize.xs, marginTop: spacing.xxs }}
                >
                  {task.description}
                </Text>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing.xxs,
                    marginTop: spacing.xs,
                  }}
                >
                  <Text style={{ color: palette.emerald, fontSize: fontSize.xs }}>+</Text>
                  <ShrimpCoinIcon size={iconSize.xs} color={palette.emerald} />
                  <Text style={{ color: palette.emerald, fontSize: fontSize.xs }}>
                    {task.reward}
                  </Text>
                </View>
              </View>
              {task.claimable ? (
                <Button
                  size="xs"
                  onPress={() => claimMutation.mutate(task.key)}
                  loading={claimMutation.isPending}
                >
                  {t('taskCenter.claim', '领取')}
                </Button>
              ) : task.completed ? (
                <Check size={iconSize.md} color={palette.emerald} />
              ) : (
                <Text style={{ color: colors.textMuted, fontSize: fontSize.xs }}>
                  {t('taskCenter.incomplete', '未完成')}
                </Text>
              )}
            </View>
          ))}
        </Section>
      </PageScroll>
    </BackgroundSurface>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  statsRow: { flexDirection: 'row', gap: spacing.sm },
  statCard: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
})
