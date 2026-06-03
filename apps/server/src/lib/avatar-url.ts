import type { MediaService } from '../services/media.service'

type AvatarMediaResolver = Pick<MediaService, 'resolveMediaUrl'>

export function resolveAvatarUrl(
  mediaService: AvatarMediaResolver | undefined,
  avatarUrl: string | null | undefined,
): string | null {
  if (!avatarUrl) return null
  return (
    mediaService?.resolveMediaUrl(avatarUrl, 'image/png', {
      variant: 'avatar',
    }) ?? avatarUrl
  )
}

export function withResolvedAvatarUrl<T extends { avatarUrl?: string | null }>(
  mediaService: AvatarMediaResolver | undefined,
  value: T,
): T {
  return {
    ...value,
    avatarUrl: resolveAvatarUrl(mediaService, value.avatarUrl),
  }
}
