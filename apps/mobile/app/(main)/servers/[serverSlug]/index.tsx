import type { Channel, ChannelSortBy } from '@shadowob/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router'
import {
  AppWindow,
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Edit3,
  Hash,
  Inbox as InboxIcon,
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
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import Reanimated, { FadeInDown } from 'react-native-reanimated'
import { ChannelCatSvg } from '../../../../src/components/common/cat-svg'
import { LoadingScreen } from '../../../../src/components/common/loading-screen'
import {
  AppText,
  BackgroundSurface,
  Button,
  ChannelRow,
  Dialog,
  GlassPanel,
  MenuItem,
  MobileBackButton,
  MobileNavigationBar,
  MobileSwipeTabs,
  Sheet,
  TextField,
  ToolbarButton,
} from '../../../../src/components/ui'
import { useChannelSort } from '../../../../src/hooks/use-channel-sort'
import { API_BASE, fetchApi, getImageUrl } from '../../../../src/lib/api'
import { selectionHaptic } from '../../../../src/lib/haptics'
import { setLastChannel } from '../../../../src/lib/last-channel'
import { animateNextLayout } from '../../../../src/lib/layout-animation'
import { serverChannelHref } from '../../../../src/lib/routes'
import { showToast } from '../../../../src/lib/toast'
import { useAuthStore } from '../../../../src/stores/auth.store'
import {
  fontSize,
  iconSize,
  letterSpacing,
  lineHeight,
  palette,
  radius,
  size,
  spacing,
  useColors,
} from '../../../../src/theme'

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
  isPublic?: boolean
  memberCount?: number
}

interface ServerAppIntegration {
  id: string
  appKey: string
  name: string
  description?: string | null
  iconUrl?: string | null
  iframeEntry?: string | null
}

interface LaunchContext {
  iframeEntry: string | null
  launchToken: string
  eventStreamPath: string
}

interface BuddyInboxEntry {
  agent: {
    id: string
    ownerId: string
    status?: string | null
    user: {
      id: string
      username: string
      displayName: string | null
      avatarUrl: string | null
    }
  }
  channel: ServerChannel | null
  canManage: boolean
}

type ServerTab = 'channels' | 'inbox' | 'apps'

const CHANNEL_GROUP_ENTER_MS = 160
const CHANNEL_GROUP_STAGGER_MS = 24

function withLaunchParams(entry: string, launch: LaunchContext) {
  const url = new URL(entry)
  url.searchParams.set('shadow_launch', launch.launchToken)
  if (launch.eventStreamPath) {
    url.searchParams.set(
      'shadow_event_stream',
      `${API_BASE}${launch.eventStreamPath.startsWith('/') ? '' : '/'}${launch.eventStreamPath}`,
    )
  }
  return url.toString()
}

