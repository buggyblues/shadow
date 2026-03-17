import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { Search, Shield } from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import Reanimated, { FadeInDown } from 'react-native-reanimated'
import { DottedBackground } from '../../../src/components/common/dotted-background'
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

  const { data: servers = [], isLoading } = useQuery({
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

  if (isLoading) return <LoadingScreen />

  const glassCardStyle = {
    backgroundColor: `${colors.surface}E6`,
    borderColor: colors.border,
    borderWidth: 2,
    borderRadius: 24,
  }

  return (
    <DottedBackground>
      <View style={[styles.container]}>
        {/* Search */}
        <View style={[styles.searchContainer]}>
          <View style={[styles.searchBox, glassCardStyle, { backgroundColor: colors.surface }]}>
            <Search size={18} color={colors.textMuted} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              value={search}
              onChangeText={setSearch}
              placeholder={t('discover.searchPlaceholder')}
              placeholderTextColor={colors.textMuted}
            />
          </View>
        </View>

        {filtered.length === 0 ? (
          <EmptyState icon="🔍" title={t('discover.noServers')} />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            renderItem={({ item, index }) => {
              const isJoined = joinedServerIds.has(item.id)
              return (
                <Reanimated.View entering={FadeInDown.delay(index * 100).springify()}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.card,
                      glassCardStyle,
                      {
                        backgroundColor: colors.surface,
                        transform: [{ scale: pressed ? 0.96 : 1 }],
                      },
                    ]}
                    onPress={() => {
                      if (isJoined) {
                        router.push(`/(main)/servers/${item.slug ?? item.id}`)
                      }
                    }}
                  >
                    {/* Banner */}
                    <View style={[styles.banner, { backgroundColor: `${colors.primary}20` }]}>
                      {item.bannerUrl && (
                        <Image
                          source={{ uri: getImageUrl(item.bannerUrl)! }}
                          style={StyleSheet.absoluteFill}
                          contentFit="cover"
                        />
                      )}
                      {item.isPublic && (
                        <View style={styles.publicBadge}>
                          <Shield size={10} color="#fff" />
                          <Text style={styles.publicText}>{t('discover.public')}</Text>
                        </View>
                      )}
                    </View>

                    {/* Icon overlay */}
                    <View style={[styles.iconWrap, { backgroundColor: colors.surface }]}>
                      {item.iconUrl ? (
                        <Image
                          source={{ uri: getImageUrl(item.iconUrl)! }}
                          style={styles.icon}
                          contentFit="cover"
                        />
                      ) : (
                        <Text style={styles.iconFallback}>{item.name.charAt(0)}</Text>
                      )}
                    </View>

                    <View style={styles.cardBody}>
                      <Text style={[styles.serverName, { color: colors.text }]} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text
                        style={[styles.desc, { color: colors.textSecondary }]}
                        numberOfLines={2}
                      >
                        {item.description ?? t('discover.noDescription')}
                      </Text>

                      <View style={styles.cardFooter}>
                        <View style={styles.memberInfo}>
                          <View style={[styles.onlineDot, { backgroundColor: '#23a559' }]} />
                          <Text style={{ color: colors.textMuted, fontSize: fontSize.xs }}>
                            {item.memberCount} {t('discover.members')}
                          </Text>
                        </View>

                        {isJoined ? (
                          <Pressable
                            style={[styles.joinBtn, { backgroundColor: '#23a559' }]}
                            onPress={() => router.push(`/(main)/servers/${item.slug ?? item.id}`)}
                          >
                            <Text style={styles.joinBtnText}>{t('discover.enterButton')}</Text>
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
                            <Text style={styles.joinBtnText}>{t('discover.joinButton')}</Text>
                          </Pressable>
                        )}
                      </View>
                    </View>
                  </Pressable>
                </Reanimated.View>
              )
            }}
          />
        )}
      </View>
    </DottedBackground>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchContainer: {
    padding: spacing.md,
    borderBottomWidth: 1,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    height: 44,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.md,
  },
  list: {
    padding: spacing.md,
    gap: spacing.md,
  },
  card: {
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  banner: {
    height: 100,
  },
  publicBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 99,
  },
  publicText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  iconWrap: {
    position: 'absolute',
    top: 74,
    left: 12,
    width: 52,
    height: 52,
    borderRadius: 14,
    padding: 3,
    zIndex: 10,
  },
  icon: {
    width: 46,
    height: 46,
    borderRadius: 11,
  },
  iconFallback: {
    width: 46,
    height: 46,
    borderRadius: 11,
    textAlign: 'center',
    lineHeight: 46,
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    backgroundColor: '#5865F2',
    overflow: 'hidden',
  },
  cardBody: {
    paddingTop: 32,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  serverName: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    marginBottom: 4,
  },
  desc: {
    fontSize: fontSize.sm,
    marginBottom: spacing.md,
    minHeight: 36,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  memberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  joinBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  joinBtnText: {
    color: '#fff',
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
})
