import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router'
import {
  ChevronDown,
  ChevronLeft,
  Hash,
  Lock,
  Megaphone,
  Plus,
  Search,
  Settings,
  Volume2,
  X,
} from 'lucide-react-native'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Animated,
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
import {
  AgentCatSvg,
  ChannelCatSvg,
  ShopCatSvg,
  WorkCatSvg,
} from '../../../../src/components/common/cat-svg'
import { DottedBackground } from '../../../../src/components/common/dotted-background'
import { LoadingScreen } from '../../../../src/components/common/loading-screen'
import { fetchApi, getImageUrl } from '../../../../src/lib/api'
import { setLastChannel } from '../../../../src/lib/last-channel'
import { showToast } from '../../../../src/lib/toast'
import { useAuthStore } from '../../../../src/stores/auth.store'
import { spacing, useColors } from '../../../../src/theme'

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

// ── Helpers ──────────────────────────────────────────────────────────────────

function SquishyCard({ children, onPress, style }: any) {
  const scale = useRef(new Animated.Value(1)).current
  return (
    <Pressable
      onPressIn={() => Animated.spring(scale, { toValue: 0.95, useNativeDriver: true }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start()}
      onPress={onPress}
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
  const _totalMemberCount = server?.memberCount ?? members.length
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
    onError: (err: any) => showToast(err?.message || t('common.error'), 'error'),
  })

  // ── Channel grouping ──────────────────────────

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
      {/* Custom Header Floating */}
      <View style={[styles.floatingHeader, { paddingTop: insets.top + 8 }]}>
        <SquishyCard
          onPress={() => router.back()}
          style={[
            styles.floatingBtn,
            { backgroundColor: glassCardStyle.backgroundColor, borderColor: colors.border },
          ]}
        >
          <ChevronLeft size={24} color={colors.text} />
        </SquishyCard>
        <View style={{ flex: 1 }} />
        {isOwner && (
          <SquishyCard
            onPress={() => router.push(`/(main)/servers/${serverSlug}/server-settings` as any)}
            style={[
              styles.floatingBtn,
              { backgroundColor: glassCardStyle.backgroundColor, borderColor: colors.border },
            ]}
          >
            <Settings size={22} color={colors.text} />
          </SquishyCard>
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 60, paddingBottom: 100 }}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => refetch()}
            tintColor={colors.primary}
          />
        }
      >
        {/* ── Compact Server Header Card ─────────────────────── */}
        <View style={[styles.compactHeroCard, glassCardStyle, { marginHorizontal: spacing.md }]}>
          <LinearGradient
            colors={['#00f3ff20', '#ff7da520', '#f8e71c20']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={styles.compactHeroContent}>
            <View style={[styles.compactServerIconWrap, { borderColor: colors.background }]}>
              {server?.iconUrl ? (
                <Image
                  source={{ uri: getImageUrl(server.iconUrl)! }}
                  style={styles.compactServerIcon}
                  contentFit="cover"
                />
              ) : (
                <View
                  style={[
                    styles.compactServerIcon,
                    {
                      backgroundColor: colors.primary,
                      justifyContent: 'center',
                      alignItems: 'center',
                    },
                  ]}
                >
                  <Text style={styles.compactServerIconText}>{server?.name?.[0] ?? '?'}</Text>
                </View>
              )}
            </View>

            <View style={styles.compactHeroTextCol}>
              <Text style={[styles.compactServerName, { color: colors.text }]} numberOfLines={1}>
                {server?.name}
              </Text>
              <View style={styles.neonPillsRow}>
                <View
                  style={[
                    styles.neonPill,
                    { borderColor: '#34D399', backgroundColor: '#34D39915' },
                  ]}
                >
                  <View
                    style={[styles.neonDot, { backgroundColor: '#34D399', shadowColor: '#34D399' }]}
                  />
                  <Text style={[styles.neonText, { color: '#34D399' }]}>
                    {onlineCount} {t('server.membersOnline')}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* ── Horizontal 1x4 Actions ────────────────────── */}
        <View style={styles.actionRow}>
          {/* Workspace */}
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

          {/* Shop */}
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

          {/* Apps */}
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

          {/* Members */}
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
        </View>

        {/* ── Channels Header ─────────────────────────── */}
        <View style={styles.channelsControls}>
          <Text style={[styles.cuteSectionLabel, { color: colors.text }]}>
            {t('server.channels')}
          </Text>
          <View style={styles.channelsActions}>
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
          {filteredGroups.map((group) => (
            <View
              key={group.category?.id ?? 'uncategorized'}
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
                        if (server) setLastChannel(server.id, channel.id)
                        router.push(`/(main)/servers/${serverSlug}/channels/${channel.id}` as any)
                      }}
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
            </View>
          ))}

          {channels.length === 0 && (
            <View style={[styles.emptyChannels, glassCardStyle]}>
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
            </View>
          )}
        </View>
      </ScrollView>

      {/* ── Create Channel Modal ──────────────────── */}
      <Modal visible={showCreateChannel} transparent animationType="fade">
        <View style={styles.modalOverlay}>
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
              <Pressable onPress={() => setShowCreateChannel(false)} hitSlop={8}>
                <X size={24} color={colors.textMuted} strokeWidth={2.5} />
              </Pressable>
            </View>

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
                            newChannelCategoryId === cat.id ? '#f8e71c20' : colors.inputBackground,
                          borderColor: newChannelCategoryId === cat.id ? '#f8e71c' : colors.border,
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

            <SquishyCard
              onPress={() => createChannelMutation.mutate()}
              disabled={!newChannelName.trim() || createChannelMutation.isPending}
              style={{ marginTop: spacing.xl }}
            >
              <LinearGradient
                colors={['#00f3ff', '#00a2ff']}
                style={[
                  styles.cuteModalBtn,
                  { opacity: !newChannelName.trim() || createChannelMutation.isPending ? 0.5 : 1 },
                ]}
              >
                <Text style={styles.cuteModalBtnText}>{t('common.create')}</Text>
              </LinearGradient>
            </SquishyCard>
          </View>
        </View>
      </Modal>
    </DottedBackground>
  )
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  floatingHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    zIndex: 100,
  },
  floatingBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },

  // Compact Hero
  compactHeroCard: {
    overflow: 'hidden',
    marginBottom: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 6,
    position: 'relative',
  },
  compactHeroContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  compactServerIconWrap: {
    borderWidth: 3,
    borderRadius: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
    marginRight: spacing.md,
  },
  compactServerIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  compactServerIconText: { color: '#fff', fontSize: 24, fontWeight: '900' },
  compactHeroTextCol: {
    flex: 1,
    justifyContent: 'center',
  },
  compactServerName: {
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 4,
  },
  neonPillsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  neonPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    borderWidth: 2,
    gap: 6,
  },
  neonDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  neonText: {
    fontSize: 11,
    fontWeight: '800',
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
  cuteModalBtnText: {
    color: '#1a1a1c',
    fontSize: 18,
    fontWeight: '900',
  },
})
