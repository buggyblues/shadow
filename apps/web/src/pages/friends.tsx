import { Badge, Button, cn, Input, Popover, PopoverContent, PopoverTrigger } from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bell,
  Check,
  CheckSquare,
  ChevronRight,
  Clock,
  LockKeyhole,
  MessageCircle,
  Plus,
  Search,
  Settings2,
  UserPlus,
  X,
} from 'lucide-react'
import { type MouseEvent, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { UserAvatar } from '../components/common/avatar'
import { ContextMenu, type ContextMenuGroup } from '../components/common/context-menu'
import { useSocketEvent } from '../hooks/use-socket'
import { fetchApi } from '../lib/api'
import { showToast } from '../lib/toast'

interface FriendUser {
  id: string
  username: string
  displayName: string | null
  avatarUrl: string | null
  status: string
  isBot: boolean
}

interface FriendEntry {
  friendshipId: string
  source: 'friend' | 'owned_agent' | 'rented_agent'
  user: FriendUser
  agentStatus?: 'available' | 'listed' | 'rented_out'
  rentalExpiresAt?: string | null
  createdAt: string
}

interface DirectChannelEntry {
  id: string
  userAId: string
  userBId: string
  lastMessageAt: string | null
  createdAt: string
  lastMessagePreview?: {
    id: string
    content: string
    createdAt: string
    attachmentCount?: number
  } | null
  otherUser: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
    status: string
    isBot: boolean
  } | null
}

interface BuddyAgentEntry {
  id: string
  userId: string
  config?: {
    buddyMode?: 'private' | 'shareable'
  } | null
  botUser?: {
    id: string
  } | null
}

interface BuddyContactListEntry {
  key: string
  agentId?: string
  channelId?: string
  user: FriendUser
  preview: string
  online: boolean
}

const statusColor: Record<string, string> = {
  online: 'bg-success',
  idle: 'bg-warning',
  dnd: 'bg-danger',
  offline: 'bg-text-muted',
}

/* ──────────────── Unified Contact Sidebar ──────────────── */
/* Merges direct conversations + friends into a single list. */
/* Search filters both. "Add friend" is a small icon action. */
/* Friend requests are a notification badge → popover.       */

