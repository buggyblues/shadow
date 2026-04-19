import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Clock,
  Eye,
  Loader2,
  StopCircle,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { getActiveDeck, useApp } from '../store'
import type { PipelineItem, PipelineItemStatus } from '../types'

// ── Status config: user-visible natural language labels ──
const STATUS_CONFIG: Record<
  PipelineItemStatus,
  {
    icon: React.ReactNode
    label: string
    color: string
    bg: string
  }
> = {
  queued: {
    icon: <Clock className="h-3.5 w-3.5" />,
    label: 'Queued',
    color: 'text-zinc-400',
    bg: 'border-zinc-700/50 bg-zinc-800/30',
  },
  reading: {
    icon: <BookOpen className="h-3.5 w-3.5 animate-pulse" />,
    label: 'Reading',
    color: 'text-amber-400',
    bg: 'border-amber-400/30 bg-amber-500/5',
  },
  executing: {
    icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
    label: 'Executing',
    color: 'text-brand-400',
    bg: 'border-brand-400/30 bg-brand-500/5',
  },
  approval: {
    icon: <Eye className="h-3.5 w-3.5" />,
    label: 'Pending Approval',
    color: 'text-purple-400',
    bg: 'border-purple-400/30 bg-purple-500/5',
  },
  completed: {
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    label: 'Completed',
    color: 'text-emerald-400',
    bg: 'border-emerald-400/20',
  },
  error: {
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
    label: 'Needs Help',
    color: 'text-red-400',
    bg: 'border-red-400/30 bg-red-500/5',
  },
}

function PipelineItemCard({ item }: { item: PipelineItem }) {
  const { dispatch } = useApp()
  const config = STATUS_CONFIG[item.status]
  const isActive = item.status === 'reading' || item.status === 'executing'

  const handleAbort = () => {
    if (item.taskId) {
      const fn = (window as unknown as Record<string, unknown>).__handleAbortTask as
        | ((taskId: string) => void)
        | undefined
      if (fn) fn(item.taskId)
    }
    dispatch({
      type: 'UPDATE_PIPELINE_ITEM',
      id: item.id,
      updates: { status: 'error', progress: 'Cancelled' },
    })
  }

  const handleDismiss = () => {
    dispatch({ type: 'REMOVE_PIPELINE_ITEM', id: item.id })
  }

  return (
    <div
      className={`group rounded-lg border px-3 py-2 transition-all pipeline-item-enter ${config.bg}`}
    >
      <div className="flex items-start gap-2">
        {/* Status icon */}
        <span className={`mt-0.5 shrink-0 ${config.color}`}>{config.icon}</span>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Title row */}
          <div className="flex items-center gap-2">
            <p
              className={`text-xs font-medium ${
                item.status === 'completed' ? 'text-zinc-400' : 'text-zinc-200'
              } truncate`}
            >
              {item.status === 'completed' && item.result ? item.result.summary : item.title}
            </p>
            {/* Status badge */}
            <span
              className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${config.color} bg-current/5`}
            >
              {config.label}
            </span>
          </div>

          {/* Progress description */}
          {item.progress && item.status !== 'completed' && (
            <p className="mt-0.5 text-[11px] text-zinc-500">{item.progress}</p>
          )}

          {/* Progress bar while executing */}
          {item.status === 'executing' && item.percent !== undefined && item.percent > 0 && (
            <div className="mt-1.5 h-1 rounded-full bg-surface-3 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand-500 to-cyan-400 transition-all duration-500"
                style={{ width: `${item.percent}%` }}
              />
            </div>
          )}

          {/* Output info after completion */}
          {item.status === 'completed' && item.result && (
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              {item.result.cardCount !== undefined && item.result.cardCount > 0 && (
                <span className="rounded-full bg-brand-500/10 px-1.5 py-0.5 text-[10px] text-brand-400">
                  {item.result.cardCount} card(s)
                </span>
              )}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-0.5 shrink-0">
          {isActive && (
            <button
              onClick={handleAbort}
              className="rounded p-1 text-zinc-600 transition hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100"
              title="Cancel"
            >
              <StopCircle className="h-3 w-3" />
            </button>
          )}
          {(item.status === 'completed' || item.status === 'error') && (
            <button
              onClick={handleDismiss}
              className="rounded p-1 text-zinc-700 transition hover:text-zinc-400 opacity-0 group-hover:opacity-100"
              title="Remove"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function RequirementPipeline() {
  const { state } = useApp()
  const [showCompleted, setShowCompleted] = useState(false)
  const activeDeck = getActiveDeck(state.project)

  const items = state.pipelineItems

  // Filter by current Deck: show items belonging to active Deck + global items (deckId is null/undefined)
  const visibleItems = items.filter((i) => !i.deckId || !activeDeck || i.deckId === activeDeck.id)

  const activeItems = visibleItems.filter((i) => i.status !== 'completed')
  const completedItems = visibleItems.filter((i) => i.status === 'completed')

  if (visibleItems.length === 0) return null

  return (
    <div className="py-1 max-h-[30vh] overflow-y-auto">
      <div className="space-y-1.5 px-1">
        {/* Active items */}
        {activeItems.map((item) => (
          <PipelineItemCard key={item.id} item={item} />
        ))}

        {/* Completed collapsed section */}
        {completedItems.length > 0 && (
          <>
            <button
              onClick={() => setShowCompleted(!showCompleted)}
              className="flex w-full items-center gap-2 py-1 text-[11px] text-zinc-600 transition hover:text-zinc-400"
            >
              <div className="flex-1 h-px bg-border" />
              <span className="flex items-center gap-1 shrink-0">
                Completed ({completedItems.length})
                <ChevronDown
                  className={`h-3 w-3 transition-transform ${showCompleted ? 'rotate-180' : ''}`}
                />
              </span>
              <div className="flex-1 h-px bg-border" />
            </button>

            {showCompleted && (
              <div className="space-y-1 animate-fade-in">
                {completedItems.slice(0, 10).map((item) => (
                  <PipelineItemCard key={item.id} item={item} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
