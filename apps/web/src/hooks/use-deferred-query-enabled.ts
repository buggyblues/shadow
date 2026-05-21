import { useEffect, useState } from 'react'

export type DeferredQueryStage = 'navigation' | 'interactive' | 'background'
export type DeferredQueryPriority = 'high' | 'normal' | 'low'

const STAGE_CONFIG: Record<DeferredQueryStage, { delayMs: number; concurrency: number }> = {
  navigation: { delayMs: 0, concurrency: 4 },
  interactive: { delayMs: 250, concurrency: 2 },
  background: { delayMs: 900, concurrency: 1 },
}

const STAGE_RANK: Record<DeferredQueryStage, number> = {
  navigation: 0,
  interactive: 1,
  background: 2,
}

const PRIORITY_RANK: Record<DeferredQueryPriority, number> = {
  high: 0,
  normal: 1,
  low: 2,
}

interface DeferredGate {
  id: number
  stage: DeferredQueryStage
  priority: DeferredQueryPriority
  readyAt: number
  resolve: () => void
}

let nextGateId = 0
let flushTimer: number | null = null
let flushTimerDueAt = 0
let queue: DeferredGate[] = []
const activeByStage: Record<DeferredQueryStage, number> = {
  navigation: 0,
  interactive: 0,
  background: 0,
}

function clearFlushTimer() {
  if (flushTimer === null) return
  window.clearTimeout(flushTimer)
  flushTimer = null
  flushTimerDueAt = 0
}

function scheduleFlush(delayMs: number) {
  if (typeof window === 'undefined') return
  const nextDelayMs = Math.max(0, delayMs)
  const nextDueAt = Date.now() + nextDelayMs
  if (flushTimer !== null && flushTimerDueAt <= nextDueAt) return
  clearFlushTimer()
  flushTimerDueAt = nextDueAt
  flushTimer = window.setTimeout(flushDeferredQueryQueue, nextDelayMs)
}

function sortDeferredQueue() {
  queue.sort((a, b) => {
    const readyDelta = a.readyAt - b.readyAt
    if (readyDelta !== 0) return readyDelta
    const stageDelta = STAGE_RANK[a.stage] - STAGE_RANK[b.stage]
    if (stageDelta !== 0) return stageDelta
    const priorityDelta = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
    if (priorityDelta !== 0) return priorityDelta
    return a.id - b.id
  })
}

function flushDeferredQueryQueue() {
  clearFlushTimer()
  if (queue.length === 0) return

  const now = Date.now()
  sortDeferredQueue()

  let released = false
  for (let index = 0; index < queue.length; ) {
    const gate = queue[index]!
    const stageConfig = STAGE_CONFIG[gate.stage]

    if (gate.readyAt > now) {
      index += 1
      continue
    }

    if (activeByStage[gate.stage] >= stageConfig.concurrency) {
      index += 1
      continue
    }

    queue.splice(index, 1)
    activeByStage[gate.stage] += 1
    gate.resolve()
    released = true

    window.setTimeout(() => {
      activeByStage[gate.stage] = Math.max(0, activeByStage[gate.stage] - 1)
      scheduleFlush(0)
    }, 120)
  }

  if (queue.length === 0) return

  if (released) {
    scheduleFlush(0)
    return
  }

  const nextReadyAt = Math.min(...queue.map((gate) => gate.readyAt))
  scheduleFlush(Math.max(0, nextReadyAt - Date.now()))
}

function enqueueDeferredGate({
  stage,
  priority,
  delayMs,
  resolve,
}: {
  stage: DeferredQueryStage
  priority: DeferredQueryPriority
  delayMs: number
  resolve: () => void
}) {
  if (typeof window === 'undefined') {
    resolve()
    return () => {}
  }

  const gate: DeferredGate = {
    id: nextGateId++,
    stage,
    priority,
    readyAt: Date.now() + delayMs,
    resolve,
  }

  queue.push(gate)
  scheduleFlush(delayMs)

  return () => {
    queue = queue.filter((item) => item.id !== gate.id)
  }
}

export function useDeferredQueryEnabled({
  enabled = true,
  stage = 'background',
  priority = 'normal',
  delayMs,
}: {
  enabled?: boolean
  stage?: DeferredQueryStage
  priority?: DeferredQueryPriority
  delayMs?: number
} = {}) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!enabled) {
      setReady(false)
      return
    }

    return enqueueDeferredGate({
      stage,
      priority,
      delayMs: delayMs ?? STAGE_CONFIG[stage].delayMs,
      resolve: () => setReady(true),
    })
  }, [delayMs, enabled, priority, stage])

  return ready
}
