import { type Dispatch, type SetStateAction, useEffect, useRef, useState } from 'react'
import {
  type ClientStateScope,
  getClientState,
  putClientState,
} from '../services/client-state-api.js'
import {
  type TravelClientStateEventDetail,
  travelClientStateEventName,
} from '../services/client-state-events.js'
import { travelServerScope } from '../services/shadow-host.js'

export type TravelSyncStatus = 'idle' | 'saving' | 'saved' | 'synced' | 'error'

interface StoredValue<T> {
  updatedAt: number
  value: T
}

function storageKey(tripId: string | undefined, scope: string) {
  return `travel:${travelServerScope()}:${tripId ?? 'draft'}:${scope}:v3`
}

function readStoredValue<T>(key: string, fallback: T): StoredValue<T> {
  if (typeof window === 'undefined') return { updatedAt: 0, value: fallback }
  try {
    const value = window.localStorage.getItem(key)
    return value ? (JSON.parse(value) as StoredValue<T>) : { updatedAt: 0, value: fallback }
  } catch {
    return { updatedAt: 0, value: fallback }
  }
}

export function usePersistentTripState<T>(
  tripId: string | undefined,
  scope: string,
  fallback: T,
  options: { enabled?: boolean; sharing?: ClientStateScope } = {},
): [T, Dispatch<SetStateAction<T>>, TravelSyncStatus] {
  const key = storageKey(tripId, scope)
  const enabled = options.enabled ?? true
  const sharing = options.sharing ?? (tripId ? 'trip' : 'user')
  const fallbackRef = useRef(fallback)
  const latestTimestamp = useRef(0)
  const revision = useRef(0)
  const skipNextWrite = useRef(true)
  const [value, setValue] = useState<T>(() => {
    const stored = readStoredValue(key, fallback)
    latestTimestamp.current = stored.updatedAt
    return stored.value
  })
  const [status, setStatus] = useState<TravelSyncStatus>('idle')

  useEffect(() => {
    if (!enabled) return
    const stored = readStoredValue(key, fallbackRef.current)
    latestTimestamp.current = stored.updatedAt
    skipNextWrite.current = true
    setValue(stored.value)
    setStatus(stored.updatedAt ? 'saved' : 'idle')
    let cancelled = false
    void getClientState<T>(scope, { scope: sharing, tripId }).then(
      (snapshot) => {
        if (cancelled) return
        revision.current = snapshot.revision
        if (snapshot.value !== null) {
          skipNextWrite.current = true
          setValue(snapshot.value)
          const updatedAt = snapshot.updatedAt ? new Date(snapshot.updatedAt).getTime() : Date.now()
          latestTimestamp.current = updatedAt
          window.localStorage.setItem(
            key,
            JSON.stringify({ updatedAt, value: snapshot.value } satisfies StoredValue<T>),
          )
          setStatus('synced')
        } else {
          void putClientState(scope, {
            expectedRevision: snapshot.revision,
            scope: sharing,
            tripId,
            value: stored.value,
          }).then(
            (created) => {
              if (cancelled) return
              revision.current = created.revision
              setStatus('saved')
            },
            () => {
              if (!cancelled) setStatus('error')
            },
          )
        }
      },
      () => {
        if (!cancelled) setStatus(stored.updatedAt ? 'saved' : 'error')
      },
    )
    return () => {
      cancelled = true
    }
  }, [enabled, key, scope, sharing, tripId])

  useEffect(() => {
    if (!enabled) return
    if (skipNextWrite.current) {
      skipNextWrite.current = false
      return
    }
    setStatus('saving')
    const timer = window.setTimeout(() => {
      const updatedAt = Date.now()
      try {
        window.localStorage.setItem(key, JSON.stringify({ updatedAt, value }))
        latestTimestamp.current = updatedAt
      } catch {
        setStatus('error')
        return
      }
      void putClientState(scope, {
        expectedRevision: revision.current,
        scope: sharing,
        tripId,
        value,
      }).then(
        (snapshot) => {
          revision.current = snapshot.revision
          setStatus('saved')
        },
        async (error) => {
          if ((error as { status?: number }).status === 409) {
            try {
              const snapshot = await getClientState<T>(scope, { scope: sharing, tripId })
              revision.current = snapshot.revision
              if (snapshot.value !== null) {
                skipNextWrite.current = true
                setValue(snapshot.value)
                setStatus('synced')
                return
              }
            } catch {
              // Fall through to the visible error state.
            }
          }
          setStatus('error')
        },
      )
    }, 220)
    return () => window.clearTimeout(timer)
  }, [enabled, key, scope, sharing, tripId, value])

  useEffect(() => {
    const receiveExternalUpdate = (event: StorageEvent) => {
      if (event.key !== key || !event.newValue) return
      try {
        const incoming = JSON.parse(event.newValue) as StoredValue<T>
        if (incoming.updatedAt <= latestTimestamp.current) return
        latestTimestamp.current = incoming.updatedAt
        skipNextWrite.current = true
        setValue(incoming.value)
        setStatus('synced')
      } catch {
        setStatus('error')
      }
    }
    window.addEventListener('storage', receiveExternalUpdate)
    return () => window.removeEventListener('storage', receiveExternalUpdate)
  }, [key])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const pullLatest = async () => {
      try {
        const snapshot = await getClientState<T>(scope, { scope: sharing, tripId })
        if (cancelled || snapshot.revision <= revision.current || snapshot.value === null) return
        revision.current = snapshot.revision
        skipNextWrite.current = true
        setValue(snapshot.value)
        const updatedAt = snapshot.updatedAt ? new Date(snapshot.updatedAt).getTime() : Date.now()
        latestTimestamp.current = updatedAt
        window.localStorage.setItem(
          key,
          JSON.stringify({ updatedAt, value: snapshot.value } satisfies StoredValue<T>),
        )
        setStatus('synced')
      } catch {
        // Keep the cached value while connectivity is unavailable.
      }
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void pullLatest()
    }
    const onServerUpdate = (event: Event) => {
      const detail = (event as CustomEvent<TravelClientStateEventDetail>).detail
      if (detail?.key !== scope || detail.tripId !== tripId) return
      void pullLatest()
    }
    // The websocket event is the primary cross-user synchronization path. The
    // long interval is only a recovery net for standalone/global state where no
    // trip room is connected.
    const timer = window.setInterval(() => void pullLatest(), 5 * 60_000)
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener(travelClientStateEventName, onServerUpdate)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener(travelClientStateEventName, onServerUpdate)
    }
  }, [enabled, key, scope, sharing, tripId])

  return [value, setValue, status]
}

export function combineTravelSyncStatus(statuses: TravelSyncStatus[]): TravelSyncStatus {
  if (statuses.includes('error')) return 'error'
  if (statuses.includes('saving')) return 'saving'
  if (statuses.includes('synced')) return 'synced'
  if (statuses.includes('saved')) return 'saved'
  return 'idle'
}
