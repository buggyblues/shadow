import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

interface ActivityHeatmapProps {
  data: Array<{
    date: string
    messageCount: number
    level: 0 | 1 | 2 | 3 | 4
  }>
}

type ActivityLevel = 0 | 1 | 2 | 3 | 4

const LEVEL_COLORS: Record<ActivityLevel, string> = {
  0: 'bg-transparent',
  1: 'bg-green-900/30',
  2: 'bg-green-700/50',
  3: 'bg-green-500/70',
  4: 'bg-green-400',
}

const LEVEL_LABELS: Record<ActivityLevel, string> = {
  0: 'No activity',
  1: '1-10 messages',
  2: '11-50 messages',
  3: '51-100 messages',
  4: '100+ messages',
}

export function ActivityHeatmap({ data }: ActivityHeatmapProps) {
  const { t } = useTranslation()

  const weeks = useMemo(() => {
    // Group data by week
    const weekMap = new Map<string, typeof data>()

    for (const day of data) {
      const date = new Date(day.date)
      const weekStart = new Date(date)
      weekStart.setDate(date.getDate() - date.getDay())
      const weekKey = weekStart.toISOString().split('T')[0]

      if (!weekMap.has(weekKey)) {
        weekMap.set(weekKey, [])
      }
      weekMap.get(weekKey)!.push(day)
    }

    // Convert to array and sort
    return Array.from(weekMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([_, days]) => {
        // Ensure 7 days per week
        const weekDays: typeof data = []
        for (let i = 0; i < 7; i++) {
          const day = days.find((d) => new Date(d.date).getDay() === i)
          weekDays.push(day ?? { date: '', messageCount: 0, level: 0 })
        }
        return weekDays
      })
  }, [data])

  const months = useMemo(() => {
    const monthSet = new Set<string>()
    for (const day of data) {
      if (day.date) {
        const date = new Date(day.date)
        monthSet.add(date.toLocaleString('default', { month: 'short' }))
      }
    }
    return Array.from(monthSet)
  }, [data])

  const formatDate = (dateStr: string) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    return date.toLocaleDateString('default', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  return (
    <div className="bg-bg-secondary rounded-xl p-6 border border-border-subtle">
      <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider mb-4">
        {t('buddyDashboard.activityHeatmap', 'Activity Heatmap')}
      </h3>

      {/* Month labels */}
      <div className="flex gap-1 mb-1 text-xs text-text-muted">
        {months.map((month) => (
          <span key={month} className="w-8 text-center">
            {month}
          </span>
        ))}
      </div>

      {/* Heatmap grid */}
      <div className="flex gap-1">
        {weeks.map((week, weekIndex) => (
          <div key={`week-${weekIndex}`} className="flex flex-col gap-1">
            {week.map((day, dayIndex) => (
              <div
                key={`day-${weekIndex}-${dayIndex}-${day.date || 'empty'}`}
                className={`w-3 h-3 rounded-sm ${LEVEL_COLORS[day.level]} transition-all hover:ring-2 hover:ring-primary/50 cursor-pointer`}
                title={
                  day.date ? `${formatDate(day.date)}: ${day.messageCount} messages` : 'No data'
                }
              />
            ))}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-4 text-xs text-text-muted">
        <span>{t('buddyDashboard.less', 'Less')}</span>
        <div className="flex gap-1">
          {[0, 1, 2, 3, 4].map((level) => (
            <div
              key={level}
              className={`w-3 h-3 rounded-sm ${LEVEL_COLORS[level as keyof typeof LEVEL_COLORS]}`}
              title={LEVEL_LABELS[level as keyof typeof LEVEL_LABELS]}
            />
          ))}
        </div>
        <span>{t('buddyDashboard.more', 'More')}</span>
      </div>
    </div>
  )
}
