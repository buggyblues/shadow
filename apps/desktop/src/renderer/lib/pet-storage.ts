import type { ChannelSubscription, PetServiceHistoryDay, PetServiceState } from '../pet-types'
import { type PetState, parsePetState, serializePetState, tickPet } from './game'

export const PET_STORAGE_KEY = 'shadow:desktop-pet-state:v1'
export const SUBSCRIPTIONS_STORAGE_KEY = 'shadow:desktop-pet-subscriptions:v1'
export const SERVICES_STORAGE_KEY = 'shadow:desktop-pet-services:v1'
export const SERVICE_HISTORY_STORAGE_KEY = 'shadow:desktop-pet-service-history:v1'
const SERVICE_HISTORY_MAX_DAYS = 60
const MIN_SERVICE_INTERVAL_MINUTES = 5
const DEFAULT_FOCUS_DURATION_MS = 25 * 60_000
const DEFAULT_WATER_INTERVAL_MS = 60 * 60_000
const DEFAULT_FITNESS_INTERVAL_MS = 90 * 60_000

export function loadPetState(): PetState {
  return tickPet(parsePetState(localStorage.getItem(PET_STORAGE_KEY)))
}

export function savePetState(state: PetState): void {
  localStorage.setItem(PET_STORAGE_KEY, serializePetState(state))
}

export function loadSubscriptions(): ChannelSubscription[] {
  try {
    const raw = localStorage.getItem(SUBSCRIPTIONS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as ChannelSubscription[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item) =>
        item &&
        typeof item.channelId === 'string' &&
        typeof item.channelName === 'string' &&
        typeof item.serverId === 'string' &&
        typeof item.serverName === 'string',
    )
  } catch {
    return []
  }
}

export function saveSubscriptions(subscriptions: ChannelSubscription[]): void {
  localStorage.setItem(SUBSCRIPTIONS_STORAGE_KEY, JSON.stringify(subscriptions))
}

export function loadServiceState(): PetServiceState {
  const defaults: PetServiceState = {
    water: false,
    focus: false,
    fitness: false,
    coding: true,
    focusEndsAt: null,
    focusStartedAt: null,
    focusDurationMs: DEFAULT_FOCUS_DURATION_MS,
    waterIntervalMs: DEFAULT_WATER_INTERVAL_MS,
    lastWaterAt: 0,
    lastWaterReminderAt: 0,
    fitnessIntervalMs: DEFAULT_FITNESS_INTERVAL_MS,
    lastFitnessAt: 0,
    lastFitnessReminderAt: 0,
  }
  try {
    const parsed = JSON.parse(
      localStorage.getItem(SERVICES_STORAGE_KEY) ?? '{}',
    ) as Partial<PetServiceState>
    const focusEndsAt = Number(parsed.focusEndsAt) > Date.now() ? Number(parsed.focusEndsAt) : null
    return {
      water: Boolean(parsed.water),
      focus: Boolean(parsed.focus) && Boolean(focusEndsAt),
      fitness: Boolean(parsed.fitness),
      coding: parsed.coding === undefined ? true : Boolean(parsed.coding),
      focusEndsAt,
      focusStartedAt: Number(parsed.focusStartedAt) || null,
      focusDurationMs: normalizeServiceIntervalMs(
        parsed.focusDurationMs,
        DEFAULT_FOCUS_DURATION_MS,
      ),
      waterIntervalMs: normalizeServiceIntervalMs(
        parsed.waterIntervalMs,
        DEFAULT_WATER_INTERVAL_MS,
      ),
      lastWaterAt: Number(parsed.lastWaterAt) || 0,
      lastWaterReminderAt: Number(parsed.lastWaterReminderAt) || 0,
      fitnessIntervalMs: normalizeServiceIntervalMs(
        parsed.fitnessIntervalMs,
        DEFAULT_FITNESS_INTERVAL_MS,
      ),
      lastFitnessAt: Number(parsed.lastFitnessAt) || 0,
      lastFitnessReminderAt: Number(parsed.lastFitnessReminderAt) || 0,
    }
  } catch {
    return defaults
  }
}

function normalizeServiceIntervalMs(value: unknown, fallback: number): number {
  const minutes = Math.round(Number(value) / 60_000)
  if (!Number.isFinite(minutes) || minutes <= 0) return fallback
  const roundedMinutes = Math.max(
    MIN_SERVICE_INTERVAL_MINUTES,
    Math.round(minutes / MIN_SERVICE_INTERVAL_MINUTES) * MIN_SERVICE_INTERVAL_MINUTES,
  )
  return roundedMinutes * 60_000
}

export function saveServiceState(services: PetServiceState): void {
  localStorage.setItem(SERVICES_STORAGE_KEY, JSON.stringify(services))
}

function serviceHistoryDateKey(timestamp = Date.now()): string {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function normalizeServiceHistoryDay(value: unknown): PetServiceHistoryDay | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Partial<PetServiceHistoryDay>
  if (typeof record.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(record.date)) return null
  return {
    date: record.date,
    focusMs: Math.max(0, Number(record.focusMs) || 0),
    waterCount: Math.max(0, Math.floor(Number(record.waterCount) || 0)),
    fitnessCount: Math.max(0, Math.floor(Number(record.fitnessCount) || 0)),
    codingReadyCount: Math.max(0, Math.floor(Number(record.codingReadyCount) || 0)),
  }
}

export function loadServiceHistory(): PetServiceHistoryDay[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(SERVICE_HISTORY_STORAGE_KEY) ?? '[]') as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map(normalizeServiceHistoryDay)
      .filter((item): item is PetServiceHistoryDay => Boolean(item))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-SERVICE_HISTORY_MAX_DAYS)
  } catch {
    return []
  }
}

function saveServiceHistory(history: PetServiceHistoryDay[]): PetServiceHistoryDay[] {
  const next = history
    .map(normalizeServiceHistoryDay)
    .filter((item): item is PetServiceHistoryDay => Boolean(item))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-SERVICE_HISTORY_MAX_DAYS)
  localStorage.setItem(SERVICE_HISTORY_STORAGE_KEY, JSON.stringify(next))
  return next
}

export function recordServiceHistoryEvent(
  patch: Partial<Omit<PetServiceHistoryDay, 'date'>>,
  timestamp = Date.now(),
): PetServiceHistoryDay[] {
  const date = serviceHistoryDateKey(timestamp)
  const history = loadServiceHistory()
  const existing = history.find((item) => item.date === date)
  const day = existing ?? {
    date,
    focusMs: 0,
    waterCount: 0,
    fitnessCount: 0,
    codingReadyCount: 0,
  }
  const nextDay: PetServiceHistoryDay = {
    date,
    focusMs: Math.max(0, day.focusMs + Math.max(0, Number(patch.focusMs) || 0)),
    waterCount: Math.max(
      0,
      day.waterCount + Math.max(0, Math.floor(Number(patch.waterCount) || 0)),
    ),
    fitnessCount: Math.max(
      0,
      day.fitnessCount + Math.max(0, Math.floor(Number(patch.fitnessCount) || 0)),
    ),
    codingReadyCount: Math.max(
      0,
      day.codingReadyCount + Math.max(0, Math.floor(Number(patch.codingReadyCount) || 0)),
    ),
  }
  return saveServiceHistory([...history.filter((item) => item.date !== date), nextDay])
}
