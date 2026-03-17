import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { Globe, Search, Users, X } from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import Reanimated, { FadeInDown } from 'react-native-reanimated'
import { Avatar } from '../../../src/components/common/avatar'
import { EmptyState } from '../../../src/components/common/empty-state'
import { LoadingScreen } from '../../../src/components/common/loading-screen'
import { fetchApi, getImageUrl } from '../../../src/lib/api'
import { showToast } from '../../../src/lib/toast'
import { fontSize, radius, spacing, useColors } from '../../../src/theme'

interface DiscoverServer {
  id: string
  name: string
  slug: string | null
  description: string | null
  iconUrl: string | null
  bannerUrl?: string | null
  isPublic: boolean
  inviteCode: string
  memberCount: number
}

interface ServerEntry {
  server: { id: string; name: string; slug: string | null; iconUrl: string | null }
  member: { role: string }
}

interface JoinServerResponse {
  id: string
  slug?: string | null
}

interface ApiError {
  status?: number
  message?: string
}

export default function DiscoverScreen() {
  const { t } = useTranslation()
  const colors = useColors()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const {
    data: servers = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['discover-servers'],
    queryFn: () => fetchApi<DiscoverServer[]>('/api/servers/discover'),
  })

  const { data: myServers = [] } = useQuery({
    queryKey: ['servers'],
    queryFn: () => fetchApi<ServerEntry[]>('/api/servers'),
  })

  const joinedServerIds = useMemo(() => new Set(myServers.map((s) => s.server.id)), [myServers])

  const joinMutation = useMutation({
    mutationFn: ({ inviteCode }: { inviteCode: string; serverId: string }) =>
      fetchApi<JoinServerResponse>('/api/servers/_/join', {
        method: 'POST',
        body: JSON.stringify({ inviteCode }),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      router.push(`/(main)/servers/${data.slug ?? data.id}`)
    },
    onError: (err: ApiError, variables) => {
      if (err?.status === 409) {
        queryClient.invalidateQueries({ queryKey: ['servers'] })
        const srv = servers.find((s) => s.id === variables.serverId)
        router.push(`/(main)/servers/${srv?.slug ?? variables.serverId}`)
      } else {
        showToast(err?.message || t('common.error'), 'error')
      }
    },
  })

  const filtered = servers.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.description?.toLowerCase().includes(search.toLowerCase()),
  )

  if (isLoading && !refreshing) return <LoadingScreen />

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Search */}
      <View style={[styles.searchSection, { backgroundColor: colors.surface }]}>
        <View style={[styles.searchBox, { backgroundColor: colors.inputBackground }]}>
          <Search size={16} color={colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            value={search}
            onChangeText={setSearch}
            placeholder="搜索公开服务器..."
            placeholderTextColor={colors.textMuted}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <X size={14} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Stats bar */}
      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Globe size={14} color={colors.textMuted} />
          <Text style={[styles.statText, { color: colors.textMuted }]}>
            {filtered.length} 个公开服务器
          </Text>
        </View>
      </View>

      {filtered.length === 0 ? (
        <EmptyState icon="🔍" title="没有找到服务器" />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true)
                await refetch()
                setRefreshing(false)
              }}
              tintColor={colors.textMuted}
            />
          }
          renderItem={({ item, index }) => {
            const isJoined = joinedServerIds.has(item.id)
            return (
              <Reanimated.View entering={FadeInDown.delay(index * 60).springify()}>
                <Pressable
                  style={({ pressed }) => [
                    styles.card,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      opacity: pressed ? 0.9 : 1,
                    },
                  ]}
                  onPress={() => {
                    if (isJoined) {
                      router.push(`/(main)/servers/${item.slug ?? item.id}`)
                    }
                  }}
                >
                  {/* Banner — fixed height always */}
                  <View style={styles.banner}>
                    {item.bannerUrl ? (
                      <Image
                        source={{ uri: getImageUrl(item.bannerUrl)! }}
                        style={StyleSheet.absoluteFill}
                        contentFit="cover"
                      />
                    ) : (
                      <LinearGradient
                        colors={[`${colors.primary}25`, `${colors.primary}08`]}
                        style={StyleSheet.absoluteFill}
                      />
                    )}
                  </View>

                  <View style={styles.cardBody}>
                    {/* Server info row */}
                    <View style={styles.serverRow}>
                      <Avatar uri={item.iconUrl} name={item.name} size={44} userId={item.id} />
                      <View style={styles.serverInfo}>
                        <Text style={[styles.serverName, { color: colors.text }]} numberOfLines={1}>
                          {item.name}
                        </Text>
                        <View style={styles.memberRow}>
                          <Users size={12} color={colors.textMuted} />
                          <Text style={[styles.memberCount, { color: colors.textMuted }]}>
                            {item.memberCount} 位成员
                          </Text>
                        </View>
                      </View>

                      {isJoined ? (
                        <Pressable
                          style={[styles.joinBtn, { backgroundColor: colors.surfaceHover }]}
                          onPress={() => router.push(`/(main)/servers/${item.slug ?? item.id}`)}
                        >
                          <Text style={[styles.joinBtnText, { color: colors.text }]}>进入</Text>
                        </Pressable>
                      ) : (
                        <Pressable
                          style={[styles.joinBtn, { backgroundColor: colors.primary }]}
                          onPress={() => {
                            if (item.inviteCode) {
                              joinMutation.mutate({
                                inviteCode: item.inviteCode,
                                serverId: item.id,
                              })
                            }
                          }}
                          disabled={joinMutation.isPending}
                        >
                          <Text style={[styles.joinBtnText, { color: '#fff' }]}>加入</Text>
                        </Pressable>
                      )}
                    </View>

                    {/* Description */}
                    {item.description && (
                      <Text
                        style={[styles.desc, { color: colors.textSecondary }]}
                        numberOfLines={2}
                      >
                        {item.description}
                      </Text>
                    )}
                  </View>
                </Pressable>
              </Reanimated.View>
            )
          }}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Search
  searchSection: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    height: 38,
    gap: spacing.xs,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.sm,
    paddingVertical: 0,
  },

  // Stats
  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  statText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
  },

  // List
  list: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: 100,
  },

  // Card
  card: {
    borderRadius: radius.xl,
    borderWidth: 1,
    overflow: 'hidden',
  },
  banner: {
    height: 80,
  },
  cardBody: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  serverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  serverInfo: {
    flex: 1,
    gap: 2,
  },
  serverName: {
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  memberCount: {
    fontSize: fontSize.xs,
  },
  desc: {
    fontSize: fontSize.sm,
    lineHeight: 18,
  },
  joinBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  joinBtnText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
})
