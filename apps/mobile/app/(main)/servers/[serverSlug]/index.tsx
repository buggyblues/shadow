import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router'
import {
  AppWindow,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Crown,
  FolderOpen,
  Hash,
  Lock,
  Megaphone,
  Plus,
  Search,
  Settings,
  Shield,
  ShoppingBag,
  Users,
  Volume2,
  X,
} from 'lucide-react-native'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Avatar } from '../../../../src/components/common/avatar'
import { HeaderButton } from '../../../../src/components/common/header-button'
import { LoadingScreen } from '../../../../src/components/common/loading-screen'
import { fetchApi, getImageUrl } from '../../../../src/lib/api'
import { setLastChannel } from '../../../../src/lib/last-channel'
import { showToast } from '../../../../src/lib/toast'
import { useAuthStore } from '../../../../src/stores/auth.store'
import { fontSize, radius, spacing, useColors } from '../../../../src/theme'

// ── Types ────────────────────────────────────────────────────────────────────

interface Channel {
  id: string
  name: string
  type: 'text' | 'voice' | 'announcement'
  categoryId: string | null
  position: number
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
  const [showCreateChannel, setShowCreateChannel] = useState(false)
  const [newChannelName, setNewChannelName] = useState('')
  const [newChannelType, setNewChannelType] = useState<'text' | 'voice' | 'announcement'>('text')
  const [newChannelCategoryId, setNewChannelCategoryId] = useState<string | null>(null)
  const [showSearch, setShowSearch] = useState(false)
  const [channelSearch, setChannelSearch] = useState('')

  // ── Queries ─────────────────────────────────────

  const { data: server, isLoading: isServerLoading } = useQuery({
    queryKey: ['server', serverSlug],
    queryFn: () => fetchApi<Server>(`/api/servers/${serverSlug}`),
    enabled: !!serverSlug,
  })

  const {
    data: channels = [],
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['channels', server?.id],
    queryFn: () => fetchApi<Channel[]>(`/api/servers/${server!.id}/channels`),
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
  const totalMemberCount = server?.memberCount ?? members.length
  const isOwner = currentUser?.id === server?.ownerId

  // Set navigation header
  useEffect(() => {
    navigation.setOptions({
      headerShown: false,
    })
  }, [navigation])

  // ── Create Channel ─────────────────────────────

  const createChannelMutation = useMutation({
    mutationFn: () =>
      fetchApi(`/api/servers/${server!.id}/channels`, {
        method: 'POST',
        body: JSON.stringify({
          name: newChannelName,
          type: newChannelType,
          categoryId: newChannelCategoryId,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels', server?.id] })
      setShowCreateChannel(false)
      setNewChannelName('')
    },
    // biome-ignore lint/suspicious/noExplicitAny: error shape varies
    onError: (err: any) => showToast(err?.message || t('common.error'), 'error'),
  })

  // ── Channel grouping ──────────────────────────

  const channelIcon = (type: string, color: string, size = 16) => {
    switch (type) {
      case 'voice':
        return <Volume2 size={size} color={color} />
      case 'announcement':
        return <Megaphone size={size} color={color} />
      default:
        return <Hash size={size} color={color} />
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

    const uncategorized = channels
      .filter((c) => !c.categoryId)
      .sort((a, b) => a.position - b.position)
    if (uncategorized.length > 0) {
      groups.push({ category: null, channels: uncategorized })
    }

    for (const cat of sorted) {
      const catChannels = channels
        .filter((c) => c.categoryId === cat.id)
        .sort((a, b) => a.position - b.position)
      if (catChannels.length > 0) {
        groups.push({ category: cat, channels: catChannels })
      }
    }
    return groups
  }, [channels, categories])

  // Filter by search
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

  const navItems = [
    { icon: ShoppingBag, label: t('server.shop'), route: 'shop', color: '#F59E0B' },
    { icon: FolderOpen, label: t('server.workspace'), route: 'workspace', color: '#3B82F6' },
    { icon: AppWindow, label: t('server.apps'), route: 'apps', color: '#10B981' },
    { icon: Users, label: t('server.members'), route: 'members', color: '#EF4444' },
  ]

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

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => refetch()}
            tintColor={colors.primary}
          />
        }
      >
        {/* ── Server Hero ─────────────────────── */}
        <View style={styles.hero}>
          {server?.bannerUrl ? (
            <Image
              source={{ uri: getImageUrl(server.bannerUrl)! }}
              style={styles.bannerImage}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.bannerImage, { backgroundColor: colors.primary }]} />
          )}
          <LinearGradient
            colors={['rgba(0,0,0,0.45)', 'transparent', colors.background]}
            locations={[0, 0.35, 1]}
            style={styles.bannerGradient}
          />

