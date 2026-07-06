import { configuredApiBase } from './app-base'

export type DesktopDownloadPlatform = 'macos-arm64' | 'macos-x64' | 'windows-x64' | 'linux-x64'

export type DesktopReleaseDownload = {
  id: DesktopDownloadPlatform
  label: string
  url: string
  assetName: string | null
}

export type DesktopReleaseInfo = {
  tagName: string
  htmlUrl: string
  downloads: DesktopReleaseDownload[]
}

const FALLBACK_RELEASE_URL = 'https://github.com/buggyblues/shadow/releases'

function runtimeApiBase() {
  if (typeof window === 'undefined') return ''

  const globals = window as unknown as Record<string, string | undefined>
  return (
    globals.__SHADOW_API_URL__ ??
    configuredApiBase() ??
    globals.__SHADOW_APP_API_URL__ ??
    ''
  ).replace(/\/$/, '')
}

function releaseApiUrl() {
  const base = runtimeApiBase()
  return base ? `${base}/api/desktop/releases/latest` : ''
}

export function desktopDownloadUrl(platform: DesktopDownloadPlatform) {
  const path = `/desktop/download/${platform}`
  const base = runtimeApiBase()
  if (base) return `${base}${path}`
  if (typeof window !== 'undefined' && window.location?.origin) {
    return new URL(path, window.location.origin).toString()
  }
  return path
}

function normalizeDownloadUrl(url: string, base: string) {
  if (/^https?:\/\//u.test(url)) return url
  return `${base}${url.startsWith('/') ? url : `/${url}`}`
}

export async function fetchLatestDesktopRelease(): Promise<DesktopReleaseInfo | null> {
  const base = runtimeApiBase()
  const url = releaseApiUrl()
  if (!url) return null

  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json' },
    })
    const contentType = response.headers.get('content-type') ?? ''
    if (!response.ok || !contentType.includes('application/json')) return null

    const release = (await response.json()) as DesktopReleaseInfo
    if (!release?.htmlUrl || !Array.isArray(release.downloads)) return null

    return {
      ...release,
      downloads: release.downloads.map((download) => ({
        ...download,
        url: normalizeDownloadUrl(download.url, base),
      })),
    }
  } catch {
    return null
  }
}

export function fallbackDesktopRelease(): DesktopReleaseInfo {
  return {
    tagName: '',
    htmlUrl: FALLBACK_RELEASE_URL,
    downloads: [],
  }
}
