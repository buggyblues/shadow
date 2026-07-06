export const SPACE_ICON_FILES = {
  'space-planet': 'space-planet.png',
  'discover-ship': 'discover-ship.png',
  'platform-station': 'platform-station.png',
  'category-game': 'category-game.png',
  'category-entertainment': 'category-entertainment.png',
  'category-education': 'category-education.png',
  'category-music': 'category-music.png',
  'category-science-tech': 'category-science-tech.png',
  'radar-frame-1': 'radar-frame-1.png',
  'radar-frame-2': 'radar-frame-2.png',
  'radar-frame-3': 'radar-frame-3.png',
  'radar-frame-4': 'radar-frame-4.png',
  'radar-frame-5': 'radar-frame-5.png',
} as const

export type SpaceIconName = keyof typeof SPACE_ICON_FILES

export function spaceIconPath(name: SpaceIconName, base = '') {
  const normalizedBase = base.replace(/\/$/, '')
  return `${normalizedBase}/space-icons/${SPACE_ICON_FILES[name]}`.replace(/\/{2,}/g, '/')
}
