import { useTranslation } from 'react-i18next'

interface MonthlyTrendProps {
  data: Array<{
    month: string
    messageCount: number
  }>
}

export function MonthlyTrend({ data }: MonthlyTrendProps) {
  const { t } = useTranslation()

  const maxCount = Math.max(...data.map((d) => d.messageCount), 1)
  const minCount = Math.min(...data.map((d) => d.messageCount), 0)

  const formatMonth = (monthStr: string) => {
    const [year, month] = monthStr.split('-')
    const date = new Date(Number(year), Number(month) - 1)
    return date.toLocaleDateString('default', { month: 'short' })
  }

  // Generate SVG path for the line chart
  const generatePath = () => {
    if (data.length === 0) return ''

    const width = 100
    const height = 50
    const padding = 5

    const points = data.map((d, i) => {
      const xRatio = data.length > 1 ? i / (data.length - 1) : 0
      const x = padding + xRatio * (width - 2 * padding)
      const range = maxCount - minCount || 1
      const y = height - padding - ((d.messageCount - minCount) / range) * (height - 2 * padding)
      return `${x},${y}`
    })

    return `M ${points.join(' L ')}`
  }

  // Generate area path
  const generateAreaPath = () => {
    if (data.length === 0) return ''

    const width = 100
    const height = 50
    const padding = 5

    const points = data.map((d, i) => {
      const xRatio = data.length > 1 ? i / (data.length - 1) : 0
      const x = padding + xRatio * (width - 2 * padding)
      const range = maxCount - minCount || 1
      const y = height - padding - ((d.messageCount - minCount) / range) * (height - 2 * padding)
      return `${x},${y}`
    })

    const firstPoint = (points[0] ?? `${padding},${height - padding}`).split(',')
    const lastPoint = (points[points.length - 1] ?? `${padding},${height - padding}`).split(',')
    const firstX = firstPoint[0] ?? String(padding)
    const lastX = lastPoint[0] ?? String(padding)

    return `M ${points.join(' L ')} L ${lastX},${height} L ${firstX},${height} Z`
  }

  return (
    <div className="bg-bg-secondary rounded-xl p-6 border border-border-subtle">
      <h3 className="text-sm font-bold text-text-primary uppercase tracking-widest mb-4">
        {t('buddyDashboard.monthlyTrend', 'Monthly Trend')}
      </h3>

      <div className="relative h-32">
        <svg
          viewBox="0 0 100 50"
          className="w-full h-full overflow-visible"
          preserveAspectRatio="none"
        >
          {/* Area under the line */}
          <path d={generateAreaPath()} fill="currentColor" className="text-primary/20" />

          {/* Line */}
          <path
            d={generatePath()}
            fill="none"
            stroke="currentColor"
            strokeWidth="0.5"
            className="text-primary"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Data points */}
          {data.map((d, i) => {
            const width = 100
            const height = 50
            const padding = 5
            const xRatio = data.length > 1 ? i / (data.length - 1) : 0
            const x = padding + xRatio * (width - 2 * padding)
            const range = maxCount - minCount || 1
            const y =
              height - padding - ((d.messageCount - minCount) / range) * (height - 2 * padding)

            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r="1"
                className="fill-primary hover:fill-primary-hover cursor-pointer"
              >
                <title>{`${formatMonth(d.month)}: ${d.messageCount} messages`}</title>
              </circle>
            )
          })}
        </svg>

        {/* Month labels */}
        <div className="flex justify-between mt-2 text-[11px] text-text-muted">
          {data
            .filter((_, i) => i % 3 === 0)
            .map((d, i) => (
              <span key={i}>{formatMonth(d.month)}</span>
            ))}
        </div>
      </div>
    </div>
  )
}
