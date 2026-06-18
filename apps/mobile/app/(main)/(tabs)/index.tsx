import AsyncStorage from '@react-native-async-storage/async-storage'
import MaskedView from '@react-native-masked-view/masked-view'
import {
  type Channel,
  normalizeBuddyRuntimePresenceStatus,
  normalizePresenceStatus,
} from '@shadowob/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BlurView } from 'expo-blur'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import {
  AppWindow,
  Bot,
  ChevronDown,
  ChevronRight,
  File,
  FolderOpen,
  Hash,
  Lock,
  type LucideIcon,
  Megaphone,
  MessageCircle,
  PawPrint,
  Plus,
  QrCode,
  Search,
  Server,
  ShoppingBag,
  User,
  UserPlus,
  Volume2,
  X,
} from 'lucide-react-native'
import {
  forwardRef,
  type ReactNode,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import {
  type AccessibilityRole,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  type StyleProp,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native'
import PagerView from 'react-native-pager-view'
import Reanimated, {
  FadeInRight,
  FadeInUp,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import { Avatar } from '../../../src/components/common/avatar'
import { EmptyState } from '../../../src/components/common/empty-state'
import { LoadingScreen } from '../../../src/components/common/loading-screen'
import {
  AppSwitch,
  AppText,
  BackgroundSurface,
  Button,
  IconBubble,
  InteractiveSheet,
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
import {
  encodeMobileNavigationParam,
  type ServerAppMobileConfig,
} from '../../../src/lib/server-app-mobile'
import { showToast } from '../../../src/lib/toast'
import { useAuthStore } from '../../../src/stores/auth.store'
import { useChatStore } from '../../../src/stores/chat.store'
import { useUIStore } from '../../../src/stores/ui.store'
import {
  border,
  type ColorTokens,
  fontSize,
  iconSize,
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

interface UnifiedChannel extends Channel {
  categoryId?: string | null
  isPrivate?: boolean
  lastMessagePreview?: {
    id: string
    content: string
    createdAt: string
    attachmentCount?: number
    attachmentPreviews?: UnifiedChannelAttachmentPreview[]
    author?: {
      id: string
      username: string
      displayName: string | null
    } | null
  } | null
  memberPreviews?: UnifiedChannelMemberPreview[]
}

interface UnifiedChannelAttachmentPreview {
  id: string
  filename: string
  contentType: string
  kind?: 'file' | 'image' | 'voice'
}

interface UnifiedChannelMemberPreview {
  id: string
  username: string
  displayName?: string | null
  avatarUrl?: string | null
  status?: string | null
  lastSpokeAt?: string | null
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
  mobile?: ServerAppMobileConfig | null
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

interface DirectChannelEntry {
  id: string
  lastMessageAt: string | null
  createdAt: string
  otherUser: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
    status: string
    isBot: boolean
  } | null
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
      utility: 'workspace' | 'shop'
      icon: LucideIcon
    }
  | {
      id: string
      kind: 'workspaceNode'
      label: string
      meta: string
      node: UnifiedWorkspaceNode
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

const UNIFIED_HEADER_COVER_EXTRA_HEIGHT = spacing['4xl']
const UNIFIED_HOME_LIGHT_BASE_COLOR = palette.homeLightBase
const UNIFIED_HOME_LIGHT_SURFACE_COLOR = palette.white
const UNIFIED_HOME_LIGHT_SURFACE_MUTED_COLOR = palette.homeLightSurfaceMuted
const UNIFIED_HOME_DARK_BASE_COLOR = palette.homeDarkBase
const UNIFIED_HOME_DARK_SURFACE_COLOR = palette.homeDarkSurface
const UNIFIED_HOME_DARK_SURFACE_MUTED_COLOR = palette.homeDarkSurfaceMuted
const UNIFIED_HOME_BASE_COLOR = UNIFIED_HOME_DARK_BASE_COLOR
const UNIFIED_HOME_TEXT_COLOR = palette.neutral50
const UNIFIED_HOME_TEXT_SECONDARY_COLOR = palette.neutral300
const UNIFIED_HOME_TEXT_MUTED_COLOR = palette.neutral400
const UNIFIED_HOME_ACCENT_COLOR = palette.cyan
const UNIFIED_HOME_DANGER_COLOR = palette.crimson
const UNIFIED_HOME_SURFACE_COLOR = UNIFIED_HOME_DARK_SURFACE_COLOR
const UNIFIED_HOME_SURFACE_MUTED_COLOR = UNIFIED_HOME_DARK_SURFACE_MUTED_COLOR
const UNIFIED_HOME_BORDER_COLOR = palette.lineDark
const UNIFIED_CREATE_MENU_ARROW_SIZE = spacing.md
const UNIFIED_CREATE_MENU_POINTER_SIZE = spacing.lg
const UNIFIED_CREATE_MENU_WIDTH = size.actionMinWidth
const UNIFIED_CHANNEL_LIST_PADDING = spacing.sm
const UNIFIED_CHANNEL_ROW_PADDING = spacing.md
const UNIFIED_CHANNEL_ICON_TILE_SIZE = size.controlXs
const UNIFIED_HEADER_SERVER_ICON_SIZE = size.plusPanelIcon
const UNIFIED_HOME_SECTION_GAP = spacing.md
const UNIFIED_CHANNEL_ICON_AXIS =
  UNIFIED_CHANNEL_LIST_PADDING + UNIFIED_CHANNEL_ROW_PADDING + UNIFIED_CHANNEL_ICON_TILE_SIZE / 2
const UNIFIED_HEADER_LEFT_PADDING = UNIFIED_CHANNEL_ICON_AXIS - UNIFIED_HEADER_SERVER_ICON_SIZE / 2
const UNIFIED_SHORTCUT_ICON_AXIS = UNIFIED_CHANNEL_ICON_AXIS
const UNIFIED_ACTIVE_SERVER_BORDER_WIDTH = border.active

type UnifiedHomePalette = {
  base: string
  text: string
  textSecondary: string
  textMuted: string
  textSubtle: string
  accent: string
  accentSurface: string
  danger: string
  surface: string
  surfaceMuted: string
  border: string
  buttonSurface: string
  buttonBorder: string
  coverStart: string
  coverMiddle: string
  placeholderStart: string
  placeholderMiddle: string
  placeholderEnd: string
}

function getUnifiedHomePalette(colors: ColorTokens): UnifiedHomePalette {
  if (colors.mode === 'light') {
    return {
      base: UNIFIED_HOME_LIGHT_BASE_COLOR,
      text: palette.neutral900,
      textSecondary: palette.neutral700,
      textMuted: palette.neutral500,
      textSubtle: palette.neutral500,
      accent: palette.cyanDark,
      accentSurface: palette.homeLightAccentSurface,
      danger: palette.crimsonDark,
      surface: UNIFIED_HOME_LIGHT_SURFACE_COLOR,
      surfaceMuted: UNIFIED_HOME_LIGHT_SURFACE_MUTED_COLOR,
      border: palette.lineLight,
      buttonSurface: UNIFIED_HOME_LIGHT_SURFACE_COLOR,
      buttonBorder: palette.lineLight,
      coverStart: palette.homeLightCoverStart,
      coverMiddle: UNIFIED_HOME_LIGHT_BASE_COLOR,
      placeholderStart: palette.homeLightPlaceholderStart,
      placeholderMiddle: UNIFIED_HOME_LIGHT_BASE_COLOR,
      placeholderEnd: UNIFIED_HOME_LIGHT_BASE_COLOR,
    }
  }

  return {
    base: UNIFIED_HOME_DARK_BASE_COLOR,
    text: UNIFIED_HOME_TEXT_COLOR,
    textSecondary: UNIFIED_HOME_TEXT_SECONDARY_COLOR,
    textMuted: UNIFIED_HOME_TEXT_MUTED_COLOR,
    textSubtle: palette.neutral500,
    accent: UNIFIED_HOME_ACCENT_COLOR,
    accentSurface: UNIFIED_HOME_DARK_SURFACE_MUTED_COLOR,
    danger: UNIFIED_HOME_DANGER_COLOR,
    surface: UNIFIED_HOME_DARK_SURFACE_COLOR,
    surfaceMuted: UNIFIED_HOME_DARK_SURFACE_MUTED_COLOR,
    border: UNIFIED_HOME_BORDER_COLOR,
    buttonSurface: UNIFIED_HOME_DARK_SURFACE_COLOR,
    buttonBorder: UNIFIED_HOME_BORDER_COLOR,
    coverStart: UNIFIED_HOME_DARK_SURFACE_MUTED_COLOR,
    coverMiddle: UNIFIED_HOME_DARK_SURFACE_COLOR,
    placeholderStart: palette.homeDarkPlaceholderStart,
    placeholderMiddle: UNIFIED_HOME_DARK_SURFACE_COLOR,
    placeholderEnd: UNIFIED_HOME_DARK_BASE_COLOR,
  }
}

function useUnifiedHomePalette() {
  return getUnifiedHomePalette(useColors())
}

type SignedWorkspaceMediaUrl = {
  url: string
  expiresAt: string
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

function directMessagePeerName(channel: DirectChannelEntry) {
  return (
    channel.otherUser?.displayName ||
    channel.otherUser?.username ||
    channel.otherUser?.id ||
    channel.id
  )
}

function createMenuLabel(label: string) {
  return label.replace(/^\+\s*/, '').replace(/^(新建|创建|添加|New\s+|Create\s+|Add\s+)/, '')
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

type UnifiedGesturePressableStyle =
  | StyleProp<ViewStyle>
  | ((state: { pressed: boolean }) => StyleProp<ViewStyle>)

function UnifiedGesturePressable({
  children,
  onPress,
  style,
  accessibilityLabel,
  accessibilityRole = 'button',
}: {
  children: ReactNode
  onPress?: () => void
  style?: UnifiedGesturePressableStyle
  accessibilityLabel?: string
  accessibilityRole?: AccessibilityRole
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      onPress={onPress}
      style={style}
    >
      {children}
    </Pressable>
  )
}

interface UnifiedHomePagerHandle {
  setPage: (page: number, animated?: boolean) => void
}

function clampPagerPage(page: number, pageCount: number) {
  return Math.max(0, Math.min(page, pageCount - 1))
}

const UnifiedHomePager = forwardRef<
  UnifiedHomePagerHandle,
  { pageWidth: number; initialPage?: number; pages: ReactNode[] }
>(function UnifiedHomePager({ pageWidth, initialPage = 1, pages }, ref) {
  const pageCount = pages.length
  const initialSafePage = clampPagerPage(initialPage, pageCount)
  const pagerRef = useRef<PagerView>(null)
  const currentPageRef = useRef(initialSafePage)

  const setPage = useCallback(
    (page: number, animated = true) => {
      const nextPage = clampPagerPage(page, pageCount)
      currentPageRef.current = nextPage
      if (animated) {
        pagerRef.current?.setPage(nextPage)
        return
      }
      pagerRef.current?.setPageWithoutAnimation(nextPage)
    },
    [pageCount],
  )
  useImperativeHandle(ref, () => ({ setPage }), [setPage])

  useEffect(() => {
    setPage(currentPageRef.current, false)
  }, [pageWidth, setPage])

  return (
    <PagerView
      ref={pagerRef}
      initialPage={initialSafePage}
      keyboardDismissMode="none"
      offscreenPageLimit={1}
      onPageSelected={(event) => {
        currentPageRef.current = event.nativeEvent.position
      }}
      overScrollMode="never"
      style={styles.unifiedPager}
    >
      {pages.map((page, index) => (
        <View
          key={index}
          collapsable={false}
          style={[styles.unifiedPagerPage, { width: pageWidth }]}
        >
          {page}
        </View>
      ))}
    </PagerView>
  )
})

function HeaderCoverOpacityMask() {
  return (
    <View style={styles.headerCoverOpacityMask}>
      <Svg pointerEvents="none" width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="home-cover-alpha" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={palette.black} stopOpacity="1" />
            <Stop offset="0.52" stopColor={palette.black} stopOpacity="0.96" />
            <Stop offset="0.78" stopColor={palette.black} stopOpacity="0.52" />
            <Stop offset="0.94" stopColor={palette.black} stopOpacity="0.12" />
            <Stop offset="1" stopColor={palette.black} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#home-cover-alpha)" />
      </Svg>
    </View>
  )
}

function HeaderCoverGradient({ hasCover }: { hasCover: boolean }) {
  const homePalette = useUnifiedHomePalette()
  const startColor = hasCover ? homePalette.coverStart : homePalette.placeholderStart
  const middleColor = hasCover ? homePalette.coverMiddle : homePalette.placeholderMiddle
  const endColor = hasCover ? homePalette.base : homePalette.placeholderEnd

  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill} preserveAspectRatio="none">
      <Defs>
        <LinearGradient id="home-cover-fallback" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={startColor} stopOpacity="1" />
          <Stop offset="0.42" stopColor={middleColor} stopOpacity="1" />
          <Stop offset="0.78" stopColor={endColor} stopOpacity="1" />
          <Stop offset="1" stopColor={homePalette.base} stopOpacity="1" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#home-cover-fallback)" />
    </Svg>
  )
}

function RailCoverFade() {
  const homePalette = useUnifiedHomePalette()

  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill} preserveAspectRatio="none">
      <Defs>
        <LinearGradient id="home-rail-fade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={homePalette.base} stopOpacity="0" />
          <Stop offset="0.22" stopColor={homePalette.base} stopOpacity="0.74" />
          <Stop offset="0.38" stopColor={homePalette.base} stopOpacity="0.96" />
          <Stop offset="1" stopColor={homePalette.base} stopOpacity="1" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#home-rail-fade)" />
    </Svg>
  )
}

export default function ServersScreen() {
  useEffect(() => {
    void AsyncStorage.setItem(HOME_VARIANT_STORAGE_KEY, 'unified')
  }, [])

  return <UnifiedServersScreen />
}

function memberDisplayName(member: UnifiedServerMember) {
  return member.nickname || member.user.displayName || member.user.username || member.user.id
}

function memberActivityScore(member: UnifiedServerMember) {
  const heartbeat = member.agent?.lastHeartbeat ? new Date(member.agent.lastHeartbeat).getTime() : 0
  if (Number.isFinite(heartbeat) && heartbeat > 0) return heartbeat
  return member.totalOnlineSeconds ?? member.agent?.totalOnlineSeconds ?? 0
}

function buildMemberTreeRows(members: UnifiedServerMember[]) {
  const byName = (a: UnifiedServerMember, b: UnifiedServerMember) =>
    memberDisplayName(a).localeCompare(memberDisplayName(b))
  const humans = members.filter((member) => !member.user.isBot)
  const buddies = members.filter((member) => member.user.isBot)
  const buddiesByOwner = new Map<string, UnifiedServerMember[]>()

  buddies.forEach((buddy) => {
    const ownerId = buddy.agent?.ownerId
    if (!ownerId) return
    const group = buddiesByOwner.get(ownerId) ?? []
    group.push(buddy)
    buddiesByOwner.set(ownerId, group)
  })

  buddiesByOwner.forEach((group) => {
    group.sort((a, b) => memberActivityScore(b) - memberActivityScore(a) || byName(a, b))
  })

  const rows: Array<{
    key: string
    member: UnifiedServerMember
    level: 0 | 1
    isLastChild?: boolean
  }> = []
  const seen = new Set<string>()
  const sortedHumans = [...humans].sort((a, b) => {
    const aBuddies = buddiesByOwner.get(a.user.id) ?? []
    const bBuddies = buddiesByOwner.get(b.user.id) ?? []
    const aActivity = Math.max(memberActivityScore(a), ...aBuddies.map(memberActivityScore))
    const bActivity = Math.max(memberActivityScore(b), ...bBuddies.map(memberActivityScore))
    if (aActivity !== bActivity) return bActivity - aActivity
    if (a.role !== b.role) {
      const roleRank = { owner: 0, admin: 1, member: 2 } as Record<string, number>
      return (roleRank[a.role] ?? 3) - (roleRank[b.role] ?? 3)
    }
    return byName(a, b)
  })

  sortedHumans.forEach((member) => {
    rows.push({ key: `member-${member.user.id}`, member, level: 0 })
    seen.add(member.user.id)

    const ownedBuddies = buddiesByOwner.get(member.user.id) ?? []
    ownedBuddies.forEach((buddy, index) => {
      rows.push({
        key: `buddy-${member.user.id}-${buddy.user.id}`,
        member: buddy,
        level: 1,
        isLastChild: index === ownedBuddies.length - 1,
      })
      seen.add(buddy.user.id)
    })
  })

  buddies
    .filter((buddy) => !seen.has(buddy.user.id))
    .sort((a, b) => memberActivityScore(b) - memberActivityScore(a) || byName(a, b))
    .forEach((buddy) => {
      rows.push({ key: `buddy-${buddy.user.id}`, member: buddy, level: 0 })
    })

  return rows
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
  const homePalette = useUnifiedHomePalette()

  return (
    <MotionPressable
      onPress={onPress}
      contentStyle={[
        styles.unifiedStackedIconAction,
        {
          backgroundColor: homePalette.buttonSurface,
          borderColor: homePalette.buttonBorder,
        },
      ]}
    >
      <Icon size={iconSize.xl} color={homePalette.accent} strokeWidth={2.4} />
      <View
        style={[
          styles.unifiedStackedIconBadge,
          {
            backgroundColor: homePalette.accent,
            borderColor: homePalette.base,
          },
        ]}
      >
        <Plus size={iconSize.xs} color={homePalette.base} strokeWidth={3} />
      </View>
    </MotionPressable>
  )
}

function UnifiedMembersPage({
  members,
  onInvite,
  onAddBuddy,
  onOpenMember,
  t,
}: {
  members: UnifiedServerMember[]
  onInvite: () => void
  onAddBuddy: () => void
  onOpenMember: (member: UnifiedServerMember) => void
  t: ReturnType<typeof useTranslation>['t']
}) {
  const homePalette = useUnifiedHomePalette()
  const memberRows = useMemo(() => buildMemberTreeRows(members), [members])
  const memberTreeLineColor = homePalette.border

  return (
    <View style={styles.unifiedSidePage}>
      <View style={styles.unifiedSideTopRow}>
        <View style={styles.unifiedPageHeaderText}>
          <View style={styles.unifiedSectionHeaderRow}>
            <AppText
              variant="label"
              tone="secondary"
              numberOfLines={1}
              style={[
                styles.unifiedSectionLabel,
                styles.unifiedSectionHeaderText,
                { color: homePalette.textMuted },
              ]}
            >
              {t('server.members')}
            </AppText>
            <View
              style={[
                styles.unifiedSectionCountTag,
                {
                  backgroundColor: homePalette.surfaceMuted,
                  borderColor: homePalette.surfaceMuted,
                },
              ]}
            >
              <AppText
                variant="label"
                style={[styles.unifiedSectionCountText, { color: homePalette.textSecondary }]}
              >
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
        {memberRows.map(({ key, member, level, isLastChild }) => {
          const label = memberDisplayName(member)
          return (
            <MotionPressable
              key={key}
              onPress={() => onOpenMember(member)}
              contentStyle={[styles.unifiedMemberTreeRow, level > 0 && styles.unifiedBuddyTreeRow]}
            >
              {level > 0 ? (
                <View style={styles.unifiedMemberTreeGuide}>
                  <View
                    style={[
                      styles.unifiedMemberTreeLine,
                      isLastChild ? styles.unifiedMemberTreeLineLast : null,
                      { backgroundColor: memberTreeLineColor },
                    ]}
                  />
                  <View
                    style={[
                      styles.unifiedMemberTreeBranch,
                      { backgroundColor: memberTreeLineColor },
                    ]}
                  />
                </View>
              ) : null}
              <Avatar
                uri={member.user.avatarUrl}
                name={label}
                userId={member.user.id}
                size={size.avatarSm}
                status={member.user.status}
                showStatus
              />
              <View style={styles.unifiedPreviewRowText}>
                <AppText
                  variant="bodyStrong"
                  numberOfLines={1}
                  style={[
                    styles.unifiedHomeText,
                    styles.unifiedMemberNameText,
                    { color: homePalette.text },
                  ]}
                >
                  {label}
                </AppText>
              </View>
            </MotionPressable>
          )
        })}
        {memberRows.length === 0 ? (
          <View style={styles.unifiedSideEmpty}>
            <AppText
              variant="label"
              tone="secondary"
              style={[styles.unifiedHomeMutedText, { color: homePalette.textMuted }]}
            >
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
  onOpenFile,
  onOpenFolder,
  onBack,
  canGoBack,
  currentFolderName,
  t,
}: {
  nodes: UnifiedWorkspaceNode[]
  onOpenFile: (node: UnifiedWorkspaceNode) => void
  onOpenFolder: (node: UnifiedWorkspaceNode) => void
  onBack: () => void
  canGoBack: boolean
  currentFolderName?: string | null
  t: ReturnType<typeof useTranslation>['t']
}) {
  const homePalette = useUnifiedHomePalette()
  const visibleNodes = nodes.slice(0, 10)

  return (
    <View style={styles.unifiedSidePage}>
      <View style={styles.unifiedSideTopRow}>
        {canGoBack ? (
          <MotionPressable
            onPress={onBack}
            contentStyle={[
              styles.unifiedSideIconAction,
              { backgroundColor: homePalette.buttonSurface, borderColor: homePalette.buttonBorder },
            ]}
          >
            <ChevronRight
              size={iconSize.lg}
              color={homePalette.textMuted}
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
            style={[
              styles.unifiedWorkspaceSectionTitle,
              styles.unifiedSectionHeaderText,
              { color: homePalette.textMuted },
            ]}
          >
            {t('server.workspace')}
          </AppText>
          {currentFolderName ? (
            <AppText
              variant="label"
              tone="secondary"
              numberOfLines={1}
              style={[styles.unifiedHomeMutedText, { color: homePalette.textMuted }]}
            >
              {currentFolderName}
            </AppText>
          ) : null}
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.unifiedSideListContent, styles.unifiedWorkspaceListContent]}
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
            <UnifiedGesturePressable
              key={node.id}
              onPress={() => {
                if (node.kind === 'dir') {
                  onOpenFolder(node)
                  return
                }
                onOpenFile(node)
              }}
              style={({ pressed }) => [
                styles.unifiedPreviewRow,
                pressed ? styles.unifiedPressed : null,
              ]}
            >
              <View style={[styles.unifiedFileIcon, { backgroundColor: homePalette.surfaceMuted }]}>
                <Icon
                  size={iconSize.xl}
                  color={node.kind === 'dir' ? homePalette.accent : homePalette.textMuted}
                  strokeWidth={2.4}
                />
              </View>
              <View style={styles.unifiedPreviewRowText}>
                <AppText
                  variant="bodyStrong"
                  numberOfLines={1}
                  style={[styles.unifiedHomeText, { color: homePalette.text }]}
                >
                  {node.name}
                </AppText>
                {meta ? (
                  <AppText
                    variant="label"
                    tone="secondary"
                    numberOfLines={1}
                    style={[styles.unifiedHomeMutedText, { color: homePalette.textMuted }]}
                  >
                    {meta}
                  </AppText>
                ) : null}
              </View>
            </UnifiedGesturePressable>
          )
        })}
        {visibleNodes.length === 0 ? (
          <View style={styles.unifiedSideEmpty}>
            <AppText
              variant="label"
              tone="secondary"
              style={[styles.unifiedHomeMutedText, { color: homePalette.textMuted }]}
            >
              {t('workspace.empty')}
            </AppText>
          </View>
        ) : null}
      </ScrollView>
    </View>
  )
}

function UnifiedServersScreen() {
  const { t, i18n } = useTranslation()
  const colors = useColors()
  const homePalette = getUnifiedHomePalette(colors)
  const router = useRouter()
  const queryClient = useQueryClient()
  const insets = useSafeAreaInsets()
  const { width: windowWidth } = useWindowDimensions()
  const user = useAuthStore((s) => s.user)
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

  const [selectedServerId, setSelectedServerId] = useState<string | null>(null)
  const [showDirectMessagePicker, setShowDirectMessagePicker] = useState(false)
  const [showCreateMenu, setShowCreateMenu] = useState(false)
  const [showCreateServer, setShowCreateServer] = useState(false)
  const [collapsedHomeGroups, setCollapsedHomeGroups] = useState<Set<string>>(new Set())
  const [workspaceFolderStack, setWorkspaceFolderStack] = useState<UnifiedWorkspaceNode[]>([])
  const [createName, setCreateName] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const railWidth = size.plusPanelIconLg + spacing.sm
  const panelPageWidth = Math.max(1, windowWidth - railWidth)
  const coverScrollY = useSharedValue(0)
  const handledHomeCommandPaletteRequestIdRef = useRef(0)
  const commandSearchInputRef = useRef<TextInput>(null)
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

  const { data: servers = [], isLoading } = useQuery({
    queryKey: ['servers'],
    queryFn: () => fetchApi<ServerEntry[]>('/api/servers'),
  })

  const { data: scopedUnread } = useQuery<ScopedUnread>({
    queryKey: ['notification-scoped-unread'],
    queryFn: () => fetchApi<ScopedUnread>('/api/notifications/scoped-unread'),
  })

  const { data: directChannels = [] } = useQuery<DirectChannelEntry[]>({
    queryKey: ['direct-channels'],
    queryFn: () => fetchApi<DirectChannelEntry[]>('/api/channels/dm'),
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
    setWorkspaceFolderStack([])
    homePagerRef.current?.setPage(1, false)
  }, [selectedServer?.server.id])

  const { data: selectedServerDetail } = useQuery<ServerDetail>({
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
  const headerForegroundColor = headerCoverSource ? palette.white : homePalette.text
  const headerSecondaryColor = headerCoverSource ? palette.white : homePalette.textMuted
  const headerTitleShadowStyle = headerCoverSource ? styles.unifiedServerTitleOnCover : null
  const headerIconShadowStyle = headerCoverSource ? styles.unifiedHeaderIconOnCover : null

  const { data: rawChannels = [], isLoading: isChannelsLoading } = useQuery<UnifiedChannel[]>({
    queryKey: ['home-unified-channels', selectedServer?.server.id],
    queryFn: () => fetchApi<UnifiedChannel[]>(`/api/servers/${selectedServer!.server.id}/channels`),
    enabled: Boolean(selectedServer?.server.id && selectedServer?.member.role !== '_public'),
  })

  const { data: serverApps = [], isLoading: isServerAppsLoading } = useQuery<
    ServerAppIntegration[]
  >({
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

  const { data: serverMembers = [] } = useQuery<UnifiedServerMember[]>({
    queryKey: ['home-unified-members', selectedServerSlug],
    queryFn: () => fetchApi<UnifiedServerMember[]>(`/api/servers/${selectedServerSlug}/members`),
    enabled: Boolean(selectedServerSlug && selectedServer?.member.role !== '_public'),
  })

  const { data: workspaceNodes = [] } = useQuery<UnifiedWorkspaceNode[]>({
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

  const { data: commandWorkspaceNodes = [] } = useQuery<UnifiedWorkspaceNode[]>({
    queryKey: ['home-unified-workspace-search', selectedServer?.server.id, searchQuery.trim()],
    queryFn: () =>
      fetchApi<UnifiedWorkspaceNode[]>(
        `/api/servers/${selectedServer!.server.id}/workspace/files/search?keyword=${encodeURIComponent(
          searchQuery.trim(),
        )}`,
      ),
    enabled: Boolean(
      selectedServer?.server.id &&
        selectedServer?.member.role !== '_public' &&
        searchQuery.trim().length >= 2,
    ),
  })

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
  const directMessages = useMemo(() => {
    return [...directChannels]
      .filter((channel) => {
        const peer = channel.otherUser
        if (!peer) return false
        return !(peer.isBot && normalizePresenceStatus(peer.status) === 'offline')
      })
      .sort((a, b) => {
        const aUnread = scopedUnread?.channelUnread?.[a.id] ?? 0
        const bUnread = scopedUnread?.channelUnread?.[b.id] ?? 0
        if (aUnread !== bUnread) return bUnread - aUnread
        const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0
        const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0
        return bTime - aTime
      })
  }, [directChannels, scopedUnread?.channelUnread])
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
    const workspaceCandidates: CommandCandidate[] =
      selectedServer && searchKeyword.length >= 2
        ? commandWorkspaceNodes.map((node) => {
            const normalizedNode = normalizeWorkspaceNode(node)
            return {
              id: `workspace-${normalizedNode.id}`,
              kind: 'workspaceNode' as const,
              label: normalizedNode.name,
              meta: t('server.workspace'),
              node: normalizedNode,
            }
          })
        : []
    const allCandidates: CommandCandidate[] = [
      ...serverApps.map((app) => ({
        id: `app-${app.id}`,
        kind: 'app' as const,
        label: app.name,
        meta: displayServer?.name ?? t('home.unifiedServerRail'),
        app,
      })),
      ...inboxCandidates,
      ...workspaceCandidates,
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
    selectedServer,
    serverApps,
    t,
    commandWorkspaceNodes,
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
  const renderChannelGroup = (group: { key: string; title: string; data: UnifiedChannel[] }) => {
    const collapsed = collapsedHomeGroups.has(group.key)
    const canCreateFromGroup = group.key === 'text' || group.key === 'voice'
    return (
      <View key={group.key} style={styles.unifiedChannelGroup}>
        <View style={styles.unifiedGroupHeaderRow}>
          <MotionPressable
            onPress={() => toggleHomeGroup(group.key)}
            contentStyle={styles.unifiedGroupHeader}
            hitSlop={spacing.sm}
          >
            <View style={styles.unifiedGroupChevron}>
              <ChevronDown
                size={iconSize.sm}
                color={homePalette.textMuted}
                strokeWidth={2.4}
                style={{ transform: [{ rotate: collapsed ? '-90deg' : '0deg' }] }}
              />
            </View>
            <AppText
              variant="label"
              tone="secondary"
              style={[
                styles.unifiedGroupTitle,
                styles.unifiedSectionHeaderText,
                { color: homePalette.textMuted },
              ]}
            >
              {group.title}
            </AppText>
          </MotionPressable>
          {canCreateFromGroup ? (
            <MotionPressable
              accessibilityRole="button"
              onPress={() => openCreateChannel(group.key as UnifiedChannel['type'])}
              contentStyle={styles.unifiedGroupCreateButton}
              hitSlop={spacing.sm}
            >
              <Plus size={iconSize.sm} color={homePalette.textMuted} strokeWidth={2.6} />
            </MotionPressable>
          ) : null}
        </View>
        {collapsed
          ? null
          : group.data.map((channel) => (
              <UnifiedChannelRow
                key={channel.id}
                channel={channel}
                unreadCount={scopedUnread?.channelUnread?.[channel.id] ?? 0}
                onPress={() => openChannel(channel)}
              />
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
    const shortcutLeadingOffset = UNIFIED_SHORTCUT_ICON_AXIS - shortcutTileWidth / 2
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
              contentContainerStyle={[
                styles.unifiedShortcutPager,
                { marginLeft: shortcutLeadingOffset },
              ]}
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
            <View style={[styles.unifiedAppTrack, { backgroundColor: homePalette.border }]} />
          </View>
        ) : null}

        {isInboxesLoading || visibleInboxes.length > 0 ? (
          <View style={styles.unifiedShortcutGroup}>
            <View style={styles.unifiedShortcutHeader}>
              <AppText
                variant="label"
                tone="secondary"
                style={[
                  styles.unifiedSectionLabel,
                  styles.unifiedSectionHeaderText,
                  { color: homePalette.textMuted },
                ]}
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
              contentContainerStyle={[
                styles.unifiedShortcutPager,
                { marginLeft: shortcutLeadingOffset },
              ]}
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
            <View style={[styles.unifiedAppTrack, { backgroundColor: homePalette.border }]} />
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

  const renderCommandCandidate = (candidate: CommandCandidate, index: number) => {
    const isLast = index === commandCandidates.length - 1
    const Icon =
      candidate.kind === 'channel'
        ? (CHANNEL_TYPE_ICONS[candidate.channel.type as keyof typeof CHANNEL_TYPE_ICONS] ?? Hash)
        : candidate.kind === 'workspaceNode'
          ? candidate.node.kind === 'dir'
            ? FolderOpen
            : File
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
                    {renderShortcutShelf()}
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
                      channelGroups.map(renderChannelGroup)
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
              <Search size={iconSize['5xl']} color={homePalette.accent} strokeWidth={2.6} />
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
        visible={showDirectMessagePicker}
        onClose={() => setShowDirectMessagePicker(false)}
        title={t('server.addMenuDm')}
        snapPoints={['58%', '78%']}
      >
        {directMessages.length > 0 ? (
          <SurfaceList style={styles.edgeList}>
            {directMessages.map((channel, index) => {
              const peer = channel.otherUser
              return (
                <SurfaceListItem
                  key={channel.id}
                  last={index === directMessages.length - 1}
                  onPress={() => {
                    setShowDirectMessagePicker(false)
                    openDirectChannel(channel)
                  }}
                  style={styles.menuItem}
                >
                  {peer ? (
                    <Avatar
                      uri={peer.avatarUrl}
                      name={directMessagePeerName(channel)}
                      size={size.avatarSm}
                      userId={peer.id}
                      status={normalizePresenceStatus(peer.status)}
                      showStatus
                    />
                  ) : (
                    <IconBubble icon={MessageCircle} tone="muted" size={iconSize.xl} />
                  )}
                  <AppText variant="bodyStrong" style={styles.menuLabel} numberOfLines={1}>
                    {directMessagePeerName(channel)}
                  </AppText>
                  <ChevronRight size={iconSize.md} color={colors.textMuted} />
                </SurfaceListItem>
              )
            })}
          </SurfaceList>
        ) : (
          <View style={styles.unifiedDmPickerEmpty}>
            <AppText variant="bodyStrong">{t('dm.noDirectMessages')}</AppText>
            <AppText variant="label" tone="secondary" style={styles.unifiedDmPickerEmptyText}>
              {t('dm.noDirectMessagesDesc')}
            </AppText>
            <Button
              variant="primary"
              size="sm"
              icon={UserPlus}
              onPress={() => {
                setShowDirectMessagePicker(false)
                router.push('/(main)/friends' as never)
              }}
            >
              {t('server.addMenuDm')}
            </Button>
          </View>
        )}
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
          entering={FadeInUp.duration(180).springify()}
          style={[
            styles.createMenuPopover,
            {
              left: createMenuPanelLeft,
              top: createMenuPanelTop,
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
          <View
            style={[
              styles.createMenuPanel,
              {
                backgroundColor: colors.frostedPanelStrong,
                borderColor: colors.mode === 'light' ? colors.cardBorder : colors.frostedBorder,
              },
            ]}
          >
            <BlurView
              pointerEvents="none"
              intensity={colors.mode === 'dark' ? 42 : 64}
              tint={colors.mode === 'dark' ? 'dark' : 'light'}
              style={StyleSheet.absoluteFill}
            />
            <View
              pointerEvents="none"
              style={[StyleSheet.absoluteFill, { backgroundColor: colors.frostedPanelStrong }]}
            />
            <View
              pointerEvents="none"
              style={[
                styles.createMenuInnerStroke,
                {
                  borderColor:
                    colors.mode === 'light' ? colors.frostedPanelStrong : colors.frostedBorder,
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
                  pressed ? { backgroundColor: colors.inputBackground } : null,
                  pressed ? styles.unifiedPressed : null,
                ]}
              >
                <Server size={iconSize.xl} color={colors.textSecondary} strokeWidth={2.35} />
                <AppText variant="bodyStrong" style={styles.menuLabel}>
                  {createMenuLabel(t('home.createServerAction'))}
                </AppText>
              </Pressable>
              <Pressable
                onPress={() => {
                  setShowCreateMenu(false)
                  router.push('/(main)/create-buddy' as never)
                }}
                style={({ pressed }) => [
                  styles.createMenuRow,
                  pressed ? { backgroundColor: colors.inputBackground } : null,
                  pressed ? styles.unifiedPressed : null,
                ]}
              >
                <Bot size={iconSize.xl} color={colors.textSecondary} strokeWidth={2.35} />
                <AppText variant="bodyStrong" style={styles.menuLabel}>
                  {createMenuLabel(t('home.createBuddyAction'))}
                </AppText>
              </Pressable>
              <Pressable
                onPress={() => {
                  setShowCreateMenu(false)
                  setShowDirectMessagePicker(true)
                }}
                style={({ pressed }) => [
                  styles.createMenuRow,
                  pressed ? { backgroundColor: colors.inputBackground } : null,
                  pressed ? styles.unifiedPressed : null,
                ]}
              >
                <MessageCircle size={iconSize.xl} color={colors.textSecondary} strokeWidth={2.35} />
                <AppText variant="bodyStrong" style={styles.menuLabel}>
                  {createMenuLabel(t('server.addMenuDm'))}
                </AppText>
              </Pressable>
              <Pressable
                onPress={() => {
                  setShowCreateMenu(false)
                  router.push('/(main)/friends/new-friends' as never)
                }}
                style={({ pressed }) => [
                  styles.createMenuRow,
                  pressed ? { backgroundColor: colors.inputBackground } : null,
                  pressed ? styles.unifiedPressed : null,
                ]}
              >
                <UserPlus size={iconSize.xl} color={colors.textSecondary} strokeWidth={2.35} />
                <AppText variant="bodyStrong" style={styles.menuLabel}>
                  {createMenuLabel(t('friends.addFriend'))}
                </AppText>
              </Pressable>
              <Pressable
                onPress={() => {
                  setShowCreateMenu(false)
                  router.push('/(main)/scan' as never)
                }}
                style={({ pressed }) => [
                  styles.createMenuRow,
                  pressed ? { backgroundColor: colors.inputBackground } : null,
                  pressed ? styles.unifiedPressed : null,
                ]}
              >
                <QrCode size={iconSize.xl} color={colors.textSecondary} strokeWidth={2.35} />
                <AppText variant="bodyStrong" style={styles.menuLabel}>
                  {t('home.scanAction')}
                </AppText>
              </Pressable>
            </View>
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
  const homePalette = useUnifiedHomePalette()

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
        size={size.avatarMd}
        status={buddyInboxPresenceStatus(entry, isOpening)}
        showStatus
      />
      <AppText
        variant="label"
        tone="secondary"
        numberOfLines={1}
        style={[
          styles.unifiedShortcutLabel,
          styles.unifiedHomeSecondaryText,
          { color: homePalette.textSecondary },
        ]}
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
  const homePalette = useUnifiedHomePalette()

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
        style={[
          styles.unifiedShortcutLabel,
          styles.unifiedHomeSecondaryText,
          { color: homePalette.textSecondary },
        ]}
      >
        {app.name}
      </AppText>
    </MotionPressable>
  )
}

function UnifiedShortcutSkeleton({ width }: { width: number }) {
  const homePalette = useUnifiedHomePalette()

  return (
    <View style={[styles.unifiedShortcutTile, { width }]}>
      <View
        style={[styles.unifiedShortcutSkeletonIcon, { backgroundColor: homePalette.surfaceMuted }]}
      />
      <View
        style={[styles.unifiedShortcutSkeletonLabel, { backgroundColor: homePalette.surfaceMuted }]}
      />
    </View>
  )
}

function UnifiedServerAppIcon({ iconUrl }: { iconUrl?: string | null }) {
  const homePalette = useUnifiedHomePalette()
  const imageUrl = iconUrl ? getImageUrl(iconUrl) : null

  return (
    <View
      style={[
        styles.unifiedServerAppIcon,
        { backgroundColor: homePalette.surfaceMuted, borderColor: homePalette.buttonBorder },
      ]}
    >
      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          style={styles.unifiedServerAppIconImage}
          contentFit="cover"
        />
      ) : (
        <AppWindow size={iconSize.xl} color={homePalette.accent} strokeWidth={2.5} />
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
}: {
  entry: ServerEntry
  active: boolean
  unreadCount: number
  index: number
  onPress: () => void
}) {
  const homePalette = useUnifiedHomePalette()

  return (
    <Reanimated.View entering={FadeInRight.delay(index * 28).springify()}>
      <UnifiedGesturePressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.unifiedRailServerTouch,
          pressed ? styles.unifiedPressed : null,
        ]}
      >
        <View
          style={[
            styles.unifiedRailAvatar,
            {
              borderColor: active ? homePalette.accent : homePalette.buttonBorder,
              borderWidth: active ? UNIFIED_ACTIVE_SERVER_BORDER_WIDTH : StyleSheet.hairlineWidth,
              backgroundColor: active ? homePalette.accentSurface : homePalette.buttonSurface,
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
          <View style={[styles.unifiedRailUnread, { backgroundColor: homePalette.danger }]}>
            <Text style={styles.unifiedRailBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
          </View>
        )}
      </UnifiedGesturePressable>
    </Reanimated.View>
  )
}

function UnifiedDirectMessageRailItem({
  channel,
  unreadCount,
  index,
  onPress,
}: {
  channel: DirectChannelEntry
  unreadCount: number
  index: number
  onPress: () => void
}) {
  const homePalette = useUnifiedHomePalette()
  const peer = channel.otherUser
  if (!peer) return null

  return (
    <Reanimated.View entering={FadeInRight.delay(index * 28).springify()}>
      <MotionPressable onPress={onPress} contentStyle={styles.unifiedRailServerTouch}>
        <View
          style={[
            styles.unifiedRailDirectAvatar,
            {
              borderColor: homePalette.buttonBorder,
              backgroundColor: homePalette.buttonSurface,
            },
          ]}
        >
          <Avatar
            uri={peer.avatarUrl}
            name={peer.displayName || peer.username}
            size={size.controlMd}
            userId={peer.id}
            status={normalizePresenceStatus(peer.status)}
            showStatus
            borderless
          />
        </View>
        {unreadCount > 0 ? (
          <View style={[styles.unifiedRailUnread, { backgroundColor: homePalette.danger }]}>
            <Text style={styles.unifiedRailBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
          </View>
        ) : null}
      </MotionPressable>
    </Reanimated.View>
  )
}

function UnifiedChannelRow({
  channel,
  unreadCount,
  onPress,
}: {
  channel: UnifiedChannel
  unreadCount: number
  onPress: () => void
}) {
  const homePalette = useUnifiedHomePalette()
  const Icon = CHANNEL_TYPE_ICONS[channel.type as keyof typeof CHANNEL_TYPE_ICONS] ?? Hash
  const isUnread = unreadCount > 0

  return (
    <UnifiedGesturePressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.unifiedWechatChannelRow,
        {
          backgroundColor: pressed ? homePalette.surfaceMuted : 'transparent',
          borderColor: 'transparent',
        },
      ]}
    >
      <View
        style={[
          styles.unifiedChannelIconTile,
          {
            backgroundColor: homePalette.buttonSurface,
            borderColor: homePalette.buttonBorder,
          },
        ]}
      >
        <Icon
          size={iconSize.sm}
          color={isUnread ? homePalette.accent : homePalette.textMuted}
          strokeWidth={2.5}
        />
      </View>
      <View style={styles.unifiedWechatChannelBody}>
        <View style={styles.unifiedWechatChannelTitleRow}>
          <AppText
            variant="body"
            style={[
              styles.unifiedWechatChannelTitle,
              isUnread ? styles.unifiedHomeText : styles.unifiedHomeSecondaryText,
              { color: isUnread ? homePalette.text : homePalette.textSecondary },
              isUnread ? styles.unifiedWechatChannelTitleUnread : null,
            ]}
            numberOfLines={1}
          >
            {channel.name}
          </AppText>
          {channel.isPrivate ? (
            <Lock size={iconSize.xs} color={homePalette.textMuted} strokeWidth={2.5} />
          ) : null}
          {isUnread ? (
            <View
              style={[
                styles.unifiedChannelUnreadDotInline,
                { backgroundColor: homePalette.danger },
              ]}
            />
          ) : null}
        </View>
      </View>
    </UnifiedGesturePressable>
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
  unifiedRailDivider: {
    width: size.iconButtonSm,
    height: border.hairline,
    borderRadius: radius.full,
    backgroundColor: UNIFIED_HOME_SURFACE_MUTED_COLOR,
    marginVertical: spacing.xs,
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
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: spacing.none, height: spacing.xs },
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
  unifiedRailDirectAvatar: {
    width: size.plusPanelIcon,
    height: size.plusPanelIcon,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
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
    overflow: 'visible',
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
    paddingLeft: UNIFIED_HEADER_LEFT_PADDING,
    paddingRight: spacing.sm,
    paddingTop: spacing.tight,
    paddingBottom: spacing.md,
  },
  unifiedHeaderContent: {
    minHeight: size.controlLg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.none,
    paddingVertical: spacing.sm,
    overflow: 'visible',
  },
  unifiedHeaderAvatarShadow: {
    borderRadius: radius.xl,
    shadowColor: palette.black,
    shadowOpacity: 0.12,
    shadowRadius: 10,
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
    overflow: 'visible',
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
    paddingVertical: spacing.sm,
    overflow: 'visible',
  },
  unifiedServerTitle: {
    lineHeight: lineHeight.lg,
    paddingVertical: spacing.xxs,
  },
  unifiedServerTitleOnCover: {
    textShadowColor: palette.black,
    textShadowOffset: { width: spacing.none, height: spacing.xxs },
    textShadowRadius: 6,
  },
  unifiedHeaderIconOnCover: {
    shadowColor: palette.black,
    shadowOpacity: 0.12,
    shadowRadius: 2,
    shadowOffset: { width: spacing.none, height: spacing.xxs },
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
  unifiedHomeSubtleText: {
    color: palette.neutral500,
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
  unifiedChannelList: {
    paddingLeft: UNIFIED_CHANNEL_LIST_PADDING,
    paddingRight: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.lg,
  },
  unifiedChannelListHeader: {
    marginBottom: spacing.md,
  },
  unifiedChannelScroll: {
    flex: 1,
  },
  unifiedShortcutStage: {
    gap: UNIFIED_HOME_SECTION_GAP,
    marginBottom: UNIFIED_HOME_SECTION_GAP,
  },
  unifiedShortcutGroup: {
    gap: spacing.tight,
  },
  unifiedShortcutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingLeft: UNIFIED_CHANNEL_ROW_PADDING,
    paddingRight: spacing.none,
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
    borderWidth: StyleSheet.hairlineWidth,
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
    gap: spacing.xxs,
    marginBottom: UNIFIED_HOME_SECTION_GAP,
  },
  unifiedChannelSectionHeader: {
    marginBottom: spacing.xxs,
  },
  unifiedChannelSectionHeaderSpaced: {
    marginTop: spacing.md,
  },
  unifiedChannelListItem: {
    marginBottom: spacing.xxs,
  },
  unifiedGroupHeaderRow: {
    minHeight: size.controlXs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  unifiedGroupHeader: {
    flex: 1,
    minWidth: 0,
    minHeight: size.controlXs,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.none,
    paddingRight: spacing.none,
    paddingTop: spacing.none,
    position: 'relative',
  },
  unifiedGroupChevron: {
    position: 'absolute',
    left: -spacing.xs,
    width: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unifiedGroupTitle: {
    marginLeft: UNIFIED_CHANNEL_ROW_PADDING,
  },
  unifiedGroupCreateButton: {
    width: size.iconButtonSm,
    height: size.iconButtonSm,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unifiedWechatChannelRow: {
    minHeight: size.controlSm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: UNIFIED_CHANNEL_ROW_PADDING,
    paddingVertical: spacing.xs,
    paddingRight: spacing.sm,
  },
  unifiedChannelIconTile: {
    width: UNIFIED_CHANNEL_ICON_TILE_SIZE,
    height: UNIFIED_CHANNEL_ICON_TILE_SIZE,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: UNIFIED_HOME_SURFACE_MUTED_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
    position: 'relative',
  },
  unifiedWechatChannelBody: {
    flex: 1,
    minWidth: 0,
  },
  unifiedWechatChannelTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  unifiedWechatChannelTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: fontSize.sm,
    fontWeight: '700',
    lineHeight: lineHeight.sm,
  },
  unifiedWechatChannelTitleUnread: {
    fontWeight: '900',
  },
  unifiedChannelUnreadDotInline: {
    width: size.dotMd,
    height: size.dotMd,
    borderRadius: radius.full,
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
  unifiedDmPickerEmpty: {
    minHeight: size.panelStateMinHeight,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  unifiedDmPickerEmptyText: {
    textAlign: 'center',
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
  createMenuPopover: {
    position: 'absolute',
    width: UNIFIED_CREATE_MENU_WIDTH,
    overflow: 'visible',
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: spacing.none, height: spacing.xs },
    elevation: 24,
  },
  createMenuPanel: {
    width: '100%',
    borderRadius: radius['2xl'],
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.tight,
    overflow: 'hidden',
    zIndex: 2,
  },
  createMenuArrow: {
    position: 'absolute',
    top: -UNIFIED_CREATE_MENU_POINTER_SIZE + spacing.xs,
    width: spacing.none,
    height: spacing.none,
    borderLeftWidth: UNIFIED_CREATE_MENU_POINTER_SIZE,
    borderRightWidth: UNIFIED_CREATE_MENU_POINTER_SIZE,
    borderBottomWidth: UNIFIED_CREATE_MENU_POINTER_SIZE,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    zIndex: 3,
  },
  createMenuInnerStroke: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius['2xl'],
    borderWidth: StyleSheet.hairlineWidth,
    zIndex: 1,
  },
  createMenuBubble: {
    position: 'relative',
    zIndex: 2,
    gap: spacing.none,
  },
  createMenuRow: {
    minHeight: size.controlLg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
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
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surface,
  },
  unifiedStackedIconAction: {
    width: size.iconButtonLg,
    height: size.iconButtonLg,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
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
    gap: spacing.xxs,
  },
  unifiedWorkspaceListContent: {
    gap: spacing.none,
  },
  unifiedPreviewRow: {
    minHeight: size.controlLg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  unifiedPreviewRowText: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xxs,
  },
  unifiedMemberTreeRow: {
    minHeight: size.controlLg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  unifiedBuddyTreeRow: {
    paddingLeft: spacing.none,
  },
  unifiedMemberTreeGuide: {
    width: spacing['3xl'],
    alignSelf: 'stretch',
    position: 'relative',
  },
  unifiedMemberTreeLine: {
    position: 'absolute',
    left: size.avatarSm / 2,
    top: spacing.tight,
    bottom: spacing.tight,
    width: StyleSheet.hairlineWidth,
    borderRadius: radius.full,
  },
  unifiedMemberTreeLineLast: {
    bottom: '50%',
  },
  unifiedMemberTreeBranch: {
    position: 'absolute',
    left: size.avatarSm / 2,
    top: '50%',
    width: spacing['3xl'],
    height: StyleSheet.hairlineWidth,
    borderRadius: radius.full,
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
  edgeList: {
    width: '100%',
  },

  menuItem: {
    minHeight: size.listItemLg,
  },
  menuLabel: {
    flex: 1,
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
})