          {/* Floating nav bar on banner */}
          <View style={[styles.heroNav, { paddingTop: insets.top + 8 }]}>
            <HeaderButton icon={ChevronLeft} onPress={() => router.back()} color="#fff" size={22} />
            <View style={{ flex: 1 }} />
            {isOwner && (
              <HeaderButton
                icon={Settings}
                // biome-ignore lint/suspicious/noExplicitAny: expo-router type
                onPress={() => router.push(`/(main)/servers/${serverSlug}/server-settings` as any)}
                color="#fff"
              />
            )}
          </View>

          {/* Server identity */}
          <View style={styles.heroInfo}>
            {server?.iconUrl ? (
              <Image
                source={{ uri: getImageUrl(server.iconUrl)! }}
                style={[styles.serverIcon, { borderColor: colors.background }]}
                contentFit="cover"
              />
            ) : (
              <View
                style={[
                  styles.serverIcon,
                  {
                    backgroundColor: colors.primary,
                    borderColor: colors.background,
                    alignItems: 'center',
                    justifyContent: 'center',
                  },
                ]}
              >
                <Text style={styles.serverIconText}>{server?.name?.[0] ?? '?'}</Text>
              </View>
            )}
            <Text style={[styles.serverName, { color: colors.text }]}>{server?.name}</Text>
            <View style={styles.serverMetaRow}>
              <View style={[styles.onlineDot, { backgroundColor: '#34D399' }]} />
              <Text style={[styles.metaText, { color: colors.textMuted }]}>
                {onlineCount} {t('server.membersOnline')}
              </Text>
              <Text style={[styles.metaText, { color: colors.textMuted }]}>·</Text>
              <Text style={[styles.metaText, { color: colors.textMuted }]}>
                {totalMemberCount} {t('server.membersTotal', '成员')}
              </Text>
            </View>
            {server?.description && (
              <Text style={[styles.serverDesc, { color: colors.textSecondary }]} numberOfLines={2}>
                {server.description}
              </Text>
            )}
          </View>
        </View>

        {/* ── Quick Actions ────────────────────── */}
        <View style={styles.actionsRow}>
          {navItems.map(({ icon: Icon, label, route, color }) => (
            <Pressable
              key={route}
              style={({ pressed }) => [
                styles.actionCard,
                {
                  backgroundColor: pressed ? colors.surfaceHover : colors.surface,
                },
              ]}
              // biome-ignore lint/suspicious/noExplicitAny: expo-router type
              onPress={() => router.push(`/(main)/servers/${serverSlug}/${route}` as any)}
            >
              <View style={[styles.actionIcon, { backgroundColor: `${color}18` }]}>
                <Icon size={18} color={color} />
              </View>
              <Text style={[styles.actionLabel, { color: colors.textSecondary }]}>{label}</Text>
            </Pressable>
          ))}
        </View>

