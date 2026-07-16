import { useMemo } from 'react'
import { usePersistentTripState } from '../../../hooks/use-persistent-trip-state.js'

export interface TravelerProfile {
  id: string
  profileName: string
  fullName: string
  preferredName: string
  nationality: string
  documentNumber: string
  documentExpiry: string
  phone: string
  dietaryNeeds: string
  emergencyContact: string
  notes: string
}

interface TravelerProfileState {
  profiles: TravelerProfile[]
  tripProfileIds: Record<string, string>
}

export function deleteTravelerProfileState(
  current: TravelerProfileState,
  profileId: string,
): TravelerProfileState {
  const profiles = current.profiles.filter((profile) => profile.id !== profileId)
  const fallbackId = profiles[0]?.id
  return {
    profiles,
    tripProfileIds: Object.fromEntries(
      Object.entries(current.tripProfileIds).flatMap(([key, value]) => {
        if (value !== profileId) return [[key, value]]
        return fallbackId ? [[key, fallbackId]] : []
      }),
    ),
  }
}

function emptyState(): TravelerProfileState {
  return { profiles: [], tripProfileIds: {} }
}

function readLegacyState(): TravelerProfileState {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem('travel.travelerProfiles.v1') ?? '{}',
    ) as Partial<TravelerProfileState>
    return {
      profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [],
      tripProfileIds: parsed.tripProfileIds ?? {},
    }
  } catch {
    return emptyState()
  }
}

export function createEmptyTravelerProfile(): TravelerProfile {
  return {
    dietaryNeeds: '',
    documentExpiry: '',
    documentNumber: '',
    emergencyContact: '',
    fullName: '',
    id: `profile-${Date.now()}`,
    nationality: '',
    notes: '',
    phone: '',
    preferredName: '',
    profileName: '',
  }
}

export function useTravelerProfiles(tripId?: string) {
  const [state, setState, syncStatus] = usePersistentTripState<TravelerProfileState>(
    undefined,
    'traveler-profiles',
    readLegacyState(),
  )
  const selectedProfileId = tripId ? state.tripProfileIds[tripId] : undefined
  const selectedProfile = useMemo(
    () => state.profiles.find((profile) => profile.id === selectedProfileId) ?? null,
    [selectedProfileId, state.profiles],
  )
  return {
    profiles: state.profiles,
    selectedProfile,
    selectProfile: (profileId: string) => {
      if (!tripId) return
      setState((current) => ({
        ...current,
        tripProfileIds: { ...current.tripProfileIds, [tripId]: profileId },
      }))
    },
    deleteProfile: (profileId: string) => {
      setState((current) => deleteTravelerProfileState(current, profileId))
    },
    upsertProfile: (profile: TravelerProfile, selectForTrip = true) => {
      setState((current) => {
        const exists = current.profiles.some((item) => item.id === profile.id)
        return {
          profiles: exists
            ? current.profiles.map((item) => (item.id === profile.id ? profile : item))
            : [...current.profiles, profile],
          tripProfileIds:
            selectForTrip && tripId
              ? { ...current.tripProfileIds, [tripId]: profile.id }
              : current.tripProfileIds,
        }
      })
    },
    syncStatus,
  }
}
