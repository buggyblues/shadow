import { AlertCircle, GitCompareArrows } from 'lucide-react'
import type { ArgumentCardMeta, ComparisonCardMeta, ProcessCardMeta } from '../../types'

export function ArgumentList({ meta }: { meta: ArgumentCardMeta }) {
  const typeIcon = {
    statistic: '📊',
    example: '📋',
    expert: '👤',
    trend: '📈',
    analogy: '🔄',
  }
  return (
    <div className="space-y-1.5">
      <div className="rounded-md bg-amber-500/5 border border-amber-500/15 px-2 py-1.5">
        <p className="text-[11px] font-medium text-amber-300 leading-relaxed">{meta.claim}</p>
      </div>
      {meta.evidence.slice(0, 4).map((ev, i) => (
        <div key={i} className="flex items-start gap-1.5">
          <span className="text-[10px] shrink-0 mt-0.5">{typeIcon[ev.type] || '•'}</span>
          <div className="flex-1">
            <span className="text-[11px] text-zinc-300 leading-relaxed">{ev.text}</span>
            {ev.source && <span className="text-[9px] text-zinc-600 ml-1">— {ev.source}</span>}
          </div>
        </div>
      ))}
      {meta.counterpoint && (
        <div className="mt-1 flex items-start gap-1.5 rounded-md bg-red-500/5 border border-red-500/10 px-2 py-1.5">
          <AlertCircle className="h-3 w-3 text-red-400/60 shrink-0 mt-0.5" />
          <span className="text-[10px] text-red-300/80 leading-relaxed">{meta.counterpoint}</span>
        </div>
      )}
      {meta.evidence.length > 4 && (
        <p className="text-[9px] text-zinc-600">+{meta.evidence.length - 4} more evidence</p>
      )}
      {meta.strength && (
        <span
          className={`inline-block rounded-full px-1.5 py-0.5 text-[8px] ${
            meta.strength === 'strong'
              ? 'bg-emerald-500/10 text-emerald-400'
              : meta.strength === 'moderate'
                ? 'bg-amber-500/10 text-amber-400'
                : 'bg-zinc-500/10 text-zinc-500'
          }`}
        >
          {meta.strength === 'strong'
            ? 'Strong'
            : meta.strength === 'moderate'
              ? 'Moderate'
              : 'Weak'}
        </span>
      )}
    </div>
  )
}

export function ComparisonCard({ meta }: { meta: ComparisonCardMeta }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between px-1">
        {meta.subjects.map((subj, i) => (
          <span key={i} className="text-[10px] font-bold text-zinc-300">
            {subj}
            {i < meta.subjects.length - 1 && <span className="text-zinc-700 mx-2">vs</span>}
          </span>
        ))}
      </div>
      {meta.dimensions.slice(0, 4).map((dim, i) => (
        <div key={i} className="rounded-md bg-surface/60 border border-border/20 px-2 py-1">
          <p className="text-[9px] text-zinc-600 text-center mb-0.5">{dim.label}</p>
          <div className="flex items-center justify-between">
            {dim.values.map((val, vi) => (
              <span
                key={vi}
                className={`text-[10px] ${dim.winner === vi ? 'text-emerald-400 font-medium' : 'text-zinc-400'}`}
              >
                {val}
              </span>
            ))}
          </div>
        </div>
      ))}
      {meta.dimensions.length > 4 && (
        <p className="text-[9px] text-zinc-600 text-right">
          +{meta.dimensions.length - 4} more dimensions
        </p>
      )}
      {meta.conclusion && (
        <div className="rounded-md bg-amber-500/5 border border-amber-500/10 px-2 py-1.5 text-[10px] text-amber-300/90">
          💡 {meta.conclusion}
        </div>
      )}
    </div>
  )
}

export function ProcessCard({ meta }: { meta: ProcessCardMeta }) {
  return (
    <div className="space-y-1">
      {meta.steps.slice(0, 5).map((step, i) => (
        <div key={i} className="flex items-start gap-2">
          <div className="flex flex-col items-center shrink-0">
            <div className="h-5 w-5 rounded-full bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center">
              <span className="text-[9px] font-bold text-cyan-400">{step.order}</span>
            </div>
            {i < Math.min(meta.steps.length, 5) - 1 && (
              <div className="w-0.5 h-2 bg-cyan-500/20 mt-0.5" />
            )}
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <span className="text-[10px] font-medium text-zinc-300">{step.label}</span>
            <p className="text-[9px] text-zinc-500 leading-relaxed line-clamp-2">{step.detail}</p>
          </div>
        </div>
      ))}
      {meta.steps.length > 5 && (
        <p className="text-[9px] text-zinc-600 pl-7">+{meta.steps.length - 5} more steps</p>
      )}
    </div>
  )
}
