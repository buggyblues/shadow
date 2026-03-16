import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { fetchApi } from '../../lib/api'
import { fontSize, radius, spacing, useColors } from '../../theme'
import { Avatar } from '../common/avatar'
import { StatusBadge } from '../common/status-badge'

interface Member {
  id: string
  userId: string
  role: 'owner' | 'admin' | 'member'
  user: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
    status?: string
  }
}

export function MemberList({ serverId }: { serverId: string }) {
  const { t } = useTranslation()
  const colors = useColors()

  const { data: members = [] } = useQuery({
    queryKey: ['server-members', serverId],
    queryFn: () => fetchApi<Member[]>(`/api/servers/${serverId}/members`),
    enabled: !!serverId,
  })

  const online = members.filter((m) => m.user.status && m.user.status !== 'offline')
  const offline = members.filter((m) => !m.user.status || m.user.status === 'offline')

  const renderMember = ({ item }: { item: Member }) => {
    const name = item.user.displayName || item.user.username
    return (
      <Pressable style={styles.memberItem}>
        <View style={styles.avatarWrapper}>
          <Avatar uri={item.user.avatarUrl} name={name} size={32} userId={item.user.id} />
          <View style={styles.statusDot}>
            <StatusBadge status={item.user.status || 'offline'} size={8} />
          </View>
        </View>
        <View style={styles.info}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
            {name}
          </Text>
          {item.role !== 'member' && (
            <Text style={[styles.role, { color: colors.primary }]}>
              {item.role === 'owner' ? t('member.roleOwner') : t('member.roleAdmin')}
            </Text>
          )}
        </View>
      </Pressable>
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <FlatList
        data={[...online, ...offline]}
        keyExtractor={(item) => item.id}
        renderItem={renderMember}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={[styles.groupLabel, { color: colors.textMuted }]}>
              {t('member.groupOnline')} — {online.length}
            </Text>
          </View>
        }
        contentContainerStyle={styles.list}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    padding: spacing.sm,
  },
  header: {
    marginBottom: spacing.sm,
  },
  groupLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  avatarWrapper: {
    position: 'relative',
  },
  statusDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  role: {
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
})
