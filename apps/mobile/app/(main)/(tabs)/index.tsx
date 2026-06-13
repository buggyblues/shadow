import AsyncStorage from '@react-native-async-storage/async-storage'
import MaskedView from '@react-native-masked-view/masked-view'
import { type Channel, normalizeBuddyRuntimePresenceStatus } from '@shadowob/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BlurView } from 'expo-blur'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import {
  AppWindow,
  BookOpen,
  Bot,
  ChevronDown,
  ChevronRight,
  Compass,
  File,
  FolderOpen,
  Hash,
  Lock,
  type LucideIcon,
  Megaphone,
  MessageCircle,
  MoreHorizontal,
  PawPrint,
  Plus,
  QrCode,
  Repeat2,
  Search,
  Server,
  ShoppingBag,
  User,
  UserPlus,
  Users,
  Volume2,
  X,
} from 'lucide-react-native'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native'
import Reanimated, {
  Extrapolation,
  FadeInRight,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import { Avatar } from '../../../src/components/common/avatar'
import {
  ChannelCatSvg,
  HelpBuddySvg,
  HelpProductSvg,
  HelpStartSvg,
  WorkCatSvg,
} from '../../../src/components/common/cat-svg'
import { EmptyState } from '../../../src/components/common/empty-state'
import { LoadingScreen } from '../../../src/components/common/loading-screen'
import {
  AppSwitch,
  AppText,
  BackgroundSurface,
  Badge,
  Button,
  IconBubble,
  IconButton,
  InteractiveSheet,
  ListHeader,
  MobileNavigationBar,
  MotionPressable,
  SurfaceList,
  SurfaceListItem,
  TextField,
} from '../../../src/components/ui'
import { useChannelSort } from '../../../src/hooks/use-channel-sort'
import { API_BASE, fetchApi, getImageUrl } from '../../../src/lib/api'
import { selectionHaptic } from '../../../src/lib/haptics'
import { animateNextLayout } from '../../../src/lib/layout-animation'
import { serverChannelHref } from '../../../src/lib/routes'
import { showToast } from '../../../src/lib/toast'
import { useAuthStore } from '../../../src/stores/auth.store'
import { useChatStore } from '../../../src/stores/chat.store'
import { useUIStore } from '../../../src/stores/ui.store'
import {
  border,
  fontSize,
  iconSize,
  letterSpacing,
  lineHeight,
  palette,
  radius,
  size,
  spacing,
  useColors,
} from '../../../src/theme'

interface ServerEntry {
  server: {
    id: string
    name: string
    slug: string | null
    iconUrl: string | null
    bannerUrl?: string | null
    description?: string | null
    isPublic?: boolean
    memberCount?: number
    channelCount?: number
  }
  member: {
    role: string
  }
}

type HomeVariant = 'unified' | 'legacy'

interface HomeVariantProps {
  onChangeHomeVariant: (variant: HomeVariant) => void
}

interface UnifiedChannel extends Channel {
  categoryId?: string | null
  isPrivate?: boolean
}

type ServerDetail = ServerEntry['server'] & {
  ownerId?: string
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
    lastHeartbeat?: string | null
    user: {
      id: string
      username: string
      displayName: string | null
      avatarUrl: string | null
      status?: string | null
    }
  }
  channel: UnifiedChannel | null
  canManage: boolean
}

interface UnifiedServerMember {
  userId?: string
  nickname?: string | null
  role: string
  totalOnlineSeconds?: number | null
  agent?: {
    ownerId?: string | null
    status?: string | null
    lastHeartbeat?: string | null
    totalOnlineSeconds?: number | null
    config?: Record<string, unknown> | null
  } | null
  creator?: {
    uid: string
    nickname?: string | null
    username?: string | null
    avatarUrl?: string | null
  } | null
  user: {
    id: string
    username: string
    displayName?: string | null
    avatarUrl?: string | null
    status?: string | null
    isBot?: boolean
  }
}

interface UnifiedWorkspaceNode {
  id: string
  kind: 'dir' | 'file'
  name: string
  ext?: string | null
  mime?: string | null
  mimeType?: string | null
  sizeBytes?: number | null
  contentRef?: string | null
  previewUrl?: string | null
  url?: string | null
  path?: string | null
  type?: 'file' | 'folder'
  size?: number | null
  pos?: number | null
}

type CommandCandidate =
  | {
      id: string
      kind: 'server'
      label: string
      meta: string
      server: ServerEntry
    }
  | {
      id: string
      kind: 'channel'
      label: string
      meta: string
      channel: Channel
      server: ServerEntry
    }
  | {
      id: string
      kind: 'app'
      label: string
      meta: string
      app: ServerAppIntegration
    }
  | {
      id: string
      kind: 'inbox'
      label: string
      meta: string
      inbox: BuddyInboxEntry
      server: ServerEntry
    }
  | {
      id: string
      kind: 'utility'
      label: string
      meta: string
      utility: 'workspace' | 'shop' | 'members'
      icon: LucideIcon
    }

interface ScopedUnread {
  channelUnread?: Record<string, number>
  serverUnread?: Record<string, number>
}

interface GlobalSearchServerData {
  server: ServerEntry
  channels: UnifiedChannel[]
  inboxes: BuddyInboxEntry[]
}

interface InboxOpenRequest {
  server: ServerEntry
  entry: BuddyInboxEntry
}

type CreateMenuAnchor = {
  x: number
  y: number
  width: number
  height: number
}

const HOME_VARIANT_STORAGE_KEY = 'mobileHomeVariant'

const CHANNEL_TYPE_ICONS = {
  announcement: Megaphone,
  text: Hash,
  voice: Volume2,
} as const

const UNIFIED_HEADER_COLLAPSE_DISTANCE = size.navBar + spacing['4xl']
const UNIFIED_HEADER_COVER_EXTRA_HEIGHT = spacing['4xl']
const UNIFIED_HOME_BASE_COLOR = palette.foundation
const UNIFIED_HOME_TEXT_COLOR = palette.neutral50
const UNIFIED_HOME_TEXT_SECONDARY_COLOR = palette.neutral300
const UNIFIED_HOME_TEXT_MUTED_COLOR = palette.neutral400
const UNIFIED_HOME_ACCENT_COLOR = palette.cyan
const UNIFIED_HOME_DANGER_COLOR = palette.crimson
const UNIFIED_HOME_SURFACE_COLOR = palette.surface
const UNIFIED_HOME_SURFACE_MUTED_COLOR = palette.neutral800
const UNIFIED_HOME_BORDER_COLOR = palette.lineDark
const UNIFIED_CREATE_MENU_ARROW_SIZE = spacing.md

type SignedWorkspaceMediaUrl = {
  url: string
  expiresAt: string
}

function getServerPath(server: ServerEntry['server']) {
  return `/(main)/servers/${server.slug ?? server.id}` as const
}

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

function buddyInboxPresenceStatus(entry: BuddyInboxEntry, isOpening: boolean) {
  if (isOpening) return 'busy'
  return normalizeBuddyRuntimePresenceStatus({
    userStatus: entry.agent.user.status,
    agentStatus: entry.agent.status,
    lastHeartbeat: entry.agent.lastHeartbeat,
  })
}

function FrostedBackdrop({ strong = false, muted = false }: { strong?: boolean; muted?: boolean }) {
  const colors = useColors()
  const overlayColor = strong
    ? colors.frostedPanelStrong
    : muted
      ? colors.frostedPanelMuted
      : colors.frostedPanel

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <BlurView
        intensity={colors.mode === 'dark' ? 34 : 44}
        tint={colors.mode === 'dark' ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
      />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: overlayColor }]} />
    </View>
  )
}

function HeaderCoverOpacityMask() {
  return (
    <View style={styles.headerCoverOpacityMask}>
      <Svg pointerEvents="none" width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="home-cover-alpha" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={palette.black} stopOpacity="1" />
            <Stop offset="0.36" stopColor={palette.black} stopOpacity="0.94" />
            <Stop offset="0.62" stopColor={palette.black} stopOpacity="0.54" />
            <Stop offset="0.82" stopColor={palette.black} stopOpacity="0.18" />
            <Stop offset="1" stopColor={palette.black} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#home-cover-alpha)" />
      </Svg>
    </View>
  )
}

function RailCoverFade() {
  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill} preserveAspectRatio="none">
      <Defs>
        <LinearGradient id="home-rail-fade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={UNIFIED_HOME_BASE_COLOR} stopOpacity="0" />
          <Stop offset="0.22" stopColor={UNIFIED_HOME_BASE_COLOR} stopOpacity="0.74" />
          <Stop offset="0.38" stopColor={UNIFIED_HOME_BASE_COLOR} stopOpacity="0.96" />
          <Stop offset="1" stopColor={UNIFIED_HOME_BASE_COLOR} stopOpacity="1" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#home-rail-fade)" />
    </Svg>
  )
}

export default function ServersScreen() {
  const [homeVariant, setHomeVariantState] = useState<HomeVariant>('unified')

  useEffect(() => {
    AsyncStorage.getItem(HOME_VARIANT_STORAGE_KEY).then((value) => {
      if (value === 'legacy' || value === 'unified') {
        setHomeVariantState(value)
      }
    })
  }, [])

  const handleChangeHomeVariant = (variant: HomeVariant) => {
    selectionHaptic()
    setHomeVariantState(variant)
    void AsyncStorage.setItem(HOME_VARIANT_STORAGE_KEY, variant)
  }

  if (homeVariant === 'legacy') {
    return <LegacyServersScreen onChangeHomeVariant={handleChangeHomeVariant} />
  }

  return <UnifiedServersScreen onChangeHomeVariant={handleChangeHomeVariant} />
}

