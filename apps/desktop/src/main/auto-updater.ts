import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { app, BrowserWindow, ipcMain, net, shell } from 'electron'

const RELEASE_LATEST_API_URL = 'https://api.github.com/repos/buggyblues/shadow/releases/latest'
const RELEASES_API_URL = 'https://api.github.com/repos/buggyblues/shadow/releases?per_page=30'

type UpdateStatus = 'idle' | 'checking' | 'update-available' | 'up-to-date' | 'error'
type UpdateChannel = 'production' | 'beta'

interface UpdateInfo {
  hasUpdate: boolean
  version: string
  downloadUrl: string
  releaseNotes: string
  channel: UpdateChannel
}

interface UpdateSettings {
  autoCheckOnLaunch: boolean
  channel: UpdateChannel
}

interface UpdateState {
  status: UpdateStatus
  checkedAt: number | null
  info: UpdateInfo | null
  error: string | null
  channel: UpdateChannel
}

const defaultSettings: UpdateSettings = {
  autoCheckOnLaunch: true,
  channel: 'production',
}

let updateState: UpdateState = {
  status: 'idle',
  checkedAt: null,
  info: null,
  error: null,
  channel: defaultSettings.channel,
}

function settingsFilePath(): string {
  return join(app.getPath('userData'), 'update-settings.json')
}

function normalizeUpdateChannel(channel: unknown): UpdateChannel {
  return channel === 'beta' ? 'beta' : 'production'
}

async function loadSettings(): Promise<UpdateSettings> {
  try {
    const raw = await readFile(settingsFilePath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<UpdateSettings>
    return {
      autoCheckOnLaunch: parsed.autoCheckOnLaunch ?? defaultSettings.autoCheckOnLaunch,
      channel: normalizeUpdateChannel(parsed.channel),
    }
  } catch {
    return defaultSettings
  }
}

async function saveSettings(settings: UpdateSettings): Promise<void> {
  const path = settingsFilePath()
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(settings, null, 2), 'utf8')
}

function sendUpdateState(): void {
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    if (!win.isDestroyed()) {
      win.webContents.send('desktop:updateState', updateState)
    }
  }
}

function normalizeVersion(version: string): number[] {
  const clean = version.replace(/^v/i, '')
  return clean.split('.').map((n) => Number.parseInt(n, 10) || 0)
}

function isNewerVersion(latest: string, current: string): boolean {
  const a = normalizeVersion(latest)
  const b = normalizeVersion(current)
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i += 1) {
    const av = a[i] ?? 0
    const bv = b[i] ?? 0
    if (av > bv) return true
    if (av < bv) return false
  }
  return false
}

function releaseVersion(tagName: string, channel: UpdateChannel): string {
  const pattern = channel === 'beta' ? /^desktop-beta-v(\d+\.\d+\.\d+)$/ : /^v(\d+\.\d+\.\d+)$/
  return pattern.exec(tagName)?.[1] ?? ''
}

function selectReleaseAsset(
  assets: Array<{ name: string; browser_download_url: string }>,
): string | null {
  const arch = process.arch
  const platform = process.platform
  const lowered = assets.map((a) => ({ ...a, lowerName: a.name.toLowerCase() }))

  if (platform === 'darwin') {
    const armRule =
      arch === 'arm64'
        ? (n: string) => n.includes('arm64') && n.endsWith('.dmg')
        : (n: string) => (n.includes('x64') || n.includes('intel')) && n.endsWith('.dmg')
    const best =
      lowered.find((a) => armRule(a.lowerName)) ?? lowered.find((a) => a.lowerName.endsWith('.dmg'))
    return best?.browser_download_url ?? null
  }

  if (platform === 'win32') {
    const best = lowered.find((a) => a.lowerName.endsWith('.exe'))
    return best?.browser_download_url ?? null
  }

  const linuxBest =
    lowered.find((a) => a.lowerName.endsWith('.appimage')) ??
    lowered.find((a) => a.lowerName.endsWith('.deb')) ??
    lowered.find((a) => a.lowerName.endsWith('.rpm')) ??
    lowered.find((a) => a.lowerName.endsWith('.zip'))
  return linuxBest?.browser_download_url ?? null
}

