import { Calendar, Clock, Flame, MessageSquare } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface StatsCardsProps {
  stats: {
    totalMessages: number
    totalOnlineSeconds: number
    activeDays30d: number
    currentStreak: number
    longestStreak: number
  }
}

function formatDurationShort(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  if (hours === 0) {
    return `${minutes}m`
  }
  if (hours < 24) {
    return `${hours}h ${minutes}m`
  }
  const days = Math.floor(hours / 24)
  const remainingHours = hours % 24
  return `${days}d ${remainingHours}h`
}

export function StatsCards({ stats }: StatsCardsProps) {
  const { t } = useTranslation()

  const cards = [
    {
      icon: MessageSquare,
      label: t('buddyDashboard.totalMessages', 'Total Messages'),
      value: stats.totalMessages.toLocaleString(),
      color: 'text-blue-400',
      bgColor: 'bg-blue-400/10',
    },
    {
      icon: Clock,
      label: t('buddyDashboard.onlineTime', 'Online Time'),
      value: formatDurationShort(stats.totalOnlineSeconds),
      color: 'text-green-400',
      bgColor: 'bg-green-400/10',
    },
    {
      icon: Calendar,
      label: t('buddyDashboard.activeDays', 'Active Days (30d)'),
      value: stats.activeDays30d.toString(),
      color: 'text-purple-400',
      bgColor: 'bg-purple-400/10',
    },
    {
      icon: Flame,
      label: t('buddyDashboard.currentStreak', 'Current Streak'),
      value: `${stats.currentStreak} ${t('buddyDashboard.days', 'days')}`,
      subValue:
        stats.longestStreak > 0
          ? `${t('buddyDashboard.best', 'Best')}: ${stats.longestStreak}`
          : undefined,
      color: 'text-orange-400',
      bgColor: 'bg-orange-400/10',
    },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="bg-bg-secondary rounded-xl p-4 border border-border-subtle"
        >
          <div
            className={`w-10 h-10 rounded-lg ${card.bgColor} flex items-center justify-center mb-3`}
          >
            <card.icon className={`w-5 h-5 ${card.color}`} />
          </div>
          <div className="text-2xl font-bold text-text-primary">{card.value}</div>
          <div className="text-xs text-text-muted mt-1">{card.label}</div>
          {card.subValue && <div className="text-xs text-text-muted mt-1">{card.subValue}</div>}
        </div>
      ))}
    </div>
  )
}
