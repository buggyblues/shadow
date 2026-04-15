import { type ClassValue, clsx } from 'clsx'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function truncate(s: string, maxLength: number): string {
  if (s.length <= maxLength) return s
  return `${s.slice(0, maxLength)}…`
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural ?? `${singular}s`)
}

export function getRelativeTime(ts: number): string {
  const diff = Date.now() - ts
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(ts).toLocaleDateString()
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  const result: Record<string, T[]> = {}
  for (const item of arr) {
    const k = key(item)
    if (!result[k]) result[k] = []
    result[k].push(item)
  }
  return result
}

export function sortBy<T>(arr: T[], key: (item: T) => string | number, desc = false): T[] {
  return [...arr].sort((a, b) => {
    const va = key(a)
    const vb = key(b)
    if (va < vb) return desc ? 1 : -1
    if (va > vb) return desc ? -1 : 1
    return 0
  })
}

export function parseReadyStatus(ready: string): { ready: number; total: number } {
  const [readyCount = 0, totalCount = 0] = ready.split('/').map(Number)
  return {
    ready: Number.isFinite(readyCount) ? readyCount : 0,
    total: Number.isFinite(totalCount) ? totalCount : 0,
  }
}

export function isDeploymentReady(ready: string): boolean {
  const { ready: readyCount, total } = parseReadyStatus(ready)
  return readyCount === total && total > 0
}

export function getReadyReplicas(ready: string): number {
  return parseReadyStatus(ready).ready
}

export function formatTimestamp(value?: string | null): string {
  if (!value) return '—'
  try {
    return formatDistanceToNow(parseISO(value), { addSuffix: true })
  } catch {
    return value
  }
}

export function getAge(value: string): string {
  try {
    return formatDistanceToNow(parseISO(value), { addSuffix: true })
  } catch {
    return value
  }
}
