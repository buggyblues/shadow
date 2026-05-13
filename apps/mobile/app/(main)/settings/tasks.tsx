import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ClipboardList, Gift, ListChecks, WalletCards } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { LoadingScreen } from '../../../src/components/common/loading-screen'
import { PriceCompact } from '../../../src/components/common/price-display'
import { SettingsHeader } from '../../../src/components/common/settings-header'
import { ShrimpCoinIcon } from '../../../src/components/common/shrimp-coin'
import { AppScreen, Button, Card, IconBubble, Typography } from '../../../src/components/ui'
import { fetchApi } from '../../../src/lib/api'
import { fontSize, spacing, useColors } from '../../../src/theme'

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
    <AppScreen>
      <SettingsHeader title={t('taskCenter.title', '任务中心')} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        {/* Stats */}
        <View style={styles.statsRow}>
          <Card variant="stat" style={styles.statCard}>
            <IconBubble icon={ClipboardList} size={16} />
            <Typography variant="micro">{t('taskCenter.total', '总数')}</Typography>
            <Text style={{ color: colors.text, fontSize: fontSize.lg, fontWeight: '900' }}>
              {data?.summary.totalTasks ?? 0}
            </Text>
          </Card>
          <Card variant="stat" style={styles.statCard}>
            <IconBubble icon={Gift} tone="success" size={16} />
            <Typography variant="micro">{t('taskCenter.claimable', '可领')}</Typography>
            <Text style={{ color: '#23a559', fontSize: fontSize.lg, fontWeight: '800' }}>
              {data?.summary.claimableTasks ?? 0}
            </Text>
          </Card>
          <Card variant="stat" style={styles.statCard}>
            <IconBubble icon={ListChecks} tone="primary" size={16} />
            <Typography variant="micro">{t('taskCenter.completed', '已完成')}</Typography>
            <Text style={{ color: colors.primary, fontSize: fontSize.lg, fontWeight: '800' }}>
              {data?.summary.completedTasks ?? 0}
            </Text>
          </Card>
          <Card variant="stat" style={styles.statCard}>
            <IconBubble icon={WalletCards} tone="accent" size={16} />
            <Typography variant="micro">{t('taskCenter.wallet', '虾币')}</Typography>
            <PriceCompact amount={data?.wallet.balance ?? 0} size={fontSize.lg} />
          </Card>
        </View>

        {/* Task list */}
        <Card variant="glassCard" padded={false}>
          {data?.tasks.map((task, idx) => (
            <View
              key={task.key}
              style={[
                styles.taskRow,
                { borderBottomColor: colors.border },
                idx === (data?.tasks.length ?? 0) - 1 && { borderBottomWidth: 0 },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSize.sm }}>
                  {task.title}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 }}>
                  {task.description}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 4 }}>
                  <Text style={{ color: '#23a559', fontSize: fontSize.xs }}>+</Text>
                  <ShrimpCoinIcon size={12} color="#23a559" />
                  <Text style={{ color: '#23a559', fontSize: fontSize.xs }}>{task.reward}</Text>
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
                <Check size={16} color="#23a559" />
              ) : (
                <Text style={{ color: colors.textMuted, fontSize: fontSize.xs }}>
                  {t('taskCenter.incomplete', '未完成')}
                </Text>
              )}
            </View>
          ))}
        </Card>
      </ScrollView>
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl * 2 },
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
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
})
