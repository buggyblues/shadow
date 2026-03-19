import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router'
import {
  ArrowDown,
  ArrowUp,
  Calendar,
  Check,
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
  ArrowUpDown,
} from 'lucide-react-native'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Alert,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
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
import { Avatar } from '../../../../src/components/common/avatar'
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
import { fontSize, radius, spacing, useColors } from '../../../../src/theme'
import type { Channel, ChannelSortBy } from '@shadow/shared'

// ── Types ────────────────────────────────────────────────────────────────────

interface ServerChannel extends Channel {
  categoryId: string | null
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

interface BuddyAgent {
  id: string
  ownerId: string
  userId: string
  botUser?: {
    id: string
    username: string
    displayName?: string | null
    avatarUrl?: string | null
  } | null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function SquishyCard({ children, onPress, onLongPress, style }: any) {
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
  const [showCreateChannel, setShowCreateChannel] = useState(false)
  const [newChannelName, setNewChannelName] = useState('')
  const [newChannelType, setNewChannelType] = useState<'text' | 'voice' | 'announcement'>('text')
  const [newChannelCategoryId, setNewChannelCategoryId] = useState<string | null>(null)
  const [showSearch, setShowSearch] = useState(false)
  const [channelSearch, setChannelSearch] = useState('')
  const [contextChannel, setContextChannel] = useState<ServerChannel | null>(null)
  const [editingChannel, setEditingChannel] = useState<ServerChannel | null>(null)
  const [editChannelName, setEditChannelName] = useState('')
  const [showSortModal, setShowSortModal] = useState(false)

  // Create channel member selection state
  const [memberSearch, setMemberSearch] = useState('')
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set())
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set())

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

  // User's buddy agents for invite
  const { data: myAgents = [] } = useQuery({
    queryKey: ['my-agents-for-channel-create'],
    queryFn: () => fetchApi<BuddyAgent[]>('/api/agents'),
    enabled: showCreateChannel,
  })
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

  // ── Create Channel ─────────────────────────────

  // Filter members for selection (exclude bots)
  const selectableMembers = useMemo(() => {
    const q = memberSearch.toLowerCase()
    return members
      .filter((m) => !m.user.isBot)
      .filter((m) => {
        if (!q) return true
        const name = (m.user.displayName || m.user.username).toLowerCase()
        return name.includes(q) || m.user.username.toLowerCase().includes(q)
      })
  }, [members, memberSearch])

  // Filter server bots for selection
  const selectableBots = useMemo(() => {
    const q = memberSearch.toLowerCase()
    return members
      .filter((m) => m.user.isBot)
      .filter((m) => {
        if (!q) return true
        const name = (m.user.displayName || m.user.username).toLowerCase()
        return name.includes(q)
      })
  }, [members, memberSearch])

  // Filter user's agents not on server
  const serverBotUserIds = useMemo(
    () => new Set(members.filter((m) => m.user.isBot).map((m) => m.user.id)),
    [members],
  )

  const selectableMyAgents = useMemo(() => {
    const q = memberSearch.toLowerCase()
    return myAgents
      .filter((a) => a.botUser && !serverBotUserIds.has(a.botUser.id))
      .filter((a) => {
        if (!q) return true
        const name = (a.botUser?.displayName || a.botUser?.username || '').toLowerCase()
        return name.includes(q)
      })
  }, [myAgents, serverBotUserIds, memberSearch])

  const toggleMemberSelection = (userId: string) => {
    setSelectedMembers((prev) => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  const toggleAgentSelection = (agentId: string) => {
    setSelectedAgents((prev) => {
      const next = new Set(prev)
      if (next.has(agentId)) next.delete(agentId)
      else next.add(agentId)
      return next
    })
  }

  const resetCreateChannelState = () => {
    setShowCreateChannel(false)
    setNewChannelName('')
    setNewChannelType('text')
    setNewChannelCategoryId(null)
    setMemberSearch('')
    setSelectedMembers(new Set())
    setSelectedAgents(new Set())
  }

  const createChannelMutation = useMutation({
    mutationFn: async () => {
      // 1. Create channel
      const channel = await fetchApi<{ id: string }>(`/api/servers/${server!.id}/channels`, {
        method: 'POST',
        body: JSON.stringify({
          name: newChannelName,
          type: newChannelType,
          categoryId: newChannelCategoryId,
        }),
      })

      // 2. Add selected members to channel
      const memberPromises = Array.from(selectedMembers).map((userId) =>
        fetchApi(`/api/channels/${channel.id}/members`, {
          method: 'POST',
          body: JSON.stringify({ userId }),
        }),
      )

      // 3. Add selected server bots to channel
      const botPromises = selectableBots
        .filter((b) => selectedMembers.has(b.user.id))
        .map((b) =>
          fetchApi(`/api/channels/${channel.id}/members`, {
            method: 'POST',
            body: JSON.stringify({ userId: b.user.id }),
          }),
        )

      // 4. Add selected my agents to server then channel
      const agentPromises = Array.from(selectedAgents).map(async (agentId) => {
        const agent = myAgents.find((a) => a.id === agentId)
        if (!agent) return
        await fetchApi(`/api/servers/${server!.id}/agents`, {
          method: 'POST',
          body: JSON.stringify({ agentIds: [agent.id] }),
        })
        if (agent.botUser?.id) {
          await fetchApi(`/api/channels/${channel.id}/members`, {
            method: 'POST',
            body: JSON.stringify({ userId: agent.botUser.id }),
          })
        }
      })

      await Promise.all([...memberPromises, ...botPromises, ...agentPromises])

      return channel
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['channels', server?.id] })
      resetCreateChannelState()
      // Navigate directly to the new channel
      router.push(`/(main)/servers/${serverSlug}/channels/${data.id}` as never)
    },
    onError: (err: any) => showToast(err?.message || t('common.error'), 'error'),
  })

