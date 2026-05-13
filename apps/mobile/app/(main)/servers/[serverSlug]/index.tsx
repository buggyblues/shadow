import type { Channel, ChannelSortBy } from '@shadowob/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Edit3,
  Hash,
  Lock,
  LockOpen,
  Megaphone,
  MessageSquare,
  Plus,
  Search,
  Send,
  Settings,
  Trash2,
  UserPlus,
  Volume2,
  X,
} from 'lucide-react-native'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import Reanimated, { FadeInDown } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ChannelCatSvg } from '../../../../src/components/common/cat-svg'
import { LoadingScreen } from '../../../../src/components/common/loading-screen'
import {
  AppText,
  BackgroundSurface,
  Badge,
  Button,
  ChannelRow,
  Dialog,
  GlassHeader,
  GlassPanel,
  MenuItem,
  Sheet,
  TextField,
} from '../../../../src/components/ui'
import { useChannelSort } from '../../../../src/hooks/use-channel-sort'
import { fetchApi, getImageUrl } from '../../../../src/lib/api'
import { setLastChannel } from '../../../../src/lib/last-channel'
import { showToast } from '../../../../src/lib/toast'
import { useAuthStore } from '../../../../src/stores/auth.store'
import { spacing, useColors } from '../../../../src/theme'

// ── Types ────────────────────────────────────────────────────────────────────

interface ServerChannel extends Channel {
  categoryId?: string | null
  isPrivate?: boolean
}

interface Category {
  id: string
  name: string
  position: number
}

interface Server {
  id: string
  name: string
  slug: string | null
  iconUrl: string | null
  bannerUrl?: string | null
  ownerId: string
  description: string | null
  memberCount?: number
}

