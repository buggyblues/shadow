import boschGardenOfEarthlyDelightsUrl from '../assets/backgrounds/bosch-garden-of-earthly-delights.jpg'
import starryNightUrl from '../assets/backgrounds/starry-night.png'

export interface BackgroundOption {
  id: 'none' | 'starry-night' | 'bosch-garden-of-earthly-delights'
  labelKey: string
  url: string | null
  preview: string | null
}

export type BackgroundOptionId = BackgroundOption['id']

export const DEFAULT_BACKGROUND_ID: BackgroundOptionId = 'starry-night'

export const BACKGROUND_OPTIONS: BackgroundOption[] = [
  {
    id: 'none',
    labelKey: 'settings.backgroundNone',
    url: null,
    preview: null,
  },
  {
    id: 'starry-night',
    labelKey: 'settings.backgroundStarryNight',
    url: starryNightUrl,
    preview: starryNightUrl,
  },
  {
    id: 'bosch-garden-of-earthly-delights',
    labelKey: 'settings.backgroundBoschGarden',
    url: boschGardenOfEarthlyDelightsUrl,
    preview: boschGardenOfEarthlyDelightsUrl,
  },
]

export const DEFAULT_BACKGROUND_IMAGE =
  BACKGROUND_OPTIONS.find((option) => option.id === DEFAULT_BACKGROUND_ID)?.url ?? starryNightUrl

const backgroundOptionMap = new Map<BackgroundOptionId, BackgroundOption>(
  BACKGROUND_OPTIONS.map((option) => [option.id, option]),
)

const legacyBackgroundUrlMap: Record<string, string> = {
  '/backgrounds/starry-night.png': starryNightUrl,
  '/app/backgrounds/starry-night.png': starryNightUrl,
  '/backgrounds/bosch-garden-of-earthly-delights.jpg': boschGardenOfEarthlyDelightsUrl,
  '/app/backgrounds/bosch-garden-of-earthly-delights.jpg': boschGardenOfEarthlyDelightsUrl,
}

export function getBackgroundOptionById(
  optionId: BackgroundOptionId | null | undefined,
): BackgroundOption | null {
  if (!optionId) return null
  return backgroundOptionMap.get(optionId) ?? null
}

export function getBackgroundOptionIdByUrl(
  url: string | null | undefined,
): BackgroundOptionId | null {
  if (!url) return 'none'

  const normalizedUrl = legacyBackgroundUrlMap[url] ?? url
  const exactMatch = BACKGROUND_OPTIONS.find((option) => option.url === normalizedUrl)

  if (exactMatch) {
    return exactMatch.id
  }

  const lowerUrl = normalizedUrl.toLowerCase()

  if (lowerUrl.includes('starry-night')) {
    return 'starry-night'
  }

  if (
    lowerUrl.includes('bosch-garden-of-earthly-delights') ||
    lowerUrl.includes('earthly-delights')
  ) {
    return 'bosch-garden-of-earthly-delights'
  }

  return null
}

export function resolveBackgroundImageUrl(value: string | null | undefined): string | null {
  if (!value || value === 'none') return null

  const optionFromId = getBackgroundOptionById(value as BackgroundOptionId)
  if (optionFromId) {
    return optionFromId.url
  }

  const optionId = getBackgroundOptionIdByUrl(value)
  return optionId ? (getBackgroundOptionById(optionId)?.url ?? null) : null
}

export function normalizeBackgroundImageUrl(url: string | null | undefined): string | null {
  if (!url) return null

  const resolvedUrl = resolveBackgroundImageUrl(url)
  return resolvedUrl ?? legacyBackgroundUrlMap[url] ?? url
}