function ServerAppIcon({ iconUrl }: { iconUrl?: string | null }) {
  const colors = useColors()
  const imageUrl = iconUrl ? getImageUrl(iconUrl) : null

  return (
    <View style={[styles.serverAppIcon, { backgroundColor: colors.inputBackground }]}>
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={styles.serverAppIconImage} contentFit="cover" />
      ) : (
        <AppWindow size={iconSize.md} color={colors.primary} strokeWidth={2.5} />
      )}
    </View>
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

  // State
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState<ServerTab>('channels')
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
        isMember: boolean
        canAccess: boolean
        joinRequestStatus: 'pending' | 'approved' | 'rejected' | null
      }>(`/api/servers/${serverSlug}/access`),
    enabled: !!serverSlug,
    retry: false,
  })
  const isServerMember = serverAccess?.isMember === true

  const { data: server, isLoading: isServerLoading } = useQuery({
    queryKey: ['server', serverSlug],
    queryFn: () => fetchApi<Server>(`/api/servers/${serverSlug}`),
    enabled: !!serverSlug && isServerMember,
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
  const { sortBy, setSortBy, sortChannels, updateLastAccessed, hasCustomSort } = useChannelSort(
    server?.id,
  )

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

  const { data: serverApps = [] } = useQuery({
    queryKey: ['server-apps', serverSlug],
    queryFn: () => fetchApi<ServerAppIntegration[]>(`/api/servers/${serverSlug}/apps`),
    enabled: !!serverSlug && isServerMember,
  })

  const { data: inboxes = [], refetch: refetchInboxes } = useQuery({
    queryKey: ['server-inboxes', server?.id],
    queryFn: () => fetchApi<BuddyInboxEntry[]>(`/api/servers/${server!.id}/inboxes`),
    enabled: !!server?.id,
  })

  const ensureInboxMutation = useMutation({
    mutationFn: async (entry: BuddyInboxEntry) => {
      if (entry.channel) return entry.channel
      const result = await fetchApi<{ channel: ServerChannel }>(
        `/api/servers/${server!.id}/inboxes/${entry.agent.id}`,
        { method: 'POST' },
      )
      return result.channel
    },
    onSuccess: (channel) => {
      queryClient.invalidateQueries({ queryKey: ['channels', server?.id] })
      queryClient.invalidateQueries({ queryKey: ['server-inboxes', server?.id] })
      refetchInboxes()
      if (server) setLastChannel(server.id, channel.id)
      router.push(serverChannelHref(serverSlug, channel.id) as never)
    },
    onError: (err: Error) => showToast(err?.message || t('common.error'), 'error'),
  })

  const launchAppMutation = useMutation({
    mutationFn: async (app: ServerAppIntegration) => {
      const launch = await fetchApi<LaunchContext>(
        `/api/servers/${serverSlug}/apps/${app.appKey}/launch`,
        { method: 'POST' },
      )
      const entry = launch.iframeEntry ?? app.iframeEntry
      if (!entry) throw new Error(t('serverApps.noIframe'))
      return {
        app,
        url: withLaunchParams(entry, launch),
      }
    },
    onSuccess: ({ app, url }) => {
      router.push({
        pathname: '/(main)/webview-preview',
        params: {
          url: encodeURIComponent(url),
          title: app.name,
          serverSlug,
          appKey: app.appKey,
        },
      })
    },
    onError: (err: Error) => showToast(err?.message || t('common.error'), 'error'),
  })

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
    selectionHaptic()
    animateNextLayout()
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

  const serverTabs = useMemo(() => {
    const tabs: Array<{ value: ServerTab; label: string; icon: typeof Hash }> = [
      { value: 'channels', label: t('server.channels'), icon: Hash },
    ]
    if (inboxes.length > 0) {
      tabs.push({ value: 'inbox', label: t('inbox.title'), icon: InboxIcon })
    }
    if (serverApps.length > 0) {
      tabs.push({ value: 'apps', label: t('server.apps'), icon: AppWindow })
    }
    return tabs
  }, [inboxes.length, serverApps.length, t])

  useEffect(() => {
    if (!serverTabs.some((tab) => tab.value === activeTab)) {
      setActiveTab('channels')
    }
  }, [activeTab, serverTabs])

  const handleTabChange = (tab: ServerTab) => {
    if (tab !== activeTab) animateNextLayout()
    setActiveTab(tab)
  }

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

  if (isServerAccessLoading || (isServerMember && (isServerLoading || isLoading))) {
    return <LoadingScreen />
  }

  if (serverAccess && !serverAccess.isMember) {
    const isPublic = serverAccess.server.isPublic === true
    const isPending =
      !isPublic &&
      (serverAccess.joinRequestStatus === 'pending' || requestServerAccessMutation.isSuccess)
    return (
      <BackgroundSurface>
        <View style={styles.accessGateContainer}>
          <GlassPanel style={styles.accessGateCard}>
            <View style={[styles.accessGateIcon, { backgroundColor: colors.inputBackground }]}>
              {isPending ? (
                <Clock size={iconSize['5xl']} color={colors.primary} />
              ) : (
                <Lock size={iconSize['5xl']} color={colors.primary} />
              )}
            </View>
            <AppText variant="headline" style={styles.accessGateTitle}>
              {serverAccess.server.name}
            </AppText>
            <AppText tone="secondary" style={styles.accessGateDesc}>
              {isPublic ? t('server.publicServerGateDesc') : t('server.privateServerGateDesc')}
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
              {isPending
                ? t('server.requestPending')
                : isPublic
                  ? t('server.joinPublicServer')
                  : t('server.requestAccess')}
            </Button>
          </GlassPanel>
        </View>
      </BackgroundSurface>
    )
  }

  if (isServerAccessError || !server) return <LoadingScreen />

  return (
    <BackgroundSurface>
      <MobileNavigationBar
        title={server?.name ?? '...'}
        left={<MobileBackButton onPress={() => router.back()} />}
        right={
          isOwner ? (
            <ToolbarButton
              icon={Settings}
              iconColor={colors.text}
              onPress={() => router.push(`/(main)/servers/${serverSlug}/server-settings` as never)}
              variant="ghost"
            />
          ) : null
        }
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: spacing.none,
          paddingBottom: size.tabBar + spacing['4xl'],
        }}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => refetch()}
            tintColor={colors.primary}
          />
        }
      >
        <MobileSwipeTabs
          value={activeTab}
          options={serverTabs}
          onChange={handleTabChange}
          renderPage={(tab) => (
            <View style={styles.tabPage}>
              {tab.value === 'channels' ? (
                <View style={styles.tabSection}>
                  <View style={styles.channelToolbar}>
                    <TextField
                      value={channelSearch}
                      onChangeText={setChannelSearch}
                      placeholder={t('server.searchChannels')}
                      icon={Search}
                      containerStyle={styles.channelSearchInlineContainer}
                      style={styles.channelSearchWrap}
                      right={
                        channelSearch.length > 0 ? (
                          <Pressable
                            onPress={() => {
                              selectionHaptic()
                              setChannelSearch('')
                            }}
                            hitSlop={spacing.md}
                          >
                            <X size={iconSize.md} color={colors.textMuted} strokeWidth={2.5} />
                          </Pressable>
                        ) : null
                      }
                    />
                    <View style={styles.channelsActions}>
                      <View style={styles.actionButtonWrap}>
                        <Button
                          variant={hasCustomSort ? 'primary' : 'glass'}
                          size="icon"
                          icon={ArrowUpDown}
                          iconColor={hasCustomSort ? palette.foundation : colors.text}
                          iconSize={iconSize.lg}
                          onPress={() => {
                            selectionHaptic()
                            setShowSortModal(true)
                          }}
                        />
                        {hasCustomSort && (
                          <View style={[styles.sortBadge, { backgroundColor: colors.primary }]} />
                        )}
                      </View>
                      {isOwner && (
                        <Button
                          variant="primary"
                          size="icon"
                          icon={Plus}
                          iconSize={iconSize.lg}
                          onPress={() => {
                            selectionHaptic()
                            router.push(`/(main)/servers/${serverSlug}/create-channel` as never)
                          }}
                        />
                      )}
                    </View>
                  </View>

                  <View style={styles.channelsList}>
                    {filteredGroups.map((group, groupIndex) => (
                      <Reanimated.View
                        key={group.category?.id ?? 'uncategorized'}
                        entering={FadeInDown.duration(CHANNEL_GROUP_ENTER_MS).delay(
                          Math.min(groupIndex, 4) * CHANNEL_GROUP_STAGGER_MS,
                        )}
                      >
                        <View style={styles.categoryBubble}>
                          {group.category && (
                            <Pressable
                              style={styles.categoryRow}
                              onPress={() => toggleCategory(group.category!.id)}
                            >
                              <View style={styles.categoryHeaderLeft}>
                                <ChevronDown
                                  size={iconSize.sm}
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
                                      <Lock
                                        size={iconSize.sm}
                                        color={colors.textMuted}
                                        strokeWidth={2.5}
                                      />
                                    ) : null
                                  }
                                  onPress={() => {
                                    selectionHaptic()
                                    updateLastAccessed(channel.id)
                                    if (server) setLastChannel(server.id, channel.id)
                                    router.push(serverChannelHref(serverSlug, channel.id) as never)
                                  }}
                                  onLongPress={() => {
                                    selectionHaptic()
                                    setContextChannel(channel)
                                  }}
                                  flat
                                />
                              ))}
                            </View>
                          )}
                        </View>
                      </Reanimated.View>
                    ))}

                    {channels.length === 0 && (
                      <Reanimated.View entering={FadeInDown.duration(CHANNEL_GROUP_ENTER_MS)}>
                        <GlassPanel style={styles.emptyChannels}>
                          <ChannelCatSvg width={size.thumbnailMd} height={size.thumbnailMd} />
                          <AppText tone="secondary" style={styles.emptyText}>
                            {t('server.noChannels')}
                          </AppText>
                          {isOwner && (
                            <Button
                              variant="primary"
                              size="md"
                              icon={Plus}
                              onPress={() => {
                                selectionHaptic()
                                router.push(`/(main)/servers/${serverSlug}/create-channel` as never)
                              }}
                            >
                              {t('server.createChannel')}
                            </Button>
                          )}
                        </GlassPanel>
                      </Reanimated.View>
                    )}
                  </View>
                </View>
              ) : null}

              {tab.value === 'inbox' ? (
                <View style={styles.tabSection}>
                  <GlassPanel style={styles.inboxPanel}>
                    {inboxes.map((entry) => {
                      const label =
                        entry.agent.user.displayName ?? entry.agent.user.username ?? entry.agent.id
                      return (
                        <MenuItem
                          key={entry.agent.id}
                          icon={InboxIcon}
                          title={label}
                          subtitle={
                            entry.channel
                              ? t('inbox.channelReady')
                              : entry.canManage
                                ? t('inbox.createInbox')
                                : t('inbox.noAccess')
                          }
                          tone={entry.channel ? 'primary' : 'muted'}
                          disabled={!entry.channel && !entry.canManage}
                          right={
                            <ChevronRight
                              size={iconSize.md}
                              color={colors.textMuted}
                              strokeWidth={2.6}
                            />
                          }
                          onPress={() => ensureInboxMutation.mutate(entry)}
                        />
                      )
                    })}
                  </GlassPanel>
                </View>
              ) : null}

              {tab.value === 'apps' ? (
                <View style={styles.tabSection}>
                  <GlassPanel style={styles.appsPanel}>
                    {serverApps.map((app) => (
                      <MenuItem
                        key={app.id}
                        left={<ServerAppIcon iconUrl={app.iconUrl} />}
                        title={app.name}
                        tone="primary"
                        disabled={launchAppMutation.isPending || !app.iframeEntry}
                        right={
                          <ChevronRight
                            size={iconSize.md}
                            color={colors.textMuted}
                            strokeWidth={2.6}
                          />
                        }
                        onPress={() => launchAppMutation.mutate(app)}
                      />
                    ))}
                  </GlassPanel>
                </View>
              ) : null}
            </View>
          )}
        />
      </ScrollView>

      <Sheet
        visible={!!contextChannel}
        onClose={() => setContextChannel(null)}
        title={contextChannel?.name}
      >
        <MenuItem
          icon={UserPlus}
          title={t('channel.inviteMember')}
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
          title={t('channel.editChannel')}
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
          title={contextChannel?.isPrivate ? t('channel.setPublic') : t('channel.setPrivate')}
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
          title={t('channel.copyChannelLink')}
          onPress={() => {
            if (contextChannel) {
              showToast(t('channel.linkCopied'), 'success')
            }
            setContextChannel(null)
          }}
        />
        <MenuItem
          icon={Trash2}
          tone="danger"
          title={t('channel.deleteChannel')}
          onPress={() => {
            const ch = contextChannel
            setContextChannel(null)
            if (ch) {
              Alert.alert(t('channel.deleteChannel'), t('channel.deleteChannelConfirm'), [
                { text: t('common.cancel'), style: 'cancel' },
                {
                  text: t('common.delete'),
                  style: 'destructive',
                  onPress: () => deleteChannelMutation.mutate(ch.id),
                },
              ])
            }
          }}
        />
      </Sheet>

      <Dialog
        visible={!!editingChannel}
        onClose={() => setEditingChannel(null)}
        title={t('channel.editChannel')}
        actions={
          <>
            <Button
              variant="glass"
              size="md"
              style={styles.editAction}
              onPress={() => setEditingChannel(null)}
            >
              {t('common.cancel')}
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
              {t('common.save')}
            </Button>
          </>
        }
      >
        <TextField
          value={editChannelName}
          onChangeText={setEditChannelName}
          placeholder={t('channel.channelName')}
          autoFocus
        />
      </Dialog>

      <Sheet
        visible={showSortModal}
        onClose={() => setShowSortModal(false)}
        title={t('sort.title')}
      >
        <View style={styles.sortOptionsContainer}>
          {[
            {
              value: 'position' as ChannelSortBy,
              label: t('sort.byPosition'),
              icon: ArrowUpDown,
            },
            {
              value: 'lastMessageAt' as ChannelSortBy,
              label: t('sort.byLastMessage'),
              icon: MessageSquare,
            },
          ].map((option) => {
            const isSelected = sortBy === option.value
            return (
              <MenuItem
                key={option.value}
                icon={option.icon}
                title={option.label}
                tone={isSelected ? 'primary' : 'muted'}
                right={isSelected ? <Check size={iconSize.md} color={colors.primary} /> : undefined}
                onPress={() => {
                  selectionHaptic()
                  setSortBy(option.value)
                  setShowSortModal(false)
                }}
              />
            )
          })}
        </View>
        <Button variant="glass" size="md" onPress={() => setShowSortModal(false)}>
          {t('common.close')}
        </Button>
      </Sheet>
    </BackgroundSurface>
  )
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  tabPage: {
    paddingBottom: spacing.xl,
  },
  tabSection: {
    gap: spacing.sm,
  },
  channelToolbar: {
    minHeight: size.controlLg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  channelsActions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  actionButtonWrap: {
    position: 'relative',
  },
  // Search
  channelSearchInlineContainer: {
    flex: 1,
    minWidth: 0,
  },
  channelSearchWrap: {
    height: size.controlLg,
    borderRadius: radius['2xl'],
  },

  // Channels List
  channelsList: {
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
  },
  inboxPanel: {
    marginHorizontal: spacing.lg,
    padding: spacing.xs,
  },
  appsPanel: {
    marginHorizontal: spacing.lg,
    padding: spacing.xs,
  },
  serverAppIcon: {
    width: size.iconBubble,
    height: size.iconBubble,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  serverAppIconImage: {
    width: '100%',
    height: '100%',
  },
  categoryBubble: {
    gap: spacing.xs,
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
    gap: spacing.tight,
  },
  categoryName: {
    fontSize: fontSize.sm,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: letterSpacing.none,
  },
  channelsContainer: {
    gap: spacing.sm,
  },

  // Empty State
  emptyChannels: {
    alignItems: 'center',
    paddingVertical: spacing['4xl'],
    gap: spacing.md,
  },
  emptyText: {
    fontSize: fontSize.md,
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
    maxWidth: size.contentMaxWidth,
    borderRadius: radius['3xl'],
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
  },
  accessGateIcon: {
    width: size.listItemLg,
    height: size.listItemLg,
    borderRadius: radius['2xl'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  accessGateTitle: {
    fontSize: fontSize.xl,
    fontWeight: '900',
    textAlign: 'center',
  },
  accessGateDesc: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.md,
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
    top: spacing.xs,
    right: spacing.xs,
    width: size.dotSm,
    height: size.dotSm,
    borderRadius: radius.xs,
  },
})