type GithubRelease = {
  tag_name?: string
  body?: string
  draft?: boolean
  prerelease?: boolean
  assets?: Array<{ name: string; browser_download_url: string }>
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await net.fetch(url, {
    headers: {
      'User-Agent': 'shadow-desktop-updater',
    },
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  return (await response.json()) as T
}

async function fetchRelease(channel: UpdateChannel): Promise<GithubRelease | null> {
  if (channel === 'production') {
    return fetchJson<GithubRelease>(RELEASE_LATEST_API_URL)
  }

  const releases = await fetchJson<GithubRelease[]>(RELEASES_API_URL)
  return (
    releases.find(
      (release) =>
        !release.draft && release.prerelease && !!releaseVersion(release.tag_name ?? '', 'beta'),
    ) ?? null
  )
}

async function checkForUpdateInternal(): Promise<UpdateInfo> {
  const settings = await loadSettings()
  const channel = settings.channel
  const currentVersion = app.getVersion()

  updateState = {
    ...updateState,
    status: 'checking',
    error: null,
    channel,
  }
  sendUpdateState()

  try {
    const data = await fetchRelease(channel)

    const latestVersion = data ? releaseVersion(data.tag_name ?? '', channel) : ''
    const downloadUrl = selectReleaseAsset(data?.assets ?? []) ?? ''
    const hasUpdate = !!latestVersion && isNewerVersion(latestVersion, currentVersion)

    const info: UpdateInfo = {
      hasUpdate,
      version: latestVersion || currentVersion,
      downloadUrl: hasUpdate ? downloadUrl : '',
      releaseNotes: data?.body ?? '',
      channel,
    }

    updateState = {
      status: hasUpdate ? 'update-available' : 'up-to-date',
      checkedAt: Date.now(),
      info,
      error: null,
      channel,
    }
    sendUpdateState()
    return info
  } catch (error) {
    updateState = {
      status: 'error',
      checkedAt: Date.now(),
      info: null,
      error: error instanceof Error ? error.message : 'unknown error',
      channel,
    }
    sendUpdateState()
    return { hasUpdate: false, version: currentVersion, downloadUrl: '', releaseNotes: '', channel }
  }
}

export function setupAutoUpdater(): void {
  ipcMain.handle('desktop:getVersion', () => app.getVersion())

  ipcMain.handle('desktop:getUpdateState', () => updateState)
  ipcMain.handle('desktop:getUpdateSettings', () => loadSettings())

  ipcMain.handle('desktop:setUpdateSettings', async (_event, incoming: Partial<UpdateSettings>) => {
    const current = await loadSettings()
    const next: UpdateSettings = {
      autoCheckOnLaunch: incoming.autoCheckOnLaunch ?? current.autoCheckOnLaunch,
      channel:
        incoming.channel === undefined ? current.channel : normalizeUpdateChannel(incoming.channel),
    }
    await saveSettings(next)
    updateState = { ...updateState, channel: next.channel }
    sendUpdateState()
    return next
  })

  ipcMain.handle('desktop:checkForUpdate', async () => checkForUpdateInternal())

  ipcMain.handle('desktop:downloadUpdate', async (_event, downloadUrl: string) => {
    if (!downloadUrl || typeof downloadUrl !== 'string') return false
    try {
      const parsed = new URL(downloadUrl)
      if (!['https:'].includes(parsed.protocol)) return false
      await shell.openExternal(downloadUrl)
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('desktop:setOpenAtLogin', (_event, openAtLogin: boolean) => {
    app.setLoginItemSettings({ openAtLogin })
  })

  ipcMain.handle('desktop:getOpenAtLogin', () => {
    return app.getLoginItemSettings().openAtLogin
  })

  ipcMain.handle('desktop:quitAndRestart', () => {
    app.relaunch()
    app.exit(0)
  })

  loadSettings()
    .then((settings) => {
      updateState = { ...updateState, channel: settings.channel }
      if (settings.autoCheckOnLaunch) {
        setTimeout(() => {
          checkForUpdateInternal().catch(() => {})
        }, 6000)
      }
    })
    .catch(() => {})
}
