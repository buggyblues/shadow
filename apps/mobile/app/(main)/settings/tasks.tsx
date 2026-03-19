import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react-native'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { LoadingScreen } from '../../../src/components/common/loading-screen'
import { SettingsHeader } from '../../../src/components/common/settings-header'
import { PriceCompact } from '../../../src/components/common/price-display'
import { ShrimpCoinIcon } from '../../../src/components/common/shrimp-coin'
import { fetchApi } from '../../../src/lib/api'
import { fontSize, radius, spacing, useColors } from '../../../src/theme'

export default function TaskCenterScreen() {
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
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SettingsHeader title="任务中心" />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
            <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '700' }}>总数</Text>
            <Text style={{ color: colors.text, fontSize: fontSize.lg, fontWeight: '800' }}>
              {data?.summary.totalTasks ?? 0}
            </Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
            <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '700' }}>可领</Text>
            <Text style={{ color: '#23a559', fontSize: fontSize.lg, fontWeight: '800' }}>
              {data?.summary.claimableTasks ?? 0}
            </Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
            <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '700' }}>已完成</Text>
            <Text style={{ color: colors.primary, fontSize: fontSize.lg, fontWeight: '800' }}>
              {data?.summary.completedTasks ?? 0}
            </Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
            <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '700' }}>虾币</Text>
            <PriceCompact amount={data?.wallet.balance ?? 0} size={fontSize.lg} />
          </View>
        </View>

        {/* Task list */}
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
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
                  <Text style={{ color: '#23a559', fontSize: fontSize.xs }}>
                    {task.reward}
                  </Text>
                </View>
              </View>
              {task.claimable ? (
                <Pressable
                  style={[styles.claimBtn, { backgroundColor: colors.primary }]}
                  onPress={() => claimMutation.mutate(task.key)}
                  disabled={claimMutation.isPending}
                >
                  <Text style={{ color: '#fff', fontSize: fontSize.xs, fontWeight: '700' }}>
                    领取
                  </Text>
                </Pressable>
              ) : task.completed ? (
                <Check size={16} color="#23a559" />
              ) : (
                <Text style={{ color: colors.textMuted, fontSize: fontSize.xs }}>未完成</Text>
              )}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl * 2 },
  statsRow: { flexDirection: 'row', gap: spacing.sm },
  statCard: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radius.xl,
    alignItems: 'center',
  },
  card: { borderRadius: radius.xl, overflow: 'hidden' },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  claimBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.lg,
  },
})
