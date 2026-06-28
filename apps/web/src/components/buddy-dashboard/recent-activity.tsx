import { MessageSquare, Power, RefreshCw, Settings, UserPlus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface RecentActivityProps {
  events: Array<{
    id: string
    type: string
    data: Record<string, unknown>
    createdAt: string
  }>
}

const EVENT_ICONS: Record<string, typeof MessageSquare> = {
  message: MessageSquare,
  status_change: Power,
  rental_start: UserPlus,
  rental_end: UserPlus,
  policy_update: Settings,
}

const EVENT_COLORS: Record<string, string> = {
  message: 'text-primary bg-primary/10',
  status_change: 'text-success bg-success/10',
  rental_start: 'text-accent bg-accent/10',
  rental_end: 'text-warning bg-warning/10',
  policy_update: 'text-text-muted bg-text-muted/10',
}

export function RecentActivity({ events }: RecentActivityProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n?.resolvedLanguage || i18n?.language || 'en'

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return t('buddyDashboard.justNow')
    if (diffMins < 60) return t('buddyDashboard.minutesAgo', { count: diffMins })
    if (diffHours < 24) return t('buddyDashboard.hoursAgo', { count: diffHours })
    if (diffDays < 7) return t('buddyDashboard.daysAgo', { count: diffDays })
    return date.toLocaleDateString(locale, { month: 'short', day: 'numeric' })
  }

  const getEventDescription = (event: (typeof events)[0]) => {
    switch (event.type) {
      case 'message':
        return event.data.preview
          ? `"${String(event.data.preview).substring(0, 50)}..."`
          : t('buddyDashboard.sentMessage')
      case 'status_change':
        return event.data.status === 'online'
          ? t('buddyDashboard.wentOnline')
          : t('buddyDashboard.wentOffline')
      case 'rental_start':
        return t('buddyDashboard.rentalStarted', {
          user: String(event.data.tenantUsername || 'user'),
        })
      case 'rental_end':
        return t('buddyDashboard.rentalEnded')
      case 'policy_update':
        return t('buddyDashboard.policyUpdated')
      default:
        return t('buddyDashboard.unknownEvent', { type: event.type })
    }
  }

  if (events.length === 0) {
    return (
      <div className="bg-bg-secondary rounded-xl p-6 border border-border-subtle">
        <h3 className="text-sm font-bold text-text-primary uppercase tracking-widest mb-4">
          {t('buddyDashboard.recentActivity')}
        </h3>
        <div className="text-center text-text-muted py-8">{t('buddyDashboard.noActivity')}</div>
      </div>
    )
  }

  return (
    <div className="bg-bg-secondary rounded-xl p-6 border border-border-subtle">
      <h3 className="text-sm font-bold text-text-primary uppercase tracking-widest mb-4">
        {t('buddyDashboard.recentActivity')}
      </h3>

      <div className="space-y-3">
        {events.map((event) => {
          const Icon = EVENT_ICONS[event.type] || RefreshCw
          const colorClass = EVENT_COLORS[event.type] || 'text-text-muted bg-text-muted/10'

          return (
            <div
              key={event.id}
              className="flex items-start gap-3 p-3 rounded-lg hover:bg-bg-modifier-hover transition-colors"
            >
              <div
                className={`w-8 h-8 rounded-lg ${colorClass} flex items-center justify-center shrink-0`}
              >
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-text-primary break-words">
                  {getEventDescription(event)}
                </p>
                <p className="text-xs text-text-muted mt-1 break-words">
                  {formatTime(event.createdAt)}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
