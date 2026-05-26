import type { SpaceArtwork, SpaceArtworkVersion } from '../types.js'

export function currentVersion(artwork: SpaceArtwork | undefined) {
  if (!artwork) return null
  return (
    artwork.versions.find((version) => version.id === artwork.currentVersionId) ??
    artwork.versions.at(-1) ??
    null
  )
}

export function previewUrl(
  artwork: SpaceArtwork,
  version: SpaceArtworkVersion | null = currentVersion(artwork),
) {
  return version ? `/preview/${artwork.id}/${version.id}/` : ''
}

export function compactNumber(value: number) {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`
  return String(value)
}

export function titleCaseTag(tag: string) {
  if (!tag) return tag
  return tag
    .split(/([\s_-]+)/)
    .map((part) => {
      if (/^[\s_-]+$/.test(part) || !part) return part
      return `${part.slice(0, 1).toLocaleUpperCase()}${part.slice(1)}`
    })
    .join('')
}

export function versionDisplayTitle(version: SpaceArtworkVersion | null | undefined) {
  if (!version) return ''
  if (version.title === 'First edition') return '初版'
  if (/^Edition \d+$/.test(version.title)) return version.title.replace('Edition', '版本')
  return version.title
}

export function splitTags(value: string) {
  return value
    .split(/[,，\s]+/)
    .map((tag) => tag.trim())
    .filter(Boolean)
}
