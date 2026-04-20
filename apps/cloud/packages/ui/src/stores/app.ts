import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import { api } from '@/lib/api'

// Allow saas adapter to inject a record function so we don't call local /api/activity
let _activityRecord: ((entry: object) => Promise<unknown>) | null = null
export function setActivityRecordFn(fn: (entry: object) => Promise<unknown>) {
  _activityRecord = fn
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type ActivityType = 'deploy' | 'destroy' | 'scale' | 'config' | 'init' | 'settings'

export interface ActivityEntry {
  id: string
  type: ActivityType
  title: string
  detail?: string
  namespace?: string
  template?: string
  timestamp: number
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

function loadPersisted(): Partial<Pick<AppState, 'activities' | 'favorites' | 'recentDeploys'>> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as ReturnType<typeof loadPersisted>
  } catch {
    return {}
  }
}

function persistState(state: AppState) {
  try {
    const data = {
      activities: state.activities.slice(0, 100),
      favorites: state.favorites,
      recentDeploys: state.recentDeploys.slice(0, 20),
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    /* ignore quota errors */
  }
}

// ── Store ─────────────────────────────────────────────────────────────────────

const persisted = loadPersisted()

export const useAppStore = create<AppState>((set, get) => ({
  // Settings modal
  settingsOpen: false,
  settingsTab: 'providers',
  openSettings: (tab = 'providers') => set({ settingsOpen: true, settingsTab: tab }),
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
