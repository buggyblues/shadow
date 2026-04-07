import { Button, Card } from '@shadowob/ui'
import { useQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import { ChevronLeft, LayoutDashboard } from 'lucide-react'
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
import { fetchApi } from '../lib/api'

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

export function BuddyDashboardPage() {
  const { t } = useTranslation()
  const { agentId } = useParams({ strict: false }) as { agentId: string }

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ['buddy-dashboard', agentId],
    queryFn: () => fetchApi<DashboardData>(`/api/agents/${agentId}/dashboard`),
    enabled: !!agentId,
    refetchInterval: 30000, // Refresh every 30 seconds
  })

  if (isLoading || !dashboard) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-pulse text-text-muted text-lg font-bold">
          {t('common.loading', 'Loading...')}
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto bg-bg-primary">
      <div className="max-w-5xl mx-auto px-4 py-6 md:px-6 md:py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="sm" onClick={() => window.history.back()}>
            <ChevronLeft className="w-5 h-5" />
            {t('common.back', 'Back')}
          </Button>
        </div>

        {/* Page Title */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <LayoutDashboard className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text-primary">
              {t('buddyDashboard.title', 'Buddy Dashboard')}
            </h1>
            <p className="text-sm text-text-muted">
              {t('buddyDashboard.subtitle', 'Activity and performance metrics')}
            </p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="mb-8">
          <StatsCards stats={dashboard.stats} />
        </div>

        {/* Activity Heatmap */}
        <div className="mb-8">
          <ActivityHeatmap data={dashboard.activityHeatmap} />
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <WeeklyActivityChart data={dashboard.weeklyActivity} />
          <HourlyDistribution data={dashboard.hourlyDistribution} />
        </div>

        {/* Monthly Trend */}
        <div className="mb-8">
          <MonthlyTrend data={dashboard.monthlyTrend} />
        </div>

        {/* Bottom Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <RecentActivity events={dashboard.recentEvents} />

          {/* Rental Stats */}
          {dashboard.rentalStats && (
            <Card variant="glass" className="p-6">
              <h3 className="text-sm font-bold text-text-primary uppercase tracking-widest mb-4">
                {t('buddyDashboard.rentalStats', 'Rental Statistics')}
              </h3>

              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-text-muted">
                    {t('buddyDashboard.totalRentals', 'Total Rentals')}
                  </span>
                  <span className="text-text-primary font-bold">
                    {dashboard.rentalStats.totalRentals}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-text-muted">
                    {t('buddyDashboard.totalIncome', 'Total Income')}
                  </span>
                  <span className="text-text-primary font-bold">
                    {dashboard.rentalStats.totalIncome.toLocaleString()} 虾币
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-text-muted">
                    {t('buddyDashboard.avgDuration', 'Avg Duration')}
                  </span>
                  <span className="text-text-primary font-bold">
                    {dashboard.rentalStats.averageDuration.toFixed(1)}{' '}
                    {t('buddyDashboard.days', 'days')}
                  </span>
                </div>

                {dashboard.rentalStats.currentTenant && (
                  <div className="pt-4 border-t border-border-subtle">
                    <span className="text-text-muted text-sm">
                      {t('buddyDashboard.currentTenant', 'Current Tenant')}
                    </span>
                    <div className="flex items-center gap-2 mt-2">
                      <UserAvatar
                        userId={dashboard.rentalStats.currentTenant.id}
                        displayName={dashboard.rentalStats.currentTenant.displayName}
                        size="sm"
                      />
                      <span className="text-text-primary">
                        @{dashboard.rentalStats.currentTenant.username}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
