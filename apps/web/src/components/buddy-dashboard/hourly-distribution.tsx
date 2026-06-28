import { TooltipAnchor } from '@shadowob/ui'
import { useTranslation } from 'react-i18next'

interface HourlyDistributionProps {
  data: Array<{
    hour: number
    messageCount: number
  }>
}

export function HourlyDistribution({ data }: HourlyDistributionProps) {
  const { t, i18n } = useTranslation()

  const maxCount = Math.max(...data.map((d) => d.messageCount), 1)

  const formatHour = (hour: number) => {
    if (hour === 0) return '12am'
    if (hour < 12) return `${hour}am`
    if (hour === 12) return '12pm'
    return `${hour - 12}pm`
  }

  // Show every 3rd hour label to save space
  const showLabel = (hour: number) => hour % 3 === 0

  return (
    <div className="bg-bg-secondary rounded-xl p-6 border border-border-subtle">
      <h3 className="text-sm font-bold text-text-primary uppercase tracking-widest mb-4">
        {t('buddyDashboard.hourlyDistribution')}
      </h3>

      <div className="grid grid-cols-12 gap-1 h-24">
        {data.map((hour) => {
          const intensity = maxCount > 0 ? hour.messageCount / maxCount : 0
          const opacity = Math.max(0.1, intensity)
          const label = t('buddyDashboard.dayActivity', {
            date: formatHour(hour.hour),
            count: hour.messageCount,
            unit: t('buddyDashboard.messages'),
          })

          return (
            <div key={hour.hour} className="flex flex-col items-center gap-1">
              <div className="flex-1 w-full flex items-end">
                <TooltipAnchor label={label}>
                  <div
                    aria-label={label}
                    className="w-full bg-primary rounded-sm transition-all hover:ring-2 hover:ring-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 cursor-help"
                    role="img"
                    style={{
                      height: `${Math.max(intensity * 100, 4)}%`,
                      opacity,
                    }}
                    tabIndex={0}
                  />
                </TooltipAnchor>
              </div>
              {showLabel(hour.hour) && (
                <span className="text-[11px] text-text-muted">{formatHour(hour.hour)}</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
