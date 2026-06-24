import { cn } from '@shadowob/ui'
import { BookOpen, ChevronDown, ChevronRight, ListChecks, Terminal, Wrench } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { HermesToolCallDisplay } from './hermes-tool-parser'

function getHermesToolIcon(kind: HermesToolCallDisplay['kind']) {
  if (kind === 'terminal') return Terminal
  if (kind === 'todo') return ListChecks
  if (kind === 'skill') return BookOpen
  return Wrench
}

function getHermesToolTone(kind: HermesToolCallDisplay['kind']) {
  if (kind === 'terminal') return 'text-primary'
  if (kind === 'todo') return 'text-info'
  if (kind === 'skill') return 'text-warning'
  return 'text-text-secondary'
}

function compactHermesToolText(value: string, fallback: string, maxLength = 72) {
  const text = (value || fallback)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[`"'\s]+|[`"'\s]+$/g, '')
    .trim()
  if (!text) return fallback
  if (text.length <= maxLength) return text
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

function hasCompleteHermesToolValue(call: HermesToolCallDisplay) {
  const value = call.value.trim()
  if (!value) return false
  return !/(?:\.{3}|…)\s*$/u.test(value)
}

function hasExpandableHermesToolValue(call: HermesToolCallDisplay) {
  if (!hasCompleteHermesToolValue(call)) return false
  return /[\r\n]/u.test(call.value) || call.value.length > 96
}

export type { HermesToolCallDisplay } from './hermes-tool-parser'

export function HermesToolCallList({ toolCalls }: { toolCalls: HermesToolCallDisplay[] }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(true)
  const [showEarlierCalls, setShowEarlierCalls] = useState(false)
  const [expandedCallIds, setExpandedCallIds] = useState<Set<string>>(() => new Set())
  const [countBumpKey, setCountBumpKey] = useState(0)
  const previousTotalRef = useRef(0)
  const totalSteps = toolCalls.length
  const earlierCallCount = Math.max(0, toolCalls.length - 2)
  const shouldCollapseEarlierCalls = earlierCallCount > 1
  const visibleToolCalls =
    shouldCollapseEarlierCalls && !showEarlierCalls ? toolCalls.slice(-2) : toolCalls
  const visibleStartIndex = shouldCollapseEarlierCalls && !showEarlierCalls ? earlierCallCount : 0

  useEffect(() => {
    if (toolCalls.length > 0) setExpanded(true)
  }, [toolCalls.length])

  useEffect(() => {
    setShowEarlierCalls(false)
  }, [toolCalls.length])

  useEffect(() => {
    setExpandedCallIds((previous) => {
      const ids = new Set(
        toolCalls.filter((call) => hasExpandableHermesToolValue(call)).map((call) => call.id),
      )
      const next = new Set([...previous].filter((id) => ids.has(id)))
      return next
    })
  }, [toolCalls])

  useEffect(() => {
    const previousTotal = previousTotalRef.current
    previousTotalRef.current = totalSteps
    if (previousTotal > 0 && totalSteps !== previousTotal) {
      setCountBumpKey((value) => value + 1)
    }
    return undefined
  }, [totalSteps])

  if (toolCalls.length === 0) return null
  const latest = toolCalls[toolCalls.length - 1]!
  const LatestIcon = getHermesToolIcon(latest.kind)
  const latestTone = getHermesToolTone(latest.kind)
  const latestText = compactHermesToolText(latest.value, latest.name)

  return (
    <div className="mt-2 max-w-[min(38rem,100%)] overflow-hidden rounded-xl border border-border-subtle/70 bg-bg-secondary/35">
      <button
        type="button"
        className="group/thought flex w-full min-w-0 items-center gap-2 px-3 py-2.5 text-left text-xs leading-5 text-text-secondary transition hover:bg-primary/8 focus:outline-none focus:ring-2 focus:ring-primary/25"
        aria-expanded={expanded}
        aria-label={t('chat.thoughtProcessToggle', { count: totalSteps })}
        onClick={() => setExpanded((value) => !value)}
      >
        <span
          className={cn(
            'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10',
            latestTone,
          )}
        >
          <LatestIcon className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1 truncate">
          <span className="font-semibold text-text-primary">{t('chat.thoughtProcessLabel')}</span>
          <span className="mx-1.5 text-text-muted/60">/</span>
          <span className="font-mono text-text-muted" title={latest.value || latest.name}>
            {latestText}
          </span>
        </span>
        <span
          key={countBumpKey}
          className={cn(
            'inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-primary/10 px-1.5 font-mono text-[10px] leading-none text-primary',
            countBumpKey > 0 && 'thought-process-count-bump',
          )}
        >
          {totalSteps}
        </span>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-text-muted transition-transform group-hover/thought:text-primary',
            !expanded && '-rotate-90',
          )}
          aria-hidden="true"
        />
      </button>

      {expanded && (
        <ol className="flex flex-col border-border-subtle/60 border-t px-2.5 py-1.5">
          {shouldCollapseEarlierCalls && (
            <li className="grid min-w-0 grid-cols-[1.25rem_minmax(0,1fr)] gap-2 py-1">
              <span className="relative flex justify-center">
                <span
                  aria-hidden="true"
                  className="absolute top-5 bottom-[-0.3rem] w-px bg-border-subtle/55"
                />
                <span className="z-10 inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-border-subtle/70 bg-bg-secondary px-1 font-mono text-[10px] font-semibold leading-none text-text-muted">
                  {earlierCallCount}
                </span>
              </span>
              <button
                type="button"
                className="flex min-w-0 items-center gap-1.5 rounded-lg px-1.5 py-0.5 text-left text-xs font-semibold leading-5 text-text-muted transition hover:bg-primary/8 hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                aria-expanded={showEarlierCalls}
                onClick={() => setShowEarlierCalls((value) => !value)}
              >
                <ChevronRight
                  className={cn(
                    'h-3.5 w-3.5 shrink-0 transition-transform',
                    showEarlierCalls && 'rotate-90',
                  )}
                  aria-hidden="true"
                />
                <span>
                  {t(
                    showEarlierCalls
                      ? 'chat.thoughtProcessHideEarlier'
                      : 'chat.thoughtProcessShowEarlier',
                    { count: earlierCallCount },
                  )}
                </span>
              </button>
            </li>
          )}
          {visibleToolCalls.map((call, visibleIndex) => {
            const index = visibleStartIndex + visibleIndex
            const Icon = getHermesToolIcon(call.kind)
            const iconTone = getHermesToolTone(call.kind)
            const text = compactHermesToolText(call.value, call.name, 140)
            const isExpandable = hasExpandableHermesToolValue(call)
            const isCallExpanded = expandedCallIds.has(call.id)
            return (
              <li
                key={call.id}
                className="grid min-w-0 grid-cols-[1.25rem_minmax(0,1fr)] gap-2 py-1"
              >
                <span className="relative flex justify-center">
                  {index < toolCalls.length - 1 && (
                    <span
                      aria-hidden="true"
                      className="absolute top-5 bottom-[-0.3rem] w-px bg-border-subtle/55"
                    />
                  )}
                  <span className="z-10 inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-border-subtle/70 bg-bg-secondary px-1 font-mono text-[10px] font-semibold leading-none text-text-secondary">
                    {index + 1}
                  </span>
                </span>
                <div className="min-w-0">
                  <div className="flex min-w-0 items-start gap-2 rounded-lg px-1.5 py-0.5">
                    <Icon
                      className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', iconTone)}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className={cn(
                            'shrink-0 truncate font-mono text-xs font-semibold',
                            iconTone,
                          )}
                        >
                          {call.name}
                        </span>
                        {call.count > 1 && (
                          <span className="shrink-0 rounded-full border border-border-subtle/70 px-1.5 font-mono text-[10px] leading-4 text-text-muted">
                            x{call.count}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 line-clamp-1 min-w-0 break-words font-mono text-xs leading-5 text-text-muted">
                        {text}
                      </p>
                    </div>
                    {isExpandable && (
                      <button
                        type="button"
                        className="group/call mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-text-muted transition hover:bg-bg-modifier-hover hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                        aria-expanded={isCallExpanded}
                        aria-label={t('chat.thoughtProcessToggle', { count: index + 1 })}
                        onClick={() =>
                          setExpandedCallIds((previous) => {
                            const next = new Set(previous)
                            if (next.has(call.id)) {
                              next.delete(call.id)
                            } else {
                              next.add(call.id)
                            }
                            return next
                          })
                        }
                      >
                        <ChevronRight
                          className={cn(
                            'h-3.5 w-3.5 transition-transform group-hover/call:text-primary',
                            isCallExpanded && 'rotate-90',
                          )}
                          aria-hidden="true"
                        />
                      </button>
                    )}
                  </div>
                  {isExpandable && isCallExpanded && (
                    <pre className="mt-1 mb-1 ml-5 max-h-72 overflow-auto rounded-lg border border-border-subtle/60 bg-bg-primary/35 px-2.5 py-2 font-mono text-xs leading-5 text-text-secondary whitespace-pre-wrap break-words">
                      {call.value}
                    </pre>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
