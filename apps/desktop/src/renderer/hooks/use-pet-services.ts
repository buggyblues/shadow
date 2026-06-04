import type { RuntimeSessionPetReaction } from '@shadowob/shared/types'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { PetNoticeKind, PetNoticeOptions } from '../lib/chatbot'
import {
  loadServiceHistory,
  loadServiceState,
  recordServiceHistoryEvent,
  saveServiceState,
} from '../lib/pet-storage'
import {
  evaluateRuntimeSessionNotification,
  type RuntimeSessionForNotification,
  type RuntimeSessionNotificationTracker,
  runtimeSessionKey,
  runtimeSessionLooksActive,
  runtimeSessionReaction,
  runtimeSessionReactionIsVisible,
} from '../lib/runtime-session-notifications'
import type {
  AppTab,
  ConnectorSnapshot,
  DesktopPetApi,
  PetServiceAlert,
  PetServiceAlertId,
  PetServiceId,
  PetServiceIntervalId,
  PetServiceState,
} from '../pet-types'

const MIN_SERVICE_INTERVAL_MINUTES = 5
const RUNTIME_SESSION_REACTION_VISIBLE_MS = 45_000
const RUNTIME_SESSION_REACTION_BUBBLE_COOLDOWN_MS = 30_000
const PET_RUNTIME_DEBUG_KEY = 'shadow:desktop-pet:runtime-debug'

const RUNTIME_LABELS: Record<string, string> = {
  'claude-code': 'Claude Code',
  opencode: 'OpenCode',
  codex: 'Codex CLI',
  cursor: 'Cursor',
  kimi: 'Kimi',
  copilot: 'GitHub Copilot',
  antigravity: 'Antigravity',
}

type RuntimeSessionReactionBubbleTracker = {
  reaction: RuntimeSessionPetReaction
  lastActivityAt: string | null
  shownAt: number
}