export function UnifiedContactSidebar({
  activeDirectChannelId,
  onSelectChannel,
  onStartChatWithUser,
  filterMode = 'all',
  onAddBuddy,
  onConfigureBuddy,
}: {
  activeDirectChannelId: string | null
  onSelectChannel: (id: string) => void
  onStartChatWithUser: (userId: string) => void
  filterMode?: 'all' | 'buddy' | 'friend'
  onAddBuddy?: () => void
  onConfigureBuddy?: (agentId: string) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  const [showAddFriend, setShowAddFriend] = useState(false)
  const [addUsername, setAddUsername] = useState('')
  const [showOfflineBuddies, setShowOfflineBuddies] = useState(false)
  const [selectedBuddyKeys, setSelectedBuddyKeys] = useState<Set<string>>(new Set())
  const [buddySelectionAnchor, setBuddySelectionAnchor] = useState<string | null>(null)
  const [buddyContextMenu, setBuddyContextMenu] = useState<{
    x: number
    y: number
    contactKey: string
  } | null>(null)

  /* ── Data ── */
  const { data: directChannels = [] } = useQuery({
    queryKey: ['direct-channels'],
    queryFn: () => fetchApi<DirectChannelEntry[]>('/api/channels/dm'),
  })

  const { data: friends = [], isLoading: friendsLoading } = useQuery({
    queryKey: ['friends'],
    queryFn: () => fetchApi<FriendEntry[]>('/api/friends'),
  })

  const { data: buddyAgents = [] } = useQuery({
    queryKey: ['agents', 'include-rentals', 'dm-buddy-modes'],
    queryFn: () => fetchApi<BuddyAgentEntry[]>('/api/agents?includeRentals=true'),
  })

  const { data: pendingReceived = [] } = useQuery({
    queryKey: ['friends-pending'],
    queryFn: () => fetchApi<FriendEntry[]>('/api/friends/pending'),
    enabled: filterMode !== 'buddy',
  })

  useSocketEvent('friend:accepted', () => {
    queryClient.invalidateQueries({ queryKey: ['friends'] })
    queryClient.invalidateQueries({ queryKey: ['direct-channels'] })
  })
  useSocketEvent('friend:request', () => {
    queryClient.invalidateQueries({ queryKey: ['friends-pending'] })
  })
  useSocketEvent('message:new', () => {
    queryClient.invalidateQueries({ queryKey: ['direct-channels'] })
  })

  /* ── Mutations ── */
  const sendRequest = useMutation({
    mutationFn: (username: string) =>
      fetchApi('/api/friends/request', {
        method: 'POST',
        body: JSON.stringify({ username }),
      }),
    onSuccess: () => {
      showToast(t('friends.requestSent'), 'success')
      setAddUsername('')
      setShowAddFriend(false)
      queryClient.invalidateQueries({ queryKey: ['friends-sent'] })
    },
    onError: (err: Error) => showToast(err.message, 'error'),
  })

  /* ── Filter logic ── */
  const q = searchQuery.toLowerCase()

  // Direct channels sorted by last message.
  const sortedDirectChannels = [...directChannels]
    .filter((ch) => ch.otherUser)
    .sort((a, b) => {
      const aT = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0
      const bT = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0
      return bT - aT
    })

  const filteredDirectChannels = sortedDirectChannels.filter((ch) => {
    if (!q) return true
    return (
      (ch.otherUser?.username ?? '').toLowerCase().includes(q) ||
      (ch.otherUser?.displayName ?? '').toLowerCase().includes(q)
    )
  })

  // Friends who do not have an existing direct channel, to avoid duplicates.
  const directUserIds = new Set(sortedDirectChannels.map((ch) => ch.otherUser?.id).filter(Boolean))
  const friendsWithoutDirectChannel = friends.filter((f) => !directUserIds.has(f.user.id))

  const filteredFriends = friendsWithoutDirectChannel.filter((f) => {
    if (!q) return true
    return (
      f.user.username.toLowerCase().includes(q) ||
      (f.user.displayName ?? '').toLowerCase().includes(q)
    )
  })

  const onlineFriends = filteredFriends.filter(
    (f) => f.user.status === 'online' || f.user.status === 'idle' || f.user.status === 'dnd',
  )
  const offlineFriends = filteredFriends.filter(
    (f) => f.user.status === 'offline' || !['online', 'idle', 'dnd'].includes(f.user.status),
  )

  const pendingCount = pendingReceived.length
  const privateBuddyUserIds = new Set(
    buddyAgents
      .filter((agent) => agent.config?.buddyMode !== 'shareable')
      .map((agent) => agent.botUser?.id ?? agent.userId),
  )
  const isPrivateBuddyUser = (user: { id: string; isBot: boolean } | null | undefined) =>
    Boolean(user?.isBot && privateBuddyUserIds.has(user.id))
  const matchesFilterMode = (user: { isBot: boolean; status?: string } | null | undefined) => {
    if (filterMode === 'buddy') return user?.isBot === true
    if (filterMode === 'friend') return user?.isBot !== true
    return true
  }
  const visibleDirectChannels = filteredDirectChannels.filter((ch) =>
    matchesFilterMode(ch.otherUser),
  )
  const visibleOnlineFriends = onlineFriends.filter((f) => matchesFilterMode(f.user))
  const visibleOfflineFriends = offlineFriends.filter((f) => matchesFilterMode(f.user))
  const visibleFriendsWithoutDirectChannel = friendsWithoutDirectChannel.filter((f) =>
    matchesFilterMode(f.user),
  )
  const visibleHasAnyResults =
    visibleDirectChannels.length > 0 ||
    visibleOnlineFriends.length > 0 ||
    visibleOfflineFriends.length > 0
  const showAddSuggestion = q && !visibleHasAnyResults

  const isPresenceOnline = (status: string) => ['online', 'idle', 'dnd'].includes(status)
  const agentByUserId = new Map(
    buddyAgents.flatMap((agent) => {
      const userIds = [agent.botUser?.id, agent.userId].filter((userId): userId is string =>
        Boolean(userId),
      )
      return userIds.map((userId) => [userId, agent] as const)
    }),
  )
  const buddyContacts: BuddyContactListEntry[] = [
    ...visibleDirectChannels.map((channel) => {
      const user = channel.otherUser as FriendUser
      return {
        key: `channel:${channel.id}`,
        agentId: agentByUserId.get(user.id)?.id,
        channelId: channel.id,
        user,
        preview:
          channel.lastMessagePreview?.content.trim().replace(/\s+/g, ' ') ||
          (channel.lastMessagePreview?.attachmentCount
            ? t('dm.attachmentMessage')
            : t('dm.noMessagesYet')),
        online: isPresenceOnline(user.status),
      }
    }),
    ...[...visibleOnlineFriends, ...visibleOfflineFriends].map((friend) => ({
      key: `user:${friend.user.id}`,
      agentId: agentByUserId.get(friend.user.id)?.id,
      user: friend.user,
      preview: `@${friend.user.username}`,
      online: isPresenceOnline(friend.user.status),
    })),
  ]
  const onlineBuddyContacts = buddyContacts.filter((contact) => contact.online)
  const offlineBuddyContacts = buddyContacts.filter((contact) => !contact.online)
  const visibleBuddyContacts = [
    ...onlineBuddyContacts,
    ...(showOfflineBuddies || Boolean(q) ? offlineBuddyContacts : []),
  ]

  useEffect(() => {
    const availableKeys = new Set(buddyContacts.map((contact) => contact.key))
    setSelectedBuddyKeys((previous) => {
      const next = new Set([...previous].filter((key) => availableKeys.has(key)))
      return next.size === previous.size ? previous : next
    })
    setBuddySelectionAnchor((previous) =>
      previous && availableKeys.has(previous) ? previous : null,
    )
  }, [directChannels, friends, buddyAgents])

  const openBuddyContact = (contact: BuddyContactListEntry) => {
    if (contact.channelId) {
      onSelectChannel(contact.channelId)
      return
    }
    onStartChatWithUser(contact.user.id)
  }

  const selectBuddyRange = (fromKey: string | null, toKey: string) => {
    const fromIndex = fromKey
      ? visibleBuddyContacts.findIndex((contact) => contact.key === fromKey)
      : -1
    const toIndex = visibleBuddyContacts.findIndex((contact) => contact.key === toKey)
    if (fromIndex < 0 || toIndex < 0) return new Set([toKey])
    const start = Math.min(fromIndex, toIndex)
    const end = Math.max(fromIndex, toIndex)
    return new Set(visibleBuddyContacts.slice(start, end + 1).map((contact) => contact.key))
  }

  const handleBuddyClick = (
    event: MouseEvent<HTMLButtonElement>,
    contact: BuddyContactListEntry,
  ) => {
    setBuddyContextMenu(null)
    if (event.shiftKey) {
      setSelectedBuddyKeys(selectBuddyRange(buddySelectionAnchor, contact.key))
      return
    }
    if (event.metaKey || event.ctrlKey) {
      setSelectedBuddyKeys((previous) => {
        const next = new Set(previous)
        if (next.has(contact.key)) next.delete(contact.key)
        else next.add(contact.key)
        return next
      })
      setBuddySelectionAnchor(contact.key)
      return
    }
    setSelectedBuddyKeys(new Set())
    setBuddySelectionAnchor(contact.key)
    openBuddyContact(contact)
  }

  const handleBuddyContextMenu = (
    event: MouseEvent<HTMLButtonElement>,
    contact: BuddyContactListEntry,
  ) => {
    event.preventDefault()
    setBuddyContextMenu({ x: event.clientX, y: event.clientY, contactKey: contact.key })
  }

  const contextContact = buddyContextMenu
    ? buddyContacts.find((contact) => contact.key === buddyContextMenu.contactKey)
    : undefined
  const contextSelection =
    contextContact && selectedBuddyKeys.has(contextContact.key)
      ? buddyContacts.filter((contact) => selectedBuddyKeys.has(contact.key))
      : contextContact
        ? [contextContact]
        : []
  const singleContextContact = contextSelection.length === 1 ? contextSelection[0] : undefined
  const buddyContextMenuGroups: ContextMenuGroup[] = [
    {
      items: [
        {
          icon: MessageCircle,
          label: t('dm.openConversation'),
          disabled: !singleContextContact,
          onClick: () => singleContextContact && openBuddyContact(singleContextContact),
        },
        {
          icon: Settings2,
          label: t('dm.configureBuddy'),
          disabled: !singleContextContact?.agentId || !onConfigureBuddy,
          onClick: () => {
            if (singleContextContact?.agentId) onConfigureBuddy?.(singleContextContact.agentId)
          },
        },
      ],
    },
    {
      items: [
        {
          icon: CheckSquare,
          label: t('dm.selectAllBuddies'),
          disabled: visibleBuddyContacts.length === 0,
          onClick: () =>
            setSelectedBuddyKeys(new Set(visibleBuddyContacts.map((contact) => contact.key))),
        },
        {
          icon: X,
          label: t('dm.clearSelection'),
          disabled: selectedBuddyKeys.size === 0,
          onClick: () => setSelectedBuddyKeys(new Set()),
        },
      ],
    },
  ]

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header: search + actions */}
      <div className="px-3 pt-3 pb-1 shrink-0 space-y-2">
        <div className="flex items-center gap-1.5">
          <div className="flex-1 relative">
            <Input
              icon={Search}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t(
                filterMode === 'buddy' ? 'agentMgmt.searchPlaceholder' : 'dm.searchContacts',
              )}
              className="!rounded-full h-8 text-sm"
            />
          </div>

          {filterMode === 'buddy' ? (
            onAddBuddy ? (
              <button
                type="button"
                className="w-8 h-8 rounded-full flex items-center justify-center text-text-muted hover:text-primary hover:bg-primary/10 transition shrink-0"
                aria-label={t('agentMgmt.newAgent')}
                title={t('agentMgmt.newAgent')}
                onClick={onAddBuddy}
              >
                <Plus size={17} />
              </button>
            ) : null
          ) : (
            <>
              {/* Friend request notification */}
              <FriendRequestBadge count={pendingCount} />

              {/* Add friend icon */}
              <Popover open={showAddFriend} onOpenChange={setShowAddFriend}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="w-8 h-8 rounded-full flex items-center justify-center text-text-muted hover:text-primary hover:bg-primary/10 transition shrink-0"
                    aria-label={t('friends.addFriend')}
                  >
                    <UserPlus size={16} />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-72 p-3">
                  <div className="text-[11px] font-black uppercase tracking-[0.2em] text-text-muted/60 mb-2">
                    {t('friends.addFriend')}
                  </div>
                  <p className="text-text-muted text-xs mb-2">{t('friends.addFriendDesc')}</p>
                  <div className="flex gap-1.5">
                    <Input
                      value={addUsername}
                      onChange={(e) => setAddUsername(e.target.value)}
                      onKeyDown={(e) => {
                        if (
                          e.key === 'Enter' &&
                          !e.nativeEvent.isComposing &&
                          e.keyCode !== 229 &&
                          addUsername.trim()
                        ) {
                          e.preventDefault()
                          sendRequest.mutate(addUsername.trim())
                        }
                      }}
                      placeholder={t('friends.usernamePlaceholder')}
                      className="text-sm flex-1"
                    />
                    <Button
                      variant="primary"
                      size="sm"
                      icon={UserPlus}
                      onClick={() => addUsername.trim() && sendRequest.mutate(addUsername.trim())}
                      disabled={!addUsername.trim() || sendRequest.isPending}
                      loading={sendRequest.isPending}
                    />
                  </div>
                </PopoverContent>
              </Popover>
            </>
          )}
        </div>
      </div>

      {/* Contact list */}
      <div className="flex-1 overflow-y-auto scrollbar-hidden px-2 pb-3">
        {friendsLoading ? (
          <div className="space-y-2 px-1 pt-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-2 py-2 animate-pulse">
                <div className="w-9 h-9 rounded-full bg-bg-modifier-hover" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-20 rounded bg-bg-modifier-hover" />
                  <div className="h-2 w-14 rounded bg-bg-modifier-hover" />
                </div>
              </div>
            ))}
          </div>
        ) : filterMode === 'buddy' ? (
          <div
            className="space-y-1 pt-1"
            role="listbox"
            aria-label={t('agentMgmt.myBuddies')}
            aria-multiselectable="true"
          >
            {selectedBuddyKeys.size > 0 ? (
              <div className="mx-1 mb-2 flex items-center justify-between rounded-xl border border-primary/20 bg-primary/8 px-2.5 py-2">
                <span className="text-xs font-bold text-primary">
                  {t('dm.selectedBuddies', { count: selectedBuddyKeys.size })}
                </span>
                <button
                  type="button"
                  className="rounded-lg px-2 py-1 text-xs font-bold text-text-muted transition hover:bg-white/8 hover:text-text-primary"
                  onClick={() => setSelectedBuddyKeys(new Set())}
                >
                  {t('dm.clearSelection')}
                </button>
              </div>
            ) : null}

            {onlineBuddyContacts.length > 0 ? (
              <div className="px-2.5 pb-1 pt-2 text-[11px] font-black uppercase tracking-[0.18em] text-text-muted/60">
                {t('member.groupOnline')}
              </div>
            ) : null}
            {onlineBuddyContacts.map((contact) => (
              <BuddyContactItem
                key={contact.key}
                contact={contact}
                active={contact.channelId === activeDirectChannelId}
                selected={selectedBuddyKeys.has(contact.key)}
                onClick={(event) => handleBuddyClick(event, contact)}
                onContextMenu={(event) => handleBuddyContextMenu(event, contact)}
              />
            ))}

            {offlineBuddyContacts.length > 0 ? (
              <>
                <button
                  type="button"
                  aria-expanded={showOfflineBuddies || Boolean(q)}
                  onClick={() => setShowOfflineBuddies((current) => !current)}
                  className="mt-2 flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs font-bold text-text-muted transition hover:bg-white/5 hover:text-text-primary"
                >
                  <span>{t('member.groupOffline')}</span>
                  <ChevronRight
                    size={15}
                    className={cn(
                      'transition-transform',
                      (showOfflineBuddies || Boolean(q)) && 'rotate-90',
                    )}
                  />
                </button>
                {showOfflineBuddies || q
                  ? offlineBuddyContacts.map((contact) => (
                      <BuddyContactItem
                        key={contact.key}
                        contact={contact}
                        active={contact.channelId === activeDirectChannelId}
                        selected={selectedBuddyKeys.has(contact.key)}
                        onClick={(event) => handleBuddyClick(event, contact)}
                        onContextMenu={(event) => handleBuddyContextMenu(event, contact)}
                      />
                    ))
                  : null}
              </>
            ) : null}

            {buddyContacts.length === 0 ? (
              <div className="px-3 py-8 text-center text-sm text-text-muted">
                {q ? t('common.noResults') : t('dm.emptyBuddies')}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-0.5">
            {/* Recent conversations */}
            {visibleDirectChannels.length > 0 && (
              <>
                <div className="text-[11px] font-black uppercase tracking-[0.2em] text-text-muted/60 px-2.5 pt-2 pb-1.5">
                  {t('dm.recentContacts')} · {visibleDirectChannels.length}
                </div>
                {visibleDirectChannels.map((ch) => (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => onSelectChannel(ch.id)}
                    className={cn(
                      'flex items-center gap-3 w-full px-2.5 py-2 rounded-xl transition-all text-left',
                      activeDirectChannelId === ch.id
                        ? 'bg-primary/10 ring-1 ring-primary/30'
                        : 'hover:bg-bg-tertiary/50',
                    )}
                  >
                    <div className="relative shrink-0">
                      <UserAvatar
                        userId={ch.otherUser?.id ?? ''}
                        avatarUrl={ch.otherUser?.avatarUrl ?? null}
                        displayName={ch.otherUser?.displayName ?? ch.otherUser?.username ?? '?'}
                        size="sm"
                      />
                      <span
                        className={cn(
                          'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-bg-primary',
                          statusColor[ch.otherUser?.status ?? 'offline'] ?? statusColor.offline,
                        )}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            'font-bold text-sm truncate',
                            activeDirectChannelId === ch.id ? 'text-primary' : 'text-text-primary',
                          )}
                        >
                          {ch.otherUser?.displayName ?? ch.otherUser?.username}
                        </span>
                        {isPrivateBuddyUser(ch.otherUser) && (
                          <LockKeyhole
                            size={12}
                            className="shrink-0 text-warning"
                            aria-label={t('agentMgmt.modePrivate')}
                          />
                        )}
                        {ch.otherUser?.isBot && (
                          <Badge variant="primary" size="sm">
                            Buddy
                          </Badge>
                        )}
                      </div>
                      <span className="block truncate text-text-muted text-xs">
                        {ch.lastMessagePreview?.content.trim().replace(/\s+/g, ' ') ||
                          (ch.lastMessagePreview?.attachmentCount
                            ? t('dm.attachmentMessage')
                            : t('dm.noMessagesYet'))}
                      </span>
                    </div>
                  </button>
                ))}
              </>
            )}

            {/* Friends without a direct channel (online) */}
            {visibleOnlineFriends.length > 0 && (
              <>
                <div className="text-[11px] font-black uppercase tracking-[0.2em] text-text-muted/60 px-2.5 pt-3 pb-1.5">
                  {t('member.groupOnline')} · {visibleOnlineFriends.length}
                </div>
                {visibleOnlineFriends.map((f) => (
                  <FriendContactItem
                    key={f.friendshipId}
                    friend={f}
                    isPrivateBuddy={isPrivateBuddyUser(f.user)}
                    showBuddyMetadata
                    showMessageIcon
                    onStartChat={() => onStartChatWithUser(f.user.id)}
                  />
                ))}
              </>
            )}

            {/* Friends without a direct channel (offline) */}
            {visibleOfflineFriends.length > 0 && (
              <>
                <div className="text-[11px] font-black uppercase tracking-[0.2em] text-text-muted/60 px-2.5 pt-3 pb-1.5">
                  {t('member.groupOffline')} · {visibleOfflineFriends.length}
                </div>
                {visibleOfflineFriends.map((f) => (
                  <FriendContactItem
                    key={f.friendshipId}
                    friend={f}
                    isPrivateBuddy={isPrivateBuddyUser(f.user)}
                    showBuddyMetadata
                    showMessageIcon
                    onStartChat={() => onStartChatWithUser(f.user.id)}
                  />
                ))}
              </>
            )}

            {/* Search: no local results → add friend suggestion */}
            {showAddSuggestion && (
              <div className="px-2.5 py-6 text-center space-y-3">
                <p className="text-text-muted text-sm">
                  {t('dm.noContactFound', { query: searchQuery })}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={UserPlus}
                  onClick={() => {
                    setAddUsername(searchQuery)
                    setShowAddFriend(true)
                  }}
                >
                  {t('dm.addAsContact')}
                </Button>
              </div>
            )}

            {/* Truly empty: no direct channels, no friends, no search */}
            {!q &&
              visibleDirectChannels.length === 0 &&
              visibleFriendsWithoutDirectChannel.length === 0 && (
                <div className="px-3 py-8 text-center">
                  <MessageCircle size={36} className="mx-auto text-text-muted/20 mb-3" />
                  <p className="text-text-muted text-sm">{t('dm.emptyContacts')}</p>
                </div>
              )}
          </div>
        )}
      </div>

      {buddyContextMenu ? (
        <ContextMenu
          x={buddyContextMenu.x}
          y={buddyContextMenu.y}
          groups={buddyContextMenuGroups}
          onClose={() => setBuddyContextMenu(null)}
          minWidth={210}
        />
      ) : null}
    </div>
  )
}

