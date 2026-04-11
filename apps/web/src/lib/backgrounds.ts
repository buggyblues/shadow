import boschGardenOfEarthlyDelightsUrl from '../assets/backgrounds/bosch-garden-of-earthly-delights.jpg'
import starryNightUrl from '../assets/backgrounds/starry-night.png'

export interface BackgroundOption {
  id: 'none' | 'starry-night' | 'bosch-garden-of-earthly-delights'
  labelKey: string
  url: string | null
  preview: string | null
}

export const DEFAULT_BACKGROUND_IMAGE = starryNightUrl

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

const legacyBackgroundUrlMap: Record<string, string> = {
  '/backgrounds/starry-night.png': starryNightUrl,
  '/app/backgrounds/starry-night.png': starryNightUrl,
  '/backgrounds/bosch-garden-of-earthly-delights.jpg': boschGardenOfEarthlyDelightsUrl,
  '/app/backgrounds/bosch-garden-of-earthly-delights.jpg': boschGardenOfEarthlyDelightsUrl,
}

export function normalizeBackgroundImageUrl(url: string | null | undefined): string | null {
  if (!url) return null
  return legacyBackgroundUrlMap[url] ?? url
}