        {/* ── Channels ─────────────────────────── */}
        <View style={[styles.channelsCard, { backgroundColor: colors.surface }]}>
          <View style={styles.channelsHeader}>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
              {t('server.channels')}
            </Text>
            <View style={styles.channelsActions}>
              <Pressable
                onPress={() => setShowSearch(!showSearch)}
                hitSlop={12}
                style={styles.channelActionBtn}
              >
                <Search size={18} color={colors.textMuted} />
              </Pressable>
              {isOwner && (
                <Pressable
                  onPress={() => setShowCreateChannel(true)}
                  hitSlop={12}
                  style={styles.channelActionBtn}
                >
                  <Plus size={18} color={colors.primary} />
                </Pressable>
              )}
            </View>
          </View>

          {/* Search bar */}
          {showSearch && (
            <View style={[styles.channelSearchWrap, { backgroundColor: colors.inputBackground }]}>
              <Search size={13} color={colors.textMuted} />
              <TextInput
                style={[styles.channelSearchInput, { color: colors.text }]}
                value={channelSearch}
                onChangeText={setChannelSearch}
                placeholder={t('server.searchChannels')}
                placeholderTextColor={colors.textMuted}
                autoFocus
              />
              {channelSearch.length > 0 && (
                <Pressable onPress={() => setChannelSearch('')} hitSlop={6}>
                  <X size={13} color={colors.textMuted} />
                </Pressable>
              )}
            </View>
          )}

          {/* Channel list */}
          {filteredGroups.map((group) => (
            <View key={group.category?.id ?? 'uncategorized'}>
              {group.category && (
                <Pressable
                  style={styles.categoryRow}
                  onPress={() => toggleCategory(group.category!.id)}
                >
                  <ChevronDown
                    size={9}
                    color={colors.textMuted}
                    style={{
                      transform: [
                        {
                          rotate: collapsedCategories.has(group.category.id) ? '-90deg' : '0deg',
                        },
                      ],
                    }}
                  />
                  <Text style={[styles.categoryName, { color: colors.textMuted }]}>
                    {group.category.name}
                  </Text>
                </Pressable>
              )}
              {!(group.category && collapsedCategories.has(group.category.id)) &&
                group.channels.map((channel) => (
                  <Pressable
                    key={channel.id}
                    style={({ pressed }) => [
                      styles.channelRow,
                      pressed && { backgroundColor: colors.surfaceHover },
                    ]}
                    onPress={() => {
                      if (server) setLastChannel(server.id, channel.id)
                      // biome-ignore lint/suspicious/noExplicitAny: expo-router type
                      router.push(`/(main)/servers/${serverSlug}/channels/${channel.id}` as any)
                    }}
                  >
                    {channelIcon(channel.type, colors.textMuted)}
                    <Text style={[styles.channelName, { color: colors.text }]}>{channel.name}</Text>
                    {channel.isPrivate && <Lock size={11} color={colors.textMuted} />}
                  </Pressable>
                ))}
            </View>
          ))}

          {channels.length === 0 && (
            <View style={styles.emptyChannels}>
              <Hash size={24} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                {t('server.noChannels')}
              </Text>
              {isOwner && (
                <Pressable
                  style={[styles.createHint, { backgroundColor: `${colors.primary}12` }]}
                  onPress={() => setShowCreateChannel(true)}
                >
                  <Plus size={13} color={colors.primary} />
                  <Text style={[styles.createHintText, { color: colors.primary }]}>
                    {t('server.createChannel')}
                  </Text>
                </Pressable>
              )}
            </View>
          )}
        </View>