function BuddyContactItem({
  contact,
  active,
  selected,
  onClick,
  onContextMenu,
}: {
  contact: BuddyContactListEntry
  active: boolean
  selected: boolean
  onClick: (event: MouseEvent<HTMLButtonElement>) => void
  onContextMenu: (event: MouseEvent<HTMLButtonElement>) => void
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={cn(
        'group flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors',
        active ? 'bg-primary/14' : selected ? 'bg-primary/[0.08]' : 'hover:bg-bg-tertiary/50',
      )}
    >
      <div className="relative shrink-0">
        <UserAvatar
          userId={contact.user.id}
          avatarUrl={contact.user.avatarUrl}
          displayName={contact.user.displayName ?? contact.user.username}
          size="sm"
        />
        <span
          className={cn(
            'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-bg-primary',
            statusColor[contact.user.status] ?? statusColor.offline,
          )}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            'truncate text-sm font-bold',
            active ? 'text-primary' : 'text-text-primary',
          )}
        >
          {contact.user.displayName ?? contact.user.username}
        </div>
        <div className="truncate text-xs text-text-muted">{contact.preview}</div>
      </div>
      {selected ? (
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary text-black">
          <Check size={12} strokeWidth={3} />
        </span>
      ) : null}
    </button>
  )
}

