export type PetPersonalityId = 'lazy' | 'curious' | 'clingy' | 'brave'

export type PetProfile = {
  name: string
  personality: PetPersonalityId
}

export const PET_PROFILE_STORAGE_KEY = 'shadow:desktop-pet-profile:v1'
export const PET_PERSONALITIES: PetPersonalityId[] = ['lazy', 'curious', 'clingy', 'brave']

export const DEFAULT_PET_PROFILE: PetProfile = {
  name: '小懒',
  personality: 'lazy',
}

const RANDOM_NAMES = ['小懒', '阿眠', '团团', '泡泡', '慢慢', '豆豆']

export function normalizePetProfile(input: Partial<PetProfile> | null | undefined): PetProfile {
  const name = typeof input?.name === 'string' ? input.name.trim().slice(0, 18) : ''
  const personality = PET_PERSONALITIES.includes(input?.personality as PetPersonalityId)
    ? (input?.personality as PetPersonalityId)
    : DEFAULT_PET_PROFILE.personality
  return {
    name: name || DEFAULT_PET_PROFILE.name,
    personality,
  }
}

export function loadPetProfile(): PetProfile {
  try {
    const raw = localStorage.getItem(PET_PROFILE_STORAGE_KEY)
    if (!raw) return DEFAULT_PET_PROFILE
    return normalizePetProfile(JSON.parse(raw) as Partial<PetProfile>)
  } catch {
    return DEFAULT_PET_PROFILE
  }
}

export function savePetProfile(profile: PetProfile): PetProfile {
  const normalized = normalizePetProfile(profile)
  localStorage.setItem(PET_PROFILE_STORAGE_KEY, JSON.stringify(normalized))
  return normalized
}

export function randomPetProfile(seed = Date.now()): PetProfile {
  const name = RANDOM_NAMES[Math.abs(seed) % RANDOM_NAMES.length] ?? DEFAULT_PET_PROFILE.name
  const personality =
    PET_PERSONALITIES[Math.abs(Math.floor(seed / 7)) % PET_PERSONALITIES.length] ??
    DEFAULT_PET_PROFILE.personality
  return { name, personality }
}