export function usePetServices({
  api,
  panelOpen,
  tab,
  petName,
  showPetNotice,
  clearPetNotice,
}: {
  api: DesktopPetApi | null
  panelOpen: boolean
  tab: AppTab
  petName: string
  showPetNotice: (message: string, options?: PetNoticeOptions) => void
  clearPetNotice: (noticeKind?: PetNoticeKind) => void
}) {
  const { t } = useTranslation()
  const runtimeSessionTrackerRef = useRef(new Map<string, RuntimeSessionNotificationTracker>())
  const runtimeSessionBubbleTrackerRef = useRef(
    new Map<string, RuntimeSessionReactionBubbleTracker>(),
  )
  const runtimeNotificationsRef = useRef<Record<string, boolean>>({})
  const runtimeNotificationEnabledAtRef = useRef(new Map<string, number>())
  const runtimeWatchStartedAtRef = useRef<number | null>(null)
  const runtimeScanRequestedAtRef = useRef(0)
  const servicesRef = useRef<PetServiceState | null>(null)
  const recordedFocusCompletionRef = useRef<number | null>(null)
  const [serviceAlerts, setServiceAlerts] = useState<PetServiceAlert[]>([])
  const [serviceNow, setServiceNow] = useState(() => Date.now())
  const [services, setServices] = useState<PetServiceState>(() => loadServiceState())
  const [serviceHistory, setServiceHistory] = useState(() => loadServiceHistory())
  const [connectorSnapshot, setConnectorSnapshot] = useState<ConnectorSnapshot>({
    connectorOnline: false,
    activeRuntimeSessionCount: 0,
    onlineCount: 0,
    runtimeSessionReactions: [],
    readySessions: [],
  })

  const applyRuntimeNotificationSettings = useCallback((settings: Record<string, boolean>) => {
    const now = Date.now()
    const previous = runtimeNotificationsRef.current
    runtimeNotificationsRef.current = settings
    const enabledAt = runtimeNotificationEnabledAtRef.current
    for (const [runtimeId, enabled] of Object.entries(settings)) {
      if (enabled === false) {
        enabledAt.delete(runtimeId)
        for (const key of runtimeSessionTrackerRef.current.keys()) {
          if (key.startsWith(`${runtimeId}:`)) runtimeSessionTrackerRef.current.delete(key)
        }
        for (const key of runtimeSessionBubbleTrackerRef.current.keys()) {
          if (key.startsWith(`${runtimeId}:`)) runtimeSessionBubbleTrackerRef.current.delete(key)
        }
      } else if (previous[runtimeId] === false || !enabledAt.has(runtimeId)) {
        enabledAt.set(runtimeId, now)
      }
    }
  }, [])

  const notifyRuntimeSessionCompleted = useCallback(
    (session: RuntimeSessionForNotification, runtimeLabel: string) => {
      const sessionName = session.title?.trim() || session.sessionId.slice(0, 8)
      setServiceHistory(recordServiceHistoryEvent({ codingReadyCount: 1 }, Date.now()))
      void api?.showNotification?.(
        t('desktopPet.services.notificationTitleWithName', {
          name: petName || t('desktopPet.pet.name'),
        }),
        t('desktopPet.services.runtimeSessionCompleted', {
          name: sessionName,
          runtime: runtimeLabel,
        }),
        undefined,
        {
          target: 'pet',
        },
      )
    },
    [api, petName, t],
  )

  const processRuntimeSessionNotifications = useCallback(
    (
      sessions: RuntimeSessionForNotification[],
      runtimeLabels: Map<string, string>,
      enabledRuntimeIds: Set<string>,
    ) => {
      const now = Date.now()
      const globalStartedAt = runtimeWatchStartedAtRef.current ?? now
      const seenKeys = new Set<string>()
      for (const session of sessions) {
        if (!enabledRuntimeIds.has(session.runtimeId)) continue
        if (runtimeNotificationsRef.current[session.runtimeId] === false) continue
        const lastActivityAt = session.lastActivityAt
        const lastActivityMs = lastActivityAt ? Date.parse(lastActivityAt) : Number.NaN
        if (!lastActivityAt || !Number.isFinite(lastActivityMs)) continue
        const key = runtimeSessionKey(session)
        seenKeys.add(key)
        const startedAt = Math.max(
          globalStartedAt,
          runtimeNotificationEnabledAtRef.current.get(session.runtimeId) ?? globalStartedAt,
        )
        const result = evaluateRuntimeSessionNotification({
          session,
          tracker: runtimeSessionTrackerRef.current.get(key),
          now,
          startedAt,
        })
        if (!result) continue
        runtimeSessionTrackerRef.current.set(key, result.tracker)
        if (result.notify) {
          notifyRuntimeSessionCompleted(
            session,
            runtimeLabels.get(session.runtimeId) ??
              RUNTIME_LABELS[session.runtimeId] ??
              session.runtimeId,
          )
        }
      }
      for (const key of runtimeSessionTrackerRef.current.keys()) {
        if (!seenKeys.has(key)) runtimeSessionTrackerRef.current.delete(key)
      }
    },
    [notifyRuntimeSessionCompleted],
  )

  const processRuntimeSessionReactionBubbles = useCallback(
    (sessions: RuntimeSessionForNotification[], enabledRuntimeIds: Set<string>) => {
      const now = Date.now()
      const globalStartedAt = runtimeWatchStartedAtRef.current ?? now
      const seenKeys = new Set<string>()
      for (const session of sessions) {
        if (!enabledRuntimeIds.has(session.runtimeId)) continue
        if (runtimeNotificationsRef.current[session.runtimeId] === false) continue
        if (!runtimeSessionReactionIsVisible(session, now, RUNTIME_SESSION_REACTION_VISIBLE_MS)) {
          continue
        }

        const reaction = runtimeSessionReaction(session)
        if (reaction === 'idle') continue

        const lastActivityAt = session.lastActivityAt ?? null
        const lastActivityMs = lastActivityAt ? Date.parse(lastActivityAt) : Number.NaN
        const startedAt = Math.max(
          globalStartedAt,
          runtimeNotificationEnabledAtRef.current.get(session.runtimeId) ?? globalStartedAt,
        )
        if (
          !runtimeSessionLooksActive(session) &&
          (!Number.isFinite(lastActivityMs) || lastActivityMs < startedAt - 1000)
        ) {
          continue
        }

        const key = runtimeSessionKey(session)
        seenKeys.add(key)
        const previous = runtimeSessionBubbleTrackerRef.current.get(key)
        if (
          previous?.reaction === reaction &&
          previous.lastActivityAt === lastActivityAt &&
          now - previous.shownAt < RUNTIME_SESSION_REACTION_BUBBLE_COOLDOWN_MS
        ) {
          continue
        }

        runtimeSessionBubbleTrackerRef.current.set(key, {
          reaction,
          lastActivityAt,
          shownAt: now,
        })
        logRuntimeDebug('show-runtime-bubble', {
          key,
          reaction,
          active: runtimeSessionLooksActive(session),
          session: runtimeSessionDebugSummary(session),
        })
        showPetNotice(runtimeSessionBubbleMessage(session, t), {
          noticeKind: runtimeSessionLooksActive(session) ? 'runtime-busy' : 'runtime-terminal',
          debugSource: 'runtime-session-reaction',
          debugContext: {
            key,
            reaction,
            active: runtimeSessionLooksActive(session),
            session: runtimeSessionDebugSummary(session),
          },
        })
      }
      for (const key of runtimeSessionBubbleTrackerRef.current.keys()) {
        if (!seenKeys.has(key)) runtimeSessionBubbleTrackerRef.current.delete(key)
      }
    },
    [showPetNotice, t],
  )

  useEffect(() => {
    void api?.getDesktopSettings?.().then((settings) => {
      applyRuntimeNotificationSettings(settings.connectorRuntimeNotifications ?? {})
    })
    return api?.onDesktopSettingsChanged?.((settings) => {
      applyRuntimeNotificationSettings(settings.connectorRuntimeNotifications ?? {})
    })
  }, [api, applyRuntimeNotificationSettings])

  useEffect(() => {
    servicesRef.current = services
    saveServiceState(services)
  }, [services])

  useEffect(() => {
    if (panelOpen && tab === 'services') setServiceNow(Date.now())
  }, [panelOpen, tab])

  useEffect(() => {
    let cancelled = false
    const refresh = async () => {
      const watchingRuntimes = servicesRef.current?.coding === true
      if (watchingRuntimes && runtimeWatchStartedAtRef.current === null) {
        runtimeWatchStartedAtRef.current = Date.now()
      }
      const shouldScanRuntimes =
        watchingRuntimes && Date.now() - runtimeScanRequestedAtRef.current > 12_000
      if (shouldScanRuntimes) runtimeScanRequestedAtRef.current = Date.now()
      const [state, runtimeScan] = await Promise.all([
        api?.connector?.getStatus?.().catch(() => null),
        shouldScanRuntimes
          ? api?.connector?.scanRuntimeSessions?.({ force: false }).catch(() => null)
          : Promise.resolve(null),
      ])
      if (!state || cancelled) return
      const buddyReadySessions = state.connections
        .filter((connection) => connection.status === 'running')
        .map((connection) => ({
          id: `buddy:${connection.agentId}:${connection.runtimeId}:${connection.workDir ?? ''}`,
          label: connection.label,
          runtimeLabel: connection.runtimeLabel,
          source: 'buddy' as const,
        }))
      const runtimeLabels = new Map(
        runtimeScan?.runtimes?.map((runtime) => [runtime.id, runtime.label]) ?? [],
      )
      const hasRuntimeSessionSnapshot =
        watchingRuntimes && Boolean(runtimeScan?.runtimeSessions?.sessions)
      if (hasRuntimeSessionSnapshot && runtimeScan?.runtimeSessions?.sessions) {
        const enabledRuntimeIds = new Set(runtimeScan.runtimeSessions.runtimeIds ?? [])
        processRuntimeSessionNotifications(
          runtimeScan.runtimeSessions.sessions,
          runtimeLabels,
          enabledRuntimeIds,
        )
        processRuntimeSessionReactionBubbles(
          runtimeScan.runtimeSessions.sessions,
          enabledRuntimeIds,
        )
      }
      const runtimeSessions =
        hasRuntimeSessionSnapshot && runtimeScan?.runtimeSessions?.sessions
          ? runtimeScan.runtimeSessions.sessions
          : []
      const activeRuntimeSessions = runtimeSessions.filter(runtimeSessionLooksActive)
      const runtimeSessionReactions = hasRuntimeSessionSnapshot
        ? runtimeSessions
            .filter((session) =>
              runtimeSessionReactionIsVisible(
                session,
                Date.now(),
                RUNTIME_SESSION_REACTION_VISIBLE_MS,
              ),
            )
            .map(runtimeSessionReaction)
        : []
      const readySessions = buddyReadySessions
      if (hasRuntimeSessionSnapshot && activeRuntimeSessions.length === 0) {
        clearPetNotice('runtime-busy')
      }
      logRuntimeScanDebug({
        watchingRuntimes,
        hasRuntimeSessionSnapshot,
        sessions: runtimeSessions,
        activeRuntimeSessions,
        runtimeSessionReactions,
      })
      setConnectorSnapshot({
        connectorOnline: state.running || readySessions.length > 0,
        activeRuntimeSessionCount: activeRuntimeSessions.length,
        onlineCount: readySessions.length,
        runtimeSessionReactions,
        readySessions,
      })
    }
    void refresh()
    const timer = window.setInterval(refresh, 5000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [
    api,
    clearPetNotice,
    processRuntimeSessionNotifications,
    processRuntimeSessionReactionBubbles,
  ])

  const addServiceAlert = useCallback(
    (id: PetServiceAlertId, message: string) => {
      setServiceAlerts((current) => {
        const next = [{ id, createdAt: Date.now() }, ...current.filter((item) => item.id !== id)]
        return next.slice(0, 4)
      })
      showPetNotice(message)
      void api?.showNotification?.(
        t('desktopPet.services.notificationTitleWithName', {
          name: petName || t('desktopPet.pet.name'),
        }),
        message,
        undefined,
        {
          target: 'pet',
        },
      )
    },
    [api, petName, showPetNotice, t],
  )

  const recordServiceHistory = useCallback(
    (patch: Parameters<typeof recordServiceHistoryEvent>[0], timestamp = Date.now()) => {
      setServiceHistory(recordServiceHistoryEvent(patch, timestamp))
    },
    [],
  )

  const clearServiceAlert = useCallback((id: PetServiceAlertId) => {
    setServiceAlerts((current) => current.filter((item) => item.id !== id))
  }, [])

  useEffect(() => {
    const tick = () => {
      const now = Date.now()
      setServiceNow(now)
      setServices((current) => {
        let next = current
        const patch = (value: Partial<PetServiceState>) => {
          next = { ...next, ...value }
        }
        const waterDueAt = current.lastWaterAt + current.waterIntervalMs
        if (current.water && now >= waterDueAt && current.lastWaterReminderAt < waterDueAt) {
          patch({ lastWaterReminderAt: now })
          window.setTimeout(
            () => addServiceAlert('water', t('desktopPet.services.waterReminder')),
            0,
          )
        }
        const fitnessDueAt = current.lastFitnessAt + current.fitnessIntervalMs
        if (
          current.fitness &&
          now >= fitnessDueAt &&
          current.lastFitnessReminderAt < fitnessDueAt
        ) {
          patch({ lastFitnessReminderAt: now })
          window.setTimeout(
            () => addServiceAlert('fitness', t('desktopPet.services.fitnessReminder')),
            0,
          )
        }
        if (current.focus && !current.focusEndsAt) {
          patch({ focus: false, focusEndsAt: null, focusStartedAt: null })
        }
        if (current.focus && current.focusEndsAt && now >= current.focusEndsAt) {
          if (recordedFocusCompletionRef.current !== current.focusEndsAt) {
            recordedFocusCompletionRef.current = current.focusEndsAt
            recordServiceHistory(
              {
                focusMs: Math.max(
                  0,
                  Math.min(current.focusDurationMs, now - (current.focusStartedAt ?? now)),
                ),
              },
              now,
            )
          }
          patch({ focus: false, focusEndsAt: null, focusStartedAt: null })
          window.setTimeout(() => addServiceAlert('focus', t('desktopPet.services.focusReady')), 0)
        }
        return next
      })
    }
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [addServiceAlert, recordServiceHistory, t])

  useEffect(() => {
    if (!services.coding) {
      runtimeWatchStartedAtRef.current = null
      runtimeSessionTrackerRef.current.clear()
      runtimeSessionBubbleTrackerRef.current.clear()
      clearPetNotice('runtime-busy')
      return
    }
    if (runtimeWatchStartedAtRef.current === null) runtimeWatchStartedAtRef.current = Date.now()
  }, [clearPetNotice, services.coding])

  function toggleService(service: PetServiceId) {
    const previous = servicesRef.current
    const now = Date.now()
    const enabled = previous ? !previous[service] : true
    if (service === 'focus' && previous?.focus && !enabled && previous.focusStartedAt) {
      recordServiceHistory({ focusMs: Math.max(0, now - previous.focusStartedAt) }, now)
    }
    setServices((current) => {
      const next = { ...current, [service]: enabled } as PetServiceState
      if (service === 'focus') {
        next.focusStartedAt = enabled ? now : null
        next.focusDurationMs = normalizeIntervalMs(next.focusDurationMs)
        next.focusEndsAt = enabled ? now + next.focusDurationMs : null
      }
      if (service === 'water' && enabled) {
        next.lastWaterAt = now
        next.lastWaterReminderAt = now
      }
      if (service === 'fitness' && enabled) {
        next.lastFitnessAt = now
        next.lastFitnessReminderAt = now
      }
      window.setTimeout(() => {
        clearServiceAlert(service)
        showPetNotice(
          enabled
            ? t(`desktopPet.services.${service}Enabled`)
            : t(`desktopPet.services.${service}Disabled`),
        )
      }, 0)
      return next
    })
  }

  function startFocusTimer(minutes: number) {
    const previous = servicesRef.current
    const now = Date.now()
    const durationMs = normalizeIntervalMs(minutes * 60_000)
    if (previous?.focus && previous.focusStartedAt) {
      recordServiceHistory({ focusMs: Math.max(0, now - previous.focusStartedAt) }, now)
    }
    setServices((current) => {
      window.setTimeout(() => {
        clearServiceAlert('focus')
        showPetNotice(t('desktopPet.services.focusEnabled'))
      }, 0)
      return {
        ...current,
        focus: true,
        focusStartedAt: now,
        focusDurationMs: durationMs,
        focusEndsAt: now + durationMs,
      }
    })
  }

  function updateServiceInterval(service: PetServiceIntervalId, minutes: number) {
    const now = Date.now()
    const intervalMs = normalizeIntervalMs(minutes * 60_000)
    setServices((current) => {
      if (service === 'focus') {
        const focusStartedAt = current.focusStartedAt ?? now
        return {
          ...current,
          focusDurationMs: intervalMs,
          focusStartedAt: current.focus ? focusStartedAt : current.focusStartedAt,
          focusEndsAt: current.focus ? focusStartedAt + intervalMs : current.focusEndsAt,
        }
      }
      if (service === 'water') return { ...current, waterIntervalMs: intervalMs }
      return { ...current, fitnessIntervalMs: intervalMs }
    })
  }

  function acknowledgeService(service: Extract<PetServiceId, 'water' | 'fitness'>) {
    const now = Date.now()
    setServices((current) => ({
      ...current,
      ...(service === 'water'
        ? { lastWaterAt: now, lastWaterReminderAt: now }
        : { lastFitnessAt: now, lastFitnessReminderAt: now }),
    }))
    clearServiceAlert(service)
    recordServiceHistory(service === 'water' ? { waterCount: 1 } : { fitnessCount: 1 }, now)
    showPetNotice(t(`desktopPet.services.${service}Done`))
  }

  return {
    services,
    serviceHistory,
    serviceAlerts,
    serviceNow,
    connectorSnapshot,
    toggleService,
    startFocusTimer,
    updateServiceInterval,
    acknowledgeService,
    clearServiceAlert,
  }
}

function normalizeIntervalMs(value: number): number {
  const minutes = Math.max(
    MIN_SERVICE_INTERVAL_MINUTES,
    Math.round(value / 60_000 / MIN_SERVICE_INTERVAL_MINUTES) * MIN_SERVICE_INTERVAL_MINUTES,
  )
  return minutes * 60_000
}

function runtimeSessionBubbleMessage(
  session: RuntimeSessionForNotification,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const activity = session.petActivity
  if (activity) {
    const label = typeof activity.label === 'string' ? activity.label.trim() : ''
    return label
      ? t(`desktopPet.services.runtimeActivity.${activity.kind}WithLabel`, { label })
      : t(`desktopPet.services.runtimeActivity.${activity.kind}`)
  }
  return t(`desktopPet.services.runtimeReaction.${runtimeSessionReaction(session)}`)
}

function isRuntimeDebugEnabled(): boolean {
  try {
    return localStorage.getItem(PET_RUNTIME_DEBUG_KEY) === '1'
  } catch {
    return false
  }
}

function logRuntimeDebug(reason: string, context: Record<string, unknown>): void {
  if (!isRuntimeDebugEnabled()) return
  emitDesktopPetDebugLog('[desktop-pet:runtime]', {
    reason,
    at: new Date().toISOString(),
    ...context,
  })
}

function logRuntimeScanDebug({
  watchingRuntimes,
  hasRuntimeSessionSnapshot,
  sessions,
  activeRuntimeSessions,
  runtimeSessionReactions,
}: {
  watchingRuntimes: boolean
  hasRuntimeSessionSnapshot: boolean
  sessions: RuntimeSessionForNotification[]
  activeRuntimeSessions: RuntimeSessionForNotification[]
  runtimeSessionReactions: RuntimeSessionPetReaction[]
}): void {
  if (!isRuntimeDebugEnabled()) return
  emitDesktopPetDebugLog('[desktop-pet:runtime]', {
    reason: 'runtime-scan',
    at: new Date().toISOString(),
    watchingRuntimes,
    hasRuntimeSessionSnapshot,
    totalSessions: sessions.length,
    activeCount: activeRuntimeSessions.length,
    visibleReactions: runtimeSessionReactions,
    stateCounts: countBy(sessions, (session) => session.state),
    reactionCounts: countBy(sessions, runtimeSessionReaction),
    activeSessions: activeRuntimeSessions.slice(0, 8).map(runtimeSessionDebugSummary),
  })
}

function emitDesktopPetDebugLog(scope: string, payload: Record<string, unknown>): void {
  window.desktopPetDebugLog?.(scope, payload)
}

function runtimeSessionDebugSummary(
  session: RuntimeSessionForNotification,
): Record<string, unknown> {
  return {
    key: runtimeSessionKey(session),
    runtimeId: session.runtimeId,
    instanceId: session.instanceId,
    sessionId: session.sessionId,
    state: session.state,
    reaction: runtimeSessionReaction(session),
    active: runtimeSessionLooksActive(session),
    title: session.title ?? null,
    lastActivityAt: session.lastActivityAt ?? null,
  }
}

function countBy<T>(items: T[], keyForItem: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const item of items) {
    const key = keyForItem(item)
    counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
}
