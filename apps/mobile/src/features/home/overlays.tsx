import { normalizeBuddyRuntimePresenceStatus, normalizePresenceStatus } from '@shadowob/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BlurView } from 'expo-blur'
import {
  Bot,
  ChevronRight,
  Edit3,
  Hash,
  Lock,
  LogOut,
  type LucideIcon,
  Megaphone,
  MessageCircle,
  PawPrint,
  QrCode,
  Server,
  Settings,
  Trash2,
  UserPlus,
  Users,
  Volume2,
  X,
} from 'lucide-react-native'
import { type RefObject, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  type PanResponderInstance,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  type TextInput as TextInputHandle,
  View,
} from 'react-native'
import Reanimated, { FadeInUp } from 'react-native-reanimated'
import { Avatar } from '../../components/common/avatar'
import { BuddyListItem, type BuddyListItemData } from '../../components/common/buddy-list-item'
import {
  AppSwitch,
  AppText,
  Button,
  IconBubble,
  InteractiveSheet,
  MotionPressable,
  SearchField,
  SurfaceList,
  SurfaceListItem,
  TextField,
} from '../../components/ui'
import { fetchApi } from '../../lib/api'
import { selectionHaptic } from '../../lib/haptics'
import { showToast } from '../../lib/toast'
import { border, iconSize, radius, size, spacing, useColors } from '../../theme'
import {
  type MobileChannelActionKey,
  type MobileServerActionKey,
  mobileChannelActionGroups,
  mobileServerActionGroups,
} from './action-menu-policy'
import { UnifiedCommandCandidateRow } from './components'
import { styles } from './home.styles'
import type { CommandCandidate, DirectChannelEntry, ServerEntry, UnifiedChannel } from './types'
import { createMenuLabel, directMessagePeerName } from './utils'

function runAfterSheetClose(onClose: () => void, action: () => void) {
  onClose()
  requestAnimationFrame(() => {
    setTimeout(action, 80)
  })
}

function UnifiedSheetActionRow({
  icon,
  label,
  onPress,
  danger = false,
  last = false,
}: {
  icon: LucideIcon
  label: string
  onPress: () => void
  danger?: boolean
  last?: boolean
}) {
  const colors = useColors()
  const Icon = icon

  return (
    <SurfaceListItem last={last} onPress={onPress} style={styles.sheetActionItem}>
      <Icon
        size={iconSize.lg}
        color={danger ? colors.error : colors.textSecondary}
        strokeWidth={2.2}
      />
      <AppText
        variant="bodyStrong"
        tone={danger ? 'danger' : undefined}
        style={styles.sheetActionLabel}
        numberOfLines={1}
      >
        {label}
      </AppText>
    </SurfaceListItem>
  )
}

