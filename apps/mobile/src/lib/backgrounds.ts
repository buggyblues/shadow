import type { ImageSourcePropType } from 'react-native'

export type BackgroundOptionId = 'none' | 'starry-night' | 'bosch-garden-of-earthly-delights'

export interface BackgroundOption {
  id: BackgroundOptionId
  labelKey: string
  source: ImageSourcePropType | null
}

export const DEFAULT_BACKGROUND_ID: BackgroundOptionId = 'starry-night'

export const BACKGROUND_OPTIONS: BackgroundOption[] = [
  {
    id: 'none',
    labelKey: 'settings.backgroundNone',
    source: null,
  },
  {
    id: 'starry-night',
    labelKey: 'settings.backgroundStarryNight',
    source: require('../../assets/backgrounds/starry-night.png'),
  },
  {
    id: 'bosch-garden-of-earthly-delights',
    labelKey: 'settings.backgroundBoschGarden',
    source: require('../../assets/backgrounds/bosch-garden-of-earthly-delights.jpg'),
  },
]

const backgroundOptionMap = new Map<BackgroundOptionId, BackgroundOption>(
  BACKGROUND_OPTIONS.map((option) => [option.id, option]),
)

export function getBackgroundOptionById(
  optionId: BackgroundOptionId | null | undefined,
): BackgroundOption | null {
  if (!optionId) return null
  return backgroundOptionMap.get(optionId) ?? null
}

export function getBackgroundSource(optionId: BackgroundOptionId | null | undefined) {
  if (!optionId || optionId === 'none') return null
  return (
    getBackgroundOptionById(optionId)?.source ??
    getBackgroundOptionById(DEFAULT_BACKGROUND_ID)?.source ??
    null
  )
}
