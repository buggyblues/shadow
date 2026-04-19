import { Minus, TrendingDown, TrendingUp } from 'lucide-react'
import type { ChartCardMeta, DataCardMeta } from '../../types'

export function DataDashboard({ meta, title }: { meta: DataCardMeta; title: string }) {
  return (
    <div className="space-y-2">
      {meta.period && (
        <p className="text-[10px] text-zinc-500 leading-relaxed">
          {meta.period}
          {meta.benchmark ? ` · ${meta.benchmark}` : ''}
        </p>
      )}
      <div className="grid grid-cols-2 gap-1.5">
        {meta.metrics.slice(0, 6).map((metric, i) => (
          <div key={i} className="rounded-md bg-surface/80 border border-border/30 px-2 py-1.5">
            <div className="flex items-center gap-1">
              <span className="text-[9px] text-zinc-600 uppercase tracking-wide truncate">
                {metric.key}
              </span>
              {metric.changeDirection && (
                <span
                  className={`shrink-0 ${
                    metric.changeDirection === 'up'
                      ? 'text-emerald-400'
                      : metric.changeDirection === 'down'
                        ? 'text-red-400'
                        : 'text-zinc-500'
                  }`}
                >
                  {metric.changeDirection === 'up' ? (
                    <TrendingUp className="h-2.5 w-2.5" />
                  ) : metric.changeDirection === 'down' ? (
                    <TrendingDown className="h-2.5 w-2.5" />
                  ) : (
                    <Minus className="h-2.5 w-2.5" />
                  )}
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-0.5 mt-0.5">
              <span className="text-sm font-bold text-zinc-200 tabular-nums">{metric.value}</span>
              {metric.unit && <span className="text-[9px] text-zinc-500">{metric.unit}</span>}
            </div>
            {metric.change && (
              <span
                className={`text-[9px] ${
                  metric.changeDirection === 'up'
                    ? 'text-emerald-400/70'
                    : metric.changeDirection === 'down'
                      ? 'text-red-400/70'
                      : 'text-zinc-600'
                }`}
              >
                {metric.change}
              </span>
            )}
          </div>
        ))}
      </div>
      {meta.metrics.length > 6 && (
        <p className="text-[9px] text-zinc-600 text-right">
          +{meta.metrics.length - 6} more metrics
        </p>
      )}
    </div>
  )
}

const DEFAULT_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']

export function PieChart({ meta, colors }: { meta: ChartCardMeta; colors: string[] }) {
  const data = meta.series[0]?.data || []
  const total = data.reduce((a, b) => a + b, 0) || 1
  let cumAngle = 0
  const ct = meta.chartType?.replace('Chart', '') as string
  const isDonut = ct === 'donut'
  const pieLabels = meta.categories || meta.labels

  return (
    <div className="flex items-center gap-3">
      <svg viewBox="0 0 60 60" className="h-16 w-16 shrink-0">
        {data.map((val, i) => {
          const angle = (val / total) * 360
          const startAngle = cumAngle
          cumAngle += angle

          const startRad = ((startAngle - 90) * Math.PI) / 180
          const endRad = ((startAngle + angle - 90) * Math.PI) / 180
          const largeArc = angle > 180 ? 1 : 0

          const x1 = 30 + 25 * Math.cos(startRad)
          const y1 = 30 + 25 * Math.sin(startRad)
          const x2 = 30 + 25 * Math.cos(endRad)
          const y2 = 30 + 25 * Math.sin(endRad)

          if (data.length === 1) {
            return (
              <circle
                key={i}
                cx="30"
                cy="30"
                r="25"
                fill={colors[i % colors.length]}
                opacity={0.85}
              />
            )
          }

          return (
            <path
              key={i}
              d={`M30,30 L${x1},${y1} A25,25 0 ${largeArc},1 ${x2},${y2} Z`}
              fill={colors[i % colors.length]}
              opacity={0.85}
            />
          )
        })}
        {isDonut && <circle cx="30" cy="30" r="14" fill="var(--color-surface-card)" />}
      </svg>
      <div className="flex-1 space-y-0.5">
        {meta.chartTitle && (
          <p className="text-[10px] text-zinc-400 font-medium">{meta.chartTitle}</p>
        )}
        {(pieLabels || meta.series[0]?.data.map((_, i) => `#${i + 1}`))
          ?.slice(0, 5)
          .map((label, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div
                className="h-2 w-2 rounded-sm shrink-0"
                style={{ background: colors[i % colors.length] }}
              />
              <span className="text-[9px] text-zinc-400 truncate flex-1">{label}</span>
              <span className="text-[9px] text-zinc-500 tabular-nums">
                {Math.round((data[i] / total) * 100)}%
              </span>
            </div>
          ))}
      </div>
    </div>
  )
}

export function ChartCard({ meta }: { meta: ChartCardMeta }) {
  const allData = meta.series.flatMap((s) => s.data)
  const maxVal = Math.max(...allData, 1)
  const xLabels = meta.categories || meta.labels

  const ct = meta.chartType?.replace('Chart', '') as string

  if (ct === 'pie' || ct === 'donut') {
    return <PieChart meta={meta} colors={DEFAULT_COLORS} />
  }

  if (ct === 'bar') {
    const dataLen = meta.series[0]?.data.length || 0
    return (
      <div className="space-y-1">
        {meta.chartTitle && (
          <p className="text-[10px] text-zinc-500 font-medium">{meta.chartTitle}</p>
        )}
        {meta.insight && <p className="text-[9px] text-zinc-600 italic">{meta.insight}</p>}
        <svg viewBox="0 0 200 80" className="w-full h-20">
          {meta.series.map((s, si) => {
            const color = s.color || DEFAULT_COLORS[si % DEFAULT_COLORS.length]
            return s.data.map((val, di) => {
              const bw = ((180 / dataLen) * 0.7) / meta.series.length
              const x = 10 + (di * 180) / dataLen + si * bw + (180 / dataLen) * 0.15
              const h = (val / maxVal) * 65
              return (
                <rect
                  key={`${si}-${di}`}
                  x={x}
                  y={75 - h}
                  width={Math.max(bw, 4)}
                  height={h}
                  fill={color}
                  rx={1}
                  opacity={0.85}
                />
              )
            })
          })}
          <line x1="10" y1="75" x2="190" y2="75" stroke="#3f3f46" strokeWidth="0.5" />
          {xLabels?.slice(0, 6).map((label, i) => (
            <text
              key={i}
              x={10 + (i * 180) / (xLabels.length || 1) + 180 / (xLabels.length || 1) / 2}
              y={79}
              textAnchor="middle"
              className="text-[5px] fill-zinc-600"
            >
              {label.slice(0, 4)}
            </text>
          ))}
        </svg>
        {meta.series.length > 1 && (
          <div className="flex items-center gap-2 flex-wrap">
            {meta.series.map((s, i) => (
              <div key={i} className="flex items-center gap-1">
                <div
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: s.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length] }}
                />
                <span className="text-[9px] text-zinc-500">{s.name}</span>
              </div>
            ))}
          </div>
        )}
        {meta.unit && <p className="text-[9px] text-zinc-600 text-right">Unit: {meta.unit}</p>}
      </div>
    )
  }

  if (ct === 'line' || ct === 'area') {
    return (
      <div className="space-y-1">
        {meta.chartTitle && (
          <p className="text-[10px] text-zinc-500 font-medium">{meta.chartTitle}</p>
        )}
        {meta.insight && <p className="text-[9px] text-zinc-600 italic">{meta.insight}</p>}
        <svg viewBox="0 0 200 80" className="w-full h-20">
          {meta.series.map((s, si) => {
            const color = s.color || DEFAULT_COLORS[si % DEFAULT_COLORS.length]
            const points = s.data
              .map((val, i) => {
                const x = 10 + (i / Math.max(s.data.length - 1, 1)) * 180
                const y = 72 - (val / maxVal) * 65
                return `${x},${y}`
              })
              .join(' ')

            return (
              <g key={si}>
                {ct === 'area' && (
                  <polygon points={`10,72 ${points} ${10 + 180},72`} fill={color} opacity={0.1} />
                )}
                <polyline
                  points={points}
                  fill="none"
                  stroke={color}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {s.data.map((val, i) => {
                  const x = 10 + (i / Math.max(s.data.length - 1, 1)) * 180
                  const y = 72 - (val / maxVal) * 65
                  return <circle key={i} cx={x} cy={y} r={1.5} fill={color} />
                })}
              </g>
            )
          })}
          <line x1="10" y1="72" x2="190" y2="72" stroke="#3f3f46" strokeWidth="0.5" />
        </svg>
        {meta.series.length > 1 && (
          <div className="flex items-center gap-2 flex-wrap">
            {meta.series.map((s, i) => (
              <div key={i} className="flex items-center gap-1">
                <div
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: s.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length] }}
                />
                <span className="text-[9px] text-zinc-500">{s.name}</span>
              </div>
            ))}
          </div>
        )}
        {meta.unit && <p className="text-[9px] text-zinc-600 text-right">Unit: {meta.unit}</p>}
      </div>
    )
  }

  return (
    <div className="text-[10px] text-zinc-500">
      {meta.chartType} chart · {meta.series.length} series
      {meta.insight && <p className="text-[9px] text-zinc-600 italic mt-1">{meta.insight}</p>}
    </div>
  )
}