        {/* ── Members Preview ──────────────────── */}
        {members.length > 0 && (
          <View style={[styles.membersCard, { backgroundColor: colors.surface }]}>
            <Pressable
              style={styles.membersSectionHeader}
              // biome-ignore lint/suspicious/noExplicitAny: expo-router type
              onPress={() => router.push(`/(main)/servers/${serverSlug}/members` as any)}
            >
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
                {t('server.members')} · {members.length}
              </Text>
              <ChevronRight size={14} color={colors.textMuted} />
            </Pressable>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.memberPeek}
            >
              {members.slice(0, 15).map((m) => (
                <Pressable
                  key={m.user.id}
                  style={styles.memberChip}
                  onPress={() => router.push(`/(main)/profile/${m.user.id}`)}
                >
                  <View style={styles.memberAvatarWrap}>
                    <Avatar
                      uri={m.user.avatarUrl}
                      name={m.user.displayName || m.user.username}
                      size={34}
                      userId={m.user.id}
                    />
                    {(m.role === 'owner' || m.role === 'admin') && (
                      <View
                        style={[
                          styles.roleDot,
                          {
                            backgroundColor: m.role === 'owner' ? '#F59E0B' : '#3B82F6',
                            borderColor: colors.surface,
                          },
                        ]}
                      >
                        {m.role === 'owner' ? (
                          <Crown size={6} color="#fff" />
                        ) : (
                          <Shield size={6} color="#fff" />
                        )}
                      </View>
                    )}
                  </View>
                  <Text
                    style={[styles.memberName, { color: colors.textSecondary }]}
                    numberOfLines={1}
                  >
                    {m.user.displayName || m.user.username}
                  </Text>
                </Pressable>
              ))}
              {members.length > 15 && (
                <Pressable
                  style={[styles.memberMore, { backgroundColor: colors.inputBackground }]}
                  // biome-ignore lint/suspicious/noExplicitAny: expo-router type
                  onPress={() => router.push(`/(main)/servers/${serverSlug}/members` as any)}
                >
                  <Text style={[styles.memberMoreText, { color: colors.textMuted }]}>
                    +{members.length - 15}
                  </Text>
                </Pressable>
              )}
            </ScrollView>
          </View>
        )}

        <View style={{ height: spacing.xl }} />
      </ScrollView>

      {/* ── Create Channel Modal ──────────────────── */}
      <Modal visible={showCreateChannel} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowCreateChannel(false)}>
          <View
            style={[styles.modalContent, { backgroundColor: colors.surface }]}
            onStartShouldSetResponder={() => true}
          >
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {t('server.createChannel')}
            </Text>

            <Text style={[styles.label, { color: colors.textSecondary }]}>
              {t('server.channelName')}
            </Text>
            <TextInput
              style={[
                styles.input,
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

            <Text style={[styles.label, { color: colors.textSecondary, marginTop: spacing.md }]}>
              {t('server.channelType')}
            </Text>
            <View style={styles.typeRow}>
              {(['text', 'voice', 'announcement'] as const).map((type) => (
                <Pressable
                  key={type}
                  style={[
                    styles.typeBtn,
                    {
                      backgroundColor:
                        newChannelType === type ? `${colors.primary}15` : colors.inputBackground,
                      borderColor: newChannelType === type ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => setNewChannelType(type)}
                >
                  {channelIcon(type, newChannelType === type ? colors.primary : colors.textMuted)}
                  <Text
                    style={[
                      styles.typeBtnText,
                      { color: newChannelType === type ? colors.primary : colors.text },
                    ]}
                  >
                    {channelTypeLabel(type)}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Category selector */}
            {categories.length > 0 && (
              <>
                <Text
                  style={[styles.label, { color: colors.textSecondary, marginTop: spacing.md }]}
                >
                  {t('server.channelCategory')}
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ marginTop: spacing.xs }}
                >
                  <Pressable
                    style={[
                      styles.catChip,
                      {
                        backgroundColor: !newChannelCategoryId
                          ? `${colors.primary}15`
                          : colors.inputBackground,
                        borderColor: !newChannelCategoryId ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => setNewChannelCategoryId(null)}
                  >
                    <Text
                      style={[
                        styles.catChipText,
                        { color: !newChannelCategoryId ? colors.primary : colors.textMuted },
                      ]}
                    >
                      {t('server.noCategory')}
                    </Text>
                  </Pressable>
                  {categories.map((cat) => (
                    <Pressable
                      key={cat.id}
                      style={[
                        styles.catChip,
                        {
                          backgroundColor:
                            newChannelCategoryId === cat.id
                              ? `${colors.primary}15`
                              : colors.inputBackground,
                          borderColor:
                            newChannelCategoryId === cat.id ? colors.primary : colors.border,
                        },
                      ]}
                      onPress={() => setNewChannelCategoryId(cat.id)}
                    >
                      <Text
                        style={[
                          styles.catChipText,
                          {
                            color:
                              newChannelCategoryId === cat.id ? colors.primary : colors.textMuted,
                          },
                        ]}
                      >
                        {cat.name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            )}

            <View style={styles.modalActions}>
              <Pressable onPress={() => setShowCreateChannel(false)}>
                <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>
                  {t('common.cancel')}
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.createBtn,
                  {
                    backgroundColor: colors.primary,
                    opacity: !newChannelName.trim() || createChannelMutation.isPending ? 0.5 : 1,
                  },
                ]}
                onPress={() => createChannelMutation.mutate()}
                disabled={!newChannelName.trim() || createChannelMutation.isPending}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>{t('common.create')}</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  )
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Hero
  hero: { position: 'relative' },
  bannerImage: { width: '100%', height: 160 },
  bannerGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  heroNav: {
    position: 'absolute',
    top: 0,
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 10,
  },
  heroInfo: {
    alignItems: 'center',
    marginTop: -40,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
  },
  serverIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 3,
  },
  serverIconText: { color: '#fff', fontSize: 26, fontWeight: '800' },
  serverName: { fontSize: 22, fontWeight: '800', marginTop: spacing.sm },
  serverMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  onlineDot: { width: 8, height: 8, borderRadius: 4 },
  metaText: { fontSize: fontSize.sm },
  serverDesc: {
    fontSize: fontSize.sm,
    marginTop: spacing.sm,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Actions
  actionsRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  actionCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    gap: 4,
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { fontSize: fontSize.xs, fontWeight: '600' },

  // Channels
  channelsCard: {
    marginHorizontal: spacing.sm,
    borderRadius: radius.xl,
    paddingVertical: spacing.sm,
  },
  channelsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  channelsActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  channelActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionLabel: {
    fontSize: fontSize.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  channelSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.md,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    height: 30,
    gap: spacing.xs,
  },
  channelSearchInput: { flex: 1, fontSize: fontSize.xs, paddingVertical: 0 },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: 2,
  },
  categoryName: {
    flex: 1,
    fontSize: fontSize.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  channelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 9,
    borderRadius: radius.md,
  },
  channelName: { flex: 1, fontSize: fontSize.md, fontWeight: '500' },
  emptyChannels: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.xs,
  },
  emptyText: { fontSize: fontSize.xs },
  createHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.lg,
  },
  createHintText: { fontSize: fontSize.xs, fontWeight: '600' },

  // Members
  membersCard: {
    marginHorizontal: spacing.sm,
    borderRadius: radius.xl,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  membersSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  memberPeek: { paddingHorizontal: spacing.md, gap: spacing.md },
  memberChip: { alignItems: 'center', width: 56 },
  memberAvatarWrap: { position: 'relative' },
  roleDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  memberName: { fontSize: 10, fontWeight: '500', marginTop: 3, textAlign: 'center' },
  memberMore: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  memberMoreText: { fontSize: fontSize.xs, fontWeight: '700' },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  modalContent: { borderRadius: radius.xl, padding: spacing.xl },
  modalTitle: { fontSize: fontSize.xl, fontWeight: '800', marginBottom: spacing.lg },
  label: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  input: {
    height: 44,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.md,
    borderWidth: 1,
  },
  typeRow: { flexDirection: 'row', gap: spacing.sm },
  typeBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 2,
  },
  typeBtnText: { fontSize: fontSize.xs, fontWeight: '600', marginTop: 2 },
  catChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 99,
    borderWidth: 1,
    marginRight: spacing.sm,
  },
  catChipText: { fontSize: fontSize.xs, fontWeight: '600' },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.lg,
    marginTop: spacing.xl,
    alignItems: 'center',
  },
  createBtn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
  },
})