interface Member {
  user: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
    isBot?: boolean
  }
  role: string
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ServerHomeScreen() {
  const { serverSlug } = useLocalSearchParams<{ serverSlug: string }>()
  const { t } = useTranslation()
  const colors = useColors()
  const router = useRouter()
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)
  const navigation = useNavigation()
  const insets = useSafeAreaInsets()

  // State
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set())
  const [showSearch, setShowSearch] = useState(false)
  const [channelSearch, setChannelSearch] = useState('')
  const [contextChannel, setContextChannel] = useState<ServerChannel | null>(null)
  const [editingChannel, setEditingChannel] = useState<ServerChannel | null>(null)
  const [editChannelName, setEditChannelName] = useState('')
  const [showSortModal, setShowSortModal] = useState(false)

  // ── Queries ─────────────────────────────────────

  const {
    data: serverAccess,
    isLoading: isServerAccessLoading,
    isError: isServerAccessError,
  } = useQuery({
    queryKey: ['server-access', serverSlug],
    queryFn: () =>
      fetchApi<{
        server: Server
        canAccess: boolean
        joinRequestStatus: 'pending' | 'approved' | 'rejected' | null
      }>(`/api/servers/${serverSlug}/access`),
    enabled: !!serverSlug,
    retry: false,
  })
  const canAccessServer = serverAccess?.canAccess === true

  const { data: server, isLoading: isServerLoading } = useQuery({
    queryKey: ['server', serverSlug],
    queryFn: () => fetchApi<Server>(`/api/servers/${serverSlug}`),
    enabled: !!serverSlug && canAccessServer,
  })

  const requestServerAccessMutation = useMutation({
    mutationFn: () =>
      fetchApi(`/api/servers/${serverSlug}/join-requests`, {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['server-access', serverSlug] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
    },
  })

  // Channel sort
  const {
    sortBy,
    sortDirection,
    setSortBy,
    toggleSortDirection,
    sortChannels,
    updateLastAccessed,
    hasCustomSort,
  } = useChannelSort(server?.id)

  const {
    data: channels = [],
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['channels', server?.id],
    queryFn: () => fetchApi<ServerChannel[]>(`/api/servers/${server!.id}/channels`),
    enabled: !!server?.id,
  })

  const { data: categories = [] } = useQuery({
    queryKey: ['categories', server?.id],
    queryFn: () => fetchApi<Category[]>(`/api/servers/${server!.id}/categories`),
    enabled: !!server?.id,
  })

  const { data: memberData } = useQuery({
    queryKey: ['members', server?.id],
    queryFn: () => fetchApi<Member[]>(`/api/servers/${server!.id}/members`),
    enabled: !!server?.id,
  })

  const members = memberData ?? []

  const onlineCount = members.filter(
    (m) => m.user && ((m as { user: { status?: string } }).user.status ?? 'offline') !== 'offline',
  ).length
  const _totalMemberCount = server?.memberCount ?? members.length
  const isOwner = currentUser?.id === server?.ownerId

  // Set navigation header
  useEffect(() => {
    navigation.setOptions({
      headerShown: false,
    })
  }, [navigation])

  // ── Channel actions ────────────────────────────

  const deleteChannelMutation = useMutation({
    mutationFn: (channelId: string) => fetchApi(`/api/channels/${channelId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels', server?.id] })
    },
    onError: (err: Error) => showToast(err?.message || t('common.error'), 'error'),
  })

  const updateChannelMutation = useMutation({
    mutationFn: (data: { channelId: string; name?: string; isPrivate?: boolean }) =>
      fetchApi(`/api/channels/${data.channelId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: data.name, isPrivate: data.isPrivate }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels', server?.id] })
      setEditingChannel(null)
      setEditChannelName('')
    },
    onError: (err: Error) => showToast(err?.message || t('common.error'), 'error'),
  })

  // ── Channel grouping ──────────────────────────

  // Sort channels before grouping
  const sortedChannels = useMemo(() => {
    return sortChannels(channels)
  }, [channels, sortChannels])

  const channelIcon = (type: string) => {
    switch (type) {
      case 'voice':
        return Volume2
      case 'announcement':
        return Megaphone
      default:
        return Hash
    }
  }

  const toggleCategory = (catId: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(catId)) next.delete(catId)
      else next.add(catId)
      return next
    })
  }

  const grouped = useMemo(() => {
    const sorted = [...categories].sort((a, b) => a.position - b.position)
    const groups: { category: Category | null; channels: ServerChannel[] }[] = []

    const uncategorized = sortedChannels.filter((c) => !c.categoryId)
    if (uncategorized.length > 0) {
      groups.push({ category: null, channels: uncategorized })
    }

    for (const cat of sorted) {
      const catChannels = sortedChannels.filter((c) => c.categoryId === cat.id)
      if (catChannels.length > 0) {
        groups.push({ category: cat, channels: catChannels })
      }
    }
    return groups
  }, [sortedChannels, categories])

  const filteredGroups = useMemo(() => {
    if (!channelSearch) return grouped
    const q = channelSearch.toLowerCase()
    return grouped
      .map((g) => ({
        ...g,
        channels: g.channels.filter((c) => c.name.toLowerCase().includes(q)),
      }))
      .filter((g) => g.channels.length > 0)
  }, [grouped, channelSearch])

  // ── Nav items ──────────────────────────────────

  const _channelTypeLabel = (type: 'text' | 'voice' | 'announcement') => {
    switch (type) {
      case 'voice':
        return t('channel.typeVoice')
      case 'announcement':
        return t('channel.typeAnnouncement')
      default:
        return t('channel.typeText')
    }
  }

  if (isServerAccessLoading || (canAccessServer && (isServerLoading || isLoading))) {
    return <LoadingScreen />
  }

  if (serverAccess && !serverAccess.canAccess) {
    const isPending =
      serverAccess.joinRequestStatus === 'pending' || requestServerAccessMutation.isSuccess
    return (
      <BackgroundSurface>
        <View style={[styles.accessGateContainer, { paddingTop: insets.top }]}>
          <GlassPanel style={styles.accessGateCard}>
            <View style={[styles.accessGateIcon, { backgroundColor: `${colors.primary}18` }]}>
              {isPending ? (
                <Clock size={32} color={colors.primary} />
              ) : (
                <Lock size={32} color={colors.primary} />
              )}
            </View>
            <AppText variant="headline" style={styles.accessGateTitle}>
              {serverAccess.server.name}
            </AppText>
            <AppText tone="secondary" style={styles.accessGateDesc}>
              {t('server.privateServerGateDesc')}
            </AppText>
            <Button
              variant="primary"
              size="lg"
              icon={isPending ? Clock : Send}
              loading={requestServerAccessMutation.isPending}
              disabled={isPending || requestServerAccessMutation.isPending}
              onPress={() => requestServerAccessMutation.mutate()}
              style={styles.accessGateButton}
            >
              {isPending ? t('server.requestPending') : t('server.requestAccess')}
            </Button>
          </GlassPanel>
        </View>
      </BackgroundSurface>
    )
  }

  if (isServerAccessError || !server) return <LoadingScreen />

  return (
    <BackgroundSurface>
      {/* Custom navigation header bar */}
      <GlassHeader style={[styles.customHeader, { paddingTop: insets.top }]}>
        <Button
          variant="ghost"
          size="icon"
          icon={ChevronLeft}
          onPress={() => router.back()}
          hitSlop={8}
          iconColor={colors.text}
          style={styles.headerBackBtn}
        />

        <Pressable
          onPress={() => router.push(`/(main)/servers/${serverSlug}/detail` as never)}
          style={styles.headerTitleRow}
        >
          {server?.iconUrl ? (
            <Image
              source={{ uri: getImageUrl(server.iconUrl)! }}
              style={styles.headerServerIcon}
              contentFit="cover"
            />
          ) : (
            <View
              style={[
                styles.headerServerIcon,
                { backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
              ]}
            >
              <Text style={[styles.headerInitial, { color: colors.background }]}>
                {server?.name?.[0] ?? '?'}
              </Text>
            </View>
          )}
          <View style={styles.headerTextCol}>
            <View style={styles.headerNameRow}>
              <AppText variant="title" style={styles.headerServerName} numberOfLines={1}>
                {server?.name ?? '...'}
              </AppText>
              <ChevronRight
                size={16}
                color={colors.textMuted}
                strokeWidth={2.8}
                style={styles.headerChevron}
              />
            </View>
            <View style={styles.headerOnlineRow}>
              <View style={[styles.headerOnlineDot, { backgroundColor: colors.success }]} />
              <AppText variant="label" tone="secondary" style={styles.headerOnlineText}>
                {onlineCount} {t('server.membersOnline')}
              </AppText>
            </View>
          </View>
        </Pressable>

        <View style={styles.headerRight}>
          {isOwner && (
            <Button
              variant="ghost"
              size="icon"
              icon={Settings}
              onPress={() => router.push(`/(main)/servers/${serverSlug}/server-settings` as never)}
              hitSlop={8}
              iconColor={colors.text}
              style={styles.headerIconBtn}
            />
          )}
        </View>
      </GlassHeader>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: spacing.md, paddingBottom: 100 }}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => refetch()}
            tintColor={colors.primary}
          />
        }
      >
        {/* ── Channels Header ─────────────────────────── */}
        <View style={styles.channelsControls}>
          <AppText variant="title" style={styles.cuteSectionLabel}>
            {t('server.channels')}
          </AppText>
          <View style={styles.channelsActions}>
            <View style={styles.actionButtonWrap}>
              <Button
                variant={hasCustomSort ? 'primary' : 'glass'}
                size="icon"
                icon={ArrowUpDown}
                iconColor={hasCustomSort ? '#050508' : colors.text}
                iconSize={18}
                onPress={() => setShowSortModal(true)}
              />
              {hasCustomSort && <View style={[styles.sortBadge, { backgroundColor: '#fff' }]} />}
            </View>
            <Button
              variant="glass"
              size="icon"
              icon={Search}
              iconColor={colors.text}
              iconSize={18}
              onPress={() => setShowSearch(!showSearch)}
            />
            {isOwner && (
              <Button
                variant="primary"
                size="icon"
                icon={Plus}
                iconSize={18}
                onPress={() => router.push(`/(main)/servers/${serverSlug}/create-channel` as never)}
              />
            )}
          </View>
        </View>

        {showSearch && (
          <TextField
            value={channelSearch}
            onChangeText={setChannelSearch}
            placeholder={t('server.searchChannels')}
            icon={Search}
            autoFocus
            containerStyle={styles.channelSearchContainer}
            style={styles.channelSearchWrap}
            right={
              channelSearch.length > 0 ? (
                <Pressable onPress={() => setChannelSearch('')} hitSlop={12}>
                  <X size={16} color={colors.textMuted} strokeWidth={2.5} />
                </Pressable>
              ) : null
            }
          />
        )}

        {/* ── Channel Bubbles ─────────────────────────── */}
        <View style={styles.channelsList}>
          {filteredGroups.map((group, groupIndex) => (
            <Reanimated.View
              key={group.category?.id ?? 'uncategorized'}
              entering={FadeInDown.delay(500 + groupIndex * 100).springify()}
            >
              <GlassPanel style={styles.categoryBubble}>
                {group.category && (
                  <Pressable
                    style={styles.categoryRow}
                    onPress={() => toggleCategory(group.category!.id)}
                  >
                    <View style={styles.categoryHeaderLeft}>
                      <ChevronDown
                        size={14}
                        color={colors.text}
                        strokeWidth={3}
                        style={{
                          transform: [
                            {
                              rotate: collapsedCategories.has(group.category.id)
                                ? '-90deg'
                                : '0deg',
                            },
                          ],
                        }}
                      />
                      <AppText variant="label" style={styles.categoryName}>
                        {group.category.name}
                      </AppText>
                    </View>
                    <Badge variant="neutral" size="xs">
                      {group.channels.length}
                    </Badge>
                  </Pressable>
                )}
                {!(group.category && collapsedCategories.has(group.category.id)) && (
                  <View style={styles.channelsContainer}>
                    {group.channels.map((channel) => (
                      <ChannelRow
                        key={channel.id}
                        title={channel.name}
                        icon={channelIcon(channel.type)}
                        tone={channel.isPrivate ? 'muted' : 'primary'}
                        right={
                          channel.isPrivate ? (
                            <Lock size={14} color={colors.textMuted} strokeWidth={2.5} />
                          ) : null
                        }
                        onPress={() => {
                          updateLastAccessed(channel.id)
                          if (server) setLastChannel(server.id, channel.id)
                          router.push(
                            `/(main)/servers/${serverSlug}/channels/${channel.id}` as never,
                          )
                        }}
                        onLongPress={() => setContextChannel(channel)}
                        flat
                      />
                    ))}
                  </View>
                )}
              </GlassPanel>
            </Reanimated.View>
          ))}

          {channels.length === 0 && (
            <Reanimated.View entering={FadeInDown.delay(500).springify()}>
              <GlassPanel style={styles.emptyChannels}>
                <ChannelCatSvg width={80} height={80} />
                <AppText tone="secondary" style={styles.emptyText}>
                  {t('server.noChannels')}
                </AppText>
                {isOwner && (
                  <Button
                    variant="primary"
                    size="md"
                    icon={Plus}
                    onPress={() =>
                      router.push(`/(main)/servers/${serverSlug}/create-channel` as never)
                    }
                  >
                    {t('server.createChannel')}
                  </Button>
                )}
              </GlassPanel>
            </Reanimated.View>
          )}
        </View>
      </ScrollView>

      <Sheet
        visible={!!contextChannel}
        onClose={() => setContextChannel(null)}
        title={contextChannel?.name}
      >
        <MenuItem
          icon={UserPlus}
          title={t('channel.inviteMember', '邀请成员')}
          onPress={() => {
            const ch = contextChannel
            setContextChannel(null)
            if (ch) {
              router.push(
                `/(main)/servers/${serverSlug}/channel-members?channelId=${ch.id}&autoInvite=1` as never,
              )
            }
          }}
        />
        <MenuItem
          icon={Edit3}
          title={t('channel.editChannel', '编辑频道')}
          onPress={() => {
            if (contextChannel) {
              setEditingChannel(contextChannel)
              setEditChannelName(contextChannel.name)
            }
            setContextChannel(null)
          }}
        />
        <MenuItem
          icon={contextChannel?.isPrivate ? LockOpen : Lock}
          title={
            contextChannel?.isPrivate
              ? t('channel.setPublic', '设为公开')
              : t('channel.setPrivate', '设为私有')
          }
          onPress={() => {
            if (contextChannel) {
              updateChannelMutation.mutate({
                channelId: contextChannel.id,
                name: contextChannel.name,
                isPrivate: !contextChannel.isPrivate,
              })
            }
            setContextChannel(null)
          }}
        />
        <MenuItem
          icon={Copy}
          title={t('channel.copyChannelLink', '复制频道链接')}
          onPress={() => {
            if (contextChannel) {
              showToast(t('channel.linkCopied', '频道链接已复制'), 'success')
            }
            setContextChannel(null)
          }}
        />
        <MenuItem
          icon={Trash2}
          tone="danger"
          title={t('channel.deleteChannel', '删除频道')}
          onPress={() => {
            const ch = contextChannel
            setContextChannel(null)
            if (ch) {
              Alert.alert(
                t('channel.deleteChannel', '删除频道'),
                t('channel.deleteChannelConfirm', '确定要删除此频道吗？此操作不可撤销。'),
                [
                  { text: t('common.cancel', '取消'), style: 'cancel' },
                  {
                    text: t('common.delete', '删除'),
                    style: 'destructive',
                    onPress: () => deleteChannelMutation.mutate(ch.id),
                  },
                ],
              )
            }
          }}
        />
      </Sheet>

      <Dialog
        visible={!!editingChannel}
        onClose={() => setEditingChannel(null)}
        title={t('channel.editChannel', '编辑频道')}
        actions={
          <>
            <Button
              variant="glass"
              size="md"
              style={styles.editAction}
              onPress={() => setEditingChannel(null)}
            >
              {t('common.cancel', '取消')}
            </Button>
            <Button
              variant="primary"
              size="md"
              style={styles.editAction}
              onPress={() => {
                if (editingChannel && editChannelName.trim()) {
                  updateChannelMutation.mutate({
                    channelId: editingChannel.id,
                    name: editChannelName.trim(),
                  })
                }
              }}
            >
              {t('common.save', '保存')}
            </Button>
          </>
        }
      >
        <TextField
          value={editChannelName}
          onChangeText={setEditChannelName}
          placeholder={t('channel.channelName', '频道名称')}
          autoFocus
        />
      </Dialog>

      <Sheet
        visible={showSortModal}
        onClose={() => setShowSortModal(false)}
        title={t('sort.title', '排序方式')}
      >
        <View style={styles.sortOptionsContainer}>
          {[
            {
              value: 'position' as ChannelSortBy,
              label: t('sort.byPosition', '默认顺序'),
              icon: ArrowUpDown,
            },
            {
              value: 'lastMessageAt' as ChannelSortBy,
              label: t('sort.byLastMessage', '最新消息'),
              icon: MessageSquare,
            },
            {
              value: 'lastAccessedAt' as ChannelSortBy,
              label: t('sort.byLastAccessed', '访问时间'),
              icon: Clock,
            },
            {
              value: 'createdAt' as ChannelSortBy,
              label: t('sort.byCreatedAt', '创建时间'),
              icon: Calendar,
            },
            {
              value: 'updatedAt' as ChannelSortBy,
              label: t('sort.byUpdatedAt', '更新时间'),
              icon: Clock,
            },
          ].map((option) => {
            const isSelected = sortBy === option.value
            const DirectionIcon = sortDirection === 'asc' ? ArrowUp : ArrowDown
            return (
              <MenuItem
                key={option.value}
                icon={option.icon}
                title={option.label}
                tone={isSelected ? 'primary' : 'muted'}
                right={isSelected ? <DirectionIcon size={16} color={colors.primary} /> : undefined}
                onPress={() => {
                  if (isSelected) {
                    toggleSortDirection()
                  } else {
                    setSortBy(option.value)
                  }
                  setShowSortModal(false)
                }}
              />
            )
          })}
        </View>
        <Button variant="glass" size="md" onPress={() => setShowSortModal(false)}>
          {t('common.close', '关闭')}
        </Button>
      </Sheet>
    </BackgroundSurface>
  )
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  customHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    zIndex: 100,
  },
  headerBackBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 4,
  },
  headerServerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
    borderWidth: 2,
  },
  headerInitial: { fontSize: 16, fontWeight: '800' },
  headerTextCol: {
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
  },
  headerNameRow: {
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  headerServerName: {
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 20,
    flexShrink: 1,
  },
  headerChevron: {
    opacity: 0.55,
  },
  headerOnlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerOnlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  headerOnlineText: {
    fontSize: 11,
    fontWeight: '600',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 4,
  },
  headerIconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Channels Controls
  channelsControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  cuteSectionLabel: {
    fontSize: 22,
    fontWeight: '900',
  },
  channelsActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButtonWrap: {
    position: 'relative',
  },
  // Search
  channelSearchContainer: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  channelSearchWrap: {
    height: 48,
    borderRadius: 24,
  },

  // Channels List
  channelsList: {
    paddingHorizontal: spacing.md,
    gap: spacing.md,
  },
  categoryBubble: {
    padding: spacing.sm,
    paddingTop: spacing.md,
  },
  categoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  categoryHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  categoryName: {
    fontSize: 14,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  channelsContainer: {
    gap: spacing.sm,
  },

  // Empty State
  emptyChannels: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: spacing.md,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '700',
  },
  editAction: {
    flex: 1,
  },

  accessGateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  accessGateCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 28,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
  },
  accessGateIcon: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accessGateTitle: {
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
  },
  accessGateDesc: {
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
  },
  accessGateButton: {
    width: '100%',
    marginTop: spacing.sm,
  },
  sortOptionsContainer: {
    gap: spacing.sm,
  },
  sortBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
})
