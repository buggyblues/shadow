import type {
  SpaceArtwork,
  SpaceComment,
  SpaceCommentContext,
  SpaceFavorite,
  SpaceProfile,
  SpaceVisibility,
} from '../types.js'

type CommandPayload<T> = { ok?: boolean; result?: T; error?: string } & T

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

const pending = new Map<
  string,
  {
    resolve: (value: unknown) => void
    reject: (error: Error) => void
  }
>()

function canUseBridge() {
  return (
    new URLSearchParams(location.search).has('shadow_launch') &&
    (window.parent !== window || window.ReactNativeWebView)
  )
}

function postBridge(message: unknown) {
  if (window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(JSON.stringify(message))
    return
  }
  window.parent.postMessage(message, '*')
}

window.addEventListener('message', (event) => {
  let data = event.data
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data || '{}')
    } catch {
      return
    }
  }
  if (!data || data.type !== 'shadow.app.command.response') return
  const entry = pending.get(data.requestId)
  if (!entry) return
  pending.delete(data.requestId)
  if (data.ok) entry.resolve(data.result)
  else entry.reject(new Error(data.error || 'Command failed'))
})

export async function command<T>(commandName: string, input: unknown): Promise<T> {
  if (canUseBridge()) {
    const requestId = `req_${Math.random().toString(36).slice(2)}`
    postBridge({
      type: 'shadow.app.command.request',
      requestId,
      appKey: 'shadow-space',
      commandName,
      input,
    })
    return new Promise((resolve, reject) => {
      pending.set(requestId, { resolve: resolve as (value: unknown) => void, reject })
      window.setTimeout(() => {
        if (!pending.has(requestId)) return
        pending.delete(requestId)
        reject(new Error('Command timed out'))
      }, 60000)
    }).then((payload) => unwrapCommandPayload<T>(payload))
  }

  const res = await fetch(`/api/local/commands/${encodeURIComponent(commandName)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input }),
  })
  const payload = (await res.json()) as CommandPayload<T>
  if (!res.ok || payload.ok === false) throw new Error(payload.error || 'Command failed')
  return unwrapCommandPayload<T>(payload)
}

function unwrapCommandPayload<T>(payload: unknown): T {
  if (
    payload &&
    typeof payload === 'object' &&
    !Array.isArray(payload) &&
    'ok' in payload &&
    (payload as { ok?: boolean }).ok === false
  ) {
    throw new Error((payload as { error?: string }).error || 'Command failed')
  }
  if (
    payload &&
    typeof payload === 'object' &&
    !Array.isArray(payload) &&
    'result' in payload &&
    (payload as { result?: unknown }).result !== undefined
  ) {
    return unwrapCommandPayload<T>((payload as { result: unknown }).result)
  }
  return payload as T
}

export function getProfile() {
  return command<{ profile: SpaceProfile }>('profile.get', {})
}

export async function getOAuthSession(): Promise<SpaceOAuthSession> {
  const returnTo = `${location.pathname}${location.search}${location.hash}`
  const params = new URLSearchParams({ return_to: returnTo, popup: '1' })
  const res = await fetch(`/api/oauth/session?${params.toString()}`)
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
  const res = await fetch('/api/local/covers', { method: 'POST', body: form })
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
  const res = await fetch('/api/local/uploads', { method: 'POST', body: form })
  const payload = (await res.json()) as { ok: boolean; artwork?: SpaceArtwork; error?: string }
  if (!res.ok || !payload.ok || !payload.artwork)
    throw new Error(payload.error || 'Publishing failed')
  return { artwork: payload.artwork }
}

declare global {
  interface Window {
    ReactNativeWebView?: {
      postMessage: (message: string) => void
    }
  }
}
