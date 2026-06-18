import AsyncStorage from '@react-native-async-storage/async-storage'
import MaskedView from '@react-native-masked-view/masked-view'
import type { Channel } from '@shadowob/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { ChevronRight, Hash, MessageCircle, Plus } from 'lucide-react-native'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native'
import Reanimated, {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Avatar } from '../../../src/components/common/avatar'
import { EmptyState } from '../../../src/components/common/empty-state'
import { LoadingScreen } from '../../../src/components/common/loading-screen'
import { AppText, BackgroundSurface, Button } from '../../../src/components/ui'
import {
  HeaderCoverGradient,
  HeaderCoverOpacityMask,
  RailCoverFade,
  UnifiedChannelGroup,
  UnifiedDirectMessageRailItem,
  UnifiedHomePager,
  type UnifiedHomePagerHandle,
  UnifiedMembersPage,
  UnifiedServerRailItem,
  UnifiedShortcutShelf,
  UnifiedWorkspaceFilesPage,
} from '../../../src/features/home/components'
import {
  HOME_VARIANT_STORAGE_KEY,
  UNIFIED_CREATE_MENU_ARROW_SIZE,
  UNIFIED_CREATE_MENU_POINTER_SIZE,
  UNIFIED_CREATE_MENU_WIDTH,
  UNIFIED_HEADER_COVER_EXTRA_HEIGHT,
  UNIFIED_HEADER_SERVER_ICON_SIZE,
} from '../../../src/features/home/constants'
import { styles } from '../../../src/features/home/home.styles'
import { useHomeCommandCenter } from '../../../src/features/home/hooks/useHomeCommandCenter'
import { useUnifiedHomeData } from '../../../src/features/home/hooks/useUnifiedHomeData'
import { useUnifiedHomeDerivedData } from '../../../src/features/home/hooks/useUnifiedHomeDerivedData'
import { useUnifiedHomeState } from '../../../src/features/home/hooks/useUnifiedHomeState'
import {
  UnifiedCommandCenterModal,
  UnifiedCreateMenuModal,
  UnifiedCreateServerSheet,
  UnifiedDirectMessagePickerSheet,
} from '../../../src/features/home/overlays'
import { getUnifiedHomePalette } from '../../../src/features/home/palette'
import type {
  CommandCandidate,
  CreateMenuAnchor,
  DirectChannelEntry,
  InboxOpenRequest,
  LaunchContext,
  ServerAppIntegration,
  ServerEntry,
  UnifiedChannel,
  UnifiedServerMember,
  UnifiedWorkspaceNode,
} from '../../../src/features/home/types'
import { resolveUnifiedWorkspaceMediaUrl, withLaunchParams } from '../../../src/features/home/utils'
import { useChannelSort } from '../../../src/hooks/use-channel-sort'
import { fetchApi, getImageUrl } from '../../../src/lib/api'
import { selectionHaptic } from '../../../src/lib/haptics'
import { animateNextLayout } from '../../../src/lib/layout-animation'
import { serverChannelHref } from '../../../src/lib/routes'
import { encodeMobileNavigationParam } from '../../../src/lib/server-app-mobile'
import { showToast } from '../../../src/lib/toast'
import { useChatStore } from '../../../src/stores/chat.store'
import { useUIStore } from '../../../src/stores/ui.store'
import { iconSize, palette, size, spacing, useColors } from '../../../src/theme'

export default function ServersScreen() {
  useEffect(() => {
    void AsyncStorage.setItem(HOME_VARIANT_STORAGE_KEY, 'unified')
  }, [])

  return <UnifiedServersScreen />
}

