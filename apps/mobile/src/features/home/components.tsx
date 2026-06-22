import { normalizePresenceStatus } from '@shadowob/shared'
import { BlurView } from 'expo-blur'
import { Image } from 'expo-image'
import {
  AppWindow,
  ChevronDown,
  ChevronRight,
  File,
  FolderOpen,
  Hash,
  Lock,
  type LucideIcon,
  MessageCircle,
  Plus,
  User,
} from 'lucide-react-native'
import {
  forwardRef,
  type ReactNode,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react'
import { useTranslation } from 'react-i18next'
import {
  type AccessibilityRole,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  type StyleProp,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native'
import Reanimated, { FadeInRight } from 'react-native-reanimated'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import { Avatar } from '../../components/common/avatar'
import { AppText, MotionPressable } from '../../components/ui'
import { getImageUrl } from '../../lib/api'
import { border, iconSize, palette, size, spacing, useColors } from '../../theme'
import {
  CHANNEL_TYPE_ICONS,
  UNIFIED_ACTIVE_SERVER_BORDER_WIDTH,
  UNIFIED_SHORTCUT_ICON_AXIS,
} from './constants'
import { styles } from './home.styles'
import { useUnifiedHomePalette } from './palette'
import type {
  BuddyInboxEntry,
  CommandCandidate,
  DirectChannelEntry,
  InboxOpenRequest,
  ServerAppIntegration,
  ServerEntry,
  UnifiedChannel,
  UnifiedServerMember,
  UnifiedWorkspaceNode,
} from './types'
import {
  buddyInboxPresenceStatus,
  buildMemberTreeRows,
  formatWorkspaceSize,
  memberDisplayName,
} from './utils'

export function FrostedBackdrop({
  strong = false,
  muted = false,
}: {
  strong?: boolean
  muted?: boolean
}) {
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

export function UnifiedGesturePressable({
  children,
  onPress,
  onLongPress,
  style,
  accessibilityLabel,
  accessibilityRole = 'button',
}: {
  children: ReactNode
  onPress?: () => void
  onLongPress?: () => void
  style?: UnifiedGesturePressableStyle
  accessibilityLabel?: string
  accessibilityRole?: AccessibilityRole
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      onPress={onPress}
      onLongPress={onLongPress}
      style={style}
    >
      {children}
    </Pressable>
  )
}

export interface UnifiedHomePagerHandle {
  setPage: (page: number, animated?: boolean) => void
}

function clampPagerPage(page: number, pageCount: number) {
  return Math.max(0, Math.min(page, pageCount - 1))
}

export const UnifiedHomePager = forwardRef<
  UnifiedHomePagerHandle,
  { pageWidth: number; initialPage?: number; pages: ReactNode[] }
>(function UnifiedHomePager({ pageWidth, initialPage = 1, pages }, ref) {
  const pageCount = pages.length
  const initialSafePage = clampPagerPage(initialPage, pageCount)
  const pagerRef = useRef<ScrollView>(null)
  const currentPageRef = useRef(initialSafePage)

  const syncPageFromOffset = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (pageWidth <= 0) return
      currentPageRef.current = clampPagerPage(
        Math.round(event.nativeEvent.contentOffset.x / pageWidth),
        pageCount,
      )
    },
    [pageCount, pageWidth],
  )

  const setPage = useCallback(
    (page: number, animated = true) => {
      const nextPage = clampPagerPage(page, pageCount)
      currentPageRef.current = nextPage
      pagerRef.current?.scrollTo({
        x: nextPage * pageWidth,
        y: 0,
        animated,
      })
    },
    [pageCount, pageWidth],
  )
  useImperativeHandle(ref, () => ({ setPage }), [setPage])

  useEffect(() => {
    setPage(currentPageRef.current, false)
  }, [pageWidth, setPage])

  return (
    <ScrollView
      ref={pagerRef}
      horizontal
      pagingEnabled
      bounces={false}
      decelerationRate="fast"
      keyboardDismissMode="none"
      showsHorizontalScrollIndicator={false}
      contentOffset={{ x: initialSafePage * pageWidth, y: 0 }}
      onMomentumScrollEnd={syncPageFromOffset}
      onScrollEndDrag={syncPageFromOffset}
      overScrollMode="never"
      scrollEventThrottle={16}
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
    </ScrollView>
  )
})

export function HeaderCoverOpacityMask() {
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

export function HeaderCoverGradient({ hasCover }: { hasCover: boolean }) {
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

export function RailCoverFade() {
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

export function UnifiedMembersPage({
  members,
  onInvite,
  onOpenMember,
  t,
}: {
  members: UnifiedServerMember[]
  onInvite: () => void
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

export function UnifiedWorkspaceFilesPage({
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

export function UnifiedInboxShortcut({
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
        borderless
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

export function UnifiedAppShortcut({
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

export function UnifiedShortcutSkeleton({ width }: { width: number }) {
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

export function UnifiedServerAppIcon({ iconUrl }: { iconUrl?: string | null }) {
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

export function UnifiedServerRailItem({
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
  onLongPress?: () => void
}) {
  const homePalette = useUnifiedHomePalette()
  const isPrivate = entry.server.isPublic === false

  return (
    <Reanimated.View entering={FadeInRight.delay(index * 28).springify()}>
      <UnifiedGesturePressable
        onPress={onPress}
        onLongPress={onLongPress}
        style={({ pressed }) => [
          styles.unifiedRailServerTouch,
          pressed ? styles.unifiedPressed : null,
        ]}
      >
        <View
          style={[
            styles.unifiedRailAvatarShell,
            { backgroundColor: active ? homePalette.accentSurface : homePalette.buttonSurface },
          ]}
        >
          <View style={styles.unifiedRailAvatar}>
            <Avatar
              uri={entry.server.iconUrl}
              name={entry.server.name}
              size={size.plusPanelIcon}
              userId={entry.server.id}
              shape="server"
            />
          </View>
          <View
            pointerEvents="none"
            style={[
              styles.unifiedRailAvatarOutline,
              {
                borderColor: active ? homePalette.accent : homePalette.buttonBorder,
                borderWidth: active ? UNIFIED_ACTIVE_SERVER_BORDER_WIDTH : StyleSheet.hairlineWidth,
              },
            ]}
          />
        </View>
        {isPrivate ? (
          <View
            style={[
              styles.unifiedRailPrivateBadge,
              {
                backgroundColor: homePalette.buttonSurface,
                borderColor: homePalette.buttonBorder,
              },
            ]}
          >
            <Lock size={iconSize.xs} color={homePalette.textMuted} strokeWidth={2.6} />
          </View>
        ) : null}
        {unreadCount > 0 && (
          <View style={[styles.unifiedRailUnread, { backgroundColor: homePalette.danger }]}>
            <Text style={styles.unifiedRailBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
          </View>
        )}
      </UnifiedGesturePressable>
    </Reanimated.View>
  )
}

export function UnifiedDirectMessageRailItem({
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
        <View style={styles.unifiedRailDirectAvatar}>
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

export function UnifiedChannelRow({
  channel,
  unreadCount,
  onPress,
  onLongPress,
}: {
  channel: UnifiedChannel
  unreadCount: number
  onPress: () => void
  onLongPress?: () => void
}) {
  const homePalette = useUnifiedHomePalette()
  const Icon = CHANNEL_TYPE_ICONS[channel.type as keyof typeof CHANNEL_TYPE_ICONS] ?? Hash
  const isUnread = unreadCount > 0

  return (
    <UnifiedGesturePressable
      onPress={onPress}
      onLongPress={onLongPress}
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

export function UnifiedChannelGroup({
  group,
  collapsed,
  channelUnread,
  onToggle,
  onCreateChannel,
  onOpenChannel,
  onOpenChannelActions,
}: {
  group: { key: string; title: string; data: UnifiedChannel[] }
  collapsed: boolean
  channelUnread?: Record<string, number>
  onToggle: () => void
  onCreateChannel: (type: UnifiedChannel['type']) => void
  onOpenChannel: (channel: UnifiedChannel) => void
  onOpenChannelActions?: (channel: UnifiedChannel) => void
}) {
  const homePalette = useUnifiedHomePalette()
  const canCreateFromGroup = group.key === 'text' || group.key === 'voice'

  return (
    <View style={styles.unifiedChannelGroup}>
      <View style={styles.unifiedGroupHeaderRow}>
        <MotionPressable
          onPress={onToggle}
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
            onPress={() => onCreateChannel(group.key as UnifiedChannel['type'])}
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
              unreadCount={channelUnread?.[channel.id] ?? 0}
              onPress={() => onOpenChannel(channel)}
              onLongPress={onOpenChannelActions ? () => onOpenChannelActions(channel) : undefined}
            />
          ))}
    </View>
  )
}

export function UnifiedShortcutShelf({
  windowWidth,
  inboxes,
  serverApps,
  isInboxesLoading,
  isServerAppsLoading,
  launchAppPending,
  openingInboxRequest,
  selectedServer,
  onLaunchApp,
  onOpenInbox,
  onAddInboxBuddy,
}: {
  windowWidth: number
  inboxes: BuddyInboxEntry[]
  serverApps: ServerAppIntegration[]
  isInboxesLoading: boolean
  isServerAppsLoading: boolean
  launchAppPending: boolean
  openingInboxRequest?: InboxOpenRequest
  selectedServer?: ServerEntry
  onLaunchApp: (app: ServerAppIntegration) => void
  onOpenInbox: (entry: BuddyInboxEntry) => void
  onAddInboxBuddy?: () => void
}) {
  const { t } = useTranslation()
  const homePalette = useUnifiedHomePalette()
  const pageWidth = Math.max(
    size.plusPanelIconLg * 4 + spacing.sm * 3,
    windowWidth - (size.plusPanelIcon + spacing.md) - spacing.lg * 2,
  )
  const shortcutTileWidth = (pageWidth - spacing.sm * 3) / 4
  const shortcutLeadingOffset = UNIFIED_SHORTCUT_ICON_AXIS - shortcutTileWidth / 2
  const shortcutSkeletons = [0, 1, 2, 3]
  const appPages = Array.from({ length: Math.ceil(serverApps.length / 4) }, (_, index) =>
    serverApps.slice(index * 4, index * 4 + 4),
  )
  const inboxPages = Array.from({ length: Math.ceil(inboxes.length / 4) }, (_, index) =>
    inboxes.slice(index * 4, index * 4 + 4),
  )

  return (
    <View style={styles.unifiedShortcutStage}>
      {isServerAppsLoading || serverApps.length > 0 ? (
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
                  <UnifiedShortcutSkeleton key={`app-skeleton-${item}`} width={shortcutTileWidth} />
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
                      disabled={launchAppPending}
                      onPress={() => onLaunchApp(app)}
                    />
                  ))}
                </View>
              ))
            )}
          </ScrollView>
          <View style={[styles.unifiedAppTrack, { backgroundColor: homePalette.border }]} />
        </View>
      ) : null}

      {isInboxesLoading || inboxes.length > 0 || onAddInboxBuddy ? (
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
            {onAddInboxBuddy ? (
              <MotionPressable
                accessibilityRole="button"
                accessibilityLabel={t('channel.addAgent')}
                onPress={onAddInboxBuddy}
                contentStyle={styles.unifiedGroupCreateButton}
                hitSlop={spacing.sm}
              >
                <Plus size={iconSize.sm} color={homePalette.textMuted} strokeWidth={2.6} />
              </MotionPressable>
            ) : null}
          </View>
          {isInboxesLoading || inboxes.length > 0 ? (
            <>
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
                          entry.agent.user.displayName ??
                          entry.agent.user.username ??
                          entry.agent.id
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
                            onPress={() => onOpenInbox(entry)}
                          />
                        )
                      })}
                    </View>
                  ))
                )}
              </ScrollView>
              <View style={[styles.unifiedAppTrack, { backgroundColor: homePalette.border }]} />
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}

export function UnifiedCommandCandidateRow({
  candidate,
  isLast,
  borderColor,
  onPress,
}: {
  candidate: CommandCandidate
  isLast: boolean
  borderColor: string
  onPress: () => void
}) {
  const colors = useColors()
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
  const directPeer = candidate.kind === 'direct' ? candidate.channel.otherUser : null

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.commandModalRow,
        { borderBottomColor: isLast ? 'transparent' : borderColor },
        pressed ? styles.unifiedPressed : null,
      ]}
    >
      {candidate.kind === 'server' ? (
        <View style={styles.commandModalAvatarWrap}>
          <Avatar
            uri={candidate.server.server.iconUrl}
            name={candidate.server.server.name}
            size={size.avatarMd}
            userId={candidate.server.server.id}
            shape="server"
          />
          {candidate.server.server.isPublic === false ? (
            <View
              style={[
                styles.commandModalPrivateBadge,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                },
              ]}
            >
              <Lock size={iconSize.xs} color={colors.textMuted} strokeWidth={2.6} />
            </View>
          ) : null}
        </View>
      ) : candidate.kind === 'inbox' ? (
        <Avatar
          uri={candidate.inbox.agent.user.avatarUrl}
          name={inboxLabel ?? candidate.label}
          userId={candidate.inbox.agent.user.id}
          size={size.avatarMd}
          status={buddyInboxPresenceStatus(candidate.inbox, false)}
          showStatus
          borderless
        />
      ) : candidate.kind === 'direct' ? (
        directPeer ? (
          <Avatar
            uri={directPeer.avatarUrl}
            name={candidate.label}
            userId={directPeer.id}
            size={size.avatarMd}
            status={normalizePresenceStatus(directPeer.status)}
            showStatus
            borderless
          />
        ) : (
          <View style={[styles.commandModalIcon, { backgroundColor: colors.inputBackground }]}>
            <MessageCircle size={iconSize.xl} color={colors.textMuted} strokeWidth={2.5} />
          </View>
        )
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
