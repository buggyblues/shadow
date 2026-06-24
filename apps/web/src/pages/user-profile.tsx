import { Badge, Button, GlassPanel, Tabs, TabsContent, TabsList, TabsTrigger } from '@shadowob/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams, useRouter } from '@tanstack/react-router'
import {
  ArrowRight,
  Calendar,
  ChevronLeft,
  HandCoins,
  Package,
  QrCode,
  Shield,
  ShoppingBag,
  Star,
  Store,
  UserPlus,
  X,
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { type ReactNode, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import {
  ActivityHeatmap,
  HourlyDistribution,
  MonthlyTrend,
  RecentActivity,
  StatsCards,
  WeeklyActivityChart,
} from '../components/buddy-dashboard'
import { UserAvatar } from '../components/common/avatar'
import { formatDuration, OnlineRank } from '../components/common/online-rank'
import {
  normalizeBuddyAgentPresenceStatus,
  PresenceAvatar,
} from '../components/common/presence-avatar'
import { CommunityEconomySendModal } from '../components/community-economy/community-economy-send-modal'
import { ProfileCommentSection } from '../components/profile/ProfileCommentSection'
import type { Product, Shop } from '../components/shop/shop-page'
import { PriceDisplay } from '../components/shop/ui/currency'
import { ProductVisual } from '../components/shop/ui/product-visual'
import { fetchApi } from '../lib/api'
import { showToast } from '../lib/toast'
import { useAuthStore } from '../stores/auth.store'

interface UserProfile {
  id: string
  username: string
  displayName: string
  avatarUrl: string | null
  isBot: boolean
  status: string
  createdAt: string
  agent?: {
    id: string
    ownerId: string
    status: string
    lastHeartbeat: string | null
    totalOnlineSeconds: number
    currentActivity?: string | null
    config: { description?: string }
  }
  ownerProfile?: {
    id: string
    username: string
    displayName: string
    avatarUrl: string | null
  } | null
  ownedAgents: Array<{
    id: string
    userId: string
    status: string
    lastHeartbeat: string | null
    totalOnlineSeconds: number
    currentActivity?: string | null
    botUser?: { id: string; username: string; displayName: string; avatarUrl: string | null }
  }>
}

interface DashboardData {
  activityHeatmap: Array<{
    date: string
    messageCount: number
    level: 0 | 1 | 2 | 3 | 4
  }>
  stats: {
    totalMessages: number
    totalOnlineSeconds: number
    activeDays30d: number
    currentStreak: number
    longestStreak: number
  }
  weeklyActivity: Array<{
    date: string
    messageCount: number
  }>
  hourlyDistribution: Array<{
    hour: number
    messageCount: number
  }>
  monthlyTrend: Array<{
    month: string
    messageCount: number
  }>
  recentEvents: Array<{
    id: string
    type: string
    data: Record<string, unknown>
    createdAt: string
  }>
  rentalStats?: {
    totalRentals: number
    totalIncome: number
    averageDuration: number
    currentTenant?: {
      id: string
      username: string
      displayName: string
    }
  }
}

interface FriendEntry {
  user: {
    id: string
  }
}

interface FriendRequestResult {
  status?: 'pending' | 'accepted'
}

function firstProductEntitlementConfig(product: Product) {
  const config = Array.isArray(product.entitlementConfig)
    ? product.entitlementConfig[0]
    : product.entitlementConfig
  return config && typeof config === 'object' ? config : null
}

function productAssetType(product: Product) {
  const config = firstProductEntitlementConfig(product)
  if (config?.resourceType !== 'community_asset') return null
  return product.tags?.find((tag) =>
    ['badge', 'gift', 'coupon', 'service_ticket', 'collectible', 'content_pass', 'reward'].includes(
      tag,
    ),
  )
}

function BuddyCommercePanel({
  profile,
  shop,
  products,
  rentalStats,
}: {
  profile: UserProfile
  shop: Shop | null
  products: Product[]
  rentalStats?: DashboardData['rentalStats']
}) {
  const { t } = useTranslation()
  const activeProducts = products.filter((product) => product.status === 'active')
  const totalSales = activeProducts.reduce((sum, product) => sum + (product.salesCount ?? 0), 0)
  const ratingCount = activeProducts.reduce((sum, product) => sum + (product.ratingCount ?? 0), 0)
  const ratingTotal = activeProducts.reduce(
    (sum, product) => sum + (product.avgRating ?? 0) * (product.ratingCount ?? 0),
    0,
  )
  const averageRating = ratingCount > 0 ? ratingTotal / ratingCount : 0
  const revenue =
    rentalStats?.totalIncome ??
    activeProducts.reduce(
      (sum, product) => sum + (product.basePrice ?? 0) * (product.salesCount ?? 0),
      0,
    )
  const featuredProducts = activeProducts.slice(0, 3)
  const shopPath = `/app/shop/users/${profile.id}?view=buyer`

  return (
    <GlassPanel className="overflow-hidden p-0">
      <div className="border-b border-border-subtle bg-bg-tertiary/35 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-primary">
              {t('profile.agentAsset')}
            </h3>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-text-muted">
              {t('profile.agentAssetHint')}
            </p>
          </div>
          {shop && (
            <a
              href={shopPath}
              className="inline-flex h-9 items-center gap-2 rounded-full border border-border-subtle bg-bg-primary/60 px-3 text-xs font-black text-text-primary transition hover:border-primary/40 hover:text-primary"
            >
              <Store size={14} />
              {t('profile.visitAssetStore')}
            </a>
          )}
        </div>
      </div>

      <div className="grid gap-3 p-5 sm:grid-cols-4">
        <BuddyAssetMetric
          icon={<ShoppingBag size={15} />}
          label={t('profile.availableServices')}
          value={String(activeProducts.length)}
        />
        <BuddyAssetMetric
          icon={<Package size={15} />}
          label={t('profile.deliveryRecords')}
          value={String(totalSales)}
        />
        <BuddyAssetMetric
          icon={<Star size={15} />}
          label={t('profile.creditRating')}
          value={ratingCount > 0 ? averageRating.toFixed(1) : t('profile.noCreditData')}
        />
        <BuddyAssetMetric
          icon={<HandCoins size={15} />}
          label={t('profile.assetRevenue')}
          value={<PriceDisplay amount={revenue} size={14} />}
        />
      </div>

      <div className="border-t border-border-subtle px-5 py-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="text-sm font-black text-text-primary">{t('profile.serviceShelf')}</div>
          {shop && (
            <a href={shopPath} className="text-xs font-black text-primary hover:underline">
              {t('profile.viewAllServices')}
            </a>
          )}
        </div>
        {featuredProducts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border-subtle bg-bg-secondary/35 px-4 py-5 text-sm text-text-muted">
            {t('profile.noAssetServices')}
          </div>
        ) : (
          <div className="grid gap-3">
            {featuredProducts.map((product) => {
              const config = firstProductEntitlementConfig(product)
              return (
                <a
                  key={product.id}
                  href={`/app/shop/products/${product.id}`}
                  className="grid gap-3 rounded-2xl border border-border-subtle bg-bg-secondary/35 p-3 transition hover:border-primary/35 hover:bg-bg-secondary/55 sm:grid-cols-[72px_minmax(0,1fr)_auto]"
                >
                  <ProductVisual
                    name={product.name}
                    media={product.media}
                    productType={product.type}
                    resourceType={config?.resourceType}
                    assetType={productAssetType(product)}
                    showLabel={false}
                    className="h-[72px] w-[72px] shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-black text-text-primary">
                      {product.name}
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-text-muted">
                      {product.summary ?? t('profile.serviceShelfFallback')}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-bold text-text-muted">
                      <span>
                        {t('shop.soldCount')} {product.salesCount}
                      </span>
                      {product.ratingCount > 0 && <span>{product.avgRating.toFixed(1)}</span>}
                    </div>
                  </div>
                  <div className="flex items-center text-danger">
                    <PriceDisplay amount={product.basePrice} size={14} />
                  </div>
                </a>
              )
            })}
          </div>
        )}
      </div>
    </GlassPanel>
  )
}

function BuddyAssetMetric({
  icon,
  label,
  value,
}: {
  icon: ReactNode
  label: string
  value: ReactNode
}) {
  return (
    <div className="rounded-2xl border border-border-subtle bg-bg-secondary/40 px-3 py-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-text-muted">
        <span className="text-primary">{icon}</span>
        {label}
      </div>
      <div className="text-sm font-black text-text-primary">{value}</div>
    </div>
  )
}

type UserProfilePageProps = {
  userId?: string
  embedded?: boolean
  onClose?: () => void
}

export function UserProfilePage({
  userId: userIdOverride,
  embedded = false,
  onClose,
}: UserProfilePageProps = {}) {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const params = useParams({ strict: false }) as { userId?: string }
  const userId = userIdOverride ?? params.userId
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)
  const [showQrCard, setShowQrCard] = useState(false)
  const [dashboardTab, setDashboardTab] = useState<
    'weekly' | 'hourly' | 'monthly' | 'recent' | 'rental'
  >('weekly')
  const [showTipModal, setShowTipModal] = useState(false)

  const {
    data: profile,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['user-profile', userId],
    queryFn: () => fetchApi<UserProfile>(`/api/auth/users/${userId}`),
    enabled: !!userId,
  })

  const { data: dashboardData, isLoading: dashboardLoading } = useQuery({
    queryKey: ['buddy-dashboard', profile?.agent?.id],
    queryFn: () => fetchApi<DashboardData>(`/api/agents/${profile?.agent?.id}/dashboard`),
    enabled: profile?.isBot === true && !!profile.agent?.id,
    refetchInterval: 30000,
  })

  const { data: assetShop } = useQuery({
    queryKey: ['profile-asset-shop', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return null
      try {
        return await fetchApi<Shop>(`/api/users/${profile.id}/shop`)
      } catch {
        return null
      }
    },
    enabled: profile?.isBot === true && !!profile.id,
  })

  const { data: assetProductsData } = useQuery({
    queryKey: ['profile-asset-shop-products', assetShop?.id],
    queryFn: () => fetchApi<{ products: Product[] }>(`/api/shops/${assetShop!.id}/products`),
    enabled: Boolean(assetShop?.id),
  })

  const friendQueryEnabled = Boolean(
    currentUser?.id && profile?.id && currentUser.id !== profile.id,
  )
  const { data: myFriends = [] } = useQuery({
    queryKey: ['friends'],
    queryFn: () => fetchApi<FriendEntry[]>('/api/friends'),
    enabled: friendQueryEnabled,
  })

  const { data: sentRequests = [] } = useQuery({
    queryKey: ['friends-sent'],
    queryFn: () => fetchApi<FriendEntry[]>('/api/friends/sent'),
    enabled: friendQueryEnabled,
  })

  const sendFriendRequest = useMutation({
    mutationFn: () => {
      if (!profile?.username) throw new Error(t('profile.unavailableTitle'))
      return fetchApi<FriendRequestResult>('/api/friends/request', {
        method: 'POST',
        body: JSON.stringify({ username: profile.username }),
      })
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['friends'] })
      queryClient.invalidateQueries({ queryKey: ['friends-sent'] })
      queryClient.invalidateQueries({ queryKey: ['friends-pending'] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
      showToast(
        result.status === 'accepted' ? t('friends.accepted') : t('friends.requestSent'),
        'success',
      )
    },
    onError: (error: Error) => {
      showToast(error.message || t('common.error'), 'error')
    },
  })

  const handleBack = () => {
    if (embedded) {
      onClose?.()
      return
    }
    router.history.back()
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-primary font-black tracking-widest text-xs uppercase animate-pulse">
          {t('common.loading')}...
        </div>
      </div>
    )
  }

  if (isError || !profile) {
    return (
      <div className="flex-1 flex items-center justify-center px-4">
        <GlassPanel className="w-full max-w-lg p-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-border-subtle bg-bg-tertiary/60 text-text-muted">
            <Shield size={22} />
          </div>
          <h1 className="text-xl font-black text-text-primary">{t('profile.unavailableTitle')}</h1>
          <p className="mt-3 text-sm leading-6 text-text-muted">
            {t('profile.unavailableDescription')}
          </p>
          <Button
            className="mt-5"
            variant="glass"
            size="sm"
            onClick={handleBack}
            icon={ChevronLeft}
          >
            {t('common.back')}
          </Button>
        </GlassPanel>
      </div>
    )
  }

  const status = profile.status ?? 'offline'
  const isFriend = myFriends.some((item) => item.user.id === profile.id)
  const isRequestSent = sentRequests.some((item) => item.user.id === profile.id)
  const addFriendDisabled = sendFriendRequest.isPending || isFriend || isRequestSent
  const joinedDate = new Date(profile.createdAt).toLocaleDateString(i18n.resolvedLanguage, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const hasDashboard = profile.isBot && !!profile.agent?.id
  const biographyText = profile.isBot
    ? profile.agent?.config?.description?.trim() || ''
    : t('profile.shortProfile')
  const currentActivity = profile.agent?.currentActivity
  const currentActivityLabel =
    currentActivity === 'thinking'
      ? t('member.activityThinking')
      : currentActivity === 'working'
        ? t('member.activityWorking')
        : currentActivity === 'ready'
          ? t('member.activityReady')
          : currentActivity === 'preparing'
            ? t('member.activityPreparing')
            : currentActivity
  const shopSearch = { view: 'buyer' } as const
  const assetProducts = assetProductsData?.products ?? []

  return (
    <div className="flex-1 overflow-y-auto relative scrollbar-hidden">
      <div className="mx-auto w-full max-w-[1680px] px-4 md:px-6 pt-0 pb-6">
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <GlassPanel className="p-5">
              <div className="flex items-center justify-between gap-3 mb-5">
                <Button variant="ghost" size="sm" onClick={handleBack} icon={ChevronLeft}>
                  {t('common.back')}
                </Button>

                {currentUser?.id === profile.id ? (
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button
                      size="sm"
                      variant="glass"
                      onClick={() => setShowQrCard(true)}
                      icon={QrCode}
                    >
                      {t('profile.myQrCard')}
                    </Button>
                    {assetShop && (
                      <Link
                        to="/shop/users/$userId"
                        params={{ userId: profile.id }}
                        search={shopSearch}
                        className="inline-flex h-9 items-center gap-2 rounded-xl border border-border-subtle bg-bg-tertiary/55 px-3 text-sm font-black text-text-primary transition hover:border-primary/45 hover:text-primary"
                      >
                        <Store size={15} />
                        {t('profile.visitAssetStore')}
                      </Link>
                    )}
                    {!profile.isBot && !assetShop && (
                      <Link
                        to="/shop/users/$userId"
                        params={{ userId: profile.id }}
                        search={shopSearch}
                        className="inline-flex h-9 items-center gap-2 rounded-xl border border-border-subtle bg-bg-tertiary/55 px-3 text-sm font-black text-text-primary transition hover:border-primary/45 hover:text-primary"
                      >
                        <Store size={15} />
                        {t('profile.visitShop')}
                      </Link>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {assetShop && (
                      <Link
                        to="/shop/users/$userId"
                        params={{ userId: profile.id }}
                        search={shopSearch}
                        className="inline-flex h-9 items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 text-sm font-black text-primary transition hover:bg-primary/15"
                      >
                        <Store size={15} />
                        {t('profile.visitAssetStore')}
                      </Link>
                    )}
                    {!profile.isBot && !assetShop && (
                      <Link
                        to="/shop/users/$userId"
                        params={{ userId: profile.id }}
                        search={shopSearch}
                        className="inline-flex h-9 items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 text-sm font-black text-primary transition hover:bg-primary/15"
                      >
                        <Store size={15} />
                        {t('profile.visitShop')}
                      </Link>
                    )}
                    <Button
                      size="sm"
                      variant="glass"
                      icon={HandCoins}
                      onClick={() => setShowTipModal(true)}
                    >
                      {t('communityEconomy.supportUser')}
                    </Button>
                    <Button
                      size="sm"
                      variant={isFriend || isRequestSent ? 'glass' : 'outline'}
                      icon={UserPlus}
                      disabled={addFriendDisabled}
                      loading={sendFriendRequest.isPending}
                      onClick={() => sendFriendRequest.mutate()}
                    >
                      {isFriend
                        ? t('friends.alreadyFriend')
                        : isRequestSent
                          ? t('friends.requestPending')
                          : t('friends.addFriend')}
                    </Button>
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                <div className="relative shrink-0">
                  <UserAvatar
                    userId={profile.id}
                    avatarUrl={profile.avatarUrl}
                    displayName={profile.displayName}
                    size="xl"
                    className="w-24 h-24 md:w-28 md:h-28 rounded-[20px] border-[6px] border-bg-primary/60 shadow-xl"
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <h1 className="text-2xl font-black text-text-primary tracking-tight leading-tight break-words">
                      {profile.displayName}
                    </h1>
                    {profile.isBot && (
                      <Badge variant="info" size="xs">
                        {t('common.buddy')}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-text-muted truncate">@{profile.username}</p>
                  <p className="mt-3 text-sm text-text-primary leading-relaxed break-words">
                    {biographyText || t('profile.lowProfile')}
                  </p>
                  {profile.isBot && currentActivityLabel ? (
                    <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                      <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                      {t('member.buddyWorkStatus', {
                        name: profile.displayName,
                        status: currentActivityLabel,
                      })}
                    </div>
                  ) : null}
                </div>
              </div>
            </GlassPanel>

            <GlassPanel className="p-5 space-y-4">
              <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-text-muted/50">
                {t('profile.about')}
              </h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-text-secondary">
                  <div className="w-8 h-8 rounded-lg bg-bg-tertiary/50 flex items-center justify-center">
                    <Calendar size={15} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted/60 leading-none mb-1">
                      {t('profile.joined')}
                    </p>
                    <p className="text-sm font-bold break-words">{joinedDate}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-text-secondary">
                  <div className="w-8 h-8 rounded-lg bg-bg-tertiary/50 flex items-center justify-center">
                    <Shield size={15} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted/60 leading-none mb-1">
                      {t('profile.status')}
                    </p>
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2.5 h-2.5 rounded-full ${
                          status === 'online'
                            ? 'bg-success'
                            : status === 'idle'
                              ? 'bg-warning'
                              : status === 'dnd'
                                ? 'bg-danger'
                                : 'bg-text-muted'
                        }`}
                      />
                      <p className="text-sm font-bold capitalize">
                        {t(`member.${status}`, status)}
                      </p>
                    </div>
                  </div>
                </div>
                {profile.isBot && profile.agent && (
                  <div className="border-t border-border-subtle pt-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted/60 leading-none mb-2">
                      {t('profile.onlineTime')}
                    </p>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-bold text-text-primary">
                        {formatDuration(profile.agent.totalOnlineSeconds)}
                      </span>
                      <OnlineRank totalSeconds={profile.agent.totalOnlineSeconds} />
                    </div>
                  </div>
                )}
              </div>
            </GlassPanel>
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section className="space-y-5 min-w-0">
              {profile.isBot && (
                <BuddyCommercePanel
                  profile={profile}
                  shop={assetShop ?? null}
                  products={assetProducts}
                  rentalStats={dashboardData?.rentalStats}
                />
              )}

              {hasDashboard && (
                <GlassPanel className="p-5 space-y-3">
                  <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-text-muted/50">
                    {t('buddyDashboard.activityHeatmap')}
                  </h3>

                  {dashboardLoading || !dashboardData ? (
                    <div className="py-4 text-sm text-text-muted">{t('common.loading')}</div>
                  ) : (
                    <ActivityHeatmap data={dashboardData.activityHeatmap} showTitle={false} />
                  )}
                </GlassPanel>
              )}

              <GlassPanel className="p-5">
                <ProfileCommentSection profileUserId={profile.id} />
              </GlassPanel>

              {!profile.isBot && profile.ownedAgents.length > 0 && (
                <GlassPanel className="p-5 space-y-3">
                  <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-text-muted/50">
                    {t('profile.buddies')} ({profile.ownedAgents.length})
                  </h3>
                  <div className="grid gap-2">
                    {profile.ownedAgents.map((agent) => (
                      <Link
                        key={agent.id}
                        to="/profile/$userId"
                        params={{ userId: agent.userId }}
                        className="flex items-center gap-3 p-3 rounded-xl bg-bg-tertiary/50 hover:bg-bg-modifier-hover transition-all group"
                      >
                        <PresenceAvatar
                          userId={agent.userId}
                          avatarUrl={agent.botUser?.avatarUrl ?? null}
                          displayName={agent.botUser?.displayName ?? t('common.buddy')}
                          status={normalizeBuddyAgentPresenceStatus({
                            agentStatus: agent.status,
                            lastHeartbeat: agent.lastHeartbeat,
                          })}
                          size="sm"
                          className="transition-transform group-hover:scale-105"
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-black text-text-primary truncate group-hover:text-primary transition-colors block">
                            {agent.botUser?.displayName ??
                              agent.botUser?.username ??
                              t('common.buddy')}
                          </span>
                          {agent.totalOnlineSeconds > 0 && (
                            <span className="text-[9px] font-black text-text-muted uppercase tracking-tighter">
                              {formatDuration(agent.totalOnlineSeconds)}
                            </span>
                          )}
                        </div>
                      </Link>
                    ))}
                  </div>
                </GlassPanel>
              )}

              {hasDashboard && (
                <GlassPanel className="p-5 space-y-4 overflow-hidden">
                  <div>
                    <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-text-muted/50">
                      {t('buddyDashboard.title')}
                    </h3>
                    <p className="text-xs text-text-muted mt-1">{t('buddyDashboard.subtitle')}</p>
                  </div>

                  {dashboardLoading || !dashboardData ? (
                    <div className="py-4 text-sm text-text-muted">{t('common.loading')}</div>
                  ) : (
                    <>
                      <StatsCards stats={dashboardData.stats} />
                      <Tabs
                        value={dashboardTab}
                        onValueChange={(tab) =>
                          setDashboardTab(
                            tab as 'weekly' | 'hourly' | 'monthly' | 'recent' | 'rental',
                          )
                        }
                        className="w-full"
                      >
                        <TabsList className="w-full h-auto gap-2 p-2 flex-wrap">
                          <TabsTrigger value="weekly">
                            {t('buddyDashboard.weeklyActivity')}
                          </TabsTrigger>
                          <TabsTrigger value="hourly">
                            {t('buddyDashboard.hourlyDistribution')}
                          </TabsTrigger>
                          <TabsTrigger value="monthly">
                            {t('buddyDashboard.monthlyTrend')}
                          </TabsTrigger>
                          <TabsTrigger value="recent">
                            {t('buddyDashboard.recentActivity')}
                          </TabsTrigger>
                          {dashboardData.rentalStats &&
                            dashboardData.rentalStats.totalRentals > 0 && (
                              <TabsTrigger value="rental">
                                {t('buddyDashboard.rentalStats')}
                              </TabsTrigger>
                            )}
                        </TabsList>
                        <TabsContent value="weekly" className="mt-4">
                          <WeeklyActivityChart data={dashboardData.weeklyActivity} />
                        </TabsContent>
                        <TabsContent value="hourly" className="mt-4">
                          <HourlyDistribution data={dashboardData.hourlyDistribution} />
                        </TabsContent>
                        <TabsContent value="monthly" className="mt-4">
                          <MonthlyTrend data={dashboardData.monthlyTrend} />
                        </TabsContent>
                        <TabsContent value="recent" className="mt-4">
                          <RecentActivity events={dashboardData.recentEvents} />
                        </TabsContent>
                        {dashboardData.rentalStats &&
                          dashboardData.rentalStats.totalRentals > 0 && (
                            <TabsContent value="rental" className="mt-4">
                              <div className="rounded-xl border border-border-subtle bg-bg-secondary/50 p-5">
                                <h3 className="text-xs font-bold text-text-primary uppercase tracking-widest mb-4">
                                  {t('buddyDashboard.rentalStats')}
                                </h3>
                                <div className="space-y-4">
                                  <div className="flex justify-between items-center">
                                    <span className="text-text-muted">
                                      {t('buddyDashboard.totalRentals')}
                                    </span>
                                    <span className="text-text-primary font-bold">
                                      {dashboardData.rentalStats.totalRentals}
                                    </span>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span className="text-text-muted">
                                      {t('buddyDashboard.totalIncome')}
                                    </span>
                                    <span className="text-text-primary font-bold">
                                      {dashboardData.rentalStats.totalIncome.toLocaleString()}{' '}
                                      {t('recharge.coins')}
                                    </span>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span className="text-text-muted">
                                      {t('buddyDashboard.avgDuration')}
                                    </span>
                                    <span className="text-text-primary font-bold">
                                      {dashboardData.rentalStats.averageDuration.toFixed(1)}{' '}
                                      {t('buddyDashboard.days')}
                                    </span>
                                  </div>
                                  {dashboardData.rentalStats.currentTenant && (
                                    <div className="pt-3 border-t border-border-subtle">
                                      <span className="text-text-muted text-sm">
                                        {t('buddyDashboard.currentTenant')}
                                      </span>
                                      <div className="flex items-center gap-2 mt-2">
                                        <UserAvatar
                                          userId={dashboardData.rentalStats.currentTenant.id}
                                          displayName={
                                            dashboardData.rentalStats.currentTenant.displayName
                                          }
                                          size="sm"
                                        />
                                        <span className="text-text-primary">
                                          @{dashboardData.rentalStats.currentTenant.username}
                                        </span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </TabsContent>
                          )}
                      </Tabs>
                    </>
                  )}
                </GlassPanel>
              )}
            </section>

            {profile.isBot && profile.agent && (
              <section className="space-y-5 min-w-0">
                <GlassPanel className="p-5">
                  <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-text-muted/50 mb-4">
                    {t('profile.createdBy')}
                  </h3>
                  <Link
                    to="/profile/$userId"
                    params={{ userId: profile.agent.ownerId }}
                    className="flex items-center gap-3 p-3 rounded-2xl bg-bg-tertiary/50 hover:bg-bg-modifier-hover border border-transparent hover:border-primary/20 transition-all group"
                  >
                    <UserAvatar
                      userId={profile.agent.ownerId}
                      avatarUrl={profile.ownerProfile?.avatarUrl ?? null}
                      displayName={profile.ownerProfile?.displayName ?? t('agents.owner')}
                      size="lg"
                      className="rounded-2xl shadow-lg"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-base font-black text-text-primary group-hover:text-primary transition-colors truncate block">
                        {profile.ownerProfile?.displayName ?? t('agents.owner')}
                      </span>
                      <span className="text-xs text-text-muted block">
                        @{profile.ownerProfile?.username ?? t('common.unknown')}
                      </span>
                    </div>
                    <ArrowRight className="text-text-muted group-hover:text-primary transition-all group-hover:translate-x-1" />
                  </Link>
                </GlassPanel>
              </section>
            )}
          </div>
        </div>
      </div>

      {/* QR Card */}
      {showQrCard &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <button
              type="button"
              className="absolute inset-0 bg-bg-deep/80 backdrop-blur-md w-full h-full border-none p-0 m-0 cursor-default"
              onClick={() => setShowQrCard(false)}
              aria-label={t('profile.closeQrCard')}
            />
            <GlassPanel className="relative z-10 w-full max-w-[400px] flex flex-col items-center rounded-[40px] p-10">
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-7 right-7"
                icon={X}
                onClick={() => setShowQrCard(false)}
                aria-label={t('profile.closeQrCard')}
              />
              <UserAvatar
                userId={profile.id}
                avatarUrl={profile.avatarUrl}
                displayName={profile.displayName}
                size="xl"
                className="w-24 h-24 rounded-[40px] shadow-2xl mb-4"
              />
              <h2 className="text-2xl font-black text-text-primary tracking-tight">
                {profile.displayName}
              </h2>
              <p className="text-sm font-bold text-text-muted opacity-60 mb-8">
                @{profile.username}
              </p>
              <div className="bg-white p-6 rounded-[40px] shadow-inner mb-8 ring-8 ring-primary/10">
                <QRCodeSVG
                  value={`${window.location.origin}/app/profile/${profile.id}`}
                  size={200}
                  bgColor="#ffffff"
                  fgColor="#0f0f1a"
                  level="H"
                />
              </div>
              <p className="text-xs font-black text-primary uppercase tracking-[0.2em]">
                {t('profile.scanToAdd')}
              </p>
            </GlassPanel>
          </div>,
          document.body,
        )}
      <CommunityEconomySendModal
        open={showTipModal}
        mode="tip"
        recipient={{
          id: profile.id,
          username: profile.username,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
        }}
        onClose={() => setShowTipModal(false)}
      />
    </div>
  )
}