function LegacyServersScreen({ onChangeHomeVariant }: HomeVariantProps) {
  const { t } = useTranslation()
  const colors = useColors()
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const { width: screenWidth } = useWindowDimensions()

  const [showHelpTutorial, setShowHelpTutorial] = useState(false)
  const [showCreateMenu, setShowCreateMenu] = useState(false)
  const [hideHelpIcon, setHideHelpIcon] = useState(false)
  const [dontShowAgain, setDontShowAgain] = useState(false)
  const [tutorialPageIndex, setTutorialPageIndex] = useState(0)

  useEffect(() => {
    AsyncStorage.getItem('hideHomeHelpIcon').then((val) => {
      if (val === 'true') {
        setHideHelpIcon(true)
      }
    })
  }, [])

  const handleCloseTutorial = async () => {
    if (dontShowAgain) {
      await AsyncStorage.setItem('hideHomeHelpIcon', 'true')
      setHideHelpIcon(true)
    }
    setShowHelpTutorial(false)
  }

  const {
    data: servers = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['servers'],
    queryFn: () => fetchApi<ServerEntry[]>('/api/servers'),
  })

  const { data: pendingReceived = [] } = useQuery({
    queryKey: ['friends-pending'],
    queryFn: () => fetchApi<Array<{ friendshipId: string }>>('/api/friends/pending'),
  })

  const [refreshing, setRefreshing] = useState(false)

  const queryClient = useQueryClient()
  const [showCreateServer, setShowCreateServer] = useState(false)
  const [createName, setCreateName] = useState('')
  const [isPublic, setIsPublic] = useState(true)

  const createMutation = useMutation({
    mutationFn: () =>
      fetchApi<{ id: string; slug: string | null }>('/api/servers', {
        method: 'POST',
        body: JSON.stringify({ name: createName, isPublic }),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      setShowCreateServer(false)
      setCreateName('')
      router.push(`/(main)/servers/${data.slug ?? data.id}`)
    },
  })

  // Group servers by role
  const sections = useMemo(() => {
    const owned = servers.filter((s) => s.member.role === 'owner')
    const others = servers.filter((s) => s.member.role !== 'owner')
    const result: { title: string; data: ServerEntry[] }[] = []
    if (owned.length > 0) result.push({ title: '我创建的', data: owned })
    if (others.length > 0) result.push({ title: '已加入', data: others })
    if (result.length === 0 && servers.length > 0) result.push({ title: '全部', data: servers })
    return result
  }, [servers])

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'owner':
        return '创建者'
      case 'admin':
        return '管理员'
      default:
        return '成员'
    }
  }

  if (isLoading) return <LoadingScreen />

  const tutorialInnerWidth = Math.max(
    280,
    Math.min(screenWidth - spacing['4xl'], size.contentMaxWidth - spacing['4xl']),
  )
  const tutorialPages = [
    {
      key: 'positioning',
      title: '超萌可爱的界面下',
      desc: '隐藏着硬核的生产力工具！你可以在这里拥有自己的 AI 社区、店铺和工作区。',
      tags: ['产品定位', '超级社区', '协作空间'],
      renderIcon: () => <HelpProductSvg size={size.illustrationLg} color={colors.primary} />,
    },
    {
      key: 'server',
      title: '什么是服务器？',
      desc: '服务器是你的社区“主空间”，承载成员、频道、规则和资源。可公开，也可私密。',
      tags: ['成员管理', '公开/私密', '社区中枢'],
      renderIcon: () => <WorkCatSvg width={88} height={88} />,
    },
    {
      key: 'channel',
      title: '什么是频道？',
      desc: '频道是服务器里的话题房间。你可以按讨论主题拆分，让信息更清晰不混乱。',
      tags: ['话题分区', '信息沉淀', '高效沟通'],
      renderIcon: () => <ChannelCatSvg width={88} height={88} />,
    },
    {
      key: 'buddy',
      title: '什么是 Buddy？',
      desc: 'Buddy 是黑猫打工仔：能写代码、审方案、查资料，24 小时在线协作。',
      tags: ['多 Agent', '自动协作', '持续产出'],
      renderIcon: () => <HelpBuddySvg size={size.illustrationLg} color={colors.primary} />,
    },
    {
      key: 'start',
      title: '开始奇妙之旅',
      desc: '点击右上角 + 创建服务器，接着建频道、邀请成员，再召唤 Buddy 开始协作。',
      tags: ['创建服务器', '搭建频道', '召唤 Buddy'],
      renderIcon: () => <HelpStartSvg size={size.illustrationLg} color={palette.indigo} />,
    },
  ]
  const listSections: Array<{ title: string; data: ServerEntry[] }> = sections

  return (
    <BackgroundSurface>
      <MobileNavigationBar
        title={t('server.home')}
        left={
          <Pressable
            onPress={() => {
              router.push('/(main)/dashboard' as never)
            }}
            hitSlop={spacing.sm}
          >
            <Avatar
              uri={user?.avatarUrl}
              name={user?.displayName || user?.username || ''}
              size={size.controlLg}
              userId={user?.id || ''}
              status={user?.status ?? 'offline'}
              showStatus
            />
          </Pressable>
        }
        right={
          <View style={styles.navActions}>
            {!hideHelpIcon && (
              <IconButton
                icon={BookOpen}
                variant="glass"
                size="icon"
                iconColor={colors.textSecondary}
                onPress={() => setShowHelpTutorial(true)}
                hitSlop={spacing.sm}
                style={styles.navBtn}
              />
            )}
            <IconButton
              variant="primary"
              size="icon"
              icon={Plus}
              iconSize={iconSize.xl}
              onPress={() => setShowCreateMenu(true)}
              style={styles.navBtn}
            />
          </View>
        }
      />

      {servers.length === 0 ? (
        <EmptyState
          icon={MessageCircle}
          title="暂无服务器"
          description="点击右上角 + 创建或加入一个服务器"
        />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
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
          contentContainerStyle={styles.listContent}
        >
          <View style={styles.quickEntryWrapper}>
            <SurfaceList style={styles.edgeList}>
              <SurfaceListItem
                onPress={() => router.push('/(main)/friends' as never)}
                style={styles.quickEntryCard}
              >
                <IconBubble
                  icon={MessageCircle}
                  tone="primary"
                  size={iconSize.xl}
                  style={styles.actionBubbleGlow}
                />
                <View style={styles.quickEntryInfo}>
                  <AppText variant="bodyStrong">好友与私信</AppText>
                  <AppText variant="label" tone="secondary">
                    查看好友、请求与私信会话
                  </AppText>
                </View>
                {pendingReceived.length > 0 && (
                  <Badge variant="danger" size="xs">
                    {pendingReceived.length}
                  </Badge>
                )}
                <ChevronRight size={iconSize.md} color={colors.textMuted} />
              </SurfaceListItem>

              <SurfaceListItem
                last
                onPress={() => router.push('/(main)/discover' as never)}
                style={styles.quickEntryCard}
              >
                <IconBubble
                  icon={Compass}
                  tone="primary"
                  size={iconSize.xl}
                  style={styles.actionBubbleGlow}
                />
                <View style={styles.quickEntryInfo}>
                  <AppText variant="bodyStrong">探索服务器</AppText>
                  <AppText variant="label" tone="secondary">
                    发现公开服务器并快速加入
                  </AppText>
                </View>
                <ChevronRight size={iconSize.md} color={colors.textMuted} />
              </SurfaceListItem>
            </SurfaceList>
          </View>

          {listSections.map((section) => (
            <View key={section.title} style={styles.serverSection}>
              <ListHeader
                title={section.title}
                count={section.data.length}
                style={styles.sectionHeader}
              />
              <SurfaceList style={styles.serverList}>
                {section.data.map((item, index) => {
                  const isPublicResult = item.member.role === '_public'
                  const desc = isPublicResult
                    ? item.server.description || '公开服务器'
                    : item.server.description || getRoleLabel(item.member.role)
                  const isLast = index === section.data.length - 1
                  return (
                    <Reanimated.View
                      key={item.server.id}
                      entering={FadeInRight.delay(index * 40).springify()}
                    >
                      <SurfaceListItem
                        last={isLast}
                        style={styles.serverCard}
                        onPress={() => {
                          if (isPublicResult) {
                            router.push('/(main)/discover' as never)
                          } else {
                            router.push(`/(main)/servers/${item.server.slug ?? item.server.id}`)
                          }
                        }}
                      >
                        <Avatar
                          uri={item.server.iconUrl}
                          name={item.server.name}
                          size={size.controlLg}
                          userId={item.server.id}
                          shape="server"
                        />
                        <View style={styles.serverInfo}>
                          <View style={styles.serverTopRow}>
                            <Text
                              style={[styles.serverName, { color: colors.text }]}
                              numberOfLines={1}
                            >
                              {item.server.isPublic === false && (
                                <Lock size={iconSize.xs} color={colors.textMuted} />
                              )}
                              {item.server.isPublic === false ? ' ' : ''}
                              {item.server.name}
                            </Text>
                          </View>
                          {!isPublicResult && (
                            <View style={styles.serverMetaRow}>
                              <Hash size={iconSize.xs} color={colors.textMuted} />
                              <Text style={[styles.serverMeta, { color: colors.textMuted }]}>
                                {item.server.channelCount ?? 0}
                              </Text>
                            </View>
                          )}
                          {isPublicResult && (
                            <Text
                              style={[styles.serverDesc, { color: colors.textMuted }]}
                              numberOfLines={1}
                            >
                              {desc}
                            </Text>
                          )}
                        </View>
                        <ChevronRight size={iconSize.md} color={colors.textMuted} />
                      </SurfaceListItem>
                    </Reanimated.View>
                  )
                })}
              </SurfaceList>
            </View>
          ))}
        </ScrollView>
      )}

      <InteractiveSheet
        visible={showCreateMenu}
        onClose={() => setShowCreateMenu(false)}
        title={t('common.create')}
        snapPoints={['34%']}
      >
        <SurfaceList style={styles.edgeList}>
          <SurfaceListItem
            onPress={() => {
              setShowCreateMenu(false)
              setShowCreateServer(true)
            }}
            style={styles.menuItem}
          >
            <IconBubble icon={Server} tone="primary" size={iconSize.xl} />
            <AppText variant="bodyStrong" style={styles.menuLabel}>
              {t('home.createServerAction')}
            </AppText>
            <ChevronRight size={iconSize.md} color={colors.textMuted} />
          </SurfaceListItem>
          <SurfaceListItem
            onPress={() => {
              setShowCreateMenu(false)
              router.push('/(main)/create-buddy' as never)
            }}
            style={styles.menuItem}
          >
            <IconBubble icon={Bot} tone="primary" size={iconSize.xl} />
            <AppText variant="bodyStrong" style={styles.menuLabel}>
              {t('home.createBuddyAction')}
            </AppText>
            <ChevronRight size={iconSize.md} color={colors.textMuted} />
          </SurfaceListItem>
          <SurfaceListItem
            onPress={() => {
              setShowCreateMenu(false)
              router.push('/(main)/scan' as never)
            }}
            style={styles.menuItem}
          >
            <IconBubble icon={QrCode} tone="success" size={iconSize.xl} />
            <AppText variant="bodyStrong" style={styles.menuLabel}>
              {t('home.scanAction')}
            </AppText>
            <ChevronRight size={iconSize.md} color={colors.textMuted} />
          </SurfaceListItem>
          <SurfaceListItem
            last
            onPress={() => {
              setShowCreateMenu(false)
              onChangeHomeVariant('unified')
            }}
            style={styles.menuItem}
          >
            <IconBubble icon={Repeat2} tone="accent" size={iconSize.xl} />
            <AppText variant="bodyStrong" style={styles.menuLabel}>
              {t('home.unifiedSwitchToNew')}
            </AppText>
            <ChevronRight size={iconSize.md} color={colors.textMuted} />
          </SurfaceListItem>
        </SurfaceList>
      </InteractiveSheet>

      <InteractiveSheet
        visible={showCreateServer}
        onClose={() => setShowCreateServer(false)}
        title={t('server.createTitle')}
        subtitle={t('server.createSubtitle')}
        snapPoints={['42%', '64%']}
        footer={
          <Button
            variant="primary"
            size="lg"
            onPress={() => createMutation.mutate()}
            disabled={!createName.trim() || createMutation.isPending}
            loading={createMutation.isPending}
          >
            {t('server.create')}
          </Button>
        }
      >
        <TextField
          label={t('server.nameLabel')}
          style={styles.input}
          value={createName}
          onChangeText={setCreateName}
          placeholder={t('server.namePlaceholder')}
          autoFocus
        />
        <MotionPressable
          accessibilityRole="switch"
          onPress={() => setIsPublic(!isPublic)}
          contentStyle={styles.switchRow}
        >
          <AppText variant="bodyStrong">{t('server.publicServer')}</AppText>
          <AppSwitch value={isPublic} onValueChange={setIsPublic} />
        </MotionPressable>
      </InteractiveSheet>

      <InteractiveSheet
        visible={showHelpTutorial}
        onClose={() => void handleCloseTutorial()}
        title={t('home.tutorialTitle')}
        snapPoints={['78%']}
      >
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(event) => {
            const next = Math.round(event.nativeEvent.contentOffset.x / tutorialInnerWidth)
            setTutorialPageIndex(Math.max(0, Math.min(next, tutorialPages.length - 1)))
          }}
          style={[
            styles.tutorialCarousel,
            {
              width: tutorialInnerWidth,
              height: tutorialInnerWidth,
              maxHeight: size.tutorialMaxHeight,
              backgroundColor: colors.frostedPanelMuted,
            },
          ]}
        >
          {tutorialPages.map((page) => (
            <View key={page.key} style={[styles.tutorialPage, { width: tutorialInnerWidth }]}>
              {page.renderIcon()}
              <Text style={[styles.tutorialPageTitle, { color: colors.text }]}>{page.title}</Text>
              <Text style={[styles.tutorialPageDesc, { color: colors.textMuted }]}>
                {page.desc}
              </Text>
              <View style={styles.tutorialTagRow}>
                {page.tags.map((tag) => (
                  <View
                    key={`${page.key}-${tag}`}
                    style={[styles.tutorialTag, { backgroundColor: colors.activePill }]}
                  >
                    <Text style={[styles.tutorialTagText, { color: colors.primary }]}>{tag}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>

        <View style={styles.tutorialIndicatorRow}>
          {tutorialPages.map((page, idx) => (
            <View
              key={`dot-${page.key}`}
              style={[
                styles.tutorialIndicatorDot,
                {
                  backgroundColor:
                    idx === tutorialPageIndex ? colors.primary : colors.frostedBorder,
                  width: idx === tutorialPageIndex ? 16 : 7,
                },
              ]}
            />
          ))}
        </View>

        <MotionPressable
          accessibilityRole="switch"
          onPress={() => setDontShowAgain(!dontShowAgain)}
          contentStyle={styles.switchRow}
        >
          <Text style={[styles.switchLabel, { color: colors.text, fontSize: fontSize.sm }]}>
            {t('home.tutorialDontShowAgain')}
          </Text>
          <AppSwitch value={dontShowAgain} onValueChange={setDontShowAgain} />
        </MotionPressable>

        <Button variant="primary" size="lg" onPress={() => void handleCloseTutorial()}>
          {t('home.tutorialDone')}
        </Button>
      </InteractiveSheet>
    </BackgroundSurface>
  )
}

function memberDisplayName(member: UnifiedServerMember) {
  return member.nickname || member.user.displayName || member.user.username || member.user.id
}

function memberRoleLabel(member: UnifiedServerMember, t: ReturnType<typeof useTranslation>['t']) {
  if (member.role === 'owner') return t('member.roleOwner')
  if (member.role === 'admin') return t('member.roleAdmin')
  return t('member.roleMember')
}

function memberDescription(member: UnifiedServerMember, t: ReturnType<typeof useTranslation>['t']) {
  const agentDescription = member.agent?.config?.description
  if (member.user.isBot && typeof agentDescription === 'string' && agentDescription.trim()) {
    return agentDescription.trim()
  }
  if (member.user.username) return `@${member.user.username}`
  return memberRoleLabel(member, t)
}

function normalizeWorkspaceNode(node: UnifiedWorkspaceNode): UnifiedWorkspaceNode {
  return {
    ...node,
    kind: node.kind ?? (node.type === 'folder' ? 'dir' : 'file'),
    sizeBytes: node.sizeBytes ?? node.size ?? null,
    mime: node.mime ?? node.mimeType ?? null,
  }
}

async function resolveUnifiedWorkspaceMediaUrl(
  serverId: string,
  node: UnifiedWorkspaceNode,
  disposition: 'inline' | 'attachment',
) {
  if (node.contentRef) {
    const params = new URLSearchParams({ disposition, contentRef: node.contentRef })
    const signed = await fetchApi<SignedWorkspaceMediaUrl>(
      `/api/servers/${serverId}/workspace/files/${node.id}/media-url?${params.toString()}`,
    )
    return getImageUrl(signed.url) ?? signed.url
  }

  const fallback = node.previewUrl ?? node.url
  return fallback ? (getImageUrl(fallback) ?? fallback) : null
}

function formatWorkspaceSize(bytes?: number | null) {
  if (!bytes || bytes <= 0) return null
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function UnifiedStackedIconAction({
  icon: Icon,
  onPress,
}: {
  icon: LucideIcon
  onPress: () => void
}) {
  return (
    <MotionPressable onPress={onPress} contentStyle={styles.unifiedStackedIconAction}>
      <Icon size={iconSize.xl} color={UNIFIED_HOME_ACCENT_COLOR} strokeWidth={2.4} />
      <View style={styles.unifiedStackedIconBadge}>
        <Plus size={iconSize.xs} color={UNIFIED_HOME_BASE_COLOR} strokeWidth={3} />
      </View>
    </MotionPressable>
  )
}

function UnifiedMembersPage({
  members,
  onInvite,
  onAddBuddy,
  onOpenAll,
  t,
}: {
  members: UnifiedServerMember[]
  onInvite: () => void
  onAddBuddy: () => void
  onOpenAll: () => void
  t: ReturnType<typeof useTranslation>['t']
}) {
  const visibleMembers = members.slice(0, 14)

  return (
    <View style={styles.unifiedSidePage}>
      <View style={styles.unifiedSideTopRow}>
        <View style={styles.unifiedPageHeaderText}>
          <View style={styles.unifiedSectionHeaderRow}>
            <AppText
              variant="label"
              tone="secondary"
              numberOfLines={1}
              style={[styles.unifiedSectionLabel, styles.unifiedSectionHeaderText]}
            >
              {t('server.members')}
            </AppText>
            <View style={styles.unifiedSectionCountTag}>
              <AppText variant="label" style={styles.unifiedSectionCountText}>
                {members.length}
              </AppText>
            </View>
          </View>
        </View>
        <UnifiedStackedIconAction icon={User} onPress={onInvite} />
        <UnifiedStackedIconAction icon={PawPrint} onPress={onAddBuddy} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.unifiedSideListContent}
      >
        {visibleMembers.map((member, index) => {
          const label = memberDisplayName(member)
          const description = memberDescription(member, t)
          return (
            <MotionPressable
              key={`${member.user.id}-${index}`}
              onPress={onOpenAll}
              contentStyle={[
                styles.unifiedPreviewRow,
                { borderBottomColor: UNIFIED_HOME_BORDER_COLOR },
              ]}
            >
              <Avatar
                uri={member.user.avatarUrl}
                name={label}
                userId={member.user.id}
                size={size.avatarSm}
                status={member.user.status}
                showStatus
              />
              <View style={styles.unifiedPreviewRowText}>
                <View style={styles.unifiedMemberNameRow}>
                  <AppText
                    variant="bodyStrong"
                    numberOfLines={1}
                    style={[styles.unifiedHomeText, styles.unifiedMemberNameText]}
                  >
                    {label}
                  </AppText>
                  {member.user.isBot ? (
                    <View style={styles.unifiedBuddyTag}>
                      <AppText variant="label" style={styles.unifiedBuddyTagText}>
                        {t('common.bot')}
                      </AppText>
                    </View>
                  ) : null}
                </View>
                <AppText
                  variant="label"
                  tone="secondary"
                  numberOfLines={1}
                  style={styles.unifiedHomeMutedText}
                >
                  {description}
                </AppText>
              </View>
              <ChevronRight size={iconSize.md} color={UNIFIED_HOME_TEXT_MUTED_COLOR} />
            </MotionPressable>
          )
        })}
        {visibleMembers.length === 0 ? (
          <View style={styles.unifiedSideEmpty}>
            <AppText variant="label" tone="secondary" style={styles.unifiedHomeMutedText}>
              {t('members.empty', '暂无成员')}
            </AppText>
          </View>
        ) : null}
      </ScrollView>
    </View>
  )
}

function UnifiedWorkspaceFilesPage({
  nodes,
  onOpenWorkspace,
  onOpenFile,
  onOpenFolder,
  onBack,
  canGoBack,
  currentFolderName,
  t,
}: {
  nodes: UnifiedWorkspaceNode[]
  onOpenWorkspace: () => void
  onOpenFile: (node: UnifiedWorkspaceNode) => void
  onOpenFolder: (node: UnifiedWorkspaceNode) => void
  onBack: () => void
  canGoBack: boolean
  currentFolderName?: string | null
  t: ReturnType<typeof useTranslation>['t']
}) {
  const visibleNodes = nodes.slice(0, 10)

  return (
    <View style={styles.unifiedSidePage}>
      <View style={styles.unifiedSideTopRow}>
        {canGoBack ? (
          <MotionPressable onPress={onBack} contentStyle={styles.unifiedSideIconAction}>
            <ChevronRight
              size={iconSize.lg}
              color={UNIFIED_HOME_TEXT_MUTED_COLOR}
              strokeWidth={2.4}
              style={{ transform: [{ rotate: '180deg' }] }}
            />
          </MotionPressable>
        ) : null}
        <View style={styles.unifiedPageHeaderText}>
          <AppText
            variant="label"
            tone="secondary"
            numberOfLines={1}
            style={[styles.unifiedWorkspaceSectionTitle, styles.unifiedSectionHeaderText]}
          >
            {t('server.workspace')}
          </AppText>
          {currentFolderName ? (
            <AppText
              variant="label"
              tone="secondary"
              numberOfLines={1}
              style={styles.unifiedHomeMutedText}
            >
              {currentFolderName}
            </AppText>
          ) : null}
        </View>
        <MotionPressable onPress={onOpenWorkspace} contentStyle={styles.unifiedSideIconAction}>
          <Search size={iconSize.lg} color={UNIFIED_HOME_TEXT_MUTED_COLOR} strokeWidth={2.3} />
        </MotionPressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.unifiedSideListContent}
      >
        {visibleNodes.map((node) => {
          const Icon = node.kind === 'dir' ? FolderOpen : File
          const meta =
            node.kind === 'dir'
              ? t('workspace.folderName')
              : [formatWorkspaceSize(node.sizeBytes), node.ext ?? node.mime]
                  .filter(Boolean)
                  .join(' · ')
          return (
            <MotionPressable
              key={node.id}
              onPress={() => {
                if (node.kind === 'dir') {
                  onOpenFolder(node)
                  return
                }
                onOpenFile(node)
              }}
              contentStyle={[
                styles.unifiedPreviewRow,
                { borderBottomColor: UNIFIED_HOME_BORDER_COLOR },
              ]}
            >
              <View
                style={[
                  styles.unifiedFileIcon,
                  { backgroundColor: UNIFIED_HOME_SURFACE_MUTED_COLOR },
                ]}
              >
                <Icon
                  size={iconSize.xl}
                  color={
                    node.kind === 'dir' ? UNIFIED_HOME_ACCENT_COLOR : UNIFIED_HOME_TEXT_MUTED_COLOR
                  }
                  strokeWidth={2.4}
                />
              </View>
              <View style={styles.unifiedPreviewRowText}>
                <AppText variant="bodyStrong" numberOfLines={1} style={styles.unifiedHomeText}>
                  {node.name}
                </AppText>
                {meta ? (
                  <AppText
                    variant="label"
                    tone="secondary"
                    numberOfLines={1}
                    style={styles.unifiedHomeMutedText}
                  >
                    {meta}
                  </AppText>
                ) : null}
              </View>
              <MoreHorizontal size={iconSize.md} color={UNIFIED_HOME_TEXT_MUTED_COLOR} />
            </MotionPressable>
          )
        })}
        {visibleNodes.length === 0 ? (
          <View style={styles.unifiedSideEmpty}>
            <AppText variant="label" tone="secondary" style={styles.unifiedHomeMutedText}>
              {t('workspace.empty')}
            </AppText>
          </View>
        ) : null}
      </ScrollView>
    </View>
  )
}

function UnifiedServersScreen({ onChangeHomeVariant }: HomeVariantProps) {
  const { t, i18n } = useTranslation()
  const colors = useColors()
  const router = useRouter()
  const queryClient = useQueryClient()
  const insets = useSafeAreaInsets()
  const { width: windowWidth } = useWindowDimensions()
  const user = useAuthStore((s) => s.user)
  const setActiveChannel = useChatStore((s) => s.setActiveChannel)
  const homeCommandPaletteRequestId = useUIStore((s) => s.homeCommandPaletteRequestId)
  const setPendingAction = useUIStore((s) => s.setPendingAction)
  const showCommandCenter = useUIStore((s) => s.homeCommandPaletteOpen)
  const setShowCommandCenter = useUIStore((s) => s.setHomeCommandPaletteOpen)
  const searchQuery = useUIStore((s) => s.homeCommandPaletteQuery)
  const setSearchQuery = useUIStore((s) => s.setHomeCommandPaletteQuery)
  const unifiedHomeBaseColor = UNIFIED_HOME_BASE_COLOR

  const [selectedServerId, setSelectedServerId] = useState<string | null>(null)
  const [previewServer, setPreviewServer] = useState<ServerEntry | null>(null)
  const [showCreateMenu, setShowCreateMenu] = useState(false)
  const [showCreateServer, setShowCreateServer] = useState(false)
  const [collapsedHomeGroups, setCollapsedHomeGroups] = useState<Set<string>>(new Set())
  const [workspaceFolderStack, setWorkspaceFolderStack] = useState<UnifiedWorkspaceNode[]>([])
  const [createName, setCreateName] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const railWidth = size.plusPanelIconLg + spacing.sm
  const panelPageWidth = Math.max(1, windowWidth - railWidth)
  const headerScrollY = useSharedValue(0)
  const handledHomeCommandPaletteRequestIdRef = useRef(0)
  const commandSearchInputRef = useRef<TextInput>(null)
  const createButtonRef = useRef<View>(null)
  const homePagerRef = useRef<ScrollView>(null)
  const didCenterHomePagerRef = useRef(false)
  const [createMenuAnchor, setCreateMenuAnchor] = useState<CreateMenuAnchor | null>(null)
  const expandedHeaderHeight = insets.top + size.controlLg + spacing['3xl']
  const collapsedHeaderHeight = insets.top + size.controlLg + spacing.lg
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
  const createMenuArrowLeft = Math.max(
    spacing.sm,
    activeCreateMenuAnchor.width / 2 - UNIFIED_CREATE_MENU_ARROW_SIZE,
  )

  const headerScrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      headerScrollY.value = event.contentOffset.y
    },
  })

  const headerAnimatedStyle = useAnimatedStyle(() => {
    const pull = Math.max(-headerScrollY.value, spacing.none)
    return {
      height:
        interpolate(
          interpolate(
            headerScrollY.value,
            [spacing.none, UNIFIED_HEADER_COLLAPSE_DISTANCE],
            [spacing.none, 1],
            Extrapolation.CLAMP,
          ),
          [spacing.none, 1],
          [expandedHeaderHeight, collapsedHeaderHeight],
          Extrapolation.CLAMP,
        ) + Math.min(pull * 0.58, size.thumbnailMd),
    }
  })

  const coverAnimatedStyle = useAnimatedStyle(() => {
    const pull = Math.max(-headerScrollY.value, spacing.none)
    const progress = interpolate(
      headerScrollY.value,
      [spacing.none, UNIFIED_HEADER_COLLAPSE_DISTANCE],
      [spacing.none, 1],
      Extrapolation.CLAMP,
    )
    const coverExtra = interpolate(
      progress,
      [spacing.none, 1],
      [UNIFIED_HEADER_COVER_EXTRA_HEIGHT, spacing.none],
      Extrapolation.CLAMP,
    )
    const baseHeight = interpolate(
      progress,
      [spacing.none, 1],
      [expandedHeaderHeight, collapsedHeaderHeight],
      Extrapolation.CLAMP,
    )
    return {
      height: baseHeight + coverExtra + Math.min(pull * 0.96, size.thumbnailMd * 1.8),
      transform: [
        { scaleX: 1 + Math.min(pull / 1600, 0.035) },
        { scaleY: 1 + Math.min(pull / 620, 0.14) },
      ],
    }
  })

  const refreshIndicatorAnimatedStyle = useAnimatedStyle(() => {
    const pull = Math.max(-headerScrollY.value, spacing.none)
    const progress = interpolate(
      headerScrollY.value,
      [spacing.none, UNIFIED_HEADER_COLLAPSE_DISTANCE],
      [spacing.none, 1],
      Extrapolation.CLAMP,
    )
    const headerHeight =
      interpolate(
        progress,
        [spacing.none, 1],
        [expandedHeaderHeight, collapsedHeaderHeight],
        Extrapolation.CLAMP,
      ) + Math.min(pull * 0.58, size.thumbnailMd)

    return {
      top:
        headerHeight +
        interpolate(
          pull,
          [spacing.none, size.thumbnailMd],
          [-spacing.md, spacing.md],
          Extrapolation.CLAMP,
        ),
      opacity: refreshing
        ? 1
        : interpolate(
            pull,
            [spacing.none, size.plusPanelIcon],
            [spacing.none, 0.86],
            Extrapolation.CLAMP,
          ),
      transform: [
        {
          scale: interpolate(pull, [spacing.none, size.controlLg], [0.84, 1], Extrapolation.CLAMP),
        },
      ],
    }
  })

  const workspaceBodyBackdropAnimatedStyle = useAnimatedStyle(() => {
    const pull = Math.max(-headerScrollY.value, spacing.none)
    const progress = interpolate(
      headerScrollY.value,
      [spacing.none, UNIFIED_HEADER_COLLAPSE_DISTANCE],
      [spacing.none, 1],
      Extrapolation.CLAMP,
    )
    const coverExtra = interpolate(
      progress,
      [spacing.none, 1],
      [UNIFIED_HEADER_COVER_EXTRA_HEIGHT, spacing.none],
      Extrapolation.CLAMP,
    )
    return {
      top:
        interpolate(
          progress,
          [spacing.none, 1],
          [expandedHeaderHeight, collapsedHeaderHeight],
          Extrapolation.CLAMP,
        ) +
        coverExtra +
        Math.min(pull * 0.58, size.thumbnailMd),
    }
  })

  useEffect(() => {
    if (homeCommandPaletteRequestId <= handledHomeCommandPaletteRequestIdRef.current) return
    handledHomeCommandPaletteRequestIdRef.current = homeCommandPaletteRequestId
    setShowCommandCenter(true)
    setPendingAction(null)
  }, [homeCommandPaletteRequestId, setPendingAction, setShowCommandCenter])

  useEffect(() => {
    if (!showCommandCenter) return

    const frame = requestAnimationFrame(() => {
      commandSearchInputRef.current?.focus()
    })
    const timers = [80, 220, 420].map((delay) =>
      setTimeout(() => {
        commandSearchInputRef.current?.focus()
      }, delay),
    )

    return () => {
      cancelAnimationFrame(frame)
      timers.forEach(clearTimeout)
    }
  }, [showCommandCenter])

  const commandDismissPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          showCommandCenter &&
          gesture.dy > spacing.sm &&
          Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderRelease: (_event, gesture) => {
          if (gesture.dy > spacing['2xl']) {
            setShowCommandCenter(false)
          }
        },
      }),
    [setShowCommandCenter, showCommandCenter],
  )

  const {
    data: servers = [],
    isLoading,
    refetch: refetchServers,
  } = useQuery({
    queryKey: ['servers'],
    queryFn: () => fetchApi<ServerEntry[]>('/api/servers'),
  })

  const { data: scopedUnread } = useQuery<ScopedUnread>({
    queryKey: ['notification-scoped-unread'],
    queryFn: () => fetchApi<ScopedUnread>('/api/notifications/scoped-unread'),
  })

  const joinedServers = useMemo(
    () => servers.filter((entry) => entry.member.role !== '_public'),
    [servers],
  )
  const railServers = joinedServers
  const selectedServer = useMemo(
    () => joinedServers.find((entry) => entry.server.id === selectedServerId) ?? joinedServers[0],
    [joinedServers, selectedServerId],
  )
  const joinedServerIdsKey = useMemo(
    () => joinedServers.map((entry) => entry.server.id).join('|'),
    [joinedServers],
  )
  const selectedServerSlug = selectedServer?.server.slug ?? selectedServer?.server.id
  const { sortChannels, updateLastAccessed } = useChannelSort(selectedServer?.server.id)
  const currentWorkspaceFolder = workspaceFolderStack[workspaceFolderStack.length - 1]

  useEffect(() => {
    didCenterHomePagerRef.current = false
    setWorkspaceFolderStack([])
    const timer = setTimeout(() => {
      if (didCenterHomePagerRef.current) return
      didCenterHomePagerRef.current = true
      homePagerRef.current?.scrollTo({ x: panelPageWidth, y: 0, animated: false })
    }, 80)
    return () => clearTimeout(timer)
  }, [panelPageWidth, selectedServer?.server.id])

  const { data: selectedServerDetail, refetch: refetchServerDetail } = useQuery<ServerDetail>({
    queryKey: ['home-unified-server', selectedServerSlug],
    queryFn: () => fetchApi<ServerDetail>(`/api/servers/${selectedServerSlug}`),
    enabled: Boolean(selectedServerSlug && selectedServer?.member.role !== '_public'),
  })
  const displayServer =
    selectedServerDetail && selectedServer
      ? {
          ...selectedServer.server,
          ...selectedServerDetail,
          bannerUrl: selectedServerDetail.bannerUrl ?? selectedServer.server.bannerUrl,
          iconUrl: selectedServerDetail.iconUrl ?? selectedServer.server.iconUrl,
        }
      : (selectedServerDetail ?? selectedServer?.server)
  const bannerImageUrl = getImageUrl(displayServer?.bannerUrl)
  const headerCoverSource = bannerImageUrl ? { uri: bannerImageUrl } : null

  const {
    data: rawChannels = [],
    isLoading: isChannelsLoading,
    refetch: refetchChannels,
  } = useQuery<UnifiedChannel[]>({
    queryKey: ['home-unified-channels', selectedServer?.server.id],
    queryFn: () => fetchApi<UnifiedChannel[]>(`/api/servers/${selectedServer!.server.id}/channels`),
    enabled: Boolean(selectedServer?.server.id && selectedServer?.member.role !== '_public'),
  })

  const {
    data: serverApps = [],
    isLoading: isServerAppsLoading,
    refetch: refetchServerApps,
  } = useQuery<ServerAppIntegration[]>({
    queryKey: ['home-unified-server-apps', selectedServerSlug, i18n.language],
    queryFn: () => fetchApi<ServerAppIntegration[]>(`/api/servers/${selectedServerSlug}/apps`),
    enabled: Boolean(selectedServerSlug && selectedServer?.member.role !== '_public'),
  })

  const {
    data: inboxes = [],
    isLoading: isInboxesLoading,
    refetch: refetchInboxes,
  } = useQuery<BuddyInboxEntry[]>({
    queryKey: ['home-unified-server-inboxes', selectedServer?.server.id],
    queryFn: () => fetchApi<BuddyInboxEntry[]>(`/api/servers/${selectedServer!.server.id}/inboxes`),
    enabled: Boolean(selectedServer?.server.id && selectedServer?.member.role !== '_public'),
  })

  const { data: globalSearchServers = [] } = useQuery<GlobalSearchServerData[]>({
    queryKey: ['home-unified-global-search-data', joinedServerIdsKey],
    queryFn: async () =>
      Promise.all(
        joinedServers.map(async (entry) => {
          if (entry.member.role === '_public') {
            return { server: entry, channels: [], inboxes: [] }
          }

          const [channelsResult, inboxesResult] = await Promise.allSettled([
            fetchApi<UnifiedChannel[]>(`/api/servers/${entry.server.id}/channels`),
            fetchApi<BuddyInboxEntry[]>(`/api/servers/${entry.server.id}/inboxes`),
          ])

          return {
            server: entry,
            channels: channelsResult.status === 'fulfilled' ? channelsResult.value : [],
            inboxes: inboxesResult.status === 'fulfilled' ? inboxesResult.value : [],
          }
        }),
      ),
    enabled: joinedServers.length > 0,
    staleTime: 30_000,
  })

  const { data: serverMembers = [], refetch: refetchMembers } = useQuery<UnifiedServerMember[]>({
    queryKey: ['home-unified-members', selectedServerSlug],
    queryFn: () => fetchApi<UnifiedServerMember[]>(`/api/servers/${selectedServerSlug}/members`),
    enabled: Boolean(selectedServerSlug && selectedServer?.member.role !== '_public'),
  })

  const { data: workspaceNodes = [], refetch: refetchWorkspaceNodes } = useQuery<
    UnifiedWorkspaceNode[]
  >({
    queryKey: [
      'home-unified-workspace-nodes',
      selectedServer?.server.id,
      currentWorkspaceFolder?.id,
    ],
    queryFn: () =>
      fetchApi<UnifiedWorkspaceNode[]>(
        `/api/servers/${selectedServer!.server.id}/workspace/children${
          currentWorkspaceFolder?.id ? `?parentId=${currentWorkspaceFolder.id}` : ''
        }`,
      ),
    enabled: Boolean(selectedServer?.server.id && selectedServer?.member.role !== '_public'),
  })

  const createMutation = useMutation({
    mutationFn: () =>
      fetchApi<{ id: string; slug: string | null }>('/api/servers', {
        method: 'POST',
        body: JSON.stringify({ name: createName, isPublic }),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      setShowCreateServer(false)
      setCreateName('')
      router.push(`/(main)/servers/${data.slug ?? data.id}`)
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
      }
    },
    onSuccess: ({ app, url }) => {
      router.push({
        pathname: '/(main)/webview-preview',
        params: {
          url: encodeURIComponent(url),
          title: app.name,
          serverSlug: selectedServerSlug ?? '',
          appKey: app.appKey,
        },
      })
    },
    onError: (error: Error) => showToast(error?.message || t('common.error'), 'error'),
  })

  useEffect(() => {
    if (selectedServerId && joinedServers.some((entry) => entry.server.id === selectedServerId)) {
      return
    }
    setSelectedServerId(joinedServers[0]?.server.id ?? null)
  }, [joinedServers, selectedServerId])

  const channels = useMemo(() => sortChannels(rawChannels), [rawChannels, sortChannels])
  const searchKeyword = searchQuery.trim().toLowerCase()
  const sortedServerMembers = useMemo(
    () =>
      [...serverMembers]
        .filter((member) => member.user?.id)
        .sort((a, b) => {
          if (a.user.isBot !== b.user.isBot) return a.user.isBot ? -1 : 1
          if (a.role !== b.role) {
            const roleRank = { owner: 0, admin: 1, member: 2 } as Record<string, number>
            return (roleRank[a.role] ?? 3) - (roleRank[b.role] ?? 3)
          }
          return memberDisplayName(a).localeCompare(memberDisplayName(b))
        }),
    [serverMembers],
  )
  const sortedWorkspaceNodes = useMemo(
    () =>
      [...workspaceNodes].map(normalizeWorkspaceNode).sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1
        return (a.pos ?? 0) - (b.pos ?? 0) || a.name.localeCompare(b.name)
      }),
    [workspaceNodes],
  )
  const rankedServerSearchData = useMemo(() => {
    const byServerId = new Map<string, GlobalSearchServerData>()
    for (const entry of globalSearchServers) {
      byServerId.set(entry.server.server.id, entry)
    }
    if (selectedServer) {
      byServerId.set(selectedServer.server.id, {
        server: selectedServer,
        channels,
        inboxes,
      })
    }
    return Array.from(byServerId.values()).sort((a, b) => {
      const aCurrent = a.server.server.id === selectedServer?.server.id
      const bCurrent = b.server.server.id === selectedServer?.server.id
      if (aCurrent !== bCurrent) return aCurrent ? -1 : 1
      return a.server.server.name.localeCompare(b.server.server.name)
    })
  }, [channels, globalSearchServers, inboxes, selectedServer])
  const matchedServers = useMemo(() => {
    const rankedServers = [...railServers].sort((a, b) => {
      const aCurrent = a.server.id === selectedServer?.server.id
      const bCurrent = b.server.id === selectedServer?.server.id
      if (aCurrent !== bCurrent) return aCurrent ? -1 : 1
      return a.server.name.localeCompare(b.server.name)
    })
    if (!searchKeyword) return rankedServers
    return rankedServers.filter((entry) =>
      [entry.server.name, entry.server.description]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(searchKeyword)),
    )
  }, [railServers, searchKeyword, selectedServer?.server.id])
  const commandCandidates = useMemo(() => {
    const utilityCandidates: CommandCandidate[] = selectedServerSlug
      ? [
          {
            id: 'utility-workspace',
            kind: 'utility',
            label: t('server.workspace'),
            meta: displayServer?.name ?? t('home.unifiedServerRail'),
            utility: 'workspace',
            icon: FolderOpen,
          },
          {
            id: 'utility-shop',
            kind: 'utility',
            label: t('server.shop'),
            meta: displayServer?.name ?? t('home.unifiedServerRail'),
            utility: 'shop',
            icon: ShoppingBag,
          },
          {
            id: 'utility-members',
            kind: 'utility',
            label: t('server.members'),
            meta: displayServer?.name ?? t('home.unifiedServerRail'),
            utility: 'members',
            icon: Users,
          },
        ]
      : []
    const inboxCandidates: CommandCandidate[] = rankedServerSearchData.flatMap(
      ({ server, inboxes: serverInboxes }) =>
        serverInboxes.map((entry) => {
          const label = entry.agent.user.displayName ?? entry.agent.user.username ?? entry.agent.id
          return {
            id: `inbox-${server.server.id}-${entry.agent.id}`,
            kind: 'inbox' as const,
            label,
            meta: server.server.name,
            inbox: entry,
            server,
          }
        }),
    )
    const channelCandidates: CommandCandidate[] = rankedServerSearchData.flatMap(
      ({ server, channels: serverChannels }) =>
        serverChannels.map((channel) => ({
          id: `channel-${server.server.id}-${channel.id}`,
          kind: 'channel' as const,
          label: channel.name,
          meta: server.server.name,
          channel,
          server,
        })),
    )
    const allCandidates: CommandCandidate[] = [
      ...serverApps.map((app) => ({
        id: `app-${app.id}`,
        kind: 'app' as const,
        label: app.name,
        meta: displayServer?.name ?? t('home.unifiedServerRail'),
        app,
      })),
      ...inboxCandidates,
      ...matchedServers.map((server) => ({
        id: `server-${server.server.id}`,
        kind: 'server' as const,
        label: server.server.name,
        meta: t('home.unifiedServerRail'),
        server,
      })),
      ...channelCandidates,
      ...utilityCandidates,
    ]

    if (!searchKeyword) return allCandidates.slice(0, 12)
    return allCandidates
      .filter((candidate) =>
        [candidate.label, candidate.meta].some((value) =>
          value.toLowerCase().includes(searchKeyword),
        ),
      )
      .slice(0, 16)
  }, [
    displayServer?.name,
    matchedServers,
    rankedServerSearchData,
    searchKeyword,
    selectedServerSlug,
    serverApps,
    t,
  ])

  const channelGroups = useMemo(
    () =>
      [
        {
          key: 'announcement',
          title: t('channel.announcement'),
          data: channels.filter((channel) => channel.type === 'announcement'),
        },
        {
          key: 'text',
          title: t('channel.text'),
          data: channels.filter((channel) => channel.type === 'text'),
        },
        {
          key: 'voice',
          title: t('channel.voice'),
          data: channels.filter((channel) => channel.type === 'voice'),
        },
      ].filter((group) => group.data.length > 0),
    [channels, t],
  )

  const openServer = (entry: ServerEntry) => {
    selectionHaptic()
    if (entry.member.role === '_public') {
      router.push('/(main)/discover' as never)
      return
    }
    setSelectedServerId(entry.server.id)
  }

  const openChannelForServer = (server: ServerEntry, channel: Channel) => {
    const serverSlug = server.server.slug ?? server.server.id
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

  const openServerUtility = (utility: 'workspace' | 'shop' | 'members') => {
    if (!selectedServerSlug) return
    selectionHaptic()
    router.push(`/(main)/servers/${selectedServerSlug}/${utility}` as never)
  }

  const openCreateMenu = () => {
    selectionHaptic()
    const fallbackAnchor = fallbackCreateMenuAnchor
    const openAtAnchor = (anchor: CreateMenuAnchor) => {
      setCreateMenuAnchor(anchor)
      setShowCreateMenu(true)
    }

    if (!createButtonRef.current) {
      openAtAnchor(fallbackAnchor)
      return
    }

    createButtonRef.current.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0) {
        openAtAnchor({ x, y, width, height })
        return
      }
      openAtAnchor(fallbackAnchor)
    })
  }

  const openWorkspaceFile = async (node: UnifiedWorkspaceNode) => {
    if (!selectedServer?.server.id) return
    selectionHaptic()

    try {
      const url = await resolveUnifiedWorkspaceMediaUrl(selectedServer.server.id, node, 'inline')
      if (!url) {
        openServerUtility('workspace')
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

  const refreshHome = async () => {
    setRefreshing(true)
    try {
      await Promise.all([
        refetchServers(),
        selectedServer ? refetchServerDetail() : Promise.resolve(),
        selectedServer ? refetchChannels() : Promise.resolve(),
        selectedServer ? refetchServerApps() : Promise.resolve(),
        selectedServer ? refetchInboxes() : Promise.resolve(),
        selectedServer ? refetchMembers() : Promise.resolve(),
        selectedServer ? refetchWorkspaceNodes() : Promise.resolve(),
      ])
    } finally {
      setRefreshing(false)
    }
  }

  const renderChannelGroup = (group: { key: string; title: string; data: Channel[] }) => {
    const collapsed = collapsedHomeGroups.has(group.key)
    return (
      <View key={group.key} style={styles.unifiedChannelGroup}>
        <MotionPressable
          onPress={() => toggleHomeGroup(group.key)}
          contentStyle={styles.unifiedGroupHeader}
          hitSlop={spacing.sm}
        >
          <View style={styles.unifiedGroupChevron}>
            <ChevronDown
              size={iconSize.sm}
              color={UNIFIED_HOME_TEXT_MUTED_COLOR}
              strokeWidth={2.4}
              style={{ transform: [{ rotate: collapsed ? '-90deg' : '0deg' }] }}
            />
          </View>
          <AppText
            variant="label"
            tone="secondary"
            style={[styles.unifiedGroupTitle, styles.unifiedSectionHeaderText]}
          >
            {group.title}
          </AppText>
        </MotionPressable>
        {collapsed
          ? null
          : group.data.map((channel, index) => (
              <Reanimated.View
                key={channel.id}
                entering={FadeInRight.delay(index * 24).springify()}
              >
                <UnifiedChannelRow
                  channel={channel}
                  unreadCount={scopedUnread?.channelUnread?.[channel.id] ?? 0}
                  onPress={() => openChannel(channel)}
                />
              </Reanimated.View>
            ))}
      </View>
    )
  }

  const renderShortcutShelf = () => {
    const pageWidth = Math.max(
      size.plusPanelIconLg * 4 + spacing.sm * 3,
      windowWidth - (size.plusPanelIcon + spacing.md) - spacing.lg * 2,
    )
    const shortcutTileWidth = (pageWidth - spacing.sm * 3) / 4
    const visibleInboxes = inboxes
    const visibleApps = serverApps
    const shortcutSkeletons = [0, 1, 2, 3]
    const appPages = Array.from({ length: Math.ceil(visibleApps.length / 4) }, (_, index) =>
      visibleApps.slice(index * 4, index * 4 + 4),
    )
    const inboxPages = Array.from({ length: Math.ceil(visibleInboxes.length / 4) }, (_, index) =>
      visibleInboxes.slice(index * 4, index * 4 + 4),
    )

    return (
      <View style={styles.unifiedShortcutStage}>
        {isServerAppsLoading || visibleApps.length > 0 ? (
          <View style={styles.unifiedShortcutGroup}>
            <ScrollView
              horizontal
              pagingEnabled
              snapToInterval={pageWidth + spacing.sm}
              decelerationRate="fast"
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.unifiedShortcutPager}
            >
              {isServerAppsLoading ? (
                <View style={[styles.unifiedShortcutPage, { width: pageWidth }]}>
                  {shortcutSkeletons.map((item) => (
                    <UnifiedShortcutSkeleton
                      key={`app-skeleton-${item}`}
                      width={shortcutTileWidth}
                    />
                  ))}
                </View>
              ) : (
                appPages.map((page, pageIndex) => (
                  <View
                    key={`app-page-${pageIndex}`}
                    style={[styles.unifiedShortcutPage, { width: pageWidth }]}
                  >
                    {page.map((app) => (
                      <UnifiedAppShortcut
                        key={app.id}
                        app={app}
                        width={shortcutTileWidth}
                        disabled={launchAppMutation.isPending}
                        onPress={() => {
                          selectionHaptic()
                          launchAppMutation.mutate(app)
                        }}
                      />
                    ))}
                  </View>
                ))
              )}
            </ScrollView>
            <View
              style={[styles.unifiedAppTrack, { backgroundColor: UNIFIED_HOME_BORDER_COLOR }]}
            />
          </View>
        ) : null}

        {isInboxesLoading || visibleInboxes.length > 0 ? (
          <View style={styles.unifiedShortcutGroup}>
            <View style={styles.unifiedShortcutHeader}>
              <AppText
                variant="label"
                tone="secondary"
                style={[styles.unifiedSectionLabel, styles.unifiedSectionHeaderText]}
              >
                {t('inbox.title')}
              </AppText>
            </View>
            <ScrollView
              horizontal
              pagingEnabled
              snapToInterval={pageWidth + spacing.sm}
              decelerationRate="fast"
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.unifiedShortcutPager}
            >
              {isInboxesLoading ? (
                <View style={[styles.unifiedShortcutPage, { width: pageWidth }]}>
                  {shortcutSkeletons.map((item) => (
                    <UnifiedShortcutSkeleton
                      key={`inbox-skeleton-${item}`}
                      width={shortcutTileWidth}
                    />
                  ))}
                </View>
              ) : (
                inboxPages.map((page, pageIndex) => (
                  <View
                    key={`inbox-page-${pageIndex}`}
                    style={[styles.unifiedShortcutPage, { width: pageWidth }]}
                  >
                    {page.map((entry) => {
                      const label =
                        entry.agent.user.displayName ?? entry.agent.user.username ?? entry.agent.id
                      const openingInboxRequest = ensureInboxMutation.variables
                      const isOpening = Boolean(
                        openingInboxRequest &&
                          openingInboxRequest.entry.agent.id === entry.agent.id &&
                          openingInboxRequest.server.server.id === selectedServer?.server.id,
                      )
                      return (
                        <UnifiedInboxShortcut
                          key={entry.agent.id}
                          entry={entry}
                          label={label}
                          width={shortcutTileWidth}
                          isOpening={isOpening}
                          disabled={!entry.channel && !entry.canManage}
                          onPress={() => {
                            if (!selectedServer) return
                            selectionHaptic()
                            ensureInboxMutation.mutate({ server: selectedServer, entry })
                          }}
                        />
                      )
                    })}
                  </View>
                ))
              )}
            </ScrollView>
            <View
              style={[styles.unifiedAppTrack, { backgroundColor: UNIFIED_HOME_BORDER_COLOR }]}
            />
          </View>
        ) : null}
      </View>
    )
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
    openServerUtility(candidate.utility)
  }

  const renderCommandCandidate = (candidate: CommandCandidate, index: number) => {
    const isLast = index === commandCandidates.length - 1
    const Icon =
      candidate.kind === 'channel'
        ? (CHANNEL_TYPE_ICONS[candidate.channel.type as keyof typeof CHANNEL_TYPE_ICONS] ?? Hash)
        : candidate.kind === 'utility'
          ? candidate.icon
          : null
    const inboxLabel =
      candidate.kind === 'inbox'
        ? (candidate.inbox.agent.user.displayName ??
          candidate.inbox.agent.user.username ??
          candidate.inbox.agent.id)
        : null

    return (
      <Pressable
        key={candidate.id}
        accessibilityRole="button"
        onPress={() => openCommandCandidate(candidate)}
        style={({ pressed }) => [
          styles.commandModalRow,
          { borderBottomColor: isLast ? 'transparent' : colors.frostedBorder },
          pressed ? styles.unifiedPressed : null,
        ]}
      >
        {candidate.kind === 'server' ? (
          <Avatar
            uri={candidate.server.server.iconUrl}
            name={candidate.server.server.name}
            size={size.avatarMd}
            userId={candidate.server.server.id}
            shape="server"
          />
        ) : candidate.kind === 'inbox' ? (
          <Avatar
            uri={candidate.inbox.agent.user.avatarUrl}
            name={inboxLabel ?? candidate.label}
            userId={candidate.inbox.agent.user.id}
            size={size.avatarMd}
            status={buddyInboxPresenceStatus(candidate.inbox, false)}
            showStatus
          />
        ) : candidate.kind === 'app' ? (
          <UnifiedServerAppIcon iconUrl={candidate.app.iconUrl} />
        ) : (
          <View style={[styles.commandModalIcon, { backgroundColor: colors.inputBackground }]}>
            {Icon ? <Icon size={iconSize.xl} color={colors.textMuted} strokeWidth={2.5} /> : null}
          </View>
        )}
        <View style={styles.commandModalTextColumn}>
          <AppText variant="bodyStrong" style={styles.commandModalRowLabel} numberOfLines={1}>
            {candidate.label}
          </AppText>
          <AppText variant="label" tone="secondary" style={styles.commandModalRowMeta}>
            {candidate.meta}
          </AppText>
        </View>
        <ChevronRight size={iconSize.md} color={colors.textMuted} />
      </Pressable>
    )
  }

  if (isLoading) return <LoadingScreen />

  return (
    <BackgroundSurface>
      <View style={[styles.unifiedRoot, { backgroundColor: unifiedHomeBaseColor }]}>
        <Reanimated.View
          pointerEvents="none"
          style={[styles.unifiedPageCoverLayer, coverAnimatedStyle]}
        >
          {headerCoverSource ? (
            <MaskedView
              style={styles.unifiedPageCoverMask}
              maskElement={<HeaderCoverOpacityMask />}
            >
              <Image
                source={headerCoverSource}
                style={styles.unifiedPageCover}
                contentFit="cover"
              />
            </MaskedView>
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.surface }]} />
          )}
        </Reanimated.View>
        <Reanimated.View
          style={[
            styles.unifiedRail,
            {
              borderRightColor: UNIFIED_HOME_BORDER_COLOR,
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
                    backgroundColor: UNIFIED_HOME_SURFACE_COLOR,
                    borderColor: UNIFIED_HOME_BORDER_COLOR,
                    shadowColor: colors.shadowStrong,
                  },
                ]}
              >
                <Plus size={iconSize['3xl']} color={UNIFIED_HOME_TEXT_COLOR} strokeWidth={2.35} />
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
                    onLongPress={() => {
                      selectionHaptic()
                      setPreviewServer(entry)
                    }}
                  />
                )
              })}
            </ScrollView>
          </SafeAreaView>
        </Reanimated.View>

        <View style={styles.unifiedPanel}>
          {selectedServer && displayServer ? (
            <View
              style={[
                styles.unifiedWorkspacePanel,
                {
                  borderColor: UNIFIED_HOME_BORDER_COLOR,
                },
              ]}
            >
              <Reanimated.View
                pointerEvents="none"
                style={[
                  styles.unifiedWorkspaceBodyBackdrop,
                  { backgroundColor: unifiedHomeBaseColor },
                  workspaceBodyBackdropAnimatedStyle,
                ]}
              />
              <Reanimated.View
                pointerEvents="none"
                style={[
                  styles.unifiedRefreshIndicator,
                  {
                    left: (panelPageWidth - size.iconButtonMd) / 2,
                    backgroundColor: UNIFIED_HOME_SURFACE_COLOR,
                    borderColor: UNIFIED_HOME_BORDER_COLOR,
                    shadowColor: colors.shadowStrong,
                  },
                  refreshIndicatorAnimatedStyle,
                ]}
              >
                <ActivityIndicator size="small" color={UNIFIED_HOME_ACCENT_COLOR} />
              </Reanimated.View>
              <Reanimated.View
                style={[
                  styles.unifiedWorkspaceHeader,
                  { borderBottomColor: UNIFIED_HOME_BORDER_COLOR },
                  headerAnimatedStyle,
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
                            size={size.avatarLg}
                            userId={displayServer.id}
                            shape="server"
                          />
                        </View>
                        <View style={styles.unifiedServerTitleBlock}>
                          <AppText
                            variant="title"
                            numberOfLines={1}
                            style={[styles.unifiedServerTitle, styles.unifiedHomeText]}
                          >
                            {displayServer.name}
                          </AppText>
                        </View>
                        <ChevronRight
                          size={iconSize.lg}
                          color={UNIFIED_HOME_TEXT_SECONDARY_COLOR}
                          style={styles.unifiedHeaderIconShadow}
                        />
                      </Pressable>
                    </View>
                  </View>
                </SafeAreaView>
              </Reanimated.View>

              <ScrollView
                ref={homePagerRef}
                horizontal
                pagingEnabled
                bounces={false}
                directionalLockEnabled
                disableIntervalMomentum
                snapToInterval={panelPageWidth}
                snapToAlignment="start"
                showsHorizontalScrollIndicator={false}
                decelerationRate="fast"
                contentOffset={{ x: panelPageWidth, y: 0 }}
                onLayout={() => {
                  if (didCenterHomePagerRef.current) return
                  didCenterHomePagerRef.current = true
                  homePagerRef.current?.scrollTo({ x: panelPageWidth, y: 0, animated: false })
                }}
                style={styles.unifiedPager}
              >
                <View style={[styles.unifiedPagerPage, { width: panelPageWidth }]}>
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
                    onOpenAll={() => openServerUtility('members')}
                  />
                </View>
                <View style={[styles.unifiedPagerPage, { width: panelPageWidth }]}>
                  <Reanimated.ScrollView
                    alwaysBounceVertical
                    bounces
                    contentInsetAdjustmentBehavior="never"
                    showsVerticalScrollIndicator={false}
                    style={styles.unifiedChannelScroll}
                    onScroll={headerScrollHandler}
                    scrollEventThrottle={16}
                    refreshControl={
                      <RefreshControl
                        refreshing={refreshing}
                        onRefresh={refreshHome}
                        tintColor="transparent"
                        titleColor="transparent"
                        progressBackgroundColor={unifiedHomeBaseColor}
                      />
                    }
                    contentContainerStyle={[
                      styles.unifiedChannelList,
                      { paddingBottom: insets.bottom + size.tabBar + spacing['4xl'] },
                    ]}
                  >
                    {renderShortcutShelf()}
                    {isChannelsLoading ? (
                      <View style={styles.unifiedSkeletonStack}>
                        {[0, 1, 2, 3].map((item) => (
                          <View
                            key={item}
                            style={[
                              styles.unifiedSkeletonRow,
                              { backgroundColor: UNIFIED_HOME_SURFACE_MUTED_COLOR },
                            ]}
                          />
                        ))}
                      </View>
                    ) : channelGroups.length > 0 ? (
                      channelGroups.map(renderChannelGroup)
                    ) : (
                      <View
                        style={[
                          styles.unifiedEmptyPanel,
                          {
                            backgroundColor: UNIFIED_HOME_SURFACE_MUTED_COLOR,
                            borderColor: UNIFIED_HOME_BORDER_COLOR,
                          },
                        ]}
                      >
                        <Hash size={iconSize['4xl']} color={UNIFIED_HOME_TEXT_MUTED_COLOR} />
                        <AppText variant="bodyStrong" style={styles.unifiedHomeText}>
                          {t('home.unifiedNoChannels')}
                        </AppText>
                        <AppText
                          variant="label"
                          tone="secondary"
                          style={[styles.unifiedEmptyText, styles.unifiedHomeMutedText]}
                        >
                          {t('home.unifiedNoChannelsDesc')}
                        </AppText>
                        <Button
                          variant="primary"
                          size="sm"
                          icon={Plus}
                          onPress={() =>
                            router.push(
                              `/(main)/servers/${selectedServerSlug}/create-channel` as never,
                            )
                          }
                        >
                          {t('home.unifiedCreateChannel')}
                        </Button>
                      </View>
                    )}
                  </Reanimated.ScrollView>
                </View>
                <View style={[styles.unifiedPagerPage, { width: panelPageWidth }]}>
                  <UnifiedWorkspaceFilesPage
                    nodes={sortedWorkspaceNodes}
                    t={t}
                    onOpenWorkspace={() => openServerUtility('workspace')}
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
                  />
                </View>
              </ScrollView>
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

      <Modal
        visible={showCommandCenter}
        transparent
        animationType="fade"
        onShow={() => commandSearchInputRef.current?.focus()}
        onRequestClose={() => setShowCommandCenter(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
          style={[
            styles.commandModalRoot,
            { paddingBottom: Math.max(insets.bottom + spacing.md, spacing['2xl']) },
          ]}
        >
          <BlurView
            pointerEvents="none"
            intensity={colors.mode === 'dark' ? 24 : 36}
            tint={colors.mode === 'dark' ? 'dark' : 'light'}
            style={StyleSheet.absoluteFill}
          />
          <Pressable
            accessibilityLabel={t('common.close')}
            accessibilityRole="button"
            onPress={() => setShowCommandCenter(false)}
            style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]}
          />
          <View
            style={[
              styles.commandModalResults,
              {
                borderColor: colors.frostedBorder,
                backgroundColor: colors.frostedPanel,
                shadowColor: colors.shadowStrong,
              },
            ]}
            {...commandDismissPanResponder.panHandlers}
          >
            <BlurView
              pointerEvents="none"
              intensity={colors.mode === 'dark' ? 42 : 58}
              tint={colors.mode === 'dark' ? 'dark' : 'light'}
              style={StyleSheet.absoluteFill}
            />
            <View
              pointerEvents="none"
              style={[StyleSheet.absoluteFill, { backgroundColor: colors.frostedPanel }]}
            />
            <ScrollView
              keyboardDismissMode="interactive"
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.unifiedCommandResults}
            >
              {commandCandidates.length > 0 ? (
                commandCandidates.map((candidate, index) =>
                  renderCommandCandidate(candidate, index),
                )
              ) : (
                <AppText variant="label" tone="secondary" style={styles.unifiedCommandEmptyText}>
                  {t('common.noResults')}
                </AppText>
              )}
            </ScrollView>
          </View>
          <View
            style={[
              styles.commandModalSearchPill,
              {
                borderColor: colors.frostedBorder,
                backgroundColor: colors.frostedPanel,
                shadowColor: colors.shadowStrong,
              },
            ]}
            {...commandDismissPanResponder.panHandlers}
          >
            <BlurView
              pointerEvents="none"
              intensity={colors.mode === 'dark' ? 46 : 62}
              tint={colors.mode === 'dark' ? 'dark' : 'light'}
              style={StyleSheet.absoluteFill}
            />
            <View
              pointerEvents="none"
              style={[StyleSheet.absoluteFill, { backgroundColor: colors.frostedPanel }]}
            />
            <View style={styles.commandModalSearchIconBox}>
              <Search size={iconSize['5xl']} color={colors.primary} strokeWidth={2.6} />
            </View>
            <View style={styles.commandModalSearchInputBox}>
              <TextInput
                ref={commandSearchInputRef}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder={t('common.search')}
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                autoComplete="off"
                showSoftInputOnFocus
                importantForAutofill="no"
                textContentType="none"
                returnKeyType="search"
                keyboardAppearance={colors.mode === 'dark' ? 'dark' : 'light'}
                underlineColorAndroid="transparent"
                style={[
                  styles.unifiedCommandSearchInput,
                  Platform.OS === 'android'
                    ? styles.unifiedCommandSearchInputAndroid
                    : styles.unifiedCommandSearchInputIos,
                  { color: colors.text },
                ]}
              />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              onPress={() => setShowCommandCenter(false)}
              hitSlop={spacing.sm}
              style={styles.unifiedCommandSearchClose}
            >
              <X size={iconSize.lg} color={colors.textMuted} strokeWidth={2.5} />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <InteractiveSheet
        visible={Boolean(previewServer)}
        onClose={() => setPreviewServer(null)}
        title={previewServer?.server.name ?? t('home.unifiedPreviewTitle')}
        subtitle={previewServer?.server.description ?? t('home.unifiedPreviewTitle')}
        snapPoints={['42%', '64%']}
      >
        {previewServer ? (
          <>
            <View style={styles.unifiedPreviewHeader}>
              <Avatar
                uri={previewServer.server.iconUrl}
                name={previewServer.server.name}
                size={size.avatarXl}
                userId={previewServer.server.id}
                shape="server"
              />
              <View style={styles.unifiedPreviewStats}>
                <AppText variant="bodyStrong" numberOfLines={1}>
                  {previewServer.server.name}
                </AppText>
                {previewServer.server.description ? (
                  <AppText variant="label" tone="secondary" numberOfLines={2}>
                    {previewServer.server.description}
                  </AppText>
                ) : null}
              </View>
            </View>
            <SurfaceList style={styles.edgeList}>
              <SurfaceListItem
                onPress={() => {
                  setPreviewServer(null)
                  setSelectedServerId(previewServer.server.id)
                }}
                style={styles.menuItem}
              >
                <IconBubble icon={Hash} tone="primary" size={iconSize.xl} />
                <AppText variant="bodyStrong" style={styles.menuLabel}>
                  {t('home.unifiedChannels')}
                </AppText>
                <ChevronRight size={iconSize.md} color={colors.textMuted} />
              </SurfaceListItem>
              <SurfaceListItem
                onPress={() => {
                  setPreviewServer(null)
                  router.push(getServerPath(previewServer.server) as never)
                }}
                style={styles.menuItem}
              >
                <IconBubble icon={Server} tone="muted" size={iconSize.xl} />
                <AppText variant="bodyStrong" style={styles.menuLabel}>
                  {t('server.serverInfo')}
                </AppText>
                <ChevronRight size={iconSize.md} color={colors.textMuted} />
              </SurfaceListItem>
              <SurfaceListItem
                last
                onPress={() => {
                  setPreviewServer(null)
                  router.push(
                    `/(main)/servers/${previewServer.server.slug ?? previewServer.server.id}/invite` as never,
                  )
                }}
                style={styles.menuItem}
              >
                <IconBubble icon={UserPlus} tone="accent" size={iconSize.xl} />
                <AppText variant="bodyStrong" style={styles.menuLabel}>
                  {t('home.unifiedInvite')}
                </AppText>
                <ChevronRight size={iconSize.md} color={colors.textMuted} />
              </SurfaceListItem>
            </SurfaceList>
          </>
        ) : null}
      </InteractiveSheet>

      <Modal
        visible={showCreateMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCreateMenu(false)}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          onPress={() => setShowCreateMenu(false)}
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]}
        />
        <Reanimated.View
          entering={FadeInRight.duration(160).springify()}
          style={[
            styles.createMenuPanel,
            {
              left: activeCreateMenuAnchor.x,
              top:
                activeCreateMenuAnchor.y +
                activeCreateMenuAnchor.height +
                UNIFIED_CREATE_MENU_ARROW_SIZE,
              backgroundColor: colors.frostedPanelStrong,
              borderColor: colors.frostedBorder,
              shadowColor: colors.shadowStrong,
            },
          ]}
        >
          <View
            pointerEvents="none"
            style={[
              styles.createMenuArrow,
              {
                left: createMenuArrowLeft,
                borderBottomColor: colors.frostedPanelStrong,
              },
            ]}
          />
          <View style={styles.createMenuBubble}>
            <Pressable
              onPress={() => {
                setShowCreateMenu(false)
                setShowCreateServer(true)
              }}
              style={({ pressed }) => [
                styles.createMenuRow,
                pressed ? styles.unifiedPressed : null,
              ]}
            >
              <View style={[styles.createMenuIcon, { backgroundColor: colors.activePill }]}>
                <Server size={iconSize.xl} color={colors.primary} strokeWidth={2.35} />
              </View>
              <AppText variant="bodyStrong" style={styles.menuLabel}>
                {t('home.createServerAction').replace(/^\+\s*/, '')}
              </AppText>
            </Pressable>
            <Pressable
              onPress={() => {
                setShowCreateMenu(false)
                router.push('/(main)/create-buddy' as never)
              }}
              style={({ pressed }) => [
                styles.createMenuRow,
                pressed ? styles.unifiedPressed : null,
              ]}
            >
              <View style={[styles.createMenuIcon, { backgroundColor: colors.activePill }]}>
                <Bot size={iconSize.xl} color={colors.primary} strokeWidth={2.35} />
              </View>
              <AppText variant="bodyStrong" style={styles.menuLabel}>
                {t('home.createBuddyAction').replace(/^\+\s*/, '')}
              </AppText>
            </Pressable>
            <Pressable
              onPress={() => {
                setShowCreateMenu(false)
                router.push('/(main)/friends/new-friends' as never)
              }}
              style={({ pressed }) => [
                styles.createMenuRow,
                pressed ? styles.unifiedPressed : null,
              ]}
            >
              <View style={[styles.createMenuIcon, { backgroundColor: colors.toneWarningSurface }]}>
                <UserPlus size={iconSize.xl} color={colors.warning} strokeWidth={2.35} />
              </View>
              <AppText variant="bodyStrong" style={styles.menuLabel}>
                {t('friends.addFriend', '添加好友')}
              </AppText>
            </Pressable>
            <Pressable
              onPress={() => {
                setShowCreateMenu(false)
                router.push('/(main)/scan' as never)
              }}
              style={({ pressed }) => [
                styles.createMenuRow,
                pressed ? styles.unifiedPressed : null,
              ]}
            >
              <View style={[styles.createMenuIcon, { backgroundColor: colors.toneSuccessSurface }]}>
                <QrCode size={iconSize.xl} color={colors.success} strokeWidth={2.35} />
              </View>
              <AppText variant="bodyStrong" style={styles.menuLabel}>
                {t('home.scanAction')}
              </AppText>
            </Pressable>
          </View>
        </Reanimated.View>
      </Modal>

      <InteractiveSheet
        visible={showCreateServer}
        onClose={() => setShowCreateServer(false)}
        title={t('server.createTitle')}
        subtitle={t('server.createSubtitle')}
        snapPoints={['42%', '64%']}
        footer={
          <Button
            variant="primary"
            size="lg"
            onPress={() => createMutation.mutate()}
            disabled={!createName.trim() || createMutation.isPending}
            loading={createMutation.isPending}
          >
            {t('server.create')}
          </Button>
        }
      >
        <TextField
          label={t('server.nameLabel')}
          style={styles.input}
          value={createName}
          onChangeText={setCreateName}
          placeholder={t('server.namePlaceholder')}
          autoFocus
        />
        <MotionPressable
          accessibilityRole="switch"
          onPress={() => setIsPublic(!isPublic)}
          contentStyle={styles.switchRow}
        >
          <AppText variant="bodyStrong">{t('server.publicServer')}</AppText>
          <AppSwitch value={isPublic} onValueChange={setIsPublic} />
        </MotionPressable>
      </InteractiveSheet>
    </BackgroundSurface>
  )
}