export function UnifiedCommandCenterModal({
  visible,
  bottomInset,
  commandCandidates,
  searchQuery,
  commandSearchInputRef,
  commandDismissPanResponder,
  onSearchQueryChange,
  onClose,
  onOpenCandidate,
}: {
  visible: boolean
  bottomInset: number
  commandCandidates: CommandCandidate[]
  searchQuery: string
  commandSearchInputRef: RefObject<TextInputHandle | null>
  commandDismissPanResponder: PanResponderInstance
  onSearchQueryChange: (query: string) => void
  onClose: () => void
  onOpenCandidate: (candidate: CommandCandidate) => void
}) {
  const { t } = useTranslation()
  const colors = useColors()

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onShow={() => commandSearchInputRef.current?.focus()}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
        style={[
          styles.commandModalRoot,
          { paddingBottom: Math.max(bottomInset + spacing.md, spacing['2xl']) },
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
          onPress={onClose}
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
              commandCandidates.map((candidate, index) => (
                <UnifiedCommandCandidateRow
                  key={candidate.id}
                  candidate={candidate}
                  isLast={index === commandCandidates.length - 1}
                  borderColor={colors.frostedBorder}
                  onPress={() => onOpenCandidate(candidate)}
                />
              ))
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
          <SearchField
            ref={commandSearchInputRef}
            value={searchQuery}
            onChangeText={onSearchQueryChange}
            placeholder={t('common.search')}
            fieldIconSize={iconSize['3xl']}
            autoFocus
            autoComplete="off"
            showSoftInputOnFocus
            importantForAutofill="no"
            textContentType="none"
            clearAccessibilityLabel={t('common.clear')}
            containerStyle={styles.commandModalSearchField}
            style={styles.commandModalSearchShell}
            inputStyle={[
              styles.unifiedCommandSearchInput,
              Platform.OS === 'android'
                ? styles.unifiedCommandSearchInputAndroid
                : styles.unifiedCommandSearchInputIos,
            ]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            onPress={onClose}
            hitSlop={spacing.sm}
            style={styles.unifiedCommandSearchClose}
          >
            <X size={iconSize.lg} color={colors.textMuted} strokeWidth={2.5} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

export function UnifiedDirectMessagePickerSheet({
  visible,
  directMessages,
  onClose,
  onOpenChannel,
  onStartChatWithUser,
}: {
  visible: boolean
  directMessages: DirectChannelEntry[]
  onClose: () => void
  onOpenChannel: (channel: DirectChannelEntry) => void
  onStartChatWithUser: (userId: string) => void
}) {
  const { t } = useTranslation()
  const colors = useColors()
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  const [showAddFriend, setShowAddFriend] = useState(false)
  const [addUsername, setAddUsername] = useState('')
  const dmSearchInputRef = useRef<TextInputHandle>(null)
  const dmAddFriendInputRef = useRef<TextInputHandle>(null)

  useEffect(() => {
    if (!visible) return
    setSearchQuery('')
    setShowAddFriend(false)
    setAddUsername('')
  }, [visible])

  const { data: friends = [], isLoading: friendsLoading } = useQuery({
    queryKey: ['friends'],
    queryFn: () => fetchApi<DirectContactFriend[]>('/api/friends'),
    enabled: visible,
  })

  const { data: buddyAgents = [] } = useQuery({
    queryKey: ['agents', 'include-rentals', 'dm-buddy-modes'],
    queryFn: () => fetchApi<DirectContactBuddyAgent[]>('/api/agents?includeRentals=true'),
    enabled: visible,
  })

  const { data: pendingReceived = [] } = useQuery({
    queryKey: ['friends-pending'],
    queryFn: () => fetchApi<DirectContactFriend[]>('/api/friends/pending'),
    enabled: visible,
  })

  const sendRequest = useMutation({
    mutationFn: (username: string) =>
      fetchApi('/api/friends/request', {
        method: 'POST',
        body: JSON.stringify({ username }),
      }),
    onSuccess: () => {
      showToast(t('friends.requestSent', '好友请求已发送'), 'success')
      setAddUsername('')
      setShowAddFriend(false)
      queryClient.invalidateQueries({ queryKey: ['friends-sent'] })
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const q = searchQuery.trim().toLowerCase()
  const sortedDirectChannels = useMemo(
    () =>
      [...directMessages]
        .filter((channel) => channel.otherUser)
        .sort((a, b) => {
          const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0
          const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0
          return bTime - aTime
        }),
    [directMessages],
  )
  const filteredDirectChannels = useMemo(
    () =>
      sortedDirectChannels.filter((channel) => {
        if (!q) return true
        const peer = channel.otherUser
        return (
          (peer?.username ?? '').toLowerCase().includes(q) ||
          (peer?.displayName ?? '').toLowerCase().includes(q)
        )
      }),
    [q, sortedDirectChannels],
  )
  const directUserIds = useMemo(
    () => new Set(sortedDirectChannels.map((channel) => channel.otherUser?.id).filter(Boolean)),
    [sortedDirectChannels],
  )
  const friendsWithoutDirectChannel = useMemo(
    () => friends.filter((friend) => !directUserIds.has(friend.user.id)),
    [directUserIds, friends],
  )
  const filteredFriends = useMemo(
    () =>
      friendsWithoutDirectChannel.filter((friend) => {
        if (!q) return true
        return (
          friend.user.username.toLowerCase().includes(q) ||
          (friend.user.displayName ?? '').toLowerCase().includes(q)
        )
      }),
    [friendsWithoutDirectChannel, q],
  )
  const onlineFriends = filteredFriends.filter((friend) =>
    isDirectContactOnline(friend.user.status),
  )
  const offlineFriends = filteredFriends.filter(
    (friend) => !isDirectContactOnline(friend.user.status),
  )
  const privateBuddyUserIds = useMemo(
    () =>
      new Set(
        buddyAgents
          .filter((agent) => agent.config?.buddyMode !== 'shareable')
          .map((agent) => agent.botUser?.id ?? agent.userId)
          .filter(Boolean),
      ),
    [buddyAgents],
  )
  const hasVisibleResults =
    filteredDirectChannels.length > 0 || onlineFriends.length > 0 || offlineFriends.length > 0
  const showAddSuggestion = Boolean(q) && !hasVisibleResults
  const pendingCount = pendingReceived.length

  const openAddFriend = (username = '') => {
    setAddUsername(username)
    setShowAddFriend(true)
  }

  const renderFriendRow = (friend: DirectContactFriend, last = false) => (
    <SurfaceListItem
      key={friend.friendshipId}
      last={last}
      onPress={() => {
        onClose()
        onStartChatWithUser(friend.user.id)
      }}
      style={styles.menuItem}
    >
      <Avatar
        uri={friend.user.avatarUrl}
        name={friend.user.displayName || friend.user.username}
        size={size.avatarSm}
        userId={friend.user.id}
        status={normalizePresenceStatus(friend.user.status)}
        showStatus
      />
      <View style={overlayStyles.dmContactCopy}>
        <View style={overlayStyles.dmContactNameRow}>
          <AppText variant="bodyStrong" style={styles.menuLabel} numberOfLines={1}>
            {friend.user.displayName || friend.user.username}
          </AppText>
          {friend.user.isBot ? (
            <View style={[overlayStyles.dmBuddyBadge, { backgroundColor: colors.activePill }]}>
              <AppText variant="label" tone="primary">
                {t('common.buddy', 'Buddy')}
              </AppText>
            </View>
          ) : null}
          {friend.user.isBot && privateBuddyUserIds.has(friend.user.id) ? (
            <Lock size={iconSize.xs} color={colors.warning} />
          ) : null}
        </View>
        <AppText variant="label" tone="secondary" numberOfLines={1}>
          @{friend.user.username}
        </AppText>
      </View>
      <ChevronRight size={iconSize.md} color={colors.textMuted} />
    </SurfaceListItem>
  )

  return (
    <InteractiveSheet
      visible={visible}
      onClose={onClose}
      title={t('server.addMenuDm')}
      snapPoints={['70%', '90%']}
      autoFocusRef={showAddFriend ? dmAddFriendInputRef : dmSearchInputRef}
    >
      <View style={overlayStyles.dmSearchRow}>
        <SearchField
          ref={dmSearchInputRef}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={t('dm.searchContacts', '搜索联系人')}
          fieldIconSize={iconSize.xl}
          clearAccessibilityLabel={t('common.clear')}
          containerStyle={overlayStyles.dmSearchField}
        />
        <Button
          variant="glass"
          size="icon"
          icon={UserPlus}
          accessibilityLabel={t('friends.addFriend', '添加好友')}
          onPress={() => openAddFriend(searchQuery.trim())}
        />
      </View>
      {pendingCount > 0 ? (
        <AppText variant="label" tone="secondary">
          {t('friends.pendingReceived', '待处理请求')} · {pendingCount}
        </AppText>
      ) : null}
      {showAddFriend ? (
        <TextField
          ref={dmAddFriendInputRef}
          icon={UserPlus}
          value={addUsername}
          onChangeText={setAddUsername}
          placeholder={t('friends.usernamePlaceholder', '输入用户名')}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="send"
          onSubmitEditing={() => {
            if (addUsername.trim() && !sendRequest.isPending) {
              sendRequest.mutate(addUsername.trim())
            }
          }}
          right={
            <Button
              variant="glass"
              size="xs"
              loading={sendRequest.isPending}
              disabled={!addUsername.trim() || sendRequest.isPending}
              onPress={() => addUsername.trim() && sendRequest.mutate(addUsername.trim())}
            >
              {t('friends.sendRequest', '发送请求')}
            </Button>
          }
        />
      ) : null}
      <ScrollView
        style={overlayStyles.dmContactScroller}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={overlayStyles.dmContactList}
      >
        {friendsLoading ? (
          <View style={styles.unifiedDmPickerEmpty}>
            <AppText variant="bodyStrong" tone="secondary">
              {t('common.loading')}
            </AppText>
          </View>
        ) : (
          <>
            {filteredDirectChannels.length > 0 ? (
              <View style={overlayStyles.dmContactSection}>
                <AppText variant="label" tone="secondary" style={overlayStyles.dmSectionTitle}>
                  {t('dm.recentContacts', '最近联系')} · {filteredDirectChannels.length}
                </AppText>
                <SurfaceList style={styles.edgeList}>
                  {filteredDirectChannels.map((channel, index) => {
                    const peer = channel.otherUser
                    return (
                      <SurfaceListItem
                        key={channel.id}
                        last={index === filteredDirectChannels.length - 1}
                        onPress={() => {
                          onClose()
                          onOpenChannel(channel)
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
                        <View style={overlayStyles.dmContactCopy}>
                          <View style={overlayStyles.dmContactNameRow}>
                            <AppText
                              variant="bodyStrong"
                              style={styles.menuLabel}
                              numberOfLines={1}
                            >
                              {directMessagePeerName(channel)}
                            </AppText>
                            {peer?.isBot ? (
                              <View
                                style={[
                                  overlayStyles.dmBuddyBadge,
                                  { backgroundColor: colors.activePill },
                                ]}
                              >
                                <AppText variant="label" tone="primary">
                                  {t('common.buddy', 'Buddy')}
                                </AppText>
                              </View>
                            ) : null}
                            {peer?.isBot && privateBuddyUserIds.has(peer.id) ? (
                              <Lock size={iconSize.xs} color={colors.warning} />
                            ) : null}
                          </View>
                          <AppText variant="label" tone="secondary" numberOfLines={1}>
                            {channel.lastMessageAt
                              ? new Date(channel.lastMessageAt).toLocaleDateString()
                              : t('dm.noMessagesYet', '暂无消息')}
                          </AppText>
                        </View>
                        <ChevronRight size={iconSize.md} color={colors.textMuted} />
                      </SurfaceListItem>
                    )
                  })}
                </SurfaceList>
              </View>
            ) : null}

            {onlineFriends.length > 0 ? (
              <View style={overlayStyles.dmContactSection}>
                <AppText variant="label" tone="secondary" style={overlayStyles.dmSectionTitle}>
                  {t('member.groupOnline')} · {onlineFriends.length}
                </AppText>
                <SurfaceList style={styles.edgeList}>
                  {onlineFriends.map((friend, index) =>
                    renderFriendRow(friend, index === onlineFriends.length - 1),
                  )}
                </SurfaceList>
              </View>
            ) : null}

            {offlineFriends.length > 0 ? (
              <View style={overlayStyles.dmContactSection}>
                <AppText variant="label" tone="secondary" style={overlayStyles.dmSectionTitle}>
                  {t('member.groupOffline')} · {offlineFriends.length}
                </AppText>
                <SurfaceList style={styles.edgeList}>
                  {offlineFriends.map((friend, index) =>
                    renderFriendRow(friend, index === offlineFriends.length - 1),
                  )}
                </SurfaceList>
              </View>
            ) : null}

            {showAddSuggestion ? (
              <View style={styles.unifiedDmPickerEmpty}>
                <AppText variant="label" tone="secondary" style={styles.unifiedDmPickerEmptyText}>
                  {t('dm.noContactFound', '未找到「{{query}}」', { query: searchQuery })}
                </AppText>
                <Button
                  variant="glass"
                  size="sm"
                  icon={UserPlus}
                  onPress={() => openAddFriend(searchQuery.trim())}
                >
                  {t('dm.addAsContact', '发送好友请求')}
                </Button>
              </View>
            ) : null}

            {!q && !hasVisibleResults ? (
              <View style={styles.unifiedDmPickerEmpty}>
                <IconBubble icon={MessageCircle} tone="muted" size={iconSize.xl} />
                <AppText variant="label" tone="secondary" style={styles.unifiedDmPickerEmptyText}>
                  {t('dm.emptyContacts', '搜索用户名或点击 + 添加联系人')}
                </AppText>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </InteractiveSheet>
  )
}

type CreateChannelType = 'text' | 'voice' | 'announcement'

interface ChannelCategory {
  id: string
  name: string
}

interface DirectContactUser {
  id: string
  username: string
  displayName: string | null
  avatarUrl: string | null
  status?: string | null
  isBot: boolean
}

interface DirectContactFriend {
  friendshipId: string
  source: 'friend' | 'owned_agent' | 'rented_agent'
  user: DirectContactUser
  createdAt: string
}

interface DirectContactBuddyAgent {
  userId: string
  botUser?: {
    id: string
  } | null
  config?: {
    buddyMode?: 'private' | 'shareable'
  } | null
}

interface ServerBuddyMember {
  user?: {
    id: string
    isBot?: boolean
  } | null
}

interface ServerBuddyAgent {
  id: string
  status: string
  lastHeartbeat?: string | null
  totalOnlineSeconds?: number
  createdAt?: string
  updatedAt?: string
  botUser?: {
    id: string
    username: string
    displayName?: string | null
    avatarUrl?: string | null
  } | null
  config?: {
    buddyTag?: string
    buddyMode?: 'private' | 'shareable'
    allowedServerIds?: string[]
  }
  owner?: {
    userId?: string
    id?: string
    username?: string
    displayName?: string | null
  } | null
}

type AddServerBuddyCandidate = BuddyListItemData & {
  key: string
  agentId: string
}

function canBuddyJoinServer(agent: ServerBuddyAgent, serverId: string | undefined) {
  if (!serverId) return false
  if (agent.config?.buddyMode === 'shareable') return true
  return Array.isArray(agent.config?.allowedServerIds)
    ? agent.config.allowedServerIds.includes(serverId)
    : false
}

function isDirectContactOnline(status: string | null | undefined) {
  return ['online', 'idle', 'dnd'].includes(normalizePresenceStatus(status))
}

function channelTypeIcon(type: CreateChannelType) {
  if (type === 'voice') return Volume2
  if (type === 'announcement') return Megaphone
  return Hash
}

function channelTypeLabel(type: CreateChannelType, t: ReturnType<typeof useTranslation>['t']) {
  if (type === 'voice') return t('channel.typeVoice')
  if (type === 'announcement') return t('channel.typeAnnouncement')
  return t('channel.typeText')
}

export function UnifiedCreateMenuModal({
  visible,
  panelLeft,
  panelTop,
  arrowLeft,
  onClose,
  onCreateServer,
  onCreateBuddy,
  onOpenDm,
  onAddFriend,
  onScan,
}: {
  visible: boolean
  panelLeft: number
  panelTop: number
  arrowLeft: number
  onClose: () => void
  onCreateServer: () => void
  onCreateBuddy: () => void
  onOpenDm: () => void
  onAddFriend: () => void
  onScan: () => void
}) {
  const { t } = useTranslation()
  const colors = useColors()
  const itemStyle = ({ pressed }: { pressed: boolean }) => [
    styles.createMenuRow,
    pressed ? { backgroundColor: colors.inputBackground } : null,
    pressed ? styles.unifiedPressed : null,
  ]

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlayModalRoot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]}
        />
        <Reanimated.View
          entering={FadeInUp.duration(180).springify()}
          style={[
            styles.createMenuPopover,
            {
              left: panelLeft,
              top: panelTop,
              shadowColor: colors.shadowStrong,
            },
          ]}
        >
          <View
            pointerEvents="none"
            style={[
              styles.createMenuArrow,
              {
                left: arrowLeft,
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
              <Pressable onPress={onCreateServer} style={itemStyle}>
                <Server size={iconSize.xl} color={colors.textSecondary} strokeWidth={2.35} />
                <AppText variant="bodyStrong" style={styles.menuLabel}>
                  {createMenuLabel(t('home.createServerAction'))}
                </AppText>
              </Pressable>
              <Pressable onPress={onCreateBuddy} style={itemStyle}>
                <Bot size={iconSize.xl} color={colors.textSecondary} strokeWidth={2.35} />
                <AppText variant="bodyStrong" style={styles.menuLabel}>
                  {createMenuLabel(t('home.createBuddyAction'))}
                </AppText>
              </Pressable>
              <Pressable onPress={onOpenDm} style={itemStyle}>
                <MessageCircle size={iconSize.xl} color={colors.textSecondary} strokeWidth={2.35} />
                <AppText variant="bodyStrong" style={styles.menuLabel}>
                  {createMenuLabel(t('server.addMenuDm'))}
                </AppText>
              </Pressable>
              <Pressable onPress={onAddFriend} style={itemStyle}>
                <UserPlus size={iconSize.xl} color={colors.textSecondary} strokeWidth={2.35} />
                <AppText variant="bodyStrong" style={styles.menuLabel}>
                  {createMenuLabel(t('friends.addFriend'))}
                </AppText>
              </Pressable>
              <Pressable onPress={onScan} style={itemStyle}>
                <QrCode size={iconSize.xl} color={colors.textSecondary} strokeWidth={2.35} />
                <AppText variant="bodyStrong" style={styles.menuLabel}>
                  {t('home.scanAction')}
                </AppText>
              </Pressable>
            </View>
          </View>
        </Reanimated.View>
      </View>
    </Modal>
  )
}

export function UnifiedCreateMenuSheet({
  visible,
  onClose,
  onCreateServer,
  onCreateBuddy,
  onOpenDm,
  onAddFriend,
  onScan,
}: {
  visible: boolean
  onClose: () => void
  onCreateServer: () => void
  onCreateBuddy: () => void
  onOpenDm: () => void
  onAddFriend: () => void
  onScan: () => void
}) {
  const { t } = useTranslation()

  return (
    <InteractiveSheet
      visible={visible}
      onClose={onClose}
      title={t('common.create')}
      snapPoints={['46%', '68%']}
    >
      <SurfaceList style={styles.edgeList}>
        <UnifiedSheetActionRow
          icon={Server}
          label={createMenuLabel(t('home.createServerAction'))}
          onPress={() => runAfterSheetClose(onClose, onCreateServer)}
        />
        <UnifiedSheetActionRow
          icon={Bot}
          label={createMenuLabel(t('home.createBuddyAction'))}
          onPress={() => runAfterSheetClose(onClose, onCreateBuddy)}
        />
        <UnifiedSheetActionRow
          icon={MessageCircle}
          label={createMenuLabel(t('server.addMenuDm'))}
          onPress={() => runAfterSheetClose(onClose, onOpenDm)}
        />
        <UnifiedSheetActionRow
          icon={UserPlus}
          label={createMenuLabel(t('friends.addFriend', '添加好友'))}
          onPress={() => runAfterSheetClose(onClose, onAddFriend)}
        />
        <UnifiedSheetActionRow
          icon={QrCode}
          label={t('home.scanAction')}
          onPress={() => runAfterSheetClose(onClose, onScan)}
          last
        />
      </SurfaceList>
    </InteractiveSheet>
  )
}

export function UnifiedAddFriendSheet({
  visible,
  onClose,
}: {
  visible: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [username, setUsername] = useState('')
  const usernameInputRef = useRef<TextInputHandle>(null)

  useEffect(() => {
    if (visible) setUsername('')
  }, [visible])

  const sendRequest = useMutation({
    mutationFn: (value: string) =>
      fetchApi('/api/friends/request', {
        method: 'POST',
        body: JSON.stringify({ username: value }),
      }),
    onSuccess: () => {
      showToast(t('friends.requestSent', '好友请求已发送'), 'success')
      queryClient.invalidateQueries({ queryKey: ['friends-sent'] })
      queryClient.invalidateQueries({ queryKey: ['friends-pending'] })
      onClose()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  return (
    <InteractiveSheet
      visible={visible}
      onClose={onClose}
      title={t('friends.addFriend', '添加好友')}
      subtitle={t('friends.addFriendDesc', '输入用户名来发送好友请求')}
      snapPoints={['34%', '52%']}
      autoFocusRef={usernameInputRef}
      keyboardPresentation="lift"
      footer={
        <Button
          variant="primary"
          size="lg"
          icon={UserPlus}
          disabled={!username.trim() || sendRequest.isPending}
          loading={sendRequest.isPending}
          onPress={() => sendRequest.mutate(username.trim())}
        >
          {t('friends.sendRequest', '发送请求')}
        </Button>
      }
    >
      <TextField
        ref={usernameInputRef}
        value={username}
        onChangeText={setUsername}
        placeholder={t('friends.usernamePlaceholder', '输入用户名')}
        icon={UserPlus}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="send"
        onSubmitEditing={() => {
          if (username.trim() && !sendRequest.isPending) sendRequest.mutate(username.trim())
        }}
      />
    </InteractiveSheet>
  )
}

export function UnifiedCreateChannelSheet({
  visible,
  server,
  initialType,
  onClose,
  onCreated,
}: {
  visible: boolean
  server: ServerEntry | null
  initialType?: CreateChannelType
  onClose: () => void
  onCreated: (channelId: string) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [type, setType] = useState<CreateChannelType>(initialType ?? 'text')
  const [isPrivate, setIsPrivate] = useState(false)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const channelNameInputRef = useRef<TextInputHandle>(null)

  const serverId = server?.server.id

  useEffect(() => {
    if (!visible) return
    setName('')
    setType(initialType ?? 'text')
    setIsPrivate(false)
    setCategoryId(null)
  }, [initialType, visible])

  const { data: categories = [] } = useQuery({
    queryKey: ['categories', serverId],
    queryFn: () => fetchApi<ChannelCategory[]>(`/api/servers/${serverId}/categories`),
    enabled: visible && Boolean(serverId),
  })

  const createChannel = useMutation({
    mutationFn: async () => {
      if (!serverId) throw new Error(t('common.error'))
      return fetchApi<{ id: string }>(`/api/servers/${serverId}/channels`, {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim() || t('server.newChannel'),
          type,
          categoryId,
          isPrivate,
        }),
      })
    },
    onSuccess: (channel) => {
      queryClient.invalidateQueries({ queryKey: ['home-unified-channels', serverId] })
      queryClient.invalidateQueries({ queryKey: ['channels', serverId] })
      queryClient.invalidateQueries({ queryKey: ['home-unified-global-search-data'] })
      onClose()
      onCreated(channel.id)
    },
    onError: (error: Error) => showToast(error.message || t('common.error'), 'error'),
  })

  const TypeIcon = channelTypeIcon(type)

  return (
    <InteractiveSheet
      visible={visible}
      onClose={onClose}
      title={t('server.createChannel')}
      subtitle={server?.server.name}
      snapPoints={categories.length > 0 ? ['52%', '74%'] : ['44%', '64%']}
      autoFocusRef={channelNameInputRef}
      keyboardPresentation="lift"
      footer={
        <Button
          variant="primary"
          size="lg"
          icon={TypeIcon}
          loading={createChannel.isPending}
          disabled={createChannel.isPending}
          onPress={() => {
            selectionHaptic()
            createChannel.mutate()
          }}
        >
          {createChannel.isPending ? t('common.creating') : t('common.create')}
        </Button>
      }
    >
      <TextField
        ref={channelNameInputRef}
        value={name}
        onChangeText={setName}
        placeholder={t('server.channelNamePlaceholder')}
        left={<TypeIcon size={iconSize.lg} />}
        returnKeyType="done"
        editable={!createChannel.isPending}
      />
      <View style={overlayStyles.chipRow}>
        {(['text', 'voice', 'announcement'] as CreateChannelType[]).map((item) => {
          const Icon = channelTypeIcon(item)
          const active = item === type
          return (
            <Button
              key={item}
              variant={active ? 'primary' : 'glass'}
              size="sm"
              icon={Icon}
              onPress={() => {
                if (!active) selectionHaptic()
                setType(item)
              }}
              style={overlayStyles.typeChip}
            >
              {channelTypeLabel(item, t)}
            </Button>
          )
        })}
      </View>
      <MotionPressable
        accessibilityRole="switch"
        onPress={() => {
          selectionHaptic()
          setIsPrivate((value) => !value)
        }}
        contentStyle={overlayStyles.switchRow}
      >
        <View style={overlayStyles.switchCopy}>
          <AppText variant="bodyStrong">{t('channel.privateChannel')}</AppText>
          <AppText variant="label" tone="secondary" numberOfLines={2}>
            {t('channel.privateChannelDesc')}
          </AppText>
        </View>
        <AppSwitch value={isPrivate} onValueChange={setIsPrivate} />
      </MotionPressable>
      {categories.length > 0 ? (
        <View style={overlayStyles.sectionStack}>
          <AppText variant="label" tone="secondary">
            {t('server.channelCategory')}
          </AppText>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={overlayStyles.chipRow}
          >
            <Button
              variant={!categoryId ? 'primary' : 'glass'}
              size="sm"
              onPress={() => setCategoryId(null)}
            >
              {t('server.noCategory')}
            </Button>
            {categories.map((category) => (
              <Button
                key={category.id}
                variant={categoryId === category.id ? 'primary' : 'glass'}
                size="sm"
                onPress={() => setCategoryId(category.id)}
              >
                {category.name}
              </Button>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </InteractiveSheet>
  )
}

export function UnifiedEditChannelSheet({
  visible,
  channel,
  onClose,
  onSaved,
}: {
  visible: boolean
  channel: UnifiedChannel | null
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const editChannelNameInputRef = useRef<TextInputHandle>(null)

  useEffect(() => {
    if (!channel || !visible) return
    setName(channel.name)
    setIsPrivate(Boolean(channel.isPrivate))
  }, [channel, visible])

  const updateChannel = useMutation({
    mutationFn: async () => {
      if (!channel) throw new Error(t('common.error'))
      return fetchApi<UnifiedChannel>(`/api/channels/${channel.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: name.trim(), isPrivate }),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['home-unified-channels'] })
      queryClient.invalidateQueries({ queryKey: ['home-unified-global-search-data'] })
      showToast(t('common.saveSuccess'), 'success')
      onSaved()
      onClose()
    },
    onError: (error: Error) => showToast(error.message || t('common.error'), 'error'),
  })

  return (
    <InteractiveSheet
      visible={visible}
      onClose={onClose}
      title={t('channel.editChannel')}
      subtitle={channel?.name}
      snapPoints={['38%', '56%']}
      autoFocusRef={editChannelNameInputRef}
      keyboardPresentation="lift"
      footer={
        <Button
          variant="primary"
          size="lg"
          icon={Edit3}
          disabled={!name.trim() || updateChannel.isPending}
          loading={updateChannel.isPending}
          onPress={() => updateChannel.mutate()}
        >
          {t('common.save')}
        </Button>
      }
    >
      <TextField
        ref={editChannelNameInputRef}
        value={name}
        onChangeText={setName}
        label={t('channel.channelName')}
        placeholder={t('server.channelNamePlaceholder')}
        editable={!updateChannel.isPending}
      />
      <MotionPressable
        accessibilityRole="switch"
        onPress={() => {
          selectionHaptic()
          setIsPrivate((value) => !value)
        }}
        contentStyle={overlayStyles.switchRow}
      >
        <View style={overlayStyles.switchCopy}>
          <AppText variant="bodyStrong">{t('channel.privateChannel')}</AppText>
          <AppText variant="label" tone="secondary" numberOfLines={2}>
            {t('channel.privateChannelDesc')}
          </AppText>
        </View>
        <AppSwitch value={isPrivate} onValueChange={setIsPrivate} />
      </MotionPressable>
    </InteractiveSheet>
  )
}

export function UnifiedAddServerBuddySheet({
  visible,
  server,
  onClose,
}: {
  visible: boolean
  server: ServerEntry | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const serverId = server?.server.id
  const [search, setSearch] = useState('')
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const addBuddySearchInputRef = useRef<TextInputHandle>(null)

  useEffect(() => {
    if (!visible) return
    setSearch('')
    setSelectedKeys(new Set())
  }, [visible])

  const { data: serverMembers = [] } = useQuery({
    queryKey: ['server-members-for-invite', serverId],
    queryFn: () => fetchApi<ServerBuddyMember[]>(`/api/servers/${serverId}/members`),
    enabled: visible && Boolean(serverId),
  })

  const { data: myAgents = [], isLoading: isAgentsLoading } = useQuery({
    queryKey: ['my-agents-for-invite'],
    queryFn: () => fetchApi<ServerBuddyAgent[]>('/api/agents'),
    enabled: visible,
  })

  const existingBuddyUserIds = useMemo(() => {
    const ids = new Set<string>()
    for (const member of serverMembers) {
      if (member.user?.isBot) ids.add(member.user.id)
    }
    return ids
  }, [serverMembers])

  const searchKeyword = search.trim().toLowerCase()
  const candidates = useMemo<AddServerBuddyCandidate[]>(() => {
    return myAgents
      .flatMap((agent) => {
        const botUser = agent.botUser
        if (!botUser || existingBuddyUserIds.has(botUser.id)) return []
        if (!canBuddyJoinServer(agent, serverId)) return []

        const displayName = botUser.displayName || botUser.username
        if (
          searchKeyword &&
          !displayName.toLowerCase().includes(searchKeyword) &&
          !botUser.username.toLowerCase().includes(searchKeyword)
        ) {
          return []
        }

        return [
          {
            key: `buddy-new:${agent.id}`,
            uid: botUser.id,
            nickname: displayName,
            username: botUser.username,
            avatar: botUser.avatarUrl ?? null,
            status: normalizeBuddyRuntimePresenceStatus({
              agentStatus: agent.status,
              lastHeartbeat: agent.lastHeartbeat,
            }),
            isBot: true,
            canAddToServer: true,
            canAddToChannel: false,
            membershipTier: null,
            membershipLevel: null,
            totalOnlineSeconds: agent.totalOnlineSeconds,
            lastHeartbeat: agent.lastHeartbeat ?? null,
            createdAt: agent.createdAt,
            updatedAt: agent.updatedAt,
            buddyTag: agent.config?.buddyTag ?? null,
            creator: agent.owner
              ? {
                  uid: agent.owner.userId || agent.owner.id || '',
                  nickname: agent.owner.displayName || agent.owner.username || '',
                }
              : null,
            agentId: agent.id,
          },
        ]
      })
      .sort((a, b) => a.nickname.localeCompare(b.nickname))
  }, [existingBuddyUserIds, myAgents, searchKeyword, serverId])

  const selectedAgentIds = useMemo(
    () =>
      candidates
        .filter((candidate) => selectedKeys.has(candidate.key))
        .map((candidate) => candidate.agentId),
    [candidates, selectedKeys],
  )

  const addBuddies = useMutation({
    mutationFn: (agentIds: string[]) => {
      if (!serverId) throw new Error(t('common.error'))
      return fetchApi(`/api/servers/${serverId}/agents`, {
        method: 'POST',
        body: JSON.stringify({ agentIds }),
      })
    },
    onSuccess: () => {
      showToast(t('common.saveSuccess'), 'success')
      queryClient.invalidateQueries({ queryKey: ['server-members-for-invite', serverId] })
      queryClient.invalidateQueries({ queryKey: ['server-members', serverId] })
      queryClient.invalidateQueries({ queryKey: ['home-unified-server-inboxes', serverId] })
      queryClient.invalidateQueries({ queryKey: ['home-unified-global-search-data'] })
      onClose()
    },
    onError: (error: Error) => showToast(error.message || t('common.error'), 'error'),
  })

  const toggleCandidate = (key: string) => {
    setSelectedKeys((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <InteractiveSheet
      visible={visible}
      onClose={onClose}
      title={t('channel.addAgent')}
      subtitle={server?.server.name}
      snapPoints={['64%', '84%']}
      autoFocusRef={addBuddySearchInputRef}
      footer={
        <View style={overlayStyles.addBuddyFooter}>
          <AppText variant="label" tone="secondary" style={overlayStyles.addBuddySelectedText}>
            {t('member.selectedCount', { count: selectedAgentIds.length })}
          </AppText>
          <Button
            variant="primary"
            size="md"
            icon={PawPrint}
            disabled={selectedAgentIds.length === 0 || addBuddies.isPending}
            loading={addBuddies.isPending}
            style={overlayStyles.addBuddyFooterButton}
            onPress={() => addBuddies.mutate(selectedAgentIds)}
          >
            {t('member.addToServer')}
          </Button>
        </View>
      }
    >
      <SearchField
        ref={addBuddySearchInputRef}
        value={search}
        onChangeText={setSearch}
        placeholder={t('channel.searchBuddy')}
        fieldIconSize={iconSize.xl}
        clearAccessibilityLabel={t('common.clear')}
      />
      <FlatList
        style={overlayStyles.addBuddyListScroller}
        data={candidates}
        keyboardShouldPersistTaps="handled"
        keyExtractor={(item) => item.key}
        contentContainerStyle={overlayStyles.addBuddyList}
        renderItem={({ item }) => (
          <BuddyListItem
            member={item}
            showCheckbox
            selected={selectedKeys.has(item.key)}
            onSelect={() => toggleCandidate(item.key)}
          />
        )}
        ListEmptyComponent={
          <View style={overlayStyles.addBuddyEmpty}>
            <AppText variant="bodyStrong" tone="secondary">
              {isAgentsLoading
                ? t('common.loading')
                : myAgents.length === 0
                  ? t('member.noBuddies')
                  : t('member.noInvitable')}
            </AppText>
          </View>
        }
      />
    </InteractiveSheet>
  )
}

export function UnifiedServerActionsSheet({
  visible,
  server,
  onClose,
  onInviteMembers,
  onOpenSettings,
  onDeleteServer,
  onLeaveServer,
}: {
  visible: boolean
  server: ServerEntry | null
  onClose: () => void
  onInviteMembers: (server: ServerEntry) => void
  onOpenSettings: (server: ServerEntry) => void
  onDeleteServer: (server: ServerEntry) => void
  onLeaveServer: (server: ServerEntry) => void
}) {
  const { t } = useTranslation()
  if (!server) return null

  const actionGroups = mobileServerActionGroups(server.member.role)
  if (actionGroups.length === 0) return null

  const actionRows: Record<
    MobileServerActionKey,
    { icon: LucideIcon; label: string; danger?: boolean; onPress: () => void }
  > = {
    inviteMembers: {
      icon: UserPlus,
      label: t('members.inviteMembers'),
      onPress: () => runAfterSheetClose(onClose, () => onInviteMembers(server)),
    },
    serverSettings: {
      icon: Settings,
      label: t('channel.serverSettings'),
      onPress: () => runAfterSheetClose(onClose, () => onOpenSettings(server)),
    },
    leaveServer: {
      icon: LogOut,
      label: t('server.leaveServer'),
      danger: true,
      onPress: () => runAfterSheetClose(onClose, () => onLeaveServer(server)),
    },
    deleteServer: {
      icon: Trash2,
      label: t('server.deleteServer'),
      danger: true,
      onPress: () => runAfterSheetClose(onClose, () => onDeleteServer(server)),
    },
  }

  return (
    <InteractiveSheet
      visible={visible}
      onClose={onClose}
      title={server.server.name}
      snapPoints={server.member.role === 'member' ? ['28%', '38%'] : ['34%', '44%']}
    >
      {actionGroups.map((group) => (
        <SurfaceList key={group.join('-')} style={styles.edgeList}>
          {group.map((actionKey, index) => {
            const action = actionRows[actionKey]
            return (
              <UnifiedSheetActionRow
                key={actionKey}
                icon={action.icon}
                label={action.label}
                danger={action.danger}
                onPress={action.onPress}
                last={index === group.length - 1}
              />
            )
          })}
        </SurfaceList>
      ))}
    </InteractiveSheet>
  )
}

export function UnifiedChannelActionsSheet({
  visible,
  channel,
  canManage,
  onClose,
  onOpenMembers,
  onInviteMembers,
  onEditChannel,
  onDeleteChannel,
}: {
  visible: boolean
  channel: UnifiedChannel | null
  canManage?: boolean
  onClose: () => void
  onOpenMembers: (channel: UnifiedChannel) => void
  onInviteMembers: (channel: UnifiedChannel) => void
  onEditChannel: (channel: UnifiedChannel) => void
  onDeleteChannel: (channel: UnifiedChannel) => void
}) {
  const { t } = useTranslation()
  if (!channel) return null
  const actionGroups = mobileChannelActionGroups(Boolean(canManage))
  const actionRows: Record<
    MobileChannelActionKey,
    { icon: LucideIcon; label: string; danger?: boolean; onPress: () => void }
  > = {
    members: {
      icon: Users,
      label: t('channel.members'),
      onPress: () => runAfterSheetClose(onClose, () => onOpenMembers(channel)),
    },
    inviteMembers: {
      icon: UserPlus,
      label: t('channel.inviteMember'),
      onPress: () => runAfterSheetClose(onClose, () => onInviteMembers(channel)),
    },
    editChannel: {
      icon: Edit3,
      label: t('channel.editChannel'),
      onPress: () => runAfterSheetClose(onClose, () => onEditChannel(channel)),
    },
    deleteChannel: {
      icon: Trash2,
      label: t('channel.deleteChannel'),
      danger: true,
      onPress: () => runAfterSheetClose(onClose, () => onDeleteChannel(channel)),
    },
  }

  return (
    <InteractiveSheet
      visible={visible}
      onClose={onClose}
      title={channel.name}
      snapPoints={canManage ? ['38%', '50%'] : ['28%', '38%']}
    >
      {actionGroups.map((group) => (
        <SurfaceList key={group.join('-')} style={styles.edgeList}>
          {group.map((actionKey, index) => {
            const action = actionRows[actionKey]
            return (
              <UnifiedSheetActionRow
                key={actionKey}
                icon={action.icon}
                label={action.label}
                danger={action.danger}
                onPress={action.onPress}
                last={index === group.length - 1}
              />
            )
          })}
        </SurfaceList>
      ))}
    </InteractiveSheet>
  )
}

export function UnifiedCreateServerSheet({
  visible,
  createName,
  isPublic,
  isPending,
  onClose,
  onCreate,
  onNameChange,
  onPublicChange,
}: {
  visible: boolean
  createName: string
  isPublic: boolean
  isPending: boolean
  onClose: () => void
  onCreate: () => void
  onNameChange: (name: string) => void
  onPublicChange: (isPublic: boolean) => void
}) {
  const { t } = useTranslation()
  const serverNameInputRef = useRef<TextInputHandle>(null)

  return (
    <InteractiveSheet
      visible={visible}
      onClose={onClose}
      title={t('server.createTitle')}
      subtitle={t('server.createSubtitle')}
      snapPoints={['42%', '64%']}
      autoFocusRef={serverNameInputRef}
      keyboardPresentation="lift"
      footer={
        <Button
          variant="primary"
          size="lg"
          onPress={onCreate}
          disabled={!createName.trim() || isPending}
          loading={isPending}
        >
          {t('server.create')}
        </Button>
      }
    >
      <TextField
        ref={serverNameInputRef}
        label={t('server.nameLabel')}
        value={createName}
        onChangeText={onNameChange}
        placeholder={t('server.namePlaceholder')}
      />
      <MotionPressable
        accessibilityRole="switch"
        onPress={() => onPublicChange(!isPublic)}
        contentStyle={overlayStyles.switchRow}
      >
        <View style={overlayStyles.switchCopy}>
          <AppText variant="bodyStrong">{t('server.publicServer')}</AppText>
          <AppText variant="label" tone="secondary" numberOfLines={2}>
            {t('server.publicServerDesc')}
          </AppText>
        </View>
        <AppSwitch value={isPublic} onValueChange={onPublicChange} />
      </MotionPressable>
    </InteractiveSheet>
  )
}

const overlayStyles = StyleSheet.create({
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  typeChip: {
    minHeight: size.controlSm,
  },
  switchRow: {
    minHeight: size.settingsRowMinHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: border.hairline,
    borderRadius: radius['2xl'],
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  switchCopy: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xxs,
  },
  sectionStack: {
    gap: spacing.sm,
  },
  dmSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dmSearchField: {
    flex: 1,
    minWidth: 0,
  },
  dmContactScroller: {
    flex: 1,
    minHeight: 0,
  },
  dmContactList: {
    gap: spacing.md,
    paddingBottom: spacing.sm,
  },
  dmContactSection: {
    gap: spacing.xs,
  },
  dmSectionTitle: {
    paddingHorizontal: spacing.xs,
  },
  dmContactCopy: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xxs,
  },
  dmContactNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minWidth: 0,
  },
  dmBuddyBadge: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
  },
  addBuddyList: {
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  addBuddyListScroller: {
    flex: 1,
    minHeight: 0,
  },
  addBuddyEmpty: {
    minHeight: size.controlLg * 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
  },
  addBuddyFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  addBuddySelectedText: {
    flex: 1,
    minWidth: 0,
  },
  addBuddyFooterButton: {
    minWidth: size.controlLg * 2.4,
  },
})
