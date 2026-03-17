import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, Check, Target, X } from 'lucide-react-native'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SettingsHeader } from '../../../src/components/common/settings-header'
import { fetchApi } from '../../../src/lib/api'
import { fontSize, radius, spacing, useColors } from '../../../src/theme'

export default function NotificationSettingsScreen() {
  const colors = useColors()
  const queryClient = useQueryClient()

  const { data: pref } = useQuery({
    queryKey: ['notification-preferences'],
    queryFn: () =>
      fetchApi<{
        strategy: 'all' | 'mention_only' | 'none'
        mutedServerIds: string[]
        mutedChannelIds: string[]
      }>('/api/notifications/preferences'),
  })

  const updatePref = useMutation({
    mutationFn: (payload: { strategy?: string }) =>
      fetchApi('/api/notifications/preferences', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notification-preferences'] }),
  })

  const strategies = [
    { value: 'all', icon: Bell, title: '全部通知', desc: '接收提及、回复与系统通知。' },
    { value: 'mention_only', icon: Target, title: '仅提及', desc: '只接收@提及和系统通知。' },
    { value: 'none', icon: X, title: '仅系统', desc: '屏蔽消息类通知，仅保留系统通知。' },
  ] as const

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SettingsHeader title="通知" />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        <Text style={[styles.groupTitle, { color: colors.textMuted }]}>通知策略</Text>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          {strategies.map((s, idx) => {
            const active = (pref?.strategy ?? 'all') === s.value
            const Icon = s.icon
            return (
              <Pressable
                key={s.value}
                style={[
                  styles.row,
                  { borderBottomColor: colors.border },
                  idx === strategies.length - 1 && { borderBottomWidth: 0 },
                ]}
                onPress={() => updatePref.mutate({ strategy: s.value })}
              >
                <View
                  style={[
                    styles.iconCircle,
                    { backgroundColor: active ? `${colors.primary}15` : colors.inputBackground },
                  ]}
                >
                  <Icon size={16} color={active ? colors.primary : colors.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: active ? colors.primary : colors.text,
                      fontWeight: '700',
                      fontSize: fontSize.sm,
                    }}
                  >
                    {s.title}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: fontSize.xs, marginTop: 1 }}>
                    {s.desc}
                  </Text>
                </View>
                {active && <Check size={16} color={colors.primary} />}
              </Pressable>
            )
          })}
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: spacing.xl * 2 },
  groupTitle: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  card: { marginHorizontal: spacing.md, borderRadius: radius.xl, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
