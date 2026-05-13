import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { Bot, ChevronRight } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { Avatar } from '../../../src/components/common/avatar'
import { LoadingScreen } from '../../../src/components/common/loading-screen'
import { SettingsHeader } from '../../../src/components/common/settings-header'
import { AppScreen, AppText, GlassCard, ListRow } from '../../../src/components/ui'
import { fetchApi } from '../../../src/lib/api'
import { fontSize, spacing, useColors } from '../../../src/theme'

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
    <AppScreen>
      <SettingsHeader title={t('settings.tabBuddy')} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        <GlassCard padded={false}>
          <ListRow
            icon={Bot}
            title={t('common.manage', '管理 Buddy')}
            onPress={() => router.push('/(main)/buddy-management')}
            right={<ChevronRight size={16} color={colors.textMuted} />}
          />
        </GlassCard>

        {agents.length === 0 ? (
          <View style={styles.emptyState}>
            <Bot size={40} color={colors.textMuted} />
            <AppText variant="label" tone="secondary" style={styles.emptyText}>
              {t('agentMgmt.noAgents', '暂无 Buddy')}
            </AppText>
          </View>
        ) : (
          <GlassCard padded={false}>
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
                    <AppText variant="bodyStrong">{name}</AppText>
                    <AppText variant="label" tone="secondary">
                      @{agent.botUser?.username ?? 'buddy'}
                    </AppText>
                  </View>
                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: online ? `${colors.success}20` : colors.glassSoft },
                    ]}
                  >
                    <AppText
                      variant="label"
                      style={[
                        styles.statusText,
                        { color: online ? colors.success : colors.textMuted },
                      ]}
                    >
                      {online ? t('member.online', '在线') : agent.status}
                    </AppText>
                  </View>
                </Pressable>
              )
            })}
          </GlassCard>
        )}
      </ScrollView>
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl * 2 },
  emptyState: { alignItems: 'center', paddingVertical: spacing.xl * 2 },
  emptyText: { marginTop: spacing.sm },
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
  statusText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
})
