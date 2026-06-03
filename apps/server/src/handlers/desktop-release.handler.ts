import { Hono } from 'hono'

type DesktopDownloadPlatform = 'macos-arm64' | 'macos-x64' | 'windows-x64' | 'linux-x64'

type GithubReleaseAsset = {
  name: string
  browser_download_url: string
}

type GithubRelease = {
  tag_name: string
  html_url: string
  prerelease?: boolean
  draft?: boolean
  assets?: GithubReleaseAsset[]
}

type DesktopReleaseCache = {
  expiresAt: number
  release: GithubRelease
}

const DEFAULT_DESKTOP_RELEASE_REPO = 'buggyblues/shadow'
const DESKTOP_RELEASE_CACHE_MS = 5 * 60_000
const DESKTOP_RELEASE_TAG_PREFIX = 'desktop-v'
const PLATFORM_LABELS: Record<DesktopDownloadPlatform, string> = {
  'macos-arm64': 'macOS Apple Silicon',
  'macos-x64': 'macOS Intel',
  'windows-x64': 'Windows x64',
  'linux-x64': 'Linux x64',
}

let latestDesktopReleaseCache: DesktopReleaseCache | null = null

function desktopReleaseRepo(): string {
  const repo = process.env.SHADOW_DESKTOP_RELEASE_REPO?.trim() || DEFAULT_DESKTOP_RELEASE_REPO
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) return repo
  return DEFAULT_DESKTOP_RELEASE_REPO
}

function assetMatchesPlatform(assetName: string, platform: DesktopDownloadPlatform): boolean {
  const name = assetName.toLowerCase()
  if (!name.includes(platform)) return false
  if (platform.startsWith('macos')) return name.endsWith('.dmg')
  if (platform === 'windows-x64') return name.endsWith('.exe')
  return name.endsWith('.zip') || name.endsWith('.appimage') || name.endsWith('.deb')
}

function selectDesktopAsset(
  release: GithubRelease,
  platform: DesktopDownloadPlatform,
): GithubReleaseAsset | null {
  const assets = release.assets ?? []
  return assets.find((asset) => assetMatchesPlatform(asset.name, platform)) ?? null
}

function platformFromUserAgent(userAgent: string): DesktopDownloadPlatform {
  const normalized = userAgent.toLowerCase()
  if (normalized.includes('windows')) return 'windows-x64'
  if (normalized.includes('linux')) return 'linux-x64'
  if (normalized.includes('mac')) return normalized.includes('intel') ? 'macos-x64' : 'macos-arm64'
  return 'macos-arm64'
}

function assertDesktopDownloadPlatform(value: string): DesktopDownloadPlatform | null {
  return value in PLATFORM_LABELS ? (value as DesktopDownloadPlatform) : null
}

async function fetchLatestDesktopRelease(): Promise<GithubRelease> {
  const now = Date.now()
  if (latestDesktopReleaseCache && latestDesktopReleaseCache.expiresAt > now) {
    return latestDesktopReleaseCache.release
  }

  const repo = desktopReleaseRepo()
  const response = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=30`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'shadow-desktop-release-download',
    },
  })
  if (!response.ok) {
    throw new Error(`GitHub release lookup failed: ${response.status}`)
  }
  const releases = (await response.json()) as GithubRelease[]
  const release = releases.find(
    (item) =>
      !item.draft &&
      !item.prerelease &&
      typeof item.tag_name === 'string' &&
      item.tag_name.startsWith(DESKTOP_RELEASE_TAG_PREFIX),
  )
  if (!release) throw new Error('No stable desktop release found')
  latestDesktopReleaseCache = {
    expiresAt: now + DESKTOP_RELEASE_CACHE_MS,
    release,
  }
  return release
}

function downloadUrlForPlatform(platform: DesktopDownloadPlatform): string {
  return `/desktop/download/${platform}`
}

export function createDesktopReleaseHandler() {
  const handler = new Hono()

  handler.get('/desktop/releases/latest', async (c) => {
    const release = await fetchLatestDesktopRelease()
    return c.redirect(release.html_url, 302)
  })

  handler.get('/desktop/download', async (c) => {
    const platform = platformFromUserAgent(c.req.header('user-agent') ?? '')
    return c.redirect(downloadUrlForPlatform(platform), 302)
  })

  handler.get('/desktop/download/:platform', async (c) => {
    const platform = assertDesktopDownloadPlatform(c.req.param('platform'))
    if (!platform) return c.json({ ok: false, error: 'Unsupported desktop platform' }, 404)

    const release = await fetchLatestDesktopRelease()
    const asset = selectDesktopAsset(release, platform)
    if (!asset) return c.json({ ok: false, error: 'Desktop release asset not found' }, 404)
    return c.redirect(asset.browser_download_url, 302)
  })

  handler.get('/api/desktop/releases/latest', async (c) => {
    const release = await fetchLatestDesktopRelease()
    const downloads = Object.keys(PLATFORM_LABELS).map((platform) => {
      const id = platform as DesktopDownloadPlatform
      const asset = selectDesktopAsset(release, id)
      return {
        id,
        label: PLATFORM_LABELS[id],
        url: downloadUrlForPlatform(id),
        assetName: asset?.name ?? null,
      }
    })
    return c.json({
      tagName: release.tag_name,
      htmlUrl: release.html_url,
      downloads,
    })
  })

  return handler
}
