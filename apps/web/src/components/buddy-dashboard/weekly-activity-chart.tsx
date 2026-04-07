import { useTranslation } from 'react-i18next'

interface WeeklyActivityChartProps {
  data: Array<{
    date: string
    messageCount: number
  }>
}

export function WeeklyActivityChart({ data }: WeeklyActivityChartProps) {
  const { t } = useTranslation()

  const maxCount = Math.max(...data.map((d) => d.messageCount), 1)

  const formatDay = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('default', { weekday: 'short' })
  }

  return (
    <div className="bg-bg-secondary rounded-xl p-6 border border-border-subtle">
      <h3 className="text-sm font-bold text-text-primary uppercase tracking-widest mb-4">
        {t('buddyDashboard.weeklyActivity', 'Weekly Activity')}
      </h3>

      <div className="flex items-end justify-between h-32 gap-2">
        {data.map((day, index) => {
          const height = maxCount > 0 ? (day.messageCount / maxCount) * 100 : 0
          return (
            <div key={index} className="flex-1 flex flex-col items-center gap-2">
              <div className="w-full flex-1 flex items-end">
                <div
                  className="w-full bg-primary/60 hover:bg-primary rounded-t transition-all cursor-pointer relative group"
                  style={{ height: `${Math.max(height, 4)}%` }}
                >
                  {/* Tooltip */}
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-bg-tertiary text-text-primary text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                    {day.messageCount} messages
                  </div>
                </div>
              </div>
              <span className="text-xs text-text-muted">{formatDay(day.date)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
