import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { Bot, ChevronRight } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'
import { Avatar } from '../../../src/components/common/avatar'
import { LoadingScreen } from '../../../src/components/common/loading-screen'
import { SettingsHeader } from '../../../src/components/common/settings-header'
import {
  BackgroundSurface,
  EmptyState,
  MenuItem,
  PageScroll,
  Section,
} from '../../../src/components/ui'
import { fetchApi } from '../../../src/lib/api'
import { iconSize, spacing, useColors } from '../../../src/theme'

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
    <BackgroundSurface style={styles.container}>
      <SettingsHeader title={t('settings.tabBuddy')} />
      <PageScroll compact>
        <Section>
          <MenuItem
            icon={Bot}
            title={t('common.manage', '管理 Buddy')}
            onPress={() => router.push('/(main)/buddy-management')}
            right={<ChevronRight size={iconSize.md} color={colors.textMuted} />}
          />
        </Section>

        {agents.length === 0 ? (
          <EmptyState
            icon={Bot}
            title={t('agentMgmt.noAgents', '暂无 Buddy')}
            style={styles.emptyState}
          />
        ) : (
          <Section title={t('settings.tabBuddy')}>
            {agents.map((agent) => {
              const name =
                agent.botUser?.displayName ??
                agent.botUser?.username ??
                agent.name ??
                agent.id.slice(0, 8)
              const online = isAgentOnline(agent)
              return (
                <MenuItem
                  key={agent.id}
                  left={
                    <Avatar
                      uri={agent.botUser?.avatarUrl}
                      userId={agent.botUser?.id}
                      name={name}
                      size={iconSize['6xl']}
                      status={online ? 'online' : 'offline'}
                      showStatus
                    />
                  }
                  title={name}
                  subtitle={`@${agent.botUser?.username ?? 'buddy'}`}
                  onPress={
                    agent.botUser?.id
                      ? () => router.push(`/(main)/profile/${agent.botUser?.id}` as never)
                      : undefined
                  }
                  right={
                    agent.botUser?.id ? (
                      <ChevronRight size={iconSize.md} color={colors.textMuted} />
                    ) : null
                  }
                />
              )
            })}
          </Section>
        )}
      </PageScroll>
    </BackgroundSurface>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  emptyState: { alignItems: 'center', paddingVertical: spacing.xl * 2 },
})