/* ── Friend item in sidebar (no direct channel yet — click to start chat) ── */

function FriendContactItem({
  friend,
  isPrivateBuddy,
  showBuddyMetadata,
  showMessageIcon,
  onStartChat,
}: {
  friend: FriendEntry
  isPrivateBuddy: boolean
  showBuddyMetadata: boolean
  showMessageIcon: boolean
  onStartChat: () => void
}) {
  const { t } = useTranslation()
  const { user } = friend
  return (
    <button
      type="button"
      onClick={onStartChat}
      className="flex items-center gap-3 w-full px-2.5 py-2 rounded-xl transition-all text-left hover:bg-bg-tertiary/50"
    >
      <div className="relative shrink-0">
        <UserAvatar
          userId={user.id}
          avatarUrl={user.avatarUrl}
          displayName={user.displayName ?? user.username}
          size="sm"
        />
        <span
          className={cn(
            'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-bg-primary',
            statusColor[user.status] ?? statusColor.offline,
          )}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-sm truncate text-text-primary">
            {user.displayName ?? user.username}
          </span>
          {showBuddyMetadata && isPrivateBuddy && (
            <LockKeyhole
              size={12}
              className="shrink-0 text-warning"
              aria-label={t('agentMgmt.modePrivate')}
            />
          )}
          {showBuddyMetadata && user.isBot && (
            <Badge variant="primary" size="sm">
              Buddy
            </Badge>
          )}
        </div>
        <span className="text-text-muted text-xs">@{user.username}</span>
      </div>
      {showMessageIcon ? <MessageCircle size={14} className="text-text-muted/40 shrink-0" /> : null}
    </button>
  )
}

