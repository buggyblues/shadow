import type { Channel, ChannelSortBy } from '@shadowob/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Calendar,
  ChevronDown,
  ChevronLeft,
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
  Settings,
  Trash2,
  UserPlus,
  Volume2,
  X,
} from 'lucide-react-native'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Alert,
  Animated,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import Reanimated, { FadeInDown } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  AgentCatSvg,
  ChannelCatSvg,
  ShopCatSvg,
  WorkCatSvg,
} from '../../../../src/components/common/cat-svg'
import { DottedBackground } from '../../../../src/components/common/dotted-background'
import { LoadingScreen } from '../../../../src/components/common/loading-screen'
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function SquishyCard({
  children,
  onPress,
  onLongPress,
  style,
}: {
  children: React.ReactNode
  onPress?: () => void
  onLongPress?: () => void
  style?: object | object[]
}) {
  const scale = useRef(new Animated.Value(1)).current
  return (
    <Pressable
      onPressIn={() => Animated.spring(scale, { toValue: 0.95, useNativeDriver: true }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start()}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  )
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

  const { data: server, isLoading: isServerLoading } = useQuery({
    queryKey: ['server', serverSlug],
    queryFn: () => fetchApi<Server>(`/api/servers/${serverSlug}`),
    enabled: !!serverSlug,
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

  const channelIcon = (type: string, color: string, size = 18) => {
    switch (type) {
      case 'voice':
        return <Volume2 size={size} color={color} strokeWidth={2.5} />
      case 'announcement':
        return <Megaphone size={size} color={color} strokeWidth={2.5} />
      default:
        return <Hash size={size} color={color} strokeWidth={2.5} />
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

  if (isServerLoading || isLoading || !server) return <LoadingScreen />

  // Derived styling helpers
  const glassCardStyle = {
    backgroundColor: `${colors.surface}E6`, // 90% opacity
    borderColor: colors.border,
    borderWidth: 2,
    borderRadius: 36,
  }

  return (
    <DottedBackground>
      {/* Custom navigation header bar */}
      <View
        style={[styles.customHeader, { backgroundColor: colors.surface, paddingTop: insets.top }]}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          style={({ pressed }) => [styles.headerBackBtn, pressed && { opacity: 0.5 }]}
        >
          <ChevronLeft size={26} color={colors.text} />
        </Pressable>

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
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800' }}>
                {server?.name?.[0] ?? '?'}
              </Text>
            </View>
          )}
          <View style={styles.headerTextCol}>
            <Text style={[styles.headerServerName, { color: colors.text }]} numberOfLines={1}>
              {server?.name ?? '...'} ›
            </Text>
            <View style={styles.headerOnlineRow}>
              <View style={[styles.headerOnlineDot, { backgroundColor: '#34D399' }]} />
              <Text style={[styles.headerOnlineText, { color: colors.textMuted }]}>
                {onlineCount} {t('server.membersOnline')}
              </Text>
            </View>
          </View>
        </Pressable>

        <View style={styles.headerRight}>
          {isOwner && (
            <Pressable
              onPress={() => router.push(`/(main)/servers/${serverSlug}/server-settings` as never)}
              hitSlop={8}
              style={({ pressed }) => [styles.headerIconBtn, pressed && { opacity: 0.5 }]}
            >
              <Settings size={22} color={colors.text} />
            </Pressable>
          )}
        </View>
      </View>

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
        {/* ── Horizontal 1x4 Actions ────────────────────── */}
        <View style={styles.actionRow}>
          {/* Workspace */}
          <Reanimated.View entering={FadeInDown.delay(100).springify()}>
            <SquishyCard
              style={styles.actionItem}
              onPress={() => router.push(`/(main)/servers/${serverSlug}/workspace` as never)}
            >
              <LinearGradient colors={['#3B82F6', '#60A5FA']} style={styles.actionBubbleGlow}>
                <WorkCatSvg width={40} height={40} />
              </LinearGradient>
              <Text style={[styles.actionLabel, { color: colors.textSecondary }]}>
                {t('server.workspace')}
              </Text>
            </SquishyCard>
          </Reanimated.View>

          {/* Shop */}
          <Reanimated.View entering={FadeInDown.delay(200).springify()}>
            <SquishyCard
              style={styles.actionItem}
              onPress={() => router.push(`/(main)/servers/${serverSlug}/shop` as never)}
            >
              <LinearGradient colors={['#F59E0B', '#FBBF24']} style={styles.actionBubbleGlow}>
                <ShopCatSvg width={40} height={40} />
              </LinearGradient>
              <Text style={[styles.actionLabel, { color: colors.textSecondary }]}>
                {t('server.shop')}
              </Text>
            </SquishyCard>
          </Reanimated.View>

          {/* Apps */}
          <Reanimated.View entering={FadeInDown.delay(300).springify()}>
            <SquishyCard
              style={styles.actionItem}
              onPress={() => router.push(`/(main)/servers/${serverSlug}/apps` as never)}
            >
              <LinearGradient colors={['#10B981', '#34D399']} style={styles.actionBubbleGlow}>
                <ChannelCatSvg width={40} height={40} style={{ transform: [{ scale: 1.1 }] }} />
              </LinearGradient>
              <Text style={[styles.actionLabel, { color: colors.textSecondary }]}>
                {t('server.apps')}
              </Text>
            </SquishyCard>
          </Reanimated.View>

          {/* Members */}
          <Reanimated.View entering={FadeInDown.delay(400).springify()}>
            <SquishyCard
              style={styles.actionItem}
              onPress={() => router.push(`/(main)/servers/${serverSlug}/members` as never)}
            >
              <LinearGradient colors={['#EF4444', '#F87171']} style={styles.actionBubbleGlow}>
                <AgentCatSvg width={40} height={40} />
              </LinearGradient>
              <Text style={[styles.actionLabel, { color: colors.textSecondary }]}>
                {t('server.members')}
              </Text>
            </SquishyCard>
          </Reanimated.View>
        </View>

        {/* ── Channels Header ─────────────────────────── */}
        <View style={styles.channelsControls}>
          <Text style={[styles.cuteSectionLabel, { color: colors.text }]}>
            {t('server.channels')}
          </Text>
          <View style={styles.channelsActions}>
            {/* Sort Button */}
            <SquishyCard onPress={() => setShowSortModal(true)}>
              <View
                style={[
                  styles.actionBubble,
                  hasCustomSort
                    ? { backgroundColor: colors.primary, borderColor: colors.primary }
                    : {
                        backgroundColor: glassCardStyle.backgroundColor,
                        borderColor: colors.border,
                      },
                ]}
              >
                <ArrowUpDown
                  size={18}
                  color={hasCustomSort ? '#fff' : colors.text}
                  strokeWidth={2.5}
                />
                {hasCustomSort && <View style={[styles.sortBadge, { backgroundColor: '#fff' }]} />}
              </View>
            </SquishyCard>
            <SquishyCard onPress={() => setShowSearch(!showSearch)}>
              <View
                style={[
                  styles.actionBubble,
                  { backgroundColor: glassCardStyle.backgroundColor, borderColor: colors.border },
                ]}
              >
                <Search size={18} color={colors.text} strokeWidth={2.5} />
              </View>
            </SquishyCard>
            {isOwner && (
              <SquishyCard
                onPress={() => router.push(`/(main)/servers/${serverSlug}/create-channel` as never)}
              >
                <View
                  style={[
                    styles.actionBubble,
                    { backgroundColor: '#00f3ff', borderColor: '#00c3cc' },
                  ]}
                >
                  <Plus size={18} color="#1a1a1c" strokeWidth={3} />
                </View>
              </SquishyCard>
            )}
          </View>
        </View>

        {showSearch && (
          <View
            style={[
              styles.channelSearchWrap,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Search size={16} color={colors.textMuted} strokeWidth={2.5} />
            <TextInput
              style={[styles.channelSearchInput, { color: colors.text }]}
              value={channelSearch}
              onChangeText={setChannelSearch}
              placeholder={t('server.searchChannels')}
              placeholderTextColor={colors.textMuted}
              autoFocus
            />
            {channelSearch.length > 0 && (
              <Pressable onPress={() => setChannelSearch('')} hitSlop={12}>
                <X size={16} color={colors.textMuted} strokeWidth={2.5} />
              </Pressable>
            )}
          </View>
        )}

        {/* ── Channel Bubbles ─────────────────────────── */}
        <View style={styles.channelsList}>
          {filteredGroups.map((group, groupIndex) => (
            <Reanimated.View
              key={group.category?.id ?? 'uncategorized'}
              entering={FadeInDown.delay(500 + groupIndex * 100).springify()}
              style={[styles.categoryBubble, glassCardStyle]}
            >
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
                            rotate: collapsedCategories.has(group.category.id) ? '-90deg' : '0deg',
                          },
                        ],
                      }}
                    />
                    <Text style={[styles.categoryName, { color: colors.text }]}>
                      {group.category.name}
                    </Text>
                  </View>
                  <View style={[styles.countBadge, { backgroundColor: colors.inputBackground }]}>
                    <Text style={[styles.countText, { color: colors.textMuted }]}>
                      {group.channels.length}
                    </Text>
                  </View>
                </Pressable>
              )}
              {!(group.category && collapsedCategories.has(group.category.id)) && (
                <View style={styles.channelsContainer}>
                  {group.channels.map((channel) => (
                    <SquishyCard
                      key={channel.id}
                      style={[styles.channelPill, { backgroundColor: colors.inputBackground }]}
                      onPress={() => {
                        updateLastAccessed(channel.id)
                        if (server) setLastChannel(server.id, channel.id)
                        router.push(`/(main)/servers/${serverSlug}/channels/${channel.id}` as never)
                      }}
                      onLongPress={() => setContextChannel(channel)}
                    >
                      <View style={[styles.channelIconBubble, { backgroundColor: colors.surface }]}>
                        {channelIcon(channel.type, colors.textSecondary)}
                      </View>
                      <Text style={[styles.channelName, { color: colors.text }]}>
                        {channel.name}
                      </Text>
                      {channel.isPrivate && (
                        <Lock size={14} color={colors.textMuted} strokeWidth={2.5} />
                      )}
                    </SquishyCard>
                  ))}
                </View>
              )}
            </Reanimated.View>
          ))}

          {channels.length === 0 && (
            <Reanimated.View
              entering={FadeInDown.delay(500).springify()}
              style={[styles.emptyChannels, glassCardStyle]}
            >
              <ChannelCatSvg width={80} height={80} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                {t('server.noChannels')}
              </Text>
              {isOwner && (
                <SquishyCard
                  onPress={() =>
                    router.push(`/(main)/servers/${serverSlug}/create-channel` as never)
                  }
                >
                  <LinearGradient colors={['#00f3ff', '#00a2ff']} style={styles.cuteCreateBtn}>
                    <Plus size={18} color="#1a1a1c" strokeWidth={3} />
                    <Text style={styles.cuteCreateBtnText}>{t('server.createChannel')}</Text>
                  </LinearGradient>
                </SquishyCard>
              )}
            </Reanimated.View>
          )}
        </View>
      </ScrollView>

      {/* Channel context menu */}
      <Modal
        visible={!!contextChannel}
        transparent
        animationType="fade"
        onRequestClose={() => setContextChannel(null)}
      >
        <Pressable style={styles.ctxOverlay} onPress={() => setContextChannel(null)}>
          <Reanimated.View
            entering={FadeInDown.duration(200)}
            style={[styles.ctxSheet, { backgroundColor: colors.surface }]}
          >
            {/* Invite member */}
            <Pressable
              style={({ pressed }) => [styles.ctxItem, pressed && { opacity: 0.6 }]}
              onPress={() => {
                const ch = contextChannel
                setContextChannel(null)
                if (ch) {
                  router.push(
                    `/(main)/servers/${serverSlug}/channel-members?channelId=${ch.id}&autoInvite=1` as never,
                  )
                }
              }}
            >
              <UserPlus size={18} color={colors.textSecondary} />
              <Text style={[styles.ctxLabel, { color: colors.text }]}>
                {t('channel.inviteMember', '邀请成员')}
              </Text>
            </Pressable>

            <View style={[styles.ctxDivider, { backgroundColor: colors.border }]} />

            {/* Edit channel name */}
            <Pressable
              style={({ pressed }) => [styles.ctxItem, pressed && { opacity: 0.6 }]}
              onPress={() => {
                if (contextChannel) {
                  setEditingChannel(contextChannel)
                  setEditChannelName(contextChannel.name)
                }
                setContextChannel(null)
              }}
            >
              <Edit3 size={18} color={colors.textSecondary} />
              <Text style={[styles.ctxLabel, { color: colors.text }]}>
                {t('channel.editChannel', '编辑频道')}
              </Text>
            </Pressable>

            {/* Toggle private */}
            <Pressable
              style={({ pressed }) => [styles.ctxItem, pressed && { opacity: 0.6 }]}
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
            >
              {contextChannel?.isPrivate ? (
                <LockOpen size={18} color={colors.textSecondary} />
              ) : (
                <Lock size={18} color={colors.textSecondary} />
              )}
              <Text style={[styles.ctxLabel, { color: colors.text }]}>
                {contextChannel?.isPrivate
                  ? t('channel.setPublic', '设为公开')
                  : t('channel.setPrivate', '设为私有')}
              </Text>
            </Pressable>

            {/* Copy channel link */}
            <Pressable
              style={({ pressed }) => [styles.ctxItem, pressed && { opacity: 0.6 }]}
              onPress={() => {
                // Copy not available natively without Clipboard, just show toast
                if (contextChannel) {
                  showToast(t('channel.linkCopied', '频道链接已复制'), 'success')
                }
                setContextChannel(null)
              }}
            >
              <Copy size={18} color={colors.textSecondary} />
              <Text style={[styles.ctxLabel, { color: colors.text }]}>
                {t('channel.copyChannelLink', '复制频道链接')}
              </Text>
            </Pressable>

            <View style={[styles.ctxDivider, { backgroundColor: colors.border }]} />

            {/* Delete channel */}
            <Pressable
              style={({ pressed }) => [styles.ctxItem, pressed && { opacity: 0.6 }]}
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
            >
              <Trash2 size={18} color="#ef4444" />
              <Text style={[styles.ctxLabel, { color: '#ef4444' }]}>
                {t('channel.deleteChannel', '删除频道')}
              </Text>
            </Pressable>
          </Reanimated.View>
        </Pressable>
      </Modal>

      {/* Edit channel name modal */}
      <Modal
        visible={!!editingChannel}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingChannel(null)}
      >
        <Pressable
          style={[styles.ctxOverlay, { justifyContent: 'center' }]}
          onPress={() => setEditingChannel(null)}
        >
          <Pressable
            style={[styles.editSheet, { backgroundColor: colors.surface }]}
            onPress={() => {}}
          >
            <Text style={[styles.editTitle, { color: colors.text }]}>
              {t('channel.editChannel', '编辑频道')}
            </Text>
            <TextInput
              style={[
                styles.editInput,
                {
                  backgroundColor: colors.inputBackground,
                  color: colors.text,
                  borderColor: colors.border,
                },
              ]}
              value={editChannelName}
              onChangeText={setEditChannelName}
              placeholder={t('channel.channelName', '频道名称')}
              placeholderTextColor={colors.textMuted}
              autoFocus
            />
            <View style={styles.editBtnRow}>
              <Pressable
                style={[styles.editBtn, { backgroundColor: colors.inputBackground }]}
                onPress={() => setEditingChannel(null)}
              >
                <Text style={{ color: colors.textSecondary }}>{t('common.cancel', '取消')}</Text>
              </Pressable>
              <Pressable
                style={[styles.editBtn, { backgroundColor: colors.primary }]}
                onPress={() => {
                  if (editingChannel && editChannelName.trim()) {
                    updateChannelMutation.mutate({
                      channelId: editingChannel.id,
                      name: editChannelName.trim(),
                    })
                  }
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>{t('common.save', '保存')}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Sort Modal - Bottom Sheet Style */}
      <Modal
        visible={showSortModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSortModal(false)}
      >
        <TouchableOpacity
          style={[styles.sortOverlay, { backgroundColor: colors.overlay }]}
          activeOpacity={1}
          onPress={() => setShowSortModal(false)}
        >
          <View style={[styles.sortSheet, { backgroundColor: colors.surface }]}>
            {/* Handle bar */}
            <View style={styles.sortHandleBar}>
              <View style={[styles.sortHandle, { backgroundColor: colors.textMuted }]} />
            </View>
            <Text style={[styles.sortTitle, { color: colors.text }]}>
              {t('sort.title', '排序方式')}
            </Text>
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
                const Icon = option.icon
                const isSelected = sortBy === option.value
                const DirectionIcon = sortDirection === 'asc' ? ArrowUp : ArrowDown
                return (
                  <Pressable
                    key={option.value}
                    style={[
                      styles.sortOption,
                      isSelected && { backgroundColor: `${colors.primary}15` },
                    ]}
                    onPress={() => {
                      if (isSelected) {
                        toggleSortDirection()
                      } else {
                        setSortBy(option.value)
                      }
                      setShowSortModal(false)
                    }}
                  >
                    <View
                      style={[
                        styles.sortOptionIcon,
                        {
                          backgroundColor: isSelected
                            ? `${colors.primary}25`
                            : colors.inputBackground,
                        },
                      ]}
                    >
                      <Icon size={20} color={isSelected ? colors.primary : colors.textSecondary} />
                    </View>
                    <Text
                      style={[
                        styles.sortOptionText,
                        { color: isSelected ? colors.primary : colors.text },
                      ]}
                    >
                      {option.label}
                    </Text>
                    {isSelected && (
                      <View style={styles.sortCheck}>
                        <DirectionIcon size={16} color={colors.primary} />
                      </View>
                    )}
                  </Pressable>
                )
              })}
            </View>
            <Pressable
              style={[styles.sortCloseBtn, { backgroundColor: colors.inputBackground }]}
              onPress={() => setShowSortModal(false)}
            >
              <Text style={[styles.sortCloseText, { color: colors.text }]}>
                {t('common.close', '关闭')}
              </Text>
            </Pressable>
          </View>
        </TouchableOpacity>
      </Modal>
    </DottedBackground>
  )
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  customHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
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
    borderColor: 'rgba(0,0,0,0.1)',
  },
  headerTextCol: {
    justifyContent: 'center',
  },
  headerServerName: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 2,
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

  // Horizontal 1x4 Actions
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.xl,
  },
  actionItem: {
    alignItems: 'center',
    gap: 8,
  },
  actionBubbleGlow: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: '800',
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
  actionBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },

  // Search
  channelSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    gap: spacing.sm,
  },
  channelSearchInput: { flex: 1, fontSize: 16, fontWeight: '600' },

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
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  countText: {
    fontSize: 12,
    fontWeight: '800',
  },
  channelsContainer: {
    gap: spacing.sm,
  },
  channelPill: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 6,
    paddingRight: 16,
    borderRadius: 24,
    gap: 12,
  },
  channelIconBubble: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  channelName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
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
  cuteCreateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
  },
  cuteCreateBtnText: {
    color: '#1a1a1c',
    fontSize: 16,
    fontWeight: '900',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end', // slide up from bottom feel
  },
  modalContent: {
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    borderWidth: 2,
    borderBottomWidth: 0,
    padding: spacing.xl,
    paddingBottom: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  modalTitle: { fontSize: 24, fontWeight: '900' },
  cuteLabel: {
    fontSize: 14,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
    letterSpacing: 0.5,
  },
  cuteInput: {
    height: 56,
    borderRadius: 16,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    fontWeight: '600',
    borderWidth: 2,
  },
  typeRow: { flexDirection: 'row', gap: spacing.sm },
  cuteTypeBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: 20,
    borderWidth: 2,
    gap: 8,
  },
  typeBtnText: { fontSize: 14, fontWeight: '800' },
  cuteCatChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 2,
  },
  catChipText: { fontSize: 14, fontWeight: '800' },
  cuteModalBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 24,
  },
  // Context menu
  ctxOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  ctxSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: spacing.md,
    paddingBottom: 34,
    paddingHorizontal: spacing.md,
  },
  ctxItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.sm,
  },
  ctxLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
  ctxDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 2,
  },

  // Edit channel modal
  editSheet: {
    marginHorizontal: spacing.lg,
    borderRadius: 16,
    padding: spacing.lg,
    gap: spacing.md,
  },
  editTitle: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  editInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
  editBtnRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  editBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 10,
  },

  // Sort modal - Bottom Sheet
  sortOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sortSheet: {
    width: '100%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: spacing.lg,
    paddingBottom: 40,
    paddingTop: spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  sortHandleBar: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  sortHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  sortTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  sortOptionsContainer: {
    gap: spacing.sm,
  },
  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: 16,
  },
  sortOptionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortOptionText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
  sortCheck: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortCloseBtn: {
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: 16,
    alignItems: 'center',
  },
  sortCloseText: {
    fontSize: 16,
    fontWeight: '600',
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
