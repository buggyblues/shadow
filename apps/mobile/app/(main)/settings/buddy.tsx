import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { Bot, ChevronRight, Sparkles } from 'lucide-react-native'
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
        <Pressable
          style={[styles.manageBtn, { backgroundColor: colors.primary }]}
          onPress={() => router.push('/(main)/buddy-management')}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: fontSize.sm }}>
            {t('common.manage', '管理 Buddy')}
          </Text>
          <ChevronRight size={16} color="#fff" />
        </Pressable>

        {agents.length === 0 ? (
          <View style={styles.emptyState}>
            <Bot size={48} color={colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              还没有 Buddy
            </Text>
            <Text style={[styles.emptyDesc, { color: colors.textMuted }]}>
              创建你的第一个 AI 助手，让它帮你打工！
            </Text>
            <Pressable
              style={[styles.createFirstBtn, { backgroundColor: colors.primary }]}
              onPress={() => router.push('/(main)/buddy-management')}
            >
              <Sparkles size={18} color="#fff" />
              <Text style={styles.createFirstBtnText}>创建我的第一个 Buddy</Text>
            </Pressable>
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
                      {online ? 'online' : agent.status}
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
  manageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    height: 48,
    borderRadius: radius.xl,
  },
  emptyState: { alignItems: 'center', paddingVertical: spacing.xl * 2 },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    marginTop: spacing.md,
  },
  emptyDesc: {
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
  createFirstBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.xl,
  },
  createFirstBtnText: {
    color: '#fff',
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
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