/* ──────────────── Friend Request Badge + Popover ──────────────── */

function FriendRequestBadge({ count }: { count: number }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)

  const { data: pendingReceived = [] } = useQuery({
    queryKey: ['friends-pending'],
    queryFn: () => fetchApi<FriendEntry[]>('/api/friends/pending'),
  })

  const { data: pendingSent = [] } = useQuery({
    queryKey: ['friends-sent'],
    queryFn: () => fetchApi<FriendEntry[]>('/api/friends/sent'),
  })

  const acceptRequest = useMutation({
    mutationFn: (id: string) => fetchApi(`/api/friends/${id}/accept`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friends'] })
      queryClient.invalidateQueries({ queryKey: ['friends-pending'] })
      queryClient.invalidateQueries({ queryKey: ['direct-channels'] })
      showToast(t('friends.accepted'), 'success')
    },
  })

  const rejectRequest = useMutation({
    mutationFn: (id: string) => fetchApi(`/api/friends/${id}/reject`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friends-pending'] })
    },
  })

  const totalPending = pendingReceived.length + pendingSent.length

  if (totalPending === 0 && count === 0) return null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative w-8 h-8 rounded-full flex items-center justify-center text-text-muted hover:text-primary hover:bg-primary/10 transition shrink-0"
          aria-label={t('friends.pendingReceived')}
        >
          <Bell size={16} />
          {count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-danger text-white text-[10px] font-bold flex items-center justify-center">
              {count > 9 ? '9+' : count}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0 max-h-80 overflow-y-auto">
        <div className="p-3 border-b border-border-subtle">
          <div className="text-[11px] font-black uppercase tracking-[0.2em] text-text-muted/60">
            {t('friends.pendingRequests')}
          </div>
        </div>

        {pendingReceived.length > 0 && (
          <div className="p-2 space-y-1">
            {pendingReceived.map((f) => (
              <div
                key={f.friendshipId}
                className="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-bg-tertiary/50 transition"
              >
                <UserAvatar
                  userId={f.user.id}
                  avatarUrl={f.user.avatarUrl}
                  displayName={f.user.displayName ?? f.user.username}
                  size="sm"
                />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-text-primary text-sm truncate">
                    {f.user.displayName ?? f.user.username}
                  </div>
                  <span className="text-text-muted text-xs">
                    {t('friends.wantsToBeYourFriend')}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => acceptRequest.mutate(f.friendshipId)}
                    className="w-7 h-7 rounded-full bg-success/10 hover:bg-success/20 flex items-center justify-center text-success transition"
                  >
                    <Check size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => rejectRequest.mutate(f.friendshipId)}
                    className="w-7 h-7 rounded-full hover:bg-danger/10 flex items-center justify-center text-text-muted hover:text-danger transition"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {pendingSent.length > 0 && (
          <div className="p-2 border-t border-border-subtle space-y-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted/50 px-2 pt-1">
              {t('friends.pendingSent')}
            </div>
            {pendingSent.map((f) => (
              <div
                key={f.friendshipId}
                className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl"
              >
                <UserAvatar
                  userId={f.user.id}
                  avatarUrl={f.user.avatarUrl}
                  displayName={f.user.displayName ?? f.user.username}
                  size="sm"
                />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-text-primary text-sm truncate">
                    {f.user.displayName ?? f.user.username}
                  </div>
                </div>
                <Badge variant="neutral" size="sm">
                  <Clock size={10} className="mr-0.5" />
                  {t('friends.waiting')}
                </Badge>
              </div>
            ))}
          </div>
        )}

        {pendingReceived.length === 0 && pendingSent.length === 0 && (
          <div className="p-6 text-center">
            <p className="text-text-muted text-sm">{t('friends.noPending')}</p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
