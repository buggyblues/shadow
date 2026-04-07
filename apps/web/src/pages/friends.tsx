import { Badge, Button, Card, cn, EmptyState, Input } from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  Check,
  Clock,
  MessageCircle,
  Search,
  Shield,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
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
    online: 'bg-success',
    idle: 'bg-warning',
    dnd: 'bg-danger',
    offline: 'bg-text-muted',
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-bg-primary">
      {/* Header */}
      <div className="flex items-center gap-4 px-4 md:px-6 h-14 border-b border-border-subtle bg-bg-primary/80 backdrop-blur-xl sticky top-0 z-20 shrink-0">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Users size={20} className="text-primary" />
        </div>
        <h2 className="text-base font-black text-text-primary mr-4">
          {t('friends.title', '好友')}
        </h2>
        <div className="flex items-center gap-1 bg-bg-secondary/60 rounded-full p-1">
          {[
            { key: 'all' as const, label: t('friends.tabAll', '全部好友') },
            {
              key: 'pending' as const,
              label: t('friends.tabPending', '待处理'),
              badge: pendingReceived.length,
            },
            { key: 'add' as const, label: t('friends.tabAdd', '添加好友') },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'relative px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest transition-all',
                activeTab === tab.key
                  ? tab.key === 'add'
                    ? 'bg-success text-white shadow-lg shadow-success/25'
                    : 'bg-primary text-white shadow-lg shadow-primary/25'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-modifier-hover',
              )}
            >
              {tab.label}
              {tab.badge ? (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-danger text-white text-[9px] font-bold flex items-center justify-center">
                  {tab.badge}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-hidden">
        {/* All Friends Tab */}
        {activeTab === 'all' && (
          <div className="p-4 md:px-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* Search */}
            <div className="mb-4">
              <Input
                icon={Search}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('friends.searchPlaceholder', '搜索好友')}
                className="!rounded-full"
              />
            </div>

            <div className="text-[11px] font-black uppercase tracking-[0.2em] text-text-secondary mb-3">
              {t('friends.allFriends', '全部好友')} — {filteredFriends.length}
            </div>

            {friendsLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Card key={i} className="p-4">
                    <div className="flex items-center gap-3 animate-pulse">
                      <div className="w-10 h-10 rounded-full bg-bg-modifier-hover" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 w-24 rounded bg-bg-modifier-hover" />
                        <div className="h-2.5 w-16 rounded bg-bg-modifier-hover" />
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            ) : filteredFriends.length === 0 ? (
              <EmptyState
                icon={Users}
                title={
                  searchQuery
                    ? t('friends.noSearchResults', '没有找到匹配的好友')
                    : t('friends.noFriends', '还没有好友，快去添加吧！')
                }
                description={
                  !searchQuery ? t('friends.noFriendsHint', '点击「添加好友」开始') : undefined
                }
                action={
                  !searchQuery ? (
                    <Button variant="primary" size="sm" onClick={() => setActiveTab('add')}>
                      {t('friends.tabAdd', '添加好友')}
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredFriends.map((f) => {
                  const isChatDisabled =
                    f.source === 'owned_claw' &&
                    (f.clawStatus === 'listed' || f.clawStatus === 'rented_out')

                  return (
                    <Card key={f.friendshipId} hoverable className="p-4 group">
                      <div className="flex items-center gap-3">
                        <div className="relative shrink-0">
                          <UserAvatar
                            userId={f.user.id}
                            avatarUrl={f.user.avatarUrl}
                            displayName={f.user.displayName ?? f.user.username}
                            size="md"
                          />
                          <span
                            className={cn(
                              'absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-bg-primary',
                              statusColor[f.user.status] ?? statusColor.offline,
                            )}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-black text-text-primary text-sm truncate">
                              {f.user.displayName ?? f.user.username}
                            </span>
                            {f.user.isBot && (
                              <Badge variant="primary" size="sm">
                                Buddy
                              </Badge>
                            )}
                            {f.source === 'owned_claw' && f.clawStatus === 'listed' && (
                              <Badge variant="warning" size="sm">
                                {t('friends.clawListed', '挂单中')}
                              </Badge>
                            )}
                            {f.source === 'owned_claw' && f.clawStatus === 'rented_out' && (
                              <Badge variant="danger" size="sm">
                                {t('friends.clawRentedOut', '已出租')}
                              </Badge>
                            )}
                            {f.source === 'owned_claw' && f.clawStatus === 'available' && (
                              <Badge variant="success" size="sm">
                                {t('friends.ownedClaw', '我的 Claw')}
                              </Badge>
                            )}
                            {f.source === 'rented_claw' && (
                              <Badge variant="warning" size="sm">
                                {t('friends.rentedClaw', '租赁中')}
                              </Badge>
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
                                  t(
                                    'friends.chatDisabledTooltip',
                                    '该 Claw 已挂单或出租，无法私聊',
                                  ),
                                  'error',
                                )
                              }}
                              className="w-9 h-9 rounded-xl bg-bg-secondary/50 backdrop-blur-sm flex items-center justify-center text-text-muted cursor-not-allowed opacity-50"
                              title={t(
                                'friends.chatDisabledTooltip',
                                '该 Claw 已挂单或出租，无法私聊',
                              )}
                            >
                              <MessageCircle size={16} />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => startChat.mutate(f.user.id)}
                              className="w-9 h-9 rounded-xl bg-bg-secondary hover:bg-primary/10 flex items-center justify-center text-text-secondary hover:text-primary transition"
                              title={t('friends.chat', '聊天')}
                            >
                              <MessageCircle size={16} />
                            </button>
                          )}
                          {f.source === 'friend' && (
                            <button
                              type="button"
                              onClick={() => removeFriend.mutate(f.friendshipId)}
                              className="w-9 h-9 rounded-xl bg-bg-secondary hover:bg-danger/10 flex items-center justify-center text-text-secondary hover:text-danger transition"
                              title={t('friends.remove', '删除好友')}
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Pending Tab */}
        {activeTab === 'pending' && (
          <div className="p-4 md:px-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* Received */}
            {pendingReceived.length > 0 && (
              <>
                <div className="text-[11px] font-black uppercase tracking-[0.2em] text-text-secondary mb-3">
                  {t('friends.pendingReceived', '收到的请求')} — {pendingReceived.length}
                </div>
                <div className="space-y-2 mb-6">
                  {pendingReceived.map((f) => (
                    <Card key={f.friendshipId} className="p-4">
                      <div className="flex items-center gap-3">
                        <UserAvatar
                          userId={f.user.id}
                          avatarUrl={f.user.avatarUrl}
                          displayName={f.user.displayName ?? f.user.username}
                          size="md"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-black text-text-primary text-sm truncate">
                            {f.user.displayName ?? f.user.username}
                          </div>
                          <span className="text-text-muted text-xs">
                            {t('friends.wantsToBeYourFriend', '请求添加你为好友')}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="primary"
                            size="sm"
                            icon={Check}
                            onClick={() => acceptRequest.mutate(f.friendshipId)}
                          >
                            {t('friends.accept', '接受')}
                          </Button>
                          <button
                            type="button"
                            onClick={() => rejectRequest.mutate(f.friendshipId)}
                            className="w-9 h-9 rounded-xl bg-bg-secondary hover:bg-danger/10 flex items-center justify-center text-text-secondary hover:text-danger transition"
                            title={t('friends.reject', '拒绝')}
                          >
                            <X size={16} />
                          </button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </>
            )}

            {/* Sent */}
            {pendingSent.length > 0 && (
              <>
                <div className="text-[11px] font-black uppercase tracking-[0.2em] text-text-secondary mb-3">
                  {t('friends.pendingSent', '已发送的请求')} — {pendingSent.length}
                </div>
                <div className="space-y-2">
                  {pendingSent.map((f) => (
                    <Card key={f.friendshipId} variant="surface" className="p-4">
                      <div className="flex items-center gap-3">
                        <UserAvatar
                          userId={f.user.id}
                          avatarUrl={f.user.avatarUrl}
                          displayName={f.user.displayName ?? f.user.username}
                          size="md"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-black text-text-primary text-sm truncate">
                            {f.user.displayName ?? f.user.username}
                          </div>
                          <span className="text-text-muted text-xs">
                            {t('friends.requestPending', '等待对方接受')}
                          </span>
                        </div>
                        <Badge variant="neutral" size="sm">
                          <Clock size={12} className="mr-1" />
                          {t('friends.waiting', '等待中...')}
                        </Badge>
                      </div>
                    </Card>
                  ))}
                </div>
              </>
            )}

            {pendingReceived.length === 0 && pendingSent.length === 0 && (
              <EmptyState
                icon={Shield}
                title={t('friends.noPending', '暂无待处理的好友请求')}
                description={t('friends.noPendingHint', '当有人向你发送好友请求时，将显示在这里')}
              />
            )}
          </div>
        )}

        {/* Add Friend Tab */}
        {activeTab === 'add' && (
          <div className="p-4 md:px-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="max-w-xl mx-auto pt-8">
              {/* Hero icon */}
              <div className="flex justify-center mb-6">
                <div className="w-24 h-24 rounded-[40px] bg-success/10 flex items-center justify-center">
                  <UserPlus size={40} className="text-success" />
                </div>
              </div>

              <h3 className="text-3xl font-black text-text-primary text-center mb-2">
                {t('friends.addFriend', '添加好友')}
              </h3>
              <p className="text-text-secondary text-sm text-center mb-8">
                {t('friends.addFriendDesc', '你可以通过用户名来添加好友。')}
              </p>

              <Card className="p-6">
                <div className="flex gap-3">
                  <div className="flex-1">
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
                      placeholder={t('friends.usernamePlaceholder', '你可以通过用户名来添加好友。')}
                      autoFocus
                    />
                  </div>
                  <Button
                    variant="primary"
                    size="lg"
                    onClick={() => addUsername.trim() && sendRequest.mutate(addUsername.trim())}
                    disabled={!addUsername.trim() || sendRequest.isPending}
                    loading={sendRequest.isPending}
                  >
                    {t('friends.sendRequest', '发送好友请求')}
                  </Button>
                </div>

                {sendRequest.isError && (
                  <div className="mt-4 p-3 rounded-xl bg-danger/10 text-danger text-sm">
                    {(sendRequest.error as Error).message}
                  </div>
                )}

                {sendRequest.isSuccess && (
                  <div className="mt-4 p-3 rounded-xl bg-success/10 text-success text-sm flex items-center gap-2">
                    <Check size={16} />
                    {t(
                      'friends.requestSentSuccess',
                      '好友请求已成功发送！等待对方确认后即可开始聊天。',
                    )}
                  </div>
                )}
              </Card>

              <Card variant="surface" className="mt-4 p-5 border-dashed">
                <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-text-secondary mb-2">
                  {t('friends.otherWays', '其他添加好友的方式')}
                </h4>
                <p className="text-text-muted text-sm">
                  {t(
                    'friends.otherWaysDesc',
                    '你也可以在服务器中找到其他用户，通过他们的个人资料页面发起好友请求。',
                  )}
                </p>
              </Card>
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
      <span className="px-1.5 py-0.5 rounded bg-danger/10 text-danger text-[11px] font-bold">
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
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[11px] font-bold">
      <Clock className="w-2.5 h-2.5" />
      {text}
    </span>
  )
}
