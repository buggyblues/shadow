import { TooltipAnchor } from '@shadowob/ui'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

interface ActivityHeatmapProps {
  data: Array<{
    date: string
    messageCount: number
    level: 0 | 1 | 2 | 3 | 4
  }>
  showTitle?: boolean
}

type ActivityLevel = 0 | 1 | 2 | 3 | 4

const LEVEL_COLORS: Record<ActivityLevel, string> = {
  0: 'bg-transparent',
  1: 'bg-success/20',
  2: 'bg-success/40',
  3: 'bg-success/60',
  4: 'bg-success/80',
}

const LEVEL_LABELS: Record<ActivityLevel, string> = {
  0: 'buddyDashboard.activityLevel0',
  1: 'buddyDashboard.activityLevel1',
  2: 'buddyDashboard.activityLevel2',
  3: 'buddyDashboard.activityLevel3',
  4: 'buddyDashboard.activityLevel4',
}

export function ActivityHeatmap({ data, showTitle = true }: ActivityHeatmapProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n?.resolvedLanguage || i18n?.language || 'en'

  const weeks = useMemo(() => {
    // Group data by week
    const weekMap = new Map<string, typeof data>()

    for (const day of data) {
      const date = new Date(day.date)
      const weekStart = new Date(date)
      weekStart.setDate(date.getDate() - date.getDay())
      const weekKey = weekStart.toISOString().split('T')[0] ?? ''

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
        monthSet.add(date.toLocaleString(locale, { month: 'short' }))
      }
    }
    return Array.from(monthSet)
  }, [data, locale])

  const formatDate = (dateStr: string) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    return date.toLocaleDateString(locale, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  return (
    <div className="bg-bg-secondary rounded-xl p-6 border border-border-subtle">
      {showTitle && (
        <h3 className="text-sm font-bold text-text-primary uppercase tracking-widest mb-4">
          {t('buddyDashboard.activityHeatmap')}
        </h3>
      )}

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
            {week.map((day, dayIndex) => {
              const label = day.date
                ? t('buddyDashboard.dayActivity', {
                    date: formatDate(day.date),
                    count: day.messageCount,
                    unit: t('buddyDashboard.messages'),
                  })
                : t('buddyDashboard.noData')

              return (
                <TooltipAnchor
                  key={`day-${weekIndex}-${dayIndex}-${day.date || 'empty'}`}
                  label={label}
                >
                  <div
                    aria-label={label}
                    className={`w-3 h-3 rounded-sm ${LEVEL_COLORS[day.level]} transition-all hover:ring-2 hover:ring-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 cursor-help`}
                    role="img"
                    tabIndex={0}
                  />
                </TooltipAnchor>
              )
            })}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-4 text-xs text-text-muted">
        <span>{t('buddyDashboard.less')}</span>
        <div className="flex gap-1">
          {[0, 1, 2, 3, 4].map((level) => {
            const label = t(LEVEL_LABELS[level as keyof typeof LEVEL_LABELS])
            return (
              <TooltipAnchor key={level} label={label}>
                <div
                  aria-label={label}
                  className={`w-3 h-3 rounded-sm ${LEVEL_COLORS[level as keyof typeof LEVEL_COLORS]} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 cursor-help`}
                  role="img"
                  tabIndex={0}
                />
              </TooltipAnchor>
            )
          })}
        </div>
        <span>{t('buddyDashboard.more')}</span>
      </div>
    </div>
  )
}