function UnifiedServersScreen() {
  const { t, i18n } = useTranslation()
  const colors = useColors()
  const homePalette = getUnifiedHomePalette(colors)
  const router = useRouter()
  const queryClient = useQueryClient()
  const insets = useSafeAreaInsets()
  const { width: windowWidth } = useWindowDimensions()
  const activeServerId = useChatStore((s) => s.activeServerId)
  const setActiveServer = useChatStore((s) => s.setActiveServer)
  const setActiveChannel = useChatStore((s) => s.setActiveChannel)
  const pendingAction = useUIStore((s) => s.pendingAction)
  const homeCommandPaletteRequestId = useUIStore((s) => s.homeCommandPaletteRequestId)
  const setPendingAction = useUIStore((s) => s.setPendingAction)
  const showCommandCenter = useUIStore((s) => s.homeCommandPaletteOpen)
  const setShowCommandCenter = useUIStore((s) => s.setHomeCommandPaletteOpen)
  const searchQuery = useUIStore((s) => s.homeCommandPaletteQuery)
  const setSearchQuery = useUIStore((s) => s.setHomeCommandPaletteQuery)
  const unifiedHomeBaseColor = homePalette.base
  const { commandSearchInputRef, commandDismissPanResponder } = useHomeCommandCenter({
    showCommandCenter,
    setShowCommandCenter,
    homeCommandPaletteRequestId,
    setPendingAction,
  })

  const {
    selectedServerId,
    setSelectedServerId,
    showDirectMessagePicker,
    setShowDirectMessagePicker,
    showCreateMenu,
    setShowCreateMenu,
    showCreateServer,
    setShowCreateServer,
    collapsedHomeGroups,
    setCollapsedHomeGroups,
    workspaceFolderStack,
    setWorkspaceFolderStack,
    createName,
    setCreateName,
    isPublic,
    setIsPublic,
  } = useUnifiedHomeState()
  const railWidth = size.plusPanelIconLg + spacing.sm
  const panelPageWidth = Math.max(1, windowWidth - railWidth)
  const coverScrollY = useSharedValue(0)
  const createButtonRef = useRef<View>(null)
  const homePagerRef = useRef<UnifiedHomePagerHandle>(null)
  const [createMenuAnchor, setCreateMenuAnchor] = useState<CreateMenuAnchor | null>(null)
  const expandedHeaderHeight = insets.top + size.controlLg + spacing['3xl']
  const fallbackCreateMenuAnchor = useMemo<CreateMenuAnchor>(
    () => ({
      x: (railWidth - size.plusPanelIcon) / 2,
      y: insets.top + spacing.sm,
      width: size.plusPanelIcon,
      height: size.plusPanelIcon,
    }),
    [insets.top, railWidth],
  )
  const activeCreateMenuAnchor = createMenuAnchor ?? fallbackCreateMenuAnchor
  const createMenuPanelLeft = spacing.xs
  const createMenuPanelTop =
    activeCreateMenuAnchor.y + activeCreateMenuAnchor.height + UNIFIED_CREATE_MENU_ARROW_SIZE
  const createMenuAnchorCenterX = activeCreateMenuAnchor.x + activeCreateMenuAnchor.width / 2
  const createMenuArrowLeft = Math.max(
    spacing.sm,
    Math.min(
      UNIFIED_CREATE_MENU_WIDTH - UNIFIED_CREATE_MENU_POINTER_SIZE - spacing.sm,
      createMenuAnchorCenterX - createMenuPanelLeft - UNIFIED_CREATE_MENU_POINTER_SIZE,
    ),
  )
  const coverLayerHeight = expandedHeaderHeight + UNIFIED_HEADER_COVER_EXTRA_HEIGHT
  const coverImageAnimatedStyle = useAnimatedStyle(() => {
    const pullDistance = Math.max(-coverScrollY.value, spacing.none)
    return {
      height: coverLayerHeight + Math.min(pullDistance * 0.96, size.thumbnailMd * 1.8),
      transform: [
        { scaleX: 1 + Math.min(pullDistance / 1600, 0.035) },
        { scaleY: 1 + Math.min(pullDistance / 620, 0.14) },
      ],
    }
  })
  const coverScrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      coverScrollY.value = event.contentOffset.y
    },
  })

  const {
    isLoading,
    scopedUnread,
    directChannels,
    joinedServers,
    railServers,
    selectedServer,
    selectedServerSlug,
    currentWorkspaceFolder,
    displayServer,
    rawChannels,
    isChannelsLoading,
    serverApps,
    isServerAppsLoading,
    inboxes,
    isInboxesLoading,
    refetchInboxes,
    globalSearchServers,
    serverMembers,
    workspaceNodes,
    commandWorkspaceNodes,
  } = useUnifiedHomeData({
    selectedServerId,
    workspaceFolderStack,
    searchQuery,
    language: i18n.language,
  })
  const { sortChannels, updateLastAccessed } = useChannelSort(selectedServer?.server.id)

  useEffect(() => {
    setWorkspaceFolderStack([])
    homePagerRef.current?.setPage(1, false)
  }, [selectedServer?.server.id])

  const bannerImageUrl = getImageUrl(displayServer?.bannerUrl)
  const headerCoverSource = bannerImageUrl ? { uri: bannerImageUrl } : null
  const headerForegroundColor = headerCoverSource ? palette.white : homePalette.text
  const headerSecondaryColor = headerCoverSource ? palette.white : homePalette.textMuted
  const headerTitleShadowStyle = headerCoverSource ? styles.unifiedServerTitleOnCover : null
  const headerIconShadowStyle = headerCoverSource ? styles.unifiedHeaderIconOnCover : null

  const createMutation = useMutation({
    mutationFn: () =>
      fetchApi<{ id: string; slug: string | null }>('/api/servers', {
        method: 'POST',
        body: JSON.stringify({ name: createName, isPublic }),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      setActiveServer(data.id)
      setSelectedServerId(data.id)
      setShowCreateServer(false)
      setCreateName('')
    },
  })

  const ensureInboxMutation = useMutation({
    mutationFn: async ({ server, entry }: InboxOpenRequest) => {
      if (entry.channel) return { server, channel: entry.channel }
      if (!server.server.id) throw new Error(t('common.error'))
      const result = await fetchApi<{ channel: UnifiedChannel }>(
        `/api/servers/${server.server.id}/inboxes/${entry.agent.id}`,
        { method: 'POST' },
      )
      return { server, channel: result.channel }
    },
    onSuccess: ({ server, channel }) => {
      queryClient.invalidateQueries({
        queryKey: ['home-unified-channels', server.server.id],
      })
      queryClient.invalidateQueries({
        queryKey: ['home-unified-server-inboxes', server.server.id],
      })
      queryClient.invalidateQueries({ queryKey: ['home-unified-global-search-data'] })
      if (server.server.id === selectedServer?.server.id) {
        void refetchInboxes()
      }
      setSelectedServerId(server.server.id)
      router.push(serverChannelHref(server.server.slug ?? server.server.id, channel.id) as never)
    },
    onError: (error: Error) => showToast(error?.message || t('common.error'), 'error'),
  })

  const launchAppMutation = useMutation({
    mutationFn: async (app: ServerAppIntegration) => {
      if (!selectedServerSlug) throw new Error(t('common.error'))
      const launch = await fetchApi<LaunchContext>(
        `/api/servers/${selectedServerSlug}/apps/${app.appKey}/launch`,
        { method: 'POST' },
      )
      const entry = launch.iframeEntry ?? app.iframeEntry
      if (!entry) throw new Error(t('serverApps.noIframe'))
      return {
        app,
        url: withLaunchParams(entry, launch),
        mobileNavigation: encodeMobileNavigationParam(launch.mobile),
      }
    },
    onSuccess: ({ app, url, mobileNavigation }) => {
      router.push({
        pathname: '/(main)/webview-preview',
        params: {
          url: encodeURIComponent(url),
          title: app.name,
          serverSlug: selectedServerSlug ?? '',
          appKey: app.appKey,
          ...(mobileNavigation ? { mobileNavigation } : {}),
        },
      })
    },
    onError: (error: Error) => showToast(error?.message || t('common.error'), 'error'),
  })

  useEffect(() => {
    const activeServer = activeServerId
      ? joinedServers.find(
          (entry) => entry.server.id === activeServerId || entry.server.slug === activeServerId,
        )
      : null
    if (activeServer) {
      setSelectedServerId(activeServer.server.id)
      return
    }
    if (selectedServerId && joinedServers.some((entry) => entry.server.id === selectedServerId)) {
      return
    }
    setSelectedServerId(joinedServers[0]?.server.id ?? null)
  }, [activeServerId, joinedServers, selectedServerId])

  const {
    sortedServerMembers,
    directMessages,
    sortedWorkspaceNodes,
    commandCandidates,
    channelGroups,
  } = useUnifiedHomeDerivedData({
    rawChannels,
    sortChannels,
    serverMembers,
    directChannels,
    scopedUnread,
    workspaceNodes,
    globalSearchServers,
    selectedServer,
    inboxes,
    railServers,
    searchQuery,
    selectedServerSlug,
    displayServerName: displayServer?.name,
    serverApps,
    commandWorkspaceNodes,
    t,
  })
  const openServer = (entry: ServerEntry) => {
    selectionHaptic()
    if (entry.member.role === '_public') {
      router.push('/(main)/discover' as never)
      return
    }
    setActiveServer(entry.server.id)
    setSelectedServerId(entry.server.id)
  }

  const openChannelForServer = (server: ServerEntry, channel: Channel) => {
    const serverSlug = server.server.slug ?? server.server.id
    setActiveServer(server.server.id)
    setSelectedServerId(server.server.id)
    setActiveChannel(channel.id)
    router.push(serverChannelHref(serverSlug, channel.id) as never)
  }

  const openChannel = (channel: Channel) => {
    if (!selectedServer) return
    selectionHaptic()
    updateLastAccessed(channel.id)
    openChannelForServer(selectedServer, channel)
  }

  const markChannelRead = async (channelId: string) => {
    await fetchApi('/api/notifications/read-scope', {
      method: 'POST',
      body: JSON.stringify({ channelId }),
    }).finally(() => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
      queryClient.invalidateQueries({ queryKey: ['notification-scoped-unread'] })
    })
  }

  const openDirectChannel = (channel: DirectChannelEntry) => {
    selectionHaptic()
    setActiveServer(null)
    setActiveChannel(channel.id)
    void markChannelRead(channel.id)
    router.push(`/(main)/dm/${channel.id}` as never)
  }

  const openMemberProfile = (member: UnifiedServerMember) => {
    selectionHaptic()
    router.push(`/(main)/profile/${member.user.id}` as never)
  }

  const openWorkspacePanel = () => {
    selectionHaptic()
    requestAnimationFrame(() => {
      homePagerRef.current?.setPage(2)
    })
  }

  const openServerUtility = (utility: 'workspace' | 'shop') => {
    if (!selectedServerSlug) return
    if (utility === 'workspace') {
      openWorkspacePanel()
      return
    }
    selectionHaptic()
    router.push(`/(main)/servers/${selectedServerSlug}/${utility}` as never)
  }

  useEffect(() => {
    if (!pendingAction?.startsWith('open-home-workspace')) return
    setPendingAction(null)
    openWorkspacePanel()
  }, [pendingAction, setPendingAction])

  const openCreateMenu = () => {
    selectionHaptic()
    const fallbackAnchor = fallbackCreateMenuAnchor
    setCreateMenuAnchor(fallbackAnchor)
    setShowCreateMenu(true)

    if (!createButtonRef.current) {
      return
    }

    createButtonRef.current.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0) {
        setCreateMenuAnchor({ x, y, width, height })
      }
    })
  }

  const openWorkspaceFile = async (node: UnifiedWorkspaceNode) => {
    if (!selectedServer?.server.id) return
    selectionHaptic()

    try {
      const url = await resolveUnifiedWorkspaceMediaUrl(selectedServer.server.id, node, 'inline')
      if (!url) {
        showToast(t('previewUnsupported'), 'error')
        return
      }

      router.push({
        pathname: '/(main)/media-preview',
        params: {
          url,
          filename: node.name,
          contentType: node.mime ?? node.mimeType ?? 'application/octet-stream',
        },
      })
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('common.error'), 'error')
    }
  }

  const toggleHomeGroup = (groupKey: string) => {
    selectionHaptic()
    animateNextLayout()
    setCollapsedHomeGroups((current) => {
      const next = new Set(current)
      if (next.has(groupKey)) {
        next.delete(groupKey)
      } else {
        next.add(groupKey)
      }
      return next
    })
  }

  const openCreateChannel = (type?: UnifiedChannel['type']) => {
    if (!selectedServerSlug) return
    const params = type ? `?type=${encodeURIComponent(type)}` : ''
    selectionHaptic()
    router.push(`/(main)/servers/${selectedServerSlug}/create-channel${params}` as never)
  }

  const openCommandCandidate = (candidate: CommandCandidate) => {
    selectionHaptic()
    setShowCommandCenter(false)
    if (candidate.kind === 'server') {
      openServer(candidate.server)
      return
    }
    if (candidate.kind === 'channel') {
      openChannelForServer(candidate.server, candidate.channel)
      return
    }
    if (candidate.kind === 'app') {
      launchAppMutation.mutate(candidate.app)
      return
    }
    if (candidate.kind === 'inbox') {
      ensureInboxMutation.mutate({ server: candidate.server, entry: candidate.inbox })
      return
    }
    if (candidate.kind === 'workspaceNode') {
      openWorkspacePanel()
      if (candidate.node.kind === 'dir') {
        setWorkspaceFolderStack([candidate.node])
        return
      }
      void openWorkspaceFile(candidate.node)
      return
    }
    openServerUtility(candidate.utility)
  }

  if (isLoading) return <LoadingScreen />

  return (
    <BackgroundSurface>
      <View style={[styles.unifiedRoot, { backgroundColor: unifiedHomeBaseColor }]}>
        <Reanimated.View
          pointerEvents="none"
          style={[
            styles.unifiedPageCoverLayer,
            { backgroundColor: homePalette.base, height: coverLayerHeight },
          ]}
        >
          <HeaderCoverGradient hasCover={Boolean(headerCoverSource)} />
          {headerCoverSource ? (
            <MaskedView style={StyleSheet.absoluteFill} maskElement={<HeaderCoverOpacityMask />}>
              <Reanimated.View style={[styles.unifiedPageCoverMask, coverImageAnimatedStyle]}>
                <Image
                  source={headerCoverSource}
                  style={styles.unifiedPageCover}
                  contentFit="cover"
                />
              </Reanimated.View>
            </MaskedView>
          ) : null}
        </Reanimated.View>
        <Reanimated.View
          style={[
            styles.unifiedRail,
            {
              borderRightColor: homePalette.border,
              paddingBottom: insets.bottom + size.tabBar + spacing.lg,
            },
          ]}
        >
          <View
            pointerEvents="none"
            style={[
              styles.unifiedRailBodyFade,
              { top: expandedHeaderHeight + UNIFIED_HEADER_COVER_EXTRA_HEIGHT - spacing.md },
            ]}
          >
            <RailCoverFade />
          </View>
          <SafeAreaView edges={['top']} style={styles.unifiedRailSafeArea}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common.create')}
              onPress={openCreateMenu}
              hitSlop={spacing.md}
              style={({ pressed }) => [
                styles.unifiedRailCreateTouch,
                pressed ? styles.unifiedPressed : null,
              ]}
            >
              <View
                ref={createButtonRef}
                style={[
                  styles.unifiedRailCreateButton,
                  {
                    backgroundColor: homePalette.buttonSurface,
                    borderColor: homePalette.buttonBorder,
                    shadowColor: colors.shadowStrong,
                  },
                ]}
              >
                <Plus size={iconSize['3xl']} color={homePalette.text} strokeWidth={2.35} />
              </View>
            </Pressable>
            <ScrollView
              showsVerticalScrollIndicator={false}
              style={styles.unifiedRailScroller}
              contentContainerStyle={styles.unifiedRailList}
            >
              {railServers.map((entry, index) => {
                const active = selectedServer?.server.id === entry.server.id
                const unreadCount = scopedUnread?.serverUnread?.[entry.server.id] ?? 0
                return (
                  <UnifiedServerRailItem
                    key={entry.server.id}
                    entry={entry}
                    active={active}
                    unreadCount={unreadCount}
                    index={index}
                    onPress={() => openServer(entry)}
                  />
                )
              })}
              {directMessages.length > 0 && railServers.length > 0 ? (
                <View
                  style={[styles.unifiedRailDivider, { backgroundColor: homePalette.surfaceMuted }]}
                />
              ) : null}
              {directMessages.map((channel, index) => (
                <UnifiedDirectMessageRailItem
                  key={channel.id}
                  channel={channel}
                  unreadCount={scopedUnread?.channelUnread?.[channel.id] ?? 0}
                  index={railServers.length + index}
                  onPress={() => openDirectChannel(channel)}
                />
              ))}
            </ScrollView>
          </SafeAreaView>
        </Reanimated.View>

        <View style={styles.unifiedPanel}>
          {selectedServer && displayServer ? (
            <View
              style={[
                styles.unifiedWorkspacePanel,
                {
                  borderColor: homePalette.border,
                },
              ]}
            >
              <Reanimated.View
                pointerEvents="none"
                style={[
                  styles.unifiedWorkspaceBodyBackdrop,
                  { backgroundColor: unifiedHomeBaseColor },
                  { top: expandedHeaderHeight + UNIFIED_HEADER_COVER_EXTRA_HEIGHT },
                ]}
              />
              <Reanimated.View
                style={[
                  styles.unifiedWorkspaceHeader,
                  { borderBottomColor: homePalette.border },
                  { height: expandedHeaderHeight },
                ]}
              >
                <SafeAreaView edges={['top']} style={styles.unifiedWorkspaceHeaderSafe}>
                  <View style={styles.unifiedMasthead}>
                    <View style={styles.unifiedHeaderContent}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t('channel.serverSettings')}
                        onPress={() => {
                          if (!selectedServerSlug) return
                          selectionHaptic()
                          router.push(
                            `/(main)/servers/${selectedServerSlug}/server-settings` as never,
                          )
                        }}
                        style={({ pressed }) => [
                          styles.unifiedServerIdentityPressable,
                          pressed ? styles.unifiedTouchPressed : null,
                        ]}
                      >
                        <View style={styles.unifiedHeaderAvatarShadow}>
                          <Avatar
                            uri={displayServer.iconUrl}
                            name={displayServer.name}
                            size={UNIFIED_HEADER_SERVER_ICON_SIZE}
                            userId={displayServer.id}
                            shape="server"
                          />
                        </View>
                        <View style={styles.unifiedServerTitleBlock}>
                          <AppText
                            variant="title"
                            numberOfLines={1}
                            style={[
                              styles.unifiedServerTitle,
                              styles.unifiedHomeText,
                              headerTitleShadowStyle,
                              { color: headerForegroundColor },
                            ]}
                          >
                            {displayServer.name}
                          </AppText>
                        </View>
                        <ChevronRight
                          size={iconSize.lg}
                          color={headerSecondaryColor}
                          style={headerIconShadowStyle}
                        />
                      </Pressable>
                    </View>
                  </View>
                </SafeAreaView>
              </Reanimated.View>

              <UnifiedHomePager
                ref={homePagerRef}
                initialPage={1}
                pageWidth={panelPageWidth}
                pages={[
                  <UnifiedMembersPage
                    members={sortedServerMembers}
                    t={t}
                    onInvite={() => {
                      if (!selectedServerSlug) return
                      selectionHaptic()
                      router.push(`/(main)/servers/${selectedServerSlug}/invite` as never)
                    }}
                    onAddBuddy={() => {
                      selectionHaptic()
                      router.push('/(main)/create-buddy' as never)
                    }}
                    onOpenMember={openMemberProfile}
                  />,
                  <Reanimated.ScrollView
                    alwaysBounceVertical
                    bounces
                    contentInsetAdjustmentBehavior="never"
                    showsVerticalScrollIndicator={false}
                    style={styles.unifiedChannelScroll}
                    onScroll={coverScrollHandler}
                    scrollEventThrottle={16}
                    contentContainerStyle={[
                      styles.unifiedChannelList,
                      { paddingBottom: insets.bottom + size.tabBar + spacing['4xl'] },
                    ]}
                  >
                    <UnifiedShortcutShelf
                      windowWidth={windowWidth}
                      inboxes={inboxes}
                      serverApps={serverApps}
                      isInboxesLoading={isInboxesLoading}
                      isServerAppsLoading={isServerAppsLoading}
                      launchAppPending={launchAppMutation.isPending}
                      openingInboxRequest={ensureInboxMutation.variables}
                      selectedServer={selectedServer}
                      onLaunchApp={(app) => {
                        selectionHaptic()
                        launchAppMutation.mutate(app)
                      }}
                      onOpenInbox={(entry) => {
                        if (!selectedServer) return
                        selectionHaptic()
                        ensureInboxMutation.mutate({ server: selectedServer, entry })
                      }}
                    />
                    {isChannelsLoading ? (
                      <View style={styles.unifiedSkeletonStack}>
                        {[0, 1, 2, 3].map((item) => (
                          <View
                            key={item}
                            style={[
                              styles.unifiedSkeletonRow,
                              { backgroundColor: homePalette.surfaceMuted },
                            ]}
                          />
                        ))}
                      </View>
                    ) : channelGroups.length > 0 ? (
                      channelGroups.map((group) => (
                        <UnifiedChannelGroup
                          key={group.key}
                          group={group}
                          collapsed={collapsedHomeGroups.has(group.key)}
                          channelUnread={scopedUnread?.channelUnread}
                          onToggle={() => toggleHomeGroup(group.key)}
                          onCreateChannel={openCreateChannel}
                          onOpenChannel={openChannel}
                        />
                      ))
                    ) : (
                      <View
                        style={[
                          styles.unifiedEmptyPanel,
                          {
                            backgroundColor: homePalette.surfaceMuted,
                            borderColor: homePalette.border,
                          },
                        ]}
                      >
                        <Hash size={iconSize['4xl']} color={homePalette.textMuted} />
                        <AppText
                          variant="bodyStrong"
                          style={[styles.unifiedHomeText, { color: homePalette.text }]}
                        >
                          {t('home.unifiedNoChannels')}
                        </AppText>
                        <AppText
                          variant="label"
                          tone="secondary"
                          style={[
                            styles.unifiedEmptyText,
                            styles.unifiedHomeMutedText,
                            { color: homePalette.textMuted },
                          ]}
                        >
                          {t('home.unifiedNoChannelsDesc')}
                        </AppText>
                        <Button
                          variant="primary"
                          size="sm"
                          icon={Plus}
                          onPress={() => openCreateChannel('text')}
                        >
                          {t('home.unifiedCreateChannel')}
                        </Button>
                      </View>
                    )}
                  </Reanimated.ScrollView>,
                  <UnifiedWorkspaceFilesPage
                    nodes={sortedWorkspaceNodes}
                    t={t}
                    onOpenFile={openWorkspaceFile}
                    onOpenFolder={(node) => {
                      selectionHaptic()
                      setWorkspaceFolderStack((stack) => [...stack, node])
                    }}
                    onBack={() => {
                      selectionHaptic()
                      setWorkspaceFolderStack((stack) => stack.slice(0, -1))
                    }}
                    canGoBack={workspaceFolderStack.length > 0}
                    currentFolderName={currentWorkspaceFolder?.name}
                  />,
                ]}
              />
            </View>
          ) : (
            <View style={styles.unifiedEmptyWrap}>
              <EmptyState
                icon={MessageCircle}
                title={t('server.noServers')}
                description={t('server.noServersDesc')}
              />
              <Button
                variant="primary"
                size="lg"
                icon={Plus}
                onPress={() => setShowCreateMenu(true)}
              >
                {t('home.createServerAction')}
              </Button>
            </View>
          )}
        </View>
      </View>

      <UnifiedCommandCenterModal
        visible={showCommandCenter}
        bottomInset={insets.bottom}
        commandCandidates={commandCandidates}
        searchQuery={searchQuery}
        commandSearchInputRef={commandSearchInputRef}
        commandDismissPanResponder={commandDismissPanResponder}
        onSearchQueryChange={setSearchQuery}
        onClose={() => setShowCommandCenter(false)}
        onOpenCandidate={openCommandCandidate}
      />

      <UnifiedDirectMessagePickerSheet
        visible={showDirectMessagePicker}
        directMessages={directMessages}
        onClose={() => setShowDirectMessagePicker(false)}
        onOpenChannel={openDirectChannel}
        onOpenFriends={() => {
          setShowDirectMessagePicker(false)
          router.push('/(main)/friends' as never)
        }}
      />

      <UnifiedCreateMenuModal
        visible={showCreateMenu}
        panelLeft={createMenuPanelLeft}
        panelTop={createMenuPanelTop}
        arrowLeft={createMenuArrowLeft}
        onClose={() => setShowCreateMenu(false)}
        onCreateServer={() => {
          setShowCreateMenu(false)
          setShowCreateServer(true)
        }}
        onCreateBuddy={() => {
          setShowCreateMenu(false)
          router.push('/(main)/create-buddy' as never)
        }}
        onOpenDm={() => {
          setShowCreateMenu(false)
          setShowDirectMessagePicker(true)
        }}
        onAddFriend={() => {
          setShowCreateMenu(false)
          router.push('/(main)/friends/new-friends' as never)
        }}
        onScan={() => {
          setShowCreateMenu(false)
          router.push('/(main)/scan' as never)
        }}
      />

      <UnifiedCreateServerSheet
        visible={showCreateServer}
        createName={createName}
        isPublic={isPublic}
        isPending={createMutation.isPending}
        onClose={() => setShowCreateServer(false)}
        onCreate={() => createMutation.mutate()}
        onNameChange={setCreateName}
        onPublicChange={setIsPublic}
      />
    </BackgroundSurface>
  )
}