function UnifiedInboxShortcut({
  entry,
  label,
  width,
  isOpening,
  disabled,
  onPress,
}: {
  entry: BuddyInboxEntry
  label: string
  width: number
  isOpening: boolean
  disabled: boolean
  onPress: () => void
}) {
  return (
    <MotionPressable
      disabled={disabled}
      onPress={onPress}
      contentStyle={[styles.unifiedShortcutTile, { width }]}
    >
      <Avatar
        uri={entry.agent.user.avatarUrl}
        name={label}
        userId={entry.agent.user.id}
        size={size.avatarSm}
        status={buddyInboxPresenceStatus(entry, isOpening)}
        showStatus
      />
      <AppText
        variant="label"
        tone="secondary"
        numberOfLines={1}
        style={[styles.unifiedShortcutLabel, styles.unifiedHomeSecondaryText]}
      >
        {label}
      </AppText>
    </MotionPressable>
  )
}

function UnifiedAppShortcut({
  app,
  width,
  disabled,
  onPress,
}: {
  app: ServerAppIntegration
  width: number
  disabled: boolean
  onPress: () => void
}) {
  return (
    <MotionPressable
      disabled={disabled}
      onPress={onPress}
      contentStyle={[styles.unifiedShortcutTile, { width }]}
    >
      <UnifiedServerAppIcon iconUrl={app.iconUrl} />
      <AppText
        variant="label"
        tone="secondary"
        numberOfLines={1}
        style={[styles.unifiedShortcutLabel, styles.unifiedHomeSecondaryText]}
      >
        {app.name}
      </AppText>
    </MotionPressable>
  )
}

