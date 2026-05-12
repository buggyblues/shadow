import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { Bot, ChevronRight, Package, Store } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Avatar } from '../../../src/components/common/avatar'
import { LoadingScreen } from '../../../src/components/common/loading-screen'
import { SettingsHeader } from '../../../src/components/common/settings-header'
import { fetchApi } from '../../../src/lib/api'
import { fontSize, radius, spacing, useColors } from '../../../src/theme'

export default function BuddySettingsScreen() {
  const { t } = useTranslation()
  const colors = useColors()
  const router = useRouter()

  const { data: agents = [], isLoading } = useQuery({
    queryKey: ['my-agents'],
    queryFn: () =>
      fetchApi<
        Array<{
          id: string
          name: string | null
          status: string
          lastHeartbeat: string | null
          totalOnlineSeconds: number
          botUser?: {
            id: string
            username: string
            displayName: string | null
            avatarUrl: string | null
          } | null
        }>
      >('/api/agents'),
  })

  const isAgentOnline = (agent: { status: string; lastHeartbeat: string | null }) => {
    if (agent.status !== 'running' || !agent.lastHeartbeat) return false
    return Date.now() - new Date(agent.lastHeartbeat).getTime() < 90_000
  }

  if (isLoading) return <LoadingScreen />

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SettingsHeader title={t('settings.tabBuddy')} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        <View style={[styles.actionGroup, { backgroundColor: colors.surface }]}>
          <Pressable
            style={styles.actionRow}
            onPress={() => router.push('/(main)/buddy-management')}
          >
            <View style={[styles.actionIcon, { backgroundColor: `${colors.primary}18` }]}>
              <Bot size={16} color={colors.primary} />
            </View>
            <Text style={[styles.actionLabel, { color: colors.text }]}>
              {t('common.manage', '管理 Buddy')}
            </Text>
            <ChevronRight size={16} color={colors.textMuted} />
          </Pressable>
          <View style={[styles.separator, { backgroundColor: colors.border }]} />
          <Pressable
            style={styles.actionRow}
            onPress={() => router.push('/(main)/settings/buddy-market' as never)}
          >
            <View style={[styles.actionIcon, { backgroundColor: `${colors.primary}18` }]}>
              <Store size={16} color={colors.primary} />
            </View>
            <Text style={[styles.actionLabel, { color: colors.text }]}>
              {t('settings.goBuddyMarket', 'Buddy 市场')}
            </Text>
            <ChevronRight size={16} color={colors.textMuted} />
          </Pressable>
          <View style={[styles.separator, { backgroundColor: colors.border }]} />
          <Pressable style={styles.actionRow} onPress={() => router.push('/(main)/my-rentals')}>
            <View style={[styles.actionIcon, { backgroundColor: `${colors.primary}18` }]}>
              <Package size={16} color={colors.primary} />
            </View>
            <Text style={[styles.actionLabel, { color: colors.text }]}>
              {t('marketplace.rentalsAndListings', '租赁与挂单')}
            </Text>
            <ChevronRight size={16} color={colors.textMuted} />
          </Pressable>
        </View>

        {agents.length === 0 ? (
          <View style={styles.emptyState}>
            <Bot size={40} color={colors.textMuted} />
            <Text style={{ color: colors.textMuted, fontSize: fontSize.sm, marginTop: spacing.sm }}>
              {t('agentMgmt.noAgents', '暂无 Buddy')}
            </Text>
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            {agents.map((agent, idx) => {
              const name =
                agent.botUser?.displayName ??
                agent.botUser?.username ??
                agent.name ??
                agent.id.slice(0, 8)
              const online = isAgentOnline(agent)
              return (
                <Pressable
                  key={agent.id}
                  style={[
                    styles.row,
                    { borderBottomColor: colors.border },
                    idx === agents.length - 1 && { borderBottomWidth: 0 },
                  ]}
                  onPress={() => router.push('/(main)/buddy-management')}
                >
                  <Avatar
                    uri={agent.botUser?.avatarUrl}
                    userId={agent.botUser?.id}
                    name={name}
                    size={40}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSize.sm }}>
                      {name}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: fontSize.xs }}>
                      @{agent.botUser?.username ?? 'buddy'}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: online ? '#23a559' + '20' : colors.border },
                    ]}
                  >
                    <Text
                      style={{
                        color: online ? '#23a559' : colors.textMuted,
                        fontSize: 10,
                        fontWeight: '600',
                      }}
                    >
                      {online ? t('marketplace.online', '在线') : agent.status}
                    </Text>
                  </View>
                </Pressable>
              )
            })}
          </View>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl * 2 },
  actionGroup: { borderRadius: radius.xl, overflow: 'hidden' },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 52,
    paddingHorizontal: spacing.lg,
  },
  actionIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { flex: 1, fontSize: fontSize.sm, fontWeight: '700' },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: spacing.lg + 32 + spacing.md },
  emptyState: { alignItems: 'center', paddingVertical: spacing.xl * 2 },
  card: { borderRadius: radius.xl, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 99,
  },
})
