import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import { api } from '@/lib/api'
import { isRecord, parseJson } from '@/lib/json'

// Allow saas adapter to inject a record function so we don't call local /api/activity
let _activityRecord: ((entry: object) => Promise<unknown>) | null = null
export function setActivityRecordFn(fn: (entry: object) => Promise<unknown>) {
  _activityRecord = fn
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type ActivityType =
  | 'deploy'
  | 'destroy'
  | 'scale'
  | 'config'
  | 'config_update'
  | 'cluster_add'
  | 'cluster_remove'
  | 'envvar_update'
  | 'init'
  | 'template_approved'
  | 'template_rejected'
  | 'billing_deduct'
  | 'settings'
  | 'template_submit'
  | 'template_delete'
  | 'template_update'

export type ActivityTypeValue = ActivityType | (string & {})

export interface ActivityEntry {
  id: string
  type: ActivityTypeValue
  title: string
  description?: string
  detail?: string
  namespace?: string
  template?: string
  templateSlug?: string
  slug?: string
  taskId?: string
  deploymentId?: string
  monthlyCost?: number
  hourlyCost?: number
  resourceTier?: string
  userId?: string
  meta?: Record<string, unknown> | null
  timestamp: number
  metadata?: Array<{ label: string; value: string }>
}

interface AppState {
  // Settings modal
  settingsOpen: boolean
  settingsTab: string
  openSettings: (tab?: string) => void
  closeSettings: () => void

  // Activity log
  activities: ActivityEntry[]
  addActivity: (entry: Omit<ActivityEntry, 'id' | 'timestamp'>) => void
  clearActivities: () => void

  // Favorites
  favorites: string[]
  toggleFavorite: (templateName: string) => void
  isFavorite: (templateName: string) => boolean

  // Recent deploys
  recentDeploys: Array<{ template: string; namespace: string; timestamp: number }>
  addRecentDeploy: (template: string, namespace: string) => void
}

// ── Persistence ───────────────────────────────────────────────────────────────

const STORAGE_KEY = 'shadow-cloud-console'

type PersistedAppState = Partial<Pick<AppState, 'activities' | 'favorites' | 'recentDeploys'>>

function isActivityEntry(value: unknown): value is ActivityEntry {
  if (!isRecord(value)) return false

  return (
    typeof value.id === 'string' &&
    typeof value.type === 'string' &&
    typeof value.title === 'string' &&
    typeof value.timestamp === 'number'
  )
}

function readFavorites(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  return [...new Set(value.filter((item): item is string => typeof item === 'string'))].slice(
    0,
    100,
  )
}

function readActivities(value: unknown): ActivityEntry[] {
  if (!Array.isArray(value)) return []

  return value.filter(isActivityEntry).slice(0, 100)
}

function readRecentDeploys(value: unknown): AppState['recentDeploys'] {
  if (!Array.isArray(value)) return []

  return value
    .filter((item): item is AppState['recentDeploys'][number] => {
      if (!isRecord(item)) return false

      return (
        typeof item.template === 'string' &&
        typeof item.namespace === 'string' &&
        typeof item.timestamp === 'number'
      )
    })
    .slice(0, 20)
}

function loadPersisted(): Partial<Pick<AppState, 'activities' | 'favorites' | 'recentDeploys'>> {
  try {
    if (typeof window === 'undefined') return {}

    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}

    const parsed = parseJson(raw)
    if (!parsed.ok || !isRecord(parsed.value)) return {}

    const persisted: PersistedAppState = {}
    const activities = readActivities(parsed.value.activities)
    const favorites = readFavorites(parsed.value.favorites)
    const recentDeploys = readRecentDeploys(parsed.value.recentDeploys)

    if (activities.length > 0) persisted.activities = activities
    if (favorites.length > 0) persisted.favorites = favorites
    if (recentDeploys.length > 0) persisted.recentDeploys = recentDeploys

    return persisted
  } catch {
    return {}
  }
}

function persistState(state: AppState) {
  try {
    if (typeof window === 'undefined') return

    const data = {
      activities: state.activities.slice(0, 100),
      favorites: state.favorites,
      recentDeploys: state.recentDeploys.slice(0, 20),
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    /* ignore quota errors */
  }
}

// ── Store ─────────────────────────────────────────────────────────────────────

const persisted = loadPersisted()

export const useAppStore = create<AppState>((set, get) => ({
  // Settings modal
  settingsOpen: false,
  settingsTab: 'community',
  openSettings: (tab = 'community') => set({ settingsOpen: true, settingsTab: tab }),
  closeSettings: () => set({ settingsOpen: false }),

  // Activity log
  activities: persisted.activities ?? [],
  addActivity: (entry) =>
    set((s) => {
      const activity: ActivityEntry = {
        ...entry,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: Date.now(),
      }
      const activities = [activity, ...s.activities].slice(0, 200)
      const next = { ...s, activities }
      persistState(next)
      // Also record server-side for persistence
      ;(_activityRecord ?? api.activity.record.bind(api.activity))(activity).catch(() => {
        /* ignore — server may not be available */
      })
      return { activities }
    }),
  clearActivities: () =>
    set((s) => {
      const next = { ...s, activities: [] }
      persistState(next)
      return { activities: [] }
    }),

  // Favorites
  favorites: persisted.favorites ?? [],
  toggleFavorite: (name) =>
    set((s) => {
      const favorites = s.favorites.includes(name)
        ? s.favorites.filter((f) => f !== name)
        : [...s.favorites, name]
      persistState({ ...s, favorites })
      return { favorites }
    }),
  isFavorite: (name) => get().favorites.includes(name),

  // Recent deploys
  recentDeploys: persisted.recentDeploys ?? [],
  addRecentDeploy: (template, namespace) =>
    set((s) => {
      const recentDeploys = [
        { template, namespace, timestamp: Date.now() },
        ...s.recentDeploys.filter((r) => !(r.template === template && r.namespace === namespace)),
      ].slice(0, 20)
      persistState({ ...s, recentDeploys })
      return { recentDeploys }
    }),
}))

// ── Selectors ─────────────────────────────────────────────────────────────────

export function useActivities() {
  return useAppStore((s) => s.activities)
}

export function useRecentActivities(count = 5) {
  return useAppStore(useShallow((s) => s.activities.slice(0, count)))
}