function UnifiedShortcutSkeleton({ width }: { width: number }) {
  return (
    <View style={[styles.unifiedShortcutTile, { width }]}>
      <View
        style={[
          styles.unifiedShortcutSkeletonIcon,
          { backgroundColor: UNIFIED_HOME_SURFACE_MUTED_COLOR },
        ]}
      />
      <View
        style={[
          styles.unifiedShortcutSkeletonLabel,
          { backgroundColor: UNIFIED_HOME_SURFACE_MUTED_COLOR },
        ]}
      />
    </View>
  )
}

function UnifiedServerAppIcon({ iconUrl }: { iconUrl?: string | null }) {
  const imageUrl = iconUrl ? getImageUrl(iconUrl) : null

  return (
    <View
      style={[styles.unifiedServerAppIcon, { backgroundColor: UNIFIED_HOME_SURFACE_MUTED_COLOR }]}
    >
      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          style={styles.unifiedServerAppIconImage}
          contentFit="cover"
        />
      ) : (
        <AppWindow size={iconSize.xl} color={UNIFIED_HOME_ACCENT_COLOR} strokeWidth={2.5} />
      )}
    </View>
  )
}

function UnifiedServerRailItem({
  entry,
  active,
  unreadCount,
  index,
  onPress,
  onLongPress,
}: {
  entry: ServerEntry
  active: boolean
  unreadCount: number
  index: number
  onPress: () => void
  onLongPress: () => void
}) {
  return (
    <Reanimated.View entering={FadeInRight.delay(index * 28).springify()}>
      <MotionPressable
        onPress={onPress}
        onLongPress={onLongPress}
        contentStyle={styles.unifiedRailServerTouch}
      >
        <View
          style={[
            styles.unifiedRailAvatar,
            {
              borderColor: active ? UNIFIED_HOME_ACCENT_COLOR : UNIFIED_HOME_BORDER_COLOR,
              borderWidth: active ? border.active : StyleSheet.hairlineWidth,
              backgroundColor: active
                ? UNIFIED_HOME_SURFACE_MUTED_COLOR
                : UNIFIED_HOME_SURFACE_COLOR,
            },
          ]}
        >
          <Avatar
            uri={entry.server.iconUrl}
            name={entry.server.name}
            size={size.plusPanelIcon}
            userId={entry.server.id}
            shape="server"
          />
        </View>
        {unreadCount > 0 && (
          <View style={[styles.unifiedRailUnread, { backgroundColor: UNIFIED_HOME_DANGER_COLOR }]}>
            <Text style={styles.unifiedRailBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
          </View>
        )}
      </MotionPressable>
    </Reanimated.View>
  )
}

function UnifiedChannelRow({
  channel,
  unreadCount,
  onPress,
}: {
  channel: Channel
  unreadCount: number
  onPress: () => void
}) {
  const Icon = CHANNEL_TYPE_ICONS[channel.type as keyof typeof CHANNEL_TYPE_ICONS] ?? Hash
  const isUnread = unreadCount > 0

  return (
    <MotionPressable
      onPress={onPress}
      contentStyle={[
        styles.unifiedChannelRow,
        {
          backgroundColor: isUnread ? UNIFIED_HOME_SURFACE_MUTED_COLOR : 'transparent',
          borderColor: isUnread ? UNIFIED_HOME_BORDER_COLOR : 'transparent',
        },
      ]}
    >
      <View style={styles.unifiedUnreadMarker}>
        {isUnread ? (
          <View style={[styles.unifiedUnreadDot, { backgroundColor: UNIFIED_HOME_DANGER_COLOR }]} />
        ) : null}
      </View>
      <Icon
        size={iconSize.xl}
        color={isUnread ? UNIFIED_HOME_ACCENT_COLOR : UNIFIED_HOME_TEXT_MUTED_COLOR}
        strokeWidth={2.5}
      />
      <AppText
        variant="bodyStrong"
        tone={isUnread ? 'primaryText' : 'secondary'}
        style={[
          styles.unifiedChannelName,
          isUnread ? styles.unifiedHomeText : styles.unifiedHomeSecondaryText,
        ]}
        numberOfLines={1}
      >
        {channel.name}
      </AppText>
      {isUnread ? (
        <View style={[styles.unifiedChannelBadge, { backgroundColor: UNIFIED_HOME_DANGER_COLOR }]}>
          <Text style={styles.unifiedRailBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
        </View>
      ) : null}
    </MotionPressable>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerCoverOpacityMask: {
    flex: 1,
    backgroundColor: 'transparent',
  },

  unifiedRoot: {
    flex: 1,
    flexDirection: 'row',
  },
  unifiedPageCoverLayer: {
    position: 'absolute',
    top: spacing.none,
    left: spacing.none,
    right: spacing.none,
    overflow: 'hidden',
    backgroundColor: UNIFIED_HOME_BASE_COLOR,
  },
  unifiedPageCoverMask: {
    ...StyleSheet.absoluteFillObject,
  },
  unifiedPageCover: {
    ...StyleSheet.absoluteFillObject,
  },
  unifiedRail: {
    width: size.plusPanelIcon + spacing.md,
    borderRightWidth: border.none,
    overflow: 'hidden',
    position: 'relative',
    zIndex: 8,
    elevation: 8,
  },
  unifiedRailBodyFade: {
    position: 'absolute',
    left: spacing.none,
    right: spacing.none,
    bottom: spacing.none,
    zIndex: 0,
  },
  unifiedRefreshIndicator: {
    position: 'absolute',
    zIndex: 4,
    width: size.iconButtonMd,
    height: size.iconButtonMd,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.24,
    shadowRadius: 14,
    shadowOffset: { width: spacing.none, height: spacing.xs },
    elevation: 14,
  },
  unifiedRailSafeArea: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  unifiedRailScroller: {
    flex: 1,
    width: '100%',
  },
  unifiedRailList: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingBottom: spacing.xl,
  },
  unifiedRailCreateTouch: {
    width: '100%',
    minHeight: size.plusPanelIcon + spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 12,
    elevation: 12,
  },
  unifiedRailCreateButton: {
    width: size.plusPanelIcon,
    height: size.plusPanelIcon,
    borderRadius: radius['2xl'],
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowOpacity: 0.32,
    shadowRadius: 18,
    shadowOffset: { width: spacing.none, height: spacing.sm },
    elevation: 12,
  },
  unifiedRailServerTouch: {
    width: size.plusPanelIcon + spacing.sm,
    height: size.plusPanelIcon + spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unifiedRailAvatar: {
    width: size.plusPanelIcon,
    height: size.plusPanelIcon,
    borderRadius: radius.xl,
    borderWidth: border.active,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  unifiedRailBadge: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    minWidth: size.badgeLg,
    height: size.badgeLg,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  unifiedRailUnread: {
    position: 'absolute',
    right: spacing.xs,
    bottom: spacing.xs,
    minWidth: size.badgeMd,
    height: size.badgeMd,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  unifiedRailBadgeText: {
    color: palette.white,
    fontSize: fontSize.micro,
    fontWeight: '900',
  },
  unifiedPanel: {
    flex: 1,
    minWidth: 0,
  },
  unifiedPager: {
    flex: 1,
    position: 'relative',
    zIndex: 1,
  },
  unifiedPagerPage: {
    flex: 1,
  },
  unifiedWorkspacePanel: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderTopWidth: border.none,
    borderLeftWidth: border.none,
    borderBottomWidth: border.none,
    borderRadius: radius.none,
    overflow: 'hidden',
    position: 'relative',
  },
  unifiedWorkspaceBodyBackdrop: {
    position: 'absolute',
    left: spacing.none,
    right: spacing.none,
    bottom: spacing.none,
    zIndex: 0,
  },
  unifiedWorkspaceHeader: {
    borderBottomWidth: border.none,
    overflow: 'hidden',
    position: 'relative',
    zIndex: 3,
  },
  unifiedWorkspaceHeaderSafe: {
    flex: 1,
  },
  unifiedHeaderCover: {
    ...StyleSheet.absoluteFillObject,
  },
  unifiedMasthead: {
    flex: 1,
    justifyContent: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  unifiedHeaderContent: {
    minHeight: size.controlLg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.none,
    paddingVertical: spacing.xxs,
  },
  unifiedHeaderAvatarShadow: {
    shadowColor: palette.black,
    shadowOpacity: 0.36,
    shadowRadius: 12,
    shadowOffset: { width: spacing.none, height: spacing.xs },
    elevation: 8,
  },
  unifiedServerIdentityPressable: {
    flex: 1,
    minWidth: 0,
    minHeight: size.controlLg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.xl,
    paddingRight: spacing.sm,
  },
  unifiedServerIdentity: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  unifiedServerTitleBlock: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xxs,
  },
  unifiedServerTitle: {
    lineHeight: lineHeight.lg,
    textShadowColor: palette.black,
    textShadowOffset: { width: spacing.none, height: spacing.xs },
    textShadowRadius: 10,
  },
  unifiedHeaderIconShadow: {
    shadowColor: palette.black,
    shadowOpacity: 0.42,
    shadowRadius: 8,
    shadowOffset: { width: spacing.none, height: spacing.xs },
  },
  unifiedHomeText: {
    color: UNIFIED_HOME_TEXT_COLOR,
  },
  unifiedHomeSecondaryText: {
    color: UNIFIED_HOME_TEXT_SECONDARY_COLOR,
  },
  unifiedHomeMutedText: {
    color: UNIFIED_HOME_TEXT_MUTED_COLOR,
  },
  unifiedSectionHeaderText: {
    color: UNIFIED_HOME_TEXT_MUTED_COLOR,
    fontSize: fontSize.xs,
    fontWeight: '800',
    lineHeight: lineHeight.xs,
  },
  unifiedSectionHeaderRow: {
    minHeight: size.badgeLg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  unifiedSectionCountTag: {
    minWidth: size.badgeLg,
    height: size.badgeLg,
    borderRadius: radius.full,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: UNIFIED_HOME_SURFACE_MUTED_COLOR,
    borderWidth: border.hairline,
    borderColor: UNIFIED_HOME_BORDER_COLOR,
  },
  unifiedSectionCountText: {
    color: UNIFIED_HOME_TEXT_SECONDARY_COLOR,
    fontSize: fontSize.micro,
    fontWeight: '900',
    lineHeight: lineHeight.xs,
  },
  unifiedTouchPressed: {
    transform: [{ scale: 0.985 }],
  },
  unifiedSectionLabel: {
    fontSize: fontSize.xs,
    fontWeight: '800',
    lineHeight: lineHeight.xs,
  },
  unifiedSmallIconButton: {
    width: size.iconButtonSm,
    height: size.iconButtonSm,
    borderRadius: radius.full,
  },
  unifiedChannelList: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.lg,
  },
  unifiedChannelScroll: {
    flex: 1,
  },
  unifiedShortcutStage: {
    gap: spacing.md,
  },
  unifiedShortcutGroup: {
    gap: spacing.tight,
  },
  unifiedShortcutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.none,
  },
  unifiedShortcutPager: {
    gap: spacing.sm,
    paddingRight: spacing.md,
  },
  unifiedShortcutPage: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  unifiedAppTrack: {
    display: 'none',
    width: size.thumbnailMd,
    height: size.dotXs,
    borderRadius: radius.full,
    marginTop: spacing.none,
    marginLeft: spacing.xs,
  },
  unifiedShortcutTile: {
    minHeight: size.avatarXl,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.tight,
  },
  unifiedShortcutLabel: {
    maxWidth: '100%',
    textAlign: 'center',
  },
  unifiedServerAppIcon: {
    width: size.avatarMd,
    height: size.avatarMd,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  unifiedServerAppIconImage: {
    width: '100%',
    height: '100%',
  },
  unifiedShortcutSkeletonIcon: {
    width: size.avatarMd,
    height: size.avatarMd,
    borderRadius: radius.lg,
  },
  unifiedShortcutSkeletonLabel: {
    width: size.plusPanelIcon,
    height: size.dotLg,
    borderRadius: radius.full,
  },
  unifiedChannelGroup: {
    gap: spacing.sm,
  },
  unifiedGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.none,
    paddingRight: spacing.none,
    paddingTop: spacing.none,
    position: 'relative',
  },
  unifiedGroupChevron: {
    position: 'absolute',
    left: -spacing.lg,
    width: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unifiedGroupTitle: {
    marginLeft: spacing.none,
  },
  unifiedChannelRow: {
    minHeight: size.controlMd - spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingRight: spacing.sm,
  },
  unifiedUnreadMarker: {
    position: 'absolute',
    left: -spacing.md,
    top: spacing.none,
    bottom: spacing.none,
    width: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unifiedUnreadDot: {
    width: size.dotSm,
    height: size.dotLg,
    borderRadius: radius.full,
  },
  unifiedChannelName: {
    flex: 1,
    minWidth: 0,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
  },
  unifiedChannelBadge: {
    minWidth: size.badgeLg,
    height: size.badgeLg,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  unifiedSkeletonStack: {
    gap: spacing.sm,
  },
  unifiedSkeletonRow: {
    height: size.homeChannelRowHeight,
    borderRadius: radius.lg,
  },
  unifiedEmptyPanel: {
    minHeight: size.panelStateMinHeight,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius['2xl'],
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  unifiedEmptyText: {
    textAlign: 'center',
  },
  unifiedEmptyWrap: {
    gap: spacing.lg,
    paddingTop: spacing['6xl'],
  },
  unifiedCommandSearchInput: {
    flex: 1,
    minWidth: 0,
    height: lineHeight.lg,
    fontSize: fontSize.lg,
    fontWeight: '800',
    lineHeight: lineHeight.lg,
    paddingHorizontal: spacing.none,
    paddingVertical: spacing.none,
    margin: spacing.none,
  },
  unifiedCommandSearchInputAndroid: {
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  unifiedCommandSearchInputIos: {
    transform: [{ translateY: -spacing.tight }],
  },
  unifiedCommandSearchClose: {
    width: size.controlLg,
    height: size.controlLg,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commandModalSearchIconBox: {
    width: size.controlMd,
    height: size.controlMd,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commandModalSearchInputBox: {
    flex: 1,
    minWidth: 0,
    height: size.plusPanelIconLg,
    justifyContent: 'center',
  },
  unifiedCommandResults: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    gap: spacing.none,
  },
  unifiedCommandEmptyText: {
    alignSelf: 'stretch',
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.md,
    textAlign: 'center',
  },
  unifiedPressed: {
    transform: [{ scale: 0.985 }],
  },
  commandModalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.md,
  },
  commandModalResults: {
    maxHeight: '48%',
    borderRadius: radius['3xl'],
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    marginBottom: spacing.tight,
    shadowOpacity: 0.36,
    shadowRadius: 24,
    shadowOffset: { width: spacing.none, height: spacing.sm },
    elevation: 18,
  },
  commandModalSearchPill: {
    height: size.plusPanelIconLg,
    borderRadius: radius['3xl'],
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    shadowOpacity: 0.48,
    shadowRadius: 18,
    shadowOffset: { width: spacing.none, height: spacing.sm },
    elevation: 20,
  },
  createMenuPanel: {
    position: 'absolute',
    width: size.actionMinWidth + spacing['2xl'],
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.xs,
    shadowOpacity: 0.26,
    shadowRadius: 18,
    shadowOffset: { width: spacing.none, height: spacing.xs },
    elevation: 24,
  },
  createMenuArrow: {
    position: 'absolute',
    top: -UNIFIED_CREATE_MENU_ARROW_SIZE,
    width: spacing.none,
    height: spacing.none,
    borderLeftWidth: UNIFIED_CREATE_MENU_ARROW_SIZE,
    borderRightWidth: UNIFIED_CREATE_MENU_ARROW_SIZE,
    borderBottomWidth: UNIFIED_CREATE_MENU_ARROW_SIZE,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    zIndex: 2,
  },
  createMenuBubble: {
    gap: spacing.xxs,
  },
  createMenuRow: {
    minHeight: size.controlLg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  createMenuIcon: {
    width: size.avatarSm,
    height: size.avatarSm,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commandModalRow: {
    minHeight: size.listItemLg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
  },
  commandModalIcon: {
    width: size.avatarMd,
    height: size.avatarMd,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commandModalTextColumn: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xxs,
  },
  commandModalRowLabel: {
    lineHeight: lineHeight.md,
  },
  commandModalRowMeta: {
    lineHeight: lineHeight.xs,
  },
  unifiedSidePage: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing['3xl'],
  },
  unifiedSideTopRow: {
    minHeight: size.controlMd,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },
  unifiedPageHeaderText: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xxs,
  },
  unifiedSideTitle: {
    lineHeight: lineHeight.md,
  },
  unifiedWorkspaceSectionTitle: {
    fontSize: fontSize.xs,
    fontWeight: '800',
    lineHeight: lineHeight.xs,
  },
  unifiedSideIconAction: {
    width: size.iconButtonMd,
    height: size.iconButtonMd,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surface,
  },
  unifiedStackedIconAction: {
    width: size.iconButtonLg,
    height: size.iconButtonLg,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: UNIFIED_HOME_SURFACE_COLOR,
    position: 'relative',
  },
  unifiedStackedIconBadge: {
    position: 'absolute',
    right: spacing.xxs,
    bottom: spacing.xxs,
    width: size.badgeMd,
    height: size.badgeMd,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: UNIFIED_HOME_ACCENT_COLOR,
    borderWidth: border.hairline,
    borderColor: UNIFIED_HOME_BASE_COLOR,
  },
  unifiedSideListContent: {
    paddingBottom: spacing['5xl'],
  },
  unifiedPreviewRow: {
    minHeight: size.controlLg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.xs,
  },
  unifiedPreviewRowText: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xxs,
  },
  unifiedMemberNameRow: {
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  unifiedMemberNameText: {
    flexShrink: 1,
  },
  unifiedBuddyTag: {
    minHeight: size.badgeSm,
    borderRadius: radius.full,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: UNIFIED_HOME_SURFACE_MUTED_COLOR,
    borderWidth: border.hairline,
    borderColor: UNIFIED_HOME_BORDER_COLOR,
  },
  unifiedBuddyTagText: {
    color: UNIFIED_HOME_ACCENT_COLOR,
    fontSize: fontSize.micro,
    fontWeight: '900',
    lineHeight: lineHeight.xs,
  },
  unifiedFileIcon: {
    width: size.avatarSm,
    height: size.avatarSm,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unifiedSideEmpty: {
    minHeight: size.controlLg,
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  unifiedPreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  unifiedPreviewStats: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xxs,
  },

  navActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  navBtn: {
    width: size.controlLg,
    height: size.controlLg,
    borderRadius: radius.full,
  },

  listContent: {
    paddingBottom: size.tabBar + spacing['4xl'],
  },

  quickEntryWrapper: {
    paddingVertical: spacing.sm,
  },
  edgeList: {
    width: '100%',
  },
  quickEntryCard: {
    minHeight: size.listItemLg + spacing.xxs,
  },
  actionBubbleGlow: {
    width: size.controlLg,
    height: size.controlLg,
    borderRadius: radius.xl,
  },
  quickEntryInfo: {
    flex: 1,
  },
  quickEntryTitle: {
    fontSize: fontSize.md,
    fontWeight: '800',
  },
  quickEntryDesc: {
    fontSize: fontSize.xs,
    marginTop: spacing.px,
  },
  // Section headers
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: letterSpacing.none,
  },
  sectionCount: {
    fontSize: fontSize.xs,
    fontWeight: '600',
  },

  // Server list item
  serverSection: {
    paddingHorizontal: spacing.none,
  },
  serverList: {
    marginBottom: spacing.xs,
  },
  serverCard: {
    minHeight: size.avatarXl,
    paddingVertical: spacing.sm,
  },
  serverInfo: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.xxs,
  },
  serverTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  serverName: {
    fontSize: fontSize.md,
    fontWeight: '800',
    flex: 1,
  },
  serverDesc: {
    fontSize: fontSize.sm,
    marginTop: spacing.px,
  },
  serverMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    marginTop: spacing.xxs,
  },
  serverMeta: {
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  groupGap: {
    height: spacing.md,
  },

  menuItem: {
    minHeight: size.listItemLg,
  },
  menuLabel: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    marginTop: spacing.xs,
  },
  input: {
    height: size.controlLg,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    fontSize: fontSize.md,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  switchLabel: {
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  createBtn: {
    height: size.controlLg,
    borderRadius: radius['2xl'],
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  tutorialCarousel: {
    alignSelf: 'center',
    borderRadius: radius['2xl'],
  },
  tutorialPage: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  tutorialPageTitle: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    marginTop: spacing.sm,
  },
  tutorialPageDesc: {
    fontSize: fontSize.sm,
    textAlign: 'center',
    lineHeight: lineHeight.sm,
  },
  tutorialTagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  tutorialTag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  tutorialTagText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  tutorialIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.tight,
    marginTop: spacing.sm,
  },
  tutorialIndicatorDot: {
    height: size.dotMd,
    borderRadius: radius.full,
  },
})