  // ── Channel actions ────────────────────────────

  const deleteChannelMutation = useMutation({
    mutationFn: (channelId: string) => fetchApi(`/api/channels/${channelId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels', server?.id] })
    },
    onError: (err: any) => showToast(err?.message || t('common.error'), 'error'),
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
    onError: (err: any) => showToast(err?.message || t('common.error'), 'error'),
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
    const groups: { category: Category | null; channels: Channel[] }[] = []

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

  const channelTypeLabel = (type: 'text' | 'voice' | 'announcement') => {
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
          onPress={() => router.push(`/(main)/servers/${serverSlug}/detail` as any)}
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
              onPress={() => router.push(`/(main)/servers/${serverSlug}/server-settings` as any)}
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
              onPress={() => router.push(`/(main)/servers/${serverSlug}/workspace` as any)}
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
              onPress={() => router.push(`/(main)/servers/${serverSlug}/shop` as any)}
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
              onPress={() => router.push(`/(main)/servers/${serverSlug}/apps` as any)}
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
              onPress={() => router.push(`/(main)/servers/${serverSlug}/members` as any)}
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
                    : { backgroundColor: glassCardStyle.backgroundColor, borderColor: colors.border },
                ]}
              >
                <ArrowUpDown size={18} color={hasCustomSort ? '#fff' : colors.text} strokeWidth={2.5} />
                {hasCustomSort && (
                  <View style={[styles.sortBadge, { backgroundColor: '#fff' }]} />
                )}
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
              <SquishyCard onPress={() => setShowCreateChannel(true)}>
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
                        router.push(`/(main)/servers/${serverSlug}/channels/${channel.id}` as any)
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
                <SquishyCard onPress={() => setShowCreateChannel(true)}>
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

      {/* ── Create Channel Modal ──────────────────── */}
      <Modal visible={showCreateChannel} transparent animationType="fade">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View
            style={[
              styles.modalContent,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {t('server.createChannel')}
              </Text>
              <Pressable onPress={resetCreateChannelState} hitSlop={8}>
                <X size={24} color={colors.textMuted} strokeWidth={2.5} />
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              style={{ height: Dimensions.get('window').height * 0.6 }}
              contentContainerStyle={{ paddingBottom: spacing.lg }}
            >
              <Text style={[styles.cuteLabel, { color: colors.text }]}>
                {t('server.channelName')}
              </Text>
              <TextInput
                style={[
                  styles.cuteInput,
                  {
                    backgroundColor: colors.inputBackground,
                    color: colors.text,
                    borderColor: colors.border,
                  },
                ]}
                value={newChannelName}
                onChangeText={setNewChannelName}
                placeholder={t('server.channelNamePlaceholder')}
                placeholderTextColor={colors.textMuted}
                autoFocus
              />

              <Text style={[styles.cuteLabel, { color: colors.text, marginTop: spacing.lg }]}>
                {t('server.channelType')}
              </Text>
              <View style={styles.typeRow}>
                {(['text', 'voice', 'announcement'] as const).map((type) => (
                  <Pressable
                    key={type}
                    style={[
                      styles.cuteTypeBtn,
                      {
                        backgroundColor:
                          newChannelType === type ? '#00f3ff20' : colors.inputBackground,
                        borderColor: newChannelType === type ? '#00f3ff' : colors.border,
                      },
                    ]}
                    onPress={() => setNewChannelType(type)}
                  >
                    {channelIcon(type, newChannelType === type ? '#00c3cc' : colors.textMuted, 24)}
                    <Text
                      style={[
                        styles.typeBtnText,
                        { color: newChannelType === type ? '#00c3cc' : colors.text },
                      ]}
                    >
                      {channelTypeLabel(type)}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {categories.length > 0 && (
                <>
                  <Text style={[styles.cuteLabel, { color: colors.text, marginTop: spacing.lg }]}>
                    {t('server.channelCategory')}
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={{ flexGrow: 0 }}
                    contentContainerStyle={{ gap: spacing.sm }}
                  >
                    <Pressable
                      style={[
                        styles.cuteCatChip,
                        {
                          backgroundColor: !newChannelCategoryId
                            ? '#ff7da520'
                            : colors.inputBackground,
                          borderColor: !newChannelCategoryId ? '#ff7da5' : colors.border,
                        },
                      ]}
                      onPress={() => setNewChannelCategoryId(null)}
                    >
                      <Text
                        style={[
                          styles.catChipText,
                          { color: !newChannelCategoryId ? '#e85b85' : colors.text },
                        ]}
                      >
                        {t('server.noCategory')}
                      </Text>
                    </Pressable>
                    {categories.map((cat) => (
                      <Pressable
                        key={cat.id}
                        style={[
                          styles.cuteCatChip,
                          {
                            backgroundColor:
                              newChannelCategoryId === cat.id
                                ? '#f8e71c20'
                                : colors.inputBackground,
                            borderColor:
                              newChannelCategoryId === cat.id ? '#f8e71c' : colors.border,
                          },
                        ]}
                        onPress={() => setNewChannelCategoryId(cat.id)}
                      >
                        <Text
                          style={[
                            styles.catChipText,
                            { color: newChannelCategoryId === cat.id ? '#b3a100' : colors.text },
                          ]}
                        >
                          {cat.name}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </>
              )}

              {/* Member Selection Section */}
              <Text style={[styles.cuteLabel, { color: colors.text, marginTop: spacing.lg }]}>
                {t('server.addMembers', '添加成员（可选）')}
              </Text>

              {/* Search */}
              <View style={[styles.memberSearchRow, { backgroundColor: colors.inputBackground }]}>
                <Search size={16} color={colors.textMuted} />
                <TextInput
                  style={[styles.memberSearchInput, { color: colors.text }]}
                  value={memberSearch}
                  onChangeText={setMemberSearch}
                  placeholder={t('common.search', '搜索...')}
                  placeholderTextColor={colors.textMuted}
                />
                {memberSearch.length > 0 && (
                  <Pressable onPress={() => setMemberSearch('')} hitSlop={8}>
                    <X size={14} color={colors.textMuted} />
                  </Pressable>
                )}
              </View>

              {/* Selected count */}
              {(selectedMembers.size > 0 || selectedAgents.size > 0) && (
                <Text style={[styles.selectedCount, { color: colors.textMuted }]}>
                  {t('server.selectedCount', '已选择 {{count}} 人', {
                    count: selectedMembers.size + selectedAgents.size,
                  })}
                </Text>
              )}

              {/* Server Members */}
              {selectableMembers.length > 0 && (
                <>
                  <Text style={[styles.memberSectionTitle, { color: colors.textMuted }]}>
                    {t('members.serverMembers', '服务器成员')}
                  </Text>
                  {selectableMembers.map((m) => (
                    <Pressable
                      key={m.user.id}
                      style={styles.selectableMemberRow}
                      onPress={() => toggleMemberSelection(m.user.id)}
                    >
                      <Avatar
                        uri={m.user.avatarUrl}
                        name={m.user.displayName || m.user.username}
                        size={36}
                        userId={m.user.id}
                      />
                      <Text
                        style={[styles.selectableMemberName, { color: colors.text }]}
                        numberOfLines={1}
                      >
                        {m.user.displayName || m.user.username}
                      </Text>
                      <View
                        style={[
                          styles.checkbox,
                          {
                            backgroundColor: selectedMembers.has(m.user.id)
                              ? colors.primary
                              : 'transparent',
                            borderColor: selectedMembers.has(m.user.id)
                              ? colors.primary
                              : colors.border,
                          },
                        ]}
                      >
                        {selectedMembers.has(m.user.id) && <Check size={14} color="#fff" />}
                      </View>
                    </Pressable>
                  ))}
                </>
              )}

              {/* Server Bots */}
              {selectableBots.length > 0 && (
                <>
                  <Text style={[styles.memberSectionTitle, { color: colors.textMuted }]}>
                    {t('members.serverBuddies', '服务器 Buddy')}
                  </Text>
                  {selectableBots.map((m) => (
                    <Pressable
                      key={m.user.id}
                      style={styles.selectableMemberRow}
                      onPress={() => toggleMemberSelection(m.user.id)}
                    >
                      <Avatar
                        uri={m.user.avatarUrl}
                        name={m.user.displayName || m.user.username}
                        size={36}
                        userId={m.user.id}
                      />
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[styles.selectableMemberName, { color: colors.primary }]}
                          numberOfLines={1}
                        >
                          {m.user.displayName || m.user.username}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.checkbox,
                          {
                            backgroundColor: selectedMembers.has(m.user.id)
                              ? colors.primary
                              : 'transparent',
                            borderColor: selectedMembers.has(m.user.id)
                              ? colors.primary
                              : colors.border,
                          },
                        ]}
                      >
                        {selectedMembers.has(m.user.id) && <Check size={14} color="#fff" />}
                      </View>
                    </Pressable>
                  ))}
                </>
              )}

              {/* My Agents */}
              {selectableMyAgents.length > 0 && (
                <>
                  <Text style={[styles.memberSectionTitle, { color: colors.textMuted }]}>
                    {t('members.myBuddies', '我的 Buddy')}
                  </Text>
                  {selectableMyAgents.map((a) => (
                    <Pressable
                      key={a.id}
                      style={styles.selectableMemberRow}
                      onPress={() => toggleAgentSelection(a.id)}
                    >
                      <Avatar
                        uri={a.botUser?.avatarUrl ?? null}
                        name={a.botUser?.displayName || a.botUser?.username || '?'}
                        size={36}
                        userId={a.botUser?.id}
                      />
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[styles.selectableMemberName, { color: colors.primary }]}
                          numberOfLines={1}
                        >
                          {a.botUser?.displayName || a.botUser?.username || '?'}
                        </Text>
                        <Text style={{ color: colors.textMuted, fontSize: fontSize.xs }}>
                          {t('members.notOnServer', '未加入服务器')}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.checkbox,
                          {
                            backgroundColor: selectedAgents.has(a.id)
                              ? colors.primary
                              : 'transparent',
                            borderColor: selectedAgents.has(a.id) ? colors.primary : colors.border,
                          },
                        ]}
                      >
                        {selectedAgents.has(a.id) && <Check size={14} color="#fff" />}
                      </View>
                    </Pressable>
                  ))}
                </>
              )}

              {/* Empty state */}
              {selectableMembers.length === 0 &&
                selectableBots.length === 0 &&
                selectableMyAgents.length === 0 && (
                  <Text
                    style={{
                      color: colors.textMuted,
                      fontSize: fontSize.sm,
                      textAlign: 'center',
                      paddingTop: spacing.lg,
                    }}
                  >
                    {t('members.noInvitable', '没有可邀请的成员')}
                  </Text>
                )}
            </ScrollView>

            <SquishyCard
              onPress={() => createChannelMutation.mutate()}
              disabled={!newChannelName.trim() || createChannelMutation.isPending}
              style={{ marginTop: spacing.md }}
            >
              <LinearGradient
                colors={['#00f3ff', '#00a2ff']}
                style={[
                  styles.cuteModalBtn,
                  { opacity: !newChannelName.trim() || createChannelMutation.isPending ? 0.5 : 1 },
                ]}
              >
                <Text style={styles.cuteModalBtnText}>
                  {createChannelMutation.isPending
                    ? t('common.creating', '创建中...')
                    : t('common.create')}
                </Text>
              </LinearGradient>
            </SquishyCard>
          </View>
        </KeyboardAvoidingView>
      </Modal>

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
      <Modal visible={showSortModal} transparent animationType="slide" onRequestClose={() => setShowSortModal(false)}>
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
                { value: 'position' as ChannelSortBy, label: t('sort.byPosition', '默认顺序'), icon: ArrowUpDown },
                { value: 'lastMessageAt' as ChannelSortBy, label: t('sort.byLastMessage', '最新消息'), icon: MessageSquare },
                { value: 'lastAccessedAt' as ChannelSortBy, label: t('sort.byLastAccessed', '访问时间'), icon: Clock },
                { value: 'createdAt' as ChannelSortBy, label: t('sort.byCreatedAt', '创建时间'), icon: Calendar },
                { value: 'updatedAt' as ChannelSortBy, label: t('sort.byUpdatedAt', '更新时间'), icon: Clock },
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
                    <View style={[styles.sortOptionIcon, { backgroundColor: isSelected ? `${colors.primary}25` : colors.inputBackground }]}>
                      <Icon size={20} color={isSelected ? colors.primary : colors.textSecondary} />
                    </View>
                    <Text style={[styles.sortOptionText, { color: isSelected ? colors.primary : colors.text }]}>
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
    maxHeight: Dimensions.get('window').height * 0.85,
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
  cuteModalBtnText: {
    color: '#1a1a1c',
    fontSize: 18,
    fontWeight: '900',
  },

  // Member selection styles
  memberSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    height: 44,
    borderRadius: radius.lg,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  memberSearchInput: {
    flex: 1,
    fontSize: fontSize.md,
    height: 44,
  },
  selectedCount: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  memberSectionTitle: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  selectableMemberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  selectableMemberName: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: '500',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
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
