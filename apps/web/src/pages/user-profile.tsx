import { Badge, Button, GlassPanel, Tabs, TabsContent, TabsList, TabsTrigger } from '@shadowob/ui'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import {
  ArrowRight,
  Calendar,
  ChevronLeft,
  Gift,
  HandCoins,
  QrCode,
  Shield,
  UserPlus,
  X,
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useState } from 'react'
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
import { CommunityEconomySendModal } from '../components/community-economy/community-economy-send-modal'
import { ProfileCommentSection } from '../components/profile/ProfileCommentSection'
import { fetchApi } from '../lib/api'
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
    totalOnlineSeconds: number
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
    totalOnlineSeconds: number
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

export function UserProfilePage() {
  const { t, i18n } = useTranslation()
  const { userId } = useParams({ strict: false }) as { userId: string }
  const currentUser = useAuthStore((s) => s.user)
  const [showQrCard, setShowQrCard] = useState(false)
  const [dashboardTab, setDashboardTab] = useState<
    'weekly' | 'hourly' | 'monthly' | 'recent' | 'rental'
  >('weekly')
  const [economyModal, setEconomyModal] = useState<'tip' | 'gift' | null>(null)

  const { data: profile, isLoading } = useQuery({
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

  if (isLoading || !profile) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-primary font-black tracking-widest text-xs uppercase animate-pulse">
          {t('common.loading')}...
        </div>
      </div>
    )
  }

  const status = profile.status ?? 'offline'
  const joinedDate = new Date(profile.createdAt).toLocaleDateString(i18n.resolvedLanguage, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const hasDashboard = profile.isBot && !!profile.agent?.id
  const biographyText = profile.isBot
    ? profile.agent?.config?.description?.trim() || ''
    : t('profile.shortProfile')

  return (
    <div className="flex-1 overflow-y-auto relative scrollbar-hidden">
      <div className="mx-auto w-full max-w-[1680px] px-4 md:px-6 pt-0 pb-6">
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <GlassPanel className="p-5">
              <div className="flex items-center justify-between gap-3 mb-5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => window.history.back()}
                  icon={ChevronLeft}
                >
                  {t('common.back')}
                </Button>

                {currentUser?.id === profile.id ? (
                  <Button
                    size="sm"
                    variant="glass"
                    onClick={() => setShowQrCard(true)}
                    icon={QrCode}
                  >
                    {t('profile.myQrCard')}
                  </Button>
                ) : (
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button
                      size="sm"
                      variant="glass"
                      icon={HandCoins}
                      onClick={() => setEconomyModal('tip')}
                    >
                      {t('communityEconomy.sendTip')}
                    </Button>
                    <Button
                      size="sm"
                      variant="glass"
                      icon={Gift}
                      onClick={() => setEconomyModal('gift')}
                    >
                      {t('communityEconomy.sendGift')}
                    </Button>
                    <Button size="sm" variant="outline" icon={UserPlus}>
                      {t('friends.addFriend')}
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
                        <div className="relative shrink-0">
                          <UserAvatar
                            userId={agent.userId}
                            avatarUrl={agent.botUser?.avatarUrl ?? null}
                            displayName={agent.botUser?.displayName ?? t('common.buddy')}
                            size="sm"
                            className="rounded-xl group-hover:scale-105 transition-transform"
                          />
                          <div
                            className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-bg-secondary ${agent.status === 'running' ? 'bg-success' : 'bg-text-muted'}`}
                          />
                        </div>
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
        open={economyModal !== null}
        mode={economyModal ?? 'tip'}
        recipient={{
          id: profile.id,
          username: profile.username,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
        }}
        onClose={() => setEconomyModal(null)}
      />
    </div>
  )
}
