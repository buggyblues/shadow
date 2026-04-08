import { Badge, Button, cn, Input, Popover, PopoverContent, PopoverTrigger } from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bell,
  Check,
  Clock,
  MessageCircle,
  Search,
  UserPlus,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { UserAvatar } from '../components/common/avatar'
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
  source: 'friend' | 'owned_claw' | 'rented_claw'
  user: FriendUser
  clawStatus?: 'available' | 'listed' | 'rented_out'
  rentalExpiresAt?: string | null
  createdAt: string
}

interface DmChannelEntry {
  id: string
  userAId: string
  userBId: string
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

const statusColor: Record<string, string> = {
  online: 'bg-success',
  idle: 'bg-warning',
  dnd: 'bg-danger',
  offline: 'bg-text-muted',
}

/* ──────────────── Unified Contact Sidebar ──────────────── */
/* Merges DM conversations + friends into a single list.     */
/* Search filters both. "Add friend" is a small icon action. */
/* Friend requests are a notification badge → popover.       */

export function UnifiedContactSidebar({
  activeDmChannelId,
  onSelectChannel,
  onStartChatWithUser,
}: {
  activeDmChannelId: string | null
  onSelectChannel: (id: string) => void
  onStartChatWithUser: (userId: string) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  const [showAddFriend, setShowAddFriend] = useState(false)
  const [addUsername, setAddUsername] = useState('')

  /* ── Data ── */
  const { data: dmChannels = [] } = useQuery({
    queryKey: ['dm-channels'],
    queryFn: () => fetchApi<DmChannelEntry[]>('/api/dm/channels'),
  })

  const { data: friends = [], isLoading: friendsLoading } = useQuery({
    queryKey: ['friends'],
    queryFn: () => fetchApi<FriendEntry[]>('/api/friends'),
  })

  const { data: pendingReceived = [] } = useQuery({
    queryKey: ['friends-pending'],
    queryFn: () => fetchApi<FriendEntry[]>('/api/friends/pending'),
  })

  useSocketEvent('friend:accepted', () => {
    queryClient.invalidateQueries({ queryKey: ['friends'] })
    queryClient.invalidateQueries({ queryKey: ['dm-channels'] })
  })
  useSocketEvent('friend:request', () => {
    queryClient.invalidateQueries({ queryKey: ['friends-pending'] })
  })

  /* ── Mutations ── */
  const sendRequest = useMutation({
    mutationFn: (username: string) =>
      fetchApi('/api/friends/request', {
        method: 'POST',
        body: JSON.stringify({ username }),
      }),
    onSuccess: () => {
      showToast(t('friends.requestSent', '好友请求已发送！'), 'success')
      setAddUsername('')
      setShowAddFriend(false)
      queryClient.invalidateQueries({ queryKey: ['friends-sent'] })
    },
    onError: (err: Error) => showToast(err.message, 'error'),
  })

  /* ── Filter logic ── */
  const q = searchQuery.toLowerCase()

  // DM channels sorted by last message
  const sortedDms = [...dmChannels]
    .filter((ch) => ch.otherUser)
    .sort((a, b) => {
      const aT = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0
      const bT = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0
      return bT - aT
    })

  const filteredDms = sortedDms.filter((ch) => {
    if (!q) return true
    return (
      (ch.otherUser?.username ?? '').toLowerCase().includes(q) ||
      (ch.otherUser?.displayName ?? '').toLowerCase().includes(q)
    )
  })

  // Friends who do NOT have an existing DM channel (to avoid duplicates)
  const dmUserIds = new Set(sortedDms.map((ch) => ch.otherUser?.id).filter(Boolean))
  const friendsWithoutDm = friends.filter((f) => !dmUserIds.has(f.user.id))

  const filteredFriends = friendsWithoutDm.filter((f) => {
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

  // When searching and no local results, offer "add by username"
  const hasAnyResults = filteredDms.length > 0 || filteredFriends.length > 0
  const showAddSuggestion = q && !hasAnyResults

  const pendingCount = pendingReceived.length

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
              placeholder={t('dm.searchContacts', '搜索联系人')}
              className="!rounded-full h-8 text-sm"
            />
          </div>

          {/* Friend request notification */}
          <FriendRequestBadge count={pendingCount} />

          {/* Add friend icon */}
          <Popover open={showAddFriend} onOpenChange={setShowAddFriend}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="w-8 h-8 rounded-full flex items-center justify-center text-text-muted hover:text-primary hover:bg-primary/10 transition shrink-0"
                title={t('friends.addFriend', '添加好友')}
              >
                <UserPlus size={16} />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-3">
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-text-muted/60 mb-2">
                {t('friends.addFriend', '添加好友')}
              </div>
              <p className="text-text-muted text-xs mb-2">
                {t('friends.addFriendDesc', '你可以通过用户名来添加好友。')}
              </p>
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
                  placeholder={t('friends.usernamePlaceholder', '输入用户名')}
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
        ) : (
          <div className="space-y-0.5">
            {/* Recent conversations */}
            {filteredDms.length > 0 && (
              <>
                <div className="text-[11px] font-black uppercase tracking-[0.2em] text-text-muted/60 px-2.5 pt-2 pb-1.5">
                  {t('dm.recentContacts', '最近联系')} · {filteredDms.length}
                </div>
                {filteredDms.map((ch) => (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => onSelectChannel(ch.id)}
                    className={cn(
                      'flex items-center gap-3 w-full px-2.5 py-2 rounded-xl transition-all text-left',
                      activeDmChannelId === ch.id
                        ? 'bg-primary/10 ring-1 ring-primary/30'
                        : 'hover:bg-bg-tertiary/50',
                    )}
                  >
                    <div className="relative shrink-0">
                      <UserAvatar
                        userId={ch.otherUser?.id ?? ''}
                        avatarUrl={ch.otherUser?.avatarUrl ?? null}
                        displayName={
                          ch.otherUser?.displayName ?? ch.otherUser?.username ?? '?'
                        }
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
                            activeDmChannelId === ch.id
                              ? 'text-primary'
                              : 'text-text-primary',
                          )}
                        >
                          {ch.otherUser?.displayName ?? ch.otherUser?.username}
                        </span>
                        {ch.otherUser?.isBot && (
                          <Badge variant="primary" size="sm">
                            Buddy
                          </Badge>
                        )}
                      </div>
                      <span className="text-text-muted text-xs">
                        {ch.lastMessageAt
                          ? new Date(ch.lastMessageAt).toLocaleDateString()
                          : t('dm.noMessagesYet', '暂无消息')}
                      </span>
                    </div>
                  </button>
                ))}
              </>
            )}

            {/* Friends without DM (online) */}
            {onlineFriends.length > 0 && (
              <>
                <div className="text-[11px] font-black uppercase tracking-[0.2em] text-text-muted/60 px-2.5 pt-3 pb-1.5">
                  {t('member.groupOnline', '在线')} · {onlineFriends.length}
                </div>
                {onlineFriends.map((f) => (
                  <FriendContactItem
                    key={f.friendshipId}
                    friend={f}
                    onStartChat={() => onStartChatWithUser(f.user.id)}
                  />
                ))}
              </>
            )}

            {/* Friends without DM (offline) */}
            {offlineFriends.length > 0 && (
              <>
                <div className="text-[11px] font-black uppercase tracking-[0.2em] text-text-muted/60 px-2.5 pt-3 pb-1.5">
                  {t('member.groupOffline', '离线')} · {offlineFriends.length}
                </div>
                {offlineFriends.map((f) => (
                  <FriendContactItem
                    key={f.friendshipId}
                    friend={f}
                    onStartChat={() => onStartChatWithUser(f.user.id)}
                  />
                ))}
              </>
            )}

            {/* Search: no local results → add friend suggestion */}
            {showAddSuggestion && (
              <div className="px-2.5 py-6 text-center space-y-3">
                <p className="text-text-muted text-sm">
                  {t('dm.noContactFound', '未找到"{{query}}"', { query: searchQuery })}
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
                  {t('dm.addAsContact', '发送好友请求')}
                </Button>
              </div>
            )}

            {/* Truly empty: no DMs, no friends, no search */}
            {!q && filteredDms.length === 0 && friendsWithoutDm.length === 0 && (
              <div className="px-3 py-8 text-center">
                <MessageCircle size={36} className="mx-auto text-text-muted/20 mb-3" />
                <p className="text-text-muted text-sm">
                  {t('dm.emptyContacts', '搜索用户名或点击 + 添加联系人')}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Friend item in sidebar (no DM yet — click to start chat) ── */

function FriendContactItem({
  friend,
  onStartChat,
}: {
  friend: FriendEntry
  onStartChat: () => void
}) {
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
          {user.isBot && (
            <Badge variant="primary" size="sm">
              Buddy
            </Badge>
          )}
        </div>
        <span className="text-text-muted text-xs">@{user.username}</span>
      </div>
      <MessageCircle size={14} className="text-text-muted/40 shrink-0" />
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
      queryClient.invalidateQueries({ queryKey: ['dm-channels'] })
      showToast(t('friends.accepted', '已接受好友请求'), 'success')
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
          title={t('friends.pendingReceived', '待处理请求')}
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
            {t('friends.pendingRequests', '好友请求')}
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
                    {t('friends.wantsToBeYourFriend', '请求添加你为好友')}
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
              {t('friends.pendingSent', '已发送')}
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
                  {t('friends.waiting', '等待中')}
                </Badge>
              </div>
            ))}
          </div>
        )}

        {pendingReceived.length === 0 && pendingSent.length === 0 && (
          <div className="p-6 text-center">
            <p className="text-text-muted text-sm">
              {t('friends.noPending', '暂无待处理的好友请求')}
            </p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
