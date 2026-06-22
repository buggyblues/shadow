import AsyncStorage from '@react-native-async-storage/async-storage'
import { useCallback, useEffect, useState } from 'react'
import type { HomeAccessRecord } from '../types'

const HOME_ACCESS_HISTORY_STORAGE_KEY = 'shadow-home-access-history-v1'
const MAX_HOME_ACCESS_RECORDS = 80

function normalizeRecords(value: unknown): HomeAccessRecord[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const record = entry as Partial<HomeAccessRecord>
      if (typeof record.key !== 'string' || !record.key) return null
      return {
        key: record.key,
        count: typeof record.count === 'number' && Number.isFinite(record.count) ? record.count : 1,
        lastAccessedAt:
          typeof record.lastAccessedAt === 'number' && Number.isFinite(record.lastAccessedAt)
            ? record.lastAccessedAt
            : 0,
      }
    })
    .filter((entry): entry is HomeAccessRecord => Boolean(entry))
    .sort((a, b) => b.count - a.count || b.lastAccessedAt - a.lastAccessedAt)
    .slice(0, MAX_HOME_ACCESS_RECORDS)
}

export function useHomeAccessHistory() {
  const [records, setRecords] = useState<HomeAccessRecord[]>([])

  useEffect(() => {
    let active = true
    AsyncStorage.getItem(HOME_ACCESS_HISTORY_STORAGE_KEY)
      .then((raw) => {
        if (!active || !raw) return
        setRecords(normalizeRecords(JSON.parse(raw)))
      })
      .catch(() => null)
    return () => {
      active = false
    }
  }, [])

  const recordAccess = useCallback((key: string) => {
    if (!key) return
    const now = Date.now()
    setRecords((current) => {
      const byKey = new Map(current.map((record) => [record.key, record]))
      const previous = byKey.get(key)
      byKey.set(key, {
        key,
        count: (previous?.count ?? 0) + 1,
        lastAccessedAt: now,
      })
      const next = Array.from(byKey.values())
        .sort((a, b) => b.count - a.count || b.lastAccessedAt - a.lastAccessedAt)
        .slice(0, MAX_HOME_ACCESS_RECORDS)
      void AsyncStorage.setItem(HOME_ACCESS_HISTORY_STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  return {
    accessRecords: records,
    recordAccess,
  }
}
