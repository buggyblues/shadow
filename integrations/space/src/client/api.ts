import { createShadowServerAppRuntimeClient } from '@shadowob/sdk/bridge'
import { shadowServerAppManifest } from '../shadow-app.generated.js'
import type {
  SpaceArtwork,
  SpaceComment,
  SpaceCommentContext,
  SpaceFavorite,
  SpaceProfile,
  SpaceVisibility,
} from '../types.js'

export interface SpaceTagSummary {
  tag: string
  count: number
}

export interface SpaceOAuthSession {
  configured: boolean
  authenticated: boolean
  profile: {
    id: string
    username?: string | null
    displayName?: string | null
    avatarUrl?: string | null
  } | null
  authorizeUrl: string | null
}

const shadowApp = createShadowServerAppRuntimeClient({ appKey: shadowServerAppManifest.appKey })

export async function command<T>(commandName: string, input: unknown): Promise<T> {
  return shadowApp.command<T>(commandName, input)
}

export function getProfile() {
  return command<{ profile: SpaceProfile }>('profile.get', {})
}

export async function getOAuthSession(): Promise<SpaceOAuthSession> {
  const returnTo = `${location.pathname}${location.search}${location.hash}`
  const params = new URLSearchParams({ return_to: returnTo, popup: '1' })
  const res = await shadowApp.fetchWithLaunch(
    `/api/oauth/session?${params.toString()}`,
    {},
    {
      refresh: { reason: 'oauth_session' },
    },
  )
  if (!res.ok) throw new Error('OAuth session check failed')
  return (await res.json()) as SpaceOAuthSession
}

export function updateProfile(input: { patch: Partial<SpaceProfile> }) {
  return command<{ profile: SpaceProfile }>('profile.update', input)
}

export function listArtworks(input: {
  query?: string
  tag?: string
  visibility?: SpaceVisibility | 'all'
  limit?: number
}) {
  return command<{ artworks: SpaceArtwork[] }>('artworks.list', input)
}

export function getArtwork(artworkId: string) {
  return command<{ artwork: SpaceArtwork }>('artworks.get', { artworkId })
}

export function updateArtwork(input: {
  artworkId: string
  title?: string
  description?: string
  tags?: string[]
  visibility?: SpaceVisibility
}) {
  return command<{ artwork: SpaceArtwork }>('artworks.update', input)
}

export function addComment(input: {
  artworkId: string
  body: string
  context?: SpaceCommentContext
}) {
  return command<{ comment: SpaceComment }>('artworks.comment', input)
}

export function likeArtwork(artworkId: string) {
  return command<{ liked: boolean; likes: number }>('artworks.like', { artworkId })
}

export function favoriteArtwork(artworkId: string) {
  return command<{ favorited: boolean; favorites: number }>('artworks.favorite', { artworkId })
}

export function remixArtwork(artworkId: string) {
  return command<{ artwork: SpaceArtwork }>('artworks.remix', { artworkId })
}

export function rollbackVersion(input: { artworkId: string; versionId: string }) {
  return command<{ artwork: SpaceArtwork }>('versions.rollback', input)
}

export function listFavorites() {
  return command<{ favorites: Array<{ favorite: SpaceFavorite; artwork: SpaceArtwork }> }>(
    'favorites.list',
    {},
  )
}

export function listTags() {
  return command<{ tags: SpaceTagSummary[] }>('tags.list', {})
}

export async function uploadCover(input: {
  file: File
  targetType: 'profile' | 'artwork'
  artworkId?: string
}) {
  const form = new FormData()
  form.set('file', input.file)
  form.set('targetType', input.targetType)
  if (input.artworkId) form.set('artworkId', input.artworkId)
  const res = await shadowApp.fetchWithLaunch('/api/runtime/covers', {
    method: 'POST',
    body: form,
  })
  const payload = (await res.json()) as {
    ok: boolean
    profile?: SpaceProfile
    artwork?: SpaceArtwork
    error?: string
  }
  if (!res.ok || !payload.ok) throw new Error(payload.error || 'Cover update failed')
  return payload
}

export async function uploadArtwork(input: {
  file: File
  artworkId?: string
  title: string
  description?: string
  tags?: string[]
  visibility: SpaceVisibility
  versionTitle?: string
  notes?: string
}) {
  const form = new FormData()
  form.set('file', input.file)
  if (input.artworkId) form.set('artworkId', input.artworkId)
  form.set('title', input.title)
  if (input.description) form.set('description', input.description)
  if (input.tags) form.set('tags', JSON.stringify(input.tags))
  form.set('visibility', input.visibility)
  if (input.versionTitle) form.set('versionTitle', input.versionTitle)
  if (input.notes) form.set('notes', input.notes)
  const res = await shadowApp.fetchWithLaunch('/api/runtime/uploads', {
    method: 'POST',
    body: form,
  })
  const payload = (await res.json()) as { ok: boolean; artwork?: SpaceArtwork; error?: string }
  if (!res.ok || !payload.ok || !payload.artwork)
    throw new Error(payload.error || 'Publishing failed')
  return { artwork: payload.artwork }
}
