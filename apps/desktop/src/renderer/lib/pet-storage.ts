import type { ChannelSubscription, PetServiceState } from '../pet-types'
import { type PetState, parsePetState, serializePetState, tickPet } from './game'

export const PET_STORAGE_KEY = 'shadow:desktop-pet-state:v1'
export const SUBSCRIPTIONS_STORAGE_KEY = 'shadow:desktop-pet-subscriptions:v1'
export const SERVICES_STORAGE_KEY = 'shadow:desktop-pet-services:v1'

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
    focusDurationMs: 25 * 60_000,
    lastWaterAt: 0,
    lastWaterReminderAt: 0,
    lastFitnessAt: 0,
    lastFitnessReminderAt: 0,
  }
  try {
    const parsed = JSON.parse(
      localStorage.getItem(SERVICES_STORAGE_KEY) ?? '{}',
    ) as Partial<PetServiceState>
    return {
      water: Boolean(parsed.water),
      focus: Boolean(parsed.focus),
      fitness: Boolean(parsed.fitness),
      coding: parsed.coding === undefined ? true : Boolean(parsed.coding),
      focusEndsAt: Number(parsed.focusEndsAt) > Date.now() ? Number(parsed.focusEndsAt) : null,
      focusStartedAt: Number(parsed.focusStartedAt) || null,
      focusDurationMs: Number(parsed.focusDurationMs) || 25 * 60_000,
      lastWaterAt: Number(parsed.lastWaterAt) || 0,
      lastWaterReminderAt: Number(parsed.lastWaterReminderAt) || 0,
      lastFitnessAt: Number(parsed.lastFitnessAt) || 0,
      lastFitnessReminderAt: Number(parsed.lastFitnessReminderAt) || 0,
    }
  } catch {
    return defaults
  }
}

export function saveServiceState(services: PetServiceState): void {
  localStorage.setItem(SERVICES_STORAGE_KEY, JSON.stringify(services))
}
