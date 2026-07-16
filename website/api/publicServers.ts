import type { Play } from '../components/home/types'
import { configuredApiBase } from './app-base'

export interface PublicServer {
  id: string
  name: string
  slug: string | null
  description: string | null
  iconUrl: string | null
  bannerUrl: string | null
  memberCount?: number
  memberAvatars?: { id: string; avatarUrl: string | null }[]
}

export interface PublicServerDirectoryEntry extends PublicServer {
  routeKey: string
  image: string | null
  accentColor: string
  memberCount: number
}

const ACCENT_COLORS = ['#22d3ee', '#60a5fa', '#34d399', '#f472b6', '#fb923c', '#a78bfa']

function runtimeApiBase() {
  if (typeof window === 'undefined') return ''

  const globals = window as unknown as Record<string, string | undefined>
  return (
    globals.__SHADOW_API_URL__ ??
    configuredApiBase() ??
    globals.__SHADOW_SPACE_APP_API_URL__ ??
    ''
  ).replace(/\/$/, '')
}

function apiUrl(path: string, base = runtimeApiBase()) {
  if (/^https?:\/\//u.test(path)) return path
  if (base) return `${base}${path}`
  return ''
}

function mediaUrl(url: string | null | undefined, base: string) {
  if (!url) return null
  if (/^(https?:|data:|blob:)/u.test(url)) return url
  try {
    return new URL(
      url,
      base || (typeof window !== 'undefined' ? window.location.origin : ''),
    ).toString()
  } catch {
    return url
  }
}

function accentFor(id: string) {
  const index = [...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % ACCENT_COLORS.length
  return ACCENT_COLORS[index]
}

function normalizePublicServer(server: PublicServer, base: string): PublicServerDirectoryEntry {
  const routeKey = server.slug ?? server.id
  const image = mediaUrl(server.bannerUrl ?? server.iconUrl, base)

  return {
    id: server.id,
    slug: server.slug,
    routeKey,
    image,
    name: server.name,
    description: server.description ?? '',
    iconUrl: mediaUrl(server.iconUrl, base),
    bannerUrl: mediaUrl(server.bannerUrl, base),
    accentColor: accentFor(server.id),
    memberCount: server.memberCount ?? 0,
    memberAvatars: server.memberAvatars ?? [],
  }
}

export async function fetchPublicServers({
  limit = 96,
  offset = 0,
}: {
  limit?: number
  offset?: number
} = {}): Promise<PublicServerDirectoryEntry[]> {
  const base = runtimeApiBase()
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  })
  const url = apiUrl(`/api/servers/discover?${params.toString()}`, base)
  if (!url) return []

  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json' },
    })
    const contentType = response.headers.get('content-type') ?? ''
    if (!response.ok || !contentType.includes('application/json')) return []

    const servers = (await response.json()) as PublicServer[]
    if (!Array.isArray(servers)) return []

    return servers
      .filter((server) => server.id && server.name)
      .map((server) => normalizePublicServer(server, base))
  } catch {
    return []
  }
}

export async function fetchPublicServerPlays(limit = 24): Promise<Play[]> {
  const servers = await fetchPublicServers({ limit })
  return servers.map((server) => ({
    id: server.id,
    server: server.routeKey,
    image: server.image,
    title: server.name,
    titleEn: server.name,
    desc: server.description,
    descEn: server.description,
    accentColor: server.accentColor,
    memberCount: server.memberCount,
  }))
}
