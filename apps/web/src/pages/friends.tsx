import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Check, Clock, MessageCircle, Search, Trash2, UserPlus, Users, X } from 'lucide-react'
import { useEffect, useState } from 'react'
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

type FriendsTab = 'all' | 'pending' | 'add'

export function FriendsContent({ onStartChat }: { onStartChat?: (userId: string) => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<FriendsTab>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [addUsername, setAddUsername] = useState('')

  // Fetch friends
  const { data: friends = [], isLoading: friendsLoading } = useQuery({
    queryKey: ['friends'],
    queryFn: () => fetchApi<FriendEntry[]>('/api/friends'),
  })

  // Fetch pending received requests
  const { data: pendingReceived = [] } = useQuery({
    queryKey: ['friends-pending'],
    queryFn: () => fetchApi<FriendEntry[]>('/api/friends/pending'),
  })

  // Fetch pending sent requests
  const { data: pendingSent = [] } = useQuery({
    queryKey: ['friends-sent'],
    queryFn: () => fetchApi<FriendEntry[]>('/api/friends/sent'),
  })

  // Real-time: refresh pending list when a friend request is received
  useSocketEvent('friend:request', () => {
    queryClient.invalidateQueries({ queryKey: ['friends-pending'] })
  })

  // Real-time: refresh friends list when a friend request is accepted
  useSocketEvent('friend:accepted', () => {
    queryClient.invalidateQueries({ queryKey: ['friends'] })
    queryClient.invalidateQueries({ queryKey: ['friends-sent'] })
  })

  // Send friend request
  const sendRequest = useMutation({
    mutationFn: (username: string) =>
      fetchApi('/api/friends/request', {
        method: 'POST',
        body: JSON.stringify({ username }),
      }),
    onSuccess: () => {
      showToast(t('friends.requestSent', '好友请求已发送！'), 'success')
      setAddUsername('')
      queryClient.invalidateQueries({ queryKey: ['friends-sent'] })
    },
    onError: (err: Error) => {
      showToast(err.message, 'error')
    },
  })

  // Accept request
  const acceptRequest = useMutation({
    mutationFn: (id: string) => fetchApi(`/api/friends/${id}/accept`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friends'] })
      queryClient.invalidateQueries({ queryKey: ['friends-pending'] })
      showToast(t('friends.accepted', '已接受好友请求'), 'success')
    },
  })

  // Reject request
  const rejectRequest = useMutation({
    mutationFn: (id: string) => fetchApi(`/api/friends/${id}/reject`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friends-pending'] })
    },
  })

  // Remove friend
  const removeFriend = useMutation({
    mutationFn: (id: string) => fetchApi(`/api/friends/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friends'] })
      showToast(t('friends.removed', '已删除好友'), 'success')
    },
  })

  // Start chat with a friend
  const startChat = useMutation({
    mutationFn: (userId: string) =>
      fetchApi<{ id: string }>('/api/dm/channels', {
        method: 'POST',
        body: JSON.stringify({ userId }),
      }),
    onSuccess: (data) => {
      if (onStartChat) {
        onStartChat(data.id)
      } else {
        navigate({ to: '/dm/$dmChannelId', params: { dmChannelId: data.id } })
      }
    },
  })

  // Filter friends by search
  const filteredFriends = friends.filter((f) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      f.user.username.toLowerCase().includes(q) ||
      (f.user.displayName ?? '').toLowerCase().includes(q)
    )
  })

  const statusColor: Record<string, string> = {
    online: 'bg-[#23a559]',
    idle: 'bg-amber-500',
    dnd: 'bg-danger',
    offline: 'bg-text-muted',
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header tabs */}
      <div className="flex items-center gap-4 px-4 md:px-6 py-3 border-b border-border-subtle bg-bg-primary shrink-0">
        <Users size={20} className="text-text-muted" />
        <h2 className="text-base font-bold text-text-primary mr-4">{t('friends.title', '好友')}</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
              activeTab === 'all'
                ? 'bg-bg-modifier-active text-text-primary'
                : 'text-text-secondary hover:bg-bg-modifier-hover hover:text-text-primary'
            }`}
          >
            {t('friends.tabAll', '全部好友')}
          </button>
          <button
            onClick={() => setActiveTab('pending')}
            className={`relative px-3 py-1.5 rounded-md text-sm font-medium transition ${
              activeTab === 'pending'
                ? 'bg-bg-modifier-active text-text-primary'
                : 'text-text-secondary hover:bg-bg-modifier-hover hover:text-text-primary'
            }`}
          >
            {t('friends.tabPending', '待处理')}
            {pendingReceived.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-danger text-white text-[10px] font-bold flex items-center justify-center">
                {pendingReceived.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('add')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
              activeTab === 'add'
                ? 'bg-[#23a559] text-white'
                : 'text-[#23a559] bg-transparent hover:bg-[#23a559]/10'
            }`}
          >
            {t('friends.tabAdd', '添加好友')}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* All Friends Tab */}
        {activeTab === 'all' && (
          <div className="p-4 md:px-6">
            {/* Search */}
            <div className="relative mb-4">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('friends.searchPlaceholder', '搜索好友')}
                className="w-full bg-bg-tertiary text-text-primary rounded-md pl-9 pr-4 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="text-[11px] font-bold uppercase text-text-secondary tracking-wide mb-2">
              {t('friends.allFriends', '全部好友')} — {filteredFriends.length}
            </div>

            {friendsLoading ? (
              <div className="text-text-muted text-sm py-8 text-center">
                {t('common.loading', '加载中...')}
              </div>
            ) : filteredFriends.length === 0 ? (
              <div className="text-text-muted text-sm py-8 text-center">
                {searchQuery
                  ? t('friends.noSearchResults', '没有找到匹配的好友')
                  : t('friends.noFriends', '还没有好友，快去添加吧！')}
              </div>
            ) : (
              <div className="space-y-0.5">
                {filteredFriends.map((f) => {
                  const isChatDisabled =
                    f.source === 'owned_claw' &&
                    (f.clawStatus === 'listed' || f.clawStatus === 'rented_out')

                  return (
                    <div
                      key={f.friendshipId}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-bg-modifier-hover group transition"
                    >
                      <div className="relative">
                        <UserAvatar
                          userId={f.user.id}
                          avatarUrl={f.user.avatarUrl}
                          displayName={f.user.displayName ?? f.user.username}
                          size="md"
                        />
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-bg-primary ${statusColor[f.user.status] ?? statusColor.offline}`}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-text-primary text-sm truncate">
                            {f.user.displayName ?? f.user.username}
                          </span>
                          {f.user.isBot && (
                            <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-bold">
                              Buddy
                            </span>
                          )}
                          {f.source === 'owned_claw' && f.clawStatus === 'listed' && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 text-[10px] font-bold">
                              {t('friends.clawListed', '挂单中')}
                            </span>
                          )}
                          {f.source === 'owned_claw' && f.clawStatus === 'rented_out' && (
                            <span className="px-1.5 py-0.5 rounded bg-danger/10 text-danger text-[10px] font-bold">
                              {t('friends.clawRentedOut', '已出租')}
                            </span>
                          )}
                          {f.source === 'owned_claw' && f.clawStatus === 'available' && (
                            <span className="px-1.5 py-0.5 rounded bg-[#23a559]/10 text-[#23a559] text-[10px] font-bold">
                              {t('friends.ownedClaw', '我的 Claw')}
                            </span>
                          )}
                          {f.source === 'rented_claw' && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 text-[10px] font-bold">
                              {t('friends.rentedClaw', '租赁中')}
                            </span>
                          )}
                          {f.source === 'rented_claw' && f.rentalExpiresAt && (
                            <FriendRentalCountdown expiresAt={f.rentalExpiresAt} />
                          )}
                        </div>
                        <span className="text-text-muted text-xs">@{f.user.username}</span>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                        {isChatDisabled ? (
                          <button
                            type="button"
                            onClick={() => {
                              showToast(
                                t('friends.chatDisabledTooltip', '该 Claw 已挂单或出租，无法私聊'),
                                'error',
                              )
                            }}
                            className="w-9 h-9 rounded-full bg-bg-secondary flex items-center justify-center text-text-muted cursor-not-allowed opacity-50"
                            title={t(
                              'friends.chatDisabledTooltip',
                              '该 Claw 已挂单或出租，无法私聊',
                            )}
                          >
                            <MessageCircle size={18} />
                          </button>
                        ) : (
                          <button
                            onClick={() => startChat.mutate(f.user.id)}
                            className="w-9 h-9 rounded-full bg-bg-secondary hover:bg-bg-tertiary flex items-center justify-center text-text-secondary hover:text-text-primary transition"
                            title={t('friends.chat', '聊天')}
                          >
                            <MessageCircle size={18} />
                          </button>
                        )}
                        {f.source === 'friend' && (
                          <button
                            onClick={() => removeFriend.mutate(f.friendshipId)}
                            className="w-9 h-9 rounded-full bg-bg-secondary hover:bg-danger/10 flex items-center justify-center text-text-secondary hover:text-danger transition"
                            title={t('friends.remove', '删除好友')}
                          >
                            <Trash2 size={18} />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Pending Tab */}
        {activeTab === 'pending' && (
          <div className="p-4 md:px-6">
            {/* Received */}
            {pendingReceived.length > 0 && (
              <>
                <div className="text-[11px] font-bold uppercase text-text-secondary tracking-wide mb-2">
                  {t('friends.pendingReceived', '收到的请求')} — {pendingReceived.length}
                </div>
                <div className="space-y-0.5 mb-6">
                  {pendingReceived.map((f) => (
                    <div
                      key={f.friendshipId}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-bg-modifier-hover transition"
                    >
                      <UserAvatar
                        userId={f.user.id}
                        avatarUrl={f.user.avatarUrl}
                        displayName={f.user.displayName ?? f.user.username}
                        size="md"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-text-primary text-sm truncate">
                          {f.user.displayName ?? f.user.username}
                        </div>
                        <span className="text-text-muted text-xs">
                          {t('friends.wantsToBeYourFriend', '请求添加你为好友')}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => acceptRequest.mutate(f.friendshipId)}
                          className="w-9 h-9 rounded-full bg-bg-secondary hover:bg-[#23a559]/10 flex items-center justify-center text-text-secondary hover:text-[#23a559] transition"
                          title={t('friends.accept', '接受')}
                        >
                          <Check size={18} />
                        </button>
                        <button
                          onClick={() => rejectRequest.mutate(f.friendshipId)}
                          className="w-9 h-9 rounded-full bg-bg-secondary hover:bg-danger/10 flex items-center justify-center text-text-secondary hover:text-danger transition"
                          title={t('friends.reject', '拒绝')}
                        >
                          <X size={18} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Sent */}
            {pendingSent.length > 0 && (
              <>
                <div className="text-[11px] font-bold uppercase text-text-secondary tracking-wide mb-2">
                  {t('friends.pendingSent', '已发送的请求')} — {pendingSent.length}
                </div>
                <div className="space-y-0.5">
                  {pendingSent.map((f) => (
                    <div
                      key={f.friendshipId}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-bg-modifier-hover transition"
                    >
                      <UserAvatar
                        userId={f.user.id}
                        avatarUrl={f.user.avatarUrl}
                        displayName={f.user.displayName ?? f.user.username}
                        size="md"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-text-primary text-sm truncate">
                          {f.user.displayName ?? f.user.username}
                        </div>
                        <span className="text-text-muted text-xs">
                          {t('friends.requestPending', '等待对方接受')}
                        </span>
                      </div>
                      <span className="text-text-muted text-xs px-2">
                        {t('friends.waiting', '等待中...')}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {pendingReceived.length === 0 && pendingSent.length === 0 && (
              <div className="text-text-muted text-sm py-8 text-center">
                {t('friends.noPending', '暂无待处理的好友请求')}
              </div>
            )}
          </div>
        )}

        {/* Add Friend Tab */}
        {activeTab === 'add' && (
          <div className="p-4 md:px-6">
            <h3 className="text-lg font-bold text-text-primary mb-2">
              {t('friends.addFriend', '添加好友')}
            </h3>
            <p className="text-text-secondary text-sm mb-6">
              {t('friends.addFriendDesc', '你可以通过用户名来添加好友。')}
            </p>

            <div className="flex gap-2">
              <div className="flex-1 relative">
                <input
                  type="text"
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
                  placeholder={t('friends.usernamePlaceholder', '你可以通过用户名来添加好友。')}
                  className="w-full bg-bg-tertiary text-text-primary rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary text-sm"
                  autoFocus
                />
              </div>
              <button
                onClick={() => addUsername.trim() && sendRequest.mutate(addUsername.trim())}
                disabled={!addUsername.trim() || sendRequest.isPending}
                className="px-5 py-3 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm font-bold transition disabled:opacity-50 shrink-0"
              >
                {t('friends.sendRequest', '发送好友请求')}
              </button>
            </div>

            {sendRequest.isError && (
              <p className="text-danger text-sm mt-3">{(sendRequest.error as Error).message}</p>
            )}

            {sendRequest.isSuccess && (
              <p className="text-[#23a559] text-sm mt-3">
                {t(
                  'friends.requestSentSuccess',
                  '好友请求已成功发送！等待对方确认后即可开始聊天。',
                )}
              </p>
            )}

            <div className="mt-8 pt-6 border-t border-border-subtle">
              <h4 className="text-sm font-semibold text-text-secondary mb-2">
                {t('friends.otherWays', '其他添加好友的方式')}
              </h4>
              <p className="text-text-muted text-sm">
                {t(
                  'friends.otherWaysDesc',
                  '你也可以在服务器中找到其他用户，通过他们的个人资料页面发起好友请求。',
                )}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ──────────────── Friend Rental Countdown ──────────────── */

function FriendRentalCountdown({ expiresAt }: { expiresAt: string }) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, new Date(expiresAt).getTime() - Date.now()),
  )

  useEffect(() => {
    const timer = setInterval(() => {
      setRemaining(Math.max(0, new Date(expiresAt).getTime() - Date.now()))
    }, 60_000) // Update every minute for friend list (less critical)
    return () => clearInterval(timer)
  }, [expiresAt])

  if (remaining <= 0) {
    return (
      <span className="px-1.5 py-0.5 rounded bg-red-500/10 text-red-500 text-[10px] font-bold">
        已到期
      </span>
    )
  }

  const totalMin = Math.floor(remaining / 60000)
  const d = Math.floor(totalMin / 1440)
  const h = Math.floor((totalMin % 1440) / 60)
  const m = totalMin % 60
  let text = ''
  if (d > 0) text = `${d}天${h}时`
  else if (h > 0) text = `${h}时${m}分`
  else text = `${m}分`

  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-600 text-[10px] font-bold">
      <Clock className="w-2.5 h-2.5" />
      {text}
    </span>
  )
}
