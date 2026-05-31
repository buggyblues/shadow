import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { loadServiceState, saveServiceState } from '../lib/pet-storage'
import type {
  AppTab,
  ConnectorSnapshot,
  DesktopPetApi,
  PetServiceAlert,
  PetServiceAlertId,
  PetServiceId,
  PetServiceState,
} from '../pet-types'

export function usePetServices({
  api,
  panelOpen,
  tab,
  showPetNotice,
}: {
  api: DesktopPetApi | null
  panelOpen: boolean
  tab: AppTab
  showPetNotice: (message: string) => void
}) {
  const { t } = useTranslation()
  const codingReadySessionIdsRef = useRef<Set<string> | null>(null)
  const [serviceAlerts, setServiceAlerts] = useState<PetServiceAlert[]>([])
  const [serviceNow, setServiceNow] = useState(() => Date.now())
  const [services, setServices] = useState<PetServiceState>(() => loadServiceState())
  const [connectorSnapshot, setConnectorSnapshot] = useState<ConnectorSnapshot>({
    running: false,
    onlineCount: 0,
    readySessions: [],
  })

  useEffect(() => {
    saveServiceState(services)
  }, [services])

  useEffect(() => {
    if (panelOpen && tab === 'services' && serviceAlerts.length > 0) {
      setServiceAlerts([])
    }
  }, [panelOpen, serviceAlerts.length, tab])

  useEffect(() => {
    if (!panelOpen || tab !== 'services') return
    setServiceNow(Date.now())
    const timer = window.setInterval(() => setServiceNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [panelOpen, tab])

  useEffect(() => {
    let cancelled = false
    const refresh = async () => {
      const state = await api?.connector?.getStatus?.().catch(() => null)
      if (!state || cancelled) return
      const readySessions = state.connections
        .filter((connection) => connection.status === 'running')
        .map((connection) => ({
          id: `${connection.agentId}:${connection.runtimeId}:${connection.workDir ?? ''}`,
          label: connection.label,
          runtimeLabel: connection.runtimeLabel,
        }))
      setConnectorSnapshot({
        running: state.running,
        onlineCount: readySessions.length,
        readySessions,
      })
    }
    void refresh()
    const timer = window.setInterval(refresh, 5000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [api])

  const addServiceAlert = useCallback(
    (id: PetServiceAlertId, message: string) => {
      setServiceAlerts((current) => {
        const next = [{ id, createdAt: Date.now() }, ...current.filter((item) => item.id !== id)]
        return next.slice(0, 4)
      })
      showPetNotice(message)
      void api?.showNotification?.(t('desktopPet.services.notificationTitle'), message, undefined, {
        target: 'pet',
      })
    },
    [api, showPetNotice, t],
  )

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now()
      setServices((current) => {
        let next = current
        const patch = (value: Partial<PetServiceState>) => {
          next = { ...next, ...value }
        }
        const waterDueAt = current.lastWaterAt + 60 * 60_000
        if (current.water && now >= waterDueAt && current.lastWaterReminderAt < waterDueAt) {
          patch({ lastWaterReminderAt: now })
          window.setTimeout(
            () => addServiceAlert('water', t('desktopPet.services.waterReminder')),
            0,
          )
        }
        const fitnessDueAt = current.lastFitnessAt + 90 * 60_000
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
        if (current.focus && current.focusEndsAt && now >= current.focusEndsAt) {
          patch({ focus: false, focusEndsAt: null, focusStartedAt: null })
          window.setTimeout(() => addServiceAlert('focus', t('desktopPet.services.focusReady')), 0)
        }
        return next
      })
    }, 30_000)
    return () => window.clearInterval(timer)
  }, [addServiceAlert, t])

  useEffect(() => {
    if (!services.coding) {
      codingReadySessionIdsRef.current = null
      return
    }
    const currentIds = new Set(connectorSnapshot.readySessions.map((session) => session.id))
    const previousIds = codingReadySessionIdsRef.current
    codingReadySessionIdsRef.current = currentIds
    if (!previousIds) return
    const newSessions = connectorSnapshot.readySessions.filter(
      (session) => !previousIds.has(session.id),
    )
    if (newSessions.length === 0) return
    const firstSession = newSessions[0]
    addServiceAlert(
      'coding',
      newSessions.length === 1
        ? t('desktopPet.services.runtimeReady', {
            name: firstSession?.label ?? t('desktopPet.services.coding'),
            runtime: firstSession?.runtimeLabel ?? t('desktopPet.services.coding'),
          })
        : t('desktopPet.services.runtimeReadyMany', { count: newSessions.length }),
    )
  }, [addServiceAlert, connectorSnapshot.readySessions, services.coding, t])

  function toggleService(service: PetServiceId) {
    setServices((current) => {
      const now = Date.now()
      const enabled = !current[service]
      const next = { ...current, [service]: enabled } as PetServiceState
      if (service === 'focus') {
        next.focusStartedAt = enabled ? now : null
        next.focusDurationMs = 25 * 60_000
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
    setServices((current) => {
      const now = Date.now()
      const durationMs = Math.max(1, minutes) * 60_000
      window.setTimeout(() => {
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

  function acknowledgeService(service: Extract<PetServiceId, 'water' | 'fitness'>) {
    const now = Date.now()
    setServices((current) => ({
      ...current,
      ...(service === 'water'
        ? { lastWaterAt: now, lastWaterReminderAt: now }
        : { lastFitnessAt: now, lastFitnessReminderAt: now }),
    }))
    setServiceAlerts((current) => current.filter((item) => item.id !== service))
    showPetNotice(t(`desktopPet.services.${service}Done`))
  }

  return {
    services,
    serviceAlerts,
    serviceNow,
    connectorSnapshot,
    toggleService,
    startFocusTimer,
    acknowledgeService,
  }
}
