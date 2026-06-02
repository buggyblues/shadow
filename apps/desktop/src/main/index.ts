import { randomUUID } from 'node:crypto'
import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  app,
  BrowserWindow,
  desktopCapturer,
  dialog,
  ipcMain,
  nativeImage,
  net,
  protocol,
  session,
  shell,
  systemPreferences,
} from 'electron'

// Suppress EPIPE errors that occur when a child process dies while the main
// process writes to its stdio pipe (e.g. gateway process exit).
process.on('uncaughtException', (err) => {
  if ((err as NodeJS.ErrnoException).code === 'EPIPE') return
  throw err
})

import { setupAutoUpdater } from './auto-updater'
import { readCommunityAuthTokens, syncCommunityAuthStateToOpenWindows } from './community-session'
import {
  fetchCommunityUrlWithAuth,
  fetchCommunityWithAuth,
  forgetCommunityAuthTokens,
  readCommunityAccessToken,
  rememberCommunityAuthSnapshot,
  setupConnectorDaemonHandlers,
  startConnectorDaemonIfEnabled,
  stopConnectorDaemon,
} from './connector-daemon'
import {
  applyDesktopNetworkSettings,
  getDesktopServerBaseUrl,
  onDesktopSettingsApplied,
  readDesktopSettings,
  resolveDesktopAppBaseUrl,
  setupDesktopSettingsHandlers,
} from './desktop-settings'
import { createAppMenu } from './menu'
import { setupNotificationHandler } from './notifications'
import { resolveDesktopPetAssetPath, setupDesktopPetAssetHandlers } from './pet-assets'
import { killAllAgents, setupProcessManager } from './process-manager'
import { registerGlobalShortcuts, setupShortcutHandlers, unregisterAllShortcuts } from './shortcuts'
import { createTray, showDesktopContextMenu } from './tray'
import { cancelDesktopSpeech, setupPetVoiceHandlers, speakWithDesktopVoice } from './voice-engine'
import {
  allowPetWindowClose,
  createPetWindow,
  createWindow,
  getMainWindow,
  getPetWindow,
  getReaderWindow,
  hidePetWindow,
  movePetWindow,
  setPetPanelMode,
  showCommunityWindow,
  showCreateBuddyWindow,
  showDesktopSettingsWindow,
  showMainWindow,
  showPetWindow,
  showReaderWindow,
} from './window'

// Handle Squirrel events on Windows install/uninstall
if (process.platform === 'win32' && process.argv.some((a) => a.startsWith('--squirrel'))) {
  app.quit()
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) {
  app.quit()
}

// Register desktop-owned local protocols before app.ready.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'desktop-local',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
  {
    scheme: 'shadow-reader',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
  {
    scheme: 'shadow-pet-asset',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
])

type ReaderResource = {
  id: string
  title: string
  sourceUrl: string
  contentType: string
  fileName: string
  buffer: Buffer
  createdAt: number
}

type ReaderResourceSnapshot = {
  id: string
  title: string
  sourceUrl: string
  displayAddress: string
  contentType: string
  fileName: string
  assetUrl: string
  createdAt: number
}

const readerResources = new Map<string, ReaderResource>()
const staticFileLookupCache = new Map<string, string | null>()
const staticResponseCache = new Map<string, StaticResponseCacheEntry>()
let activeReaderResourceId: string | null = null
let pendingDesktopDeepLink: string | null = null
let staticResponseCacheBytes = 0

const STATIC_RESPONSE_CACHE_MAX_BYTES = 32 * 1024 * 1024

type StaticResponseCacheEntry = {
  body: ArrayBuffer
  cacheControl: string
  contentType: string
  etag: string
  lastModified: string
  mtimeMs: number
  size: number
}

async function resolveDesktopIconPath(): Promise<string | null> {
  const candidates = [
    join(__dirname, '../../assets/icon.icns'),
    join(__dirname, '../../assets/icon.png'),
    join(process.resourcesPath, 'icon.icns'),
    join(process.resourcesPath, 'icon.png'),
    join(process.resourcesPath, 'assets/icon.icns'),
    join(process.resourcesPath, 'assets/icon.png'),
  ]
  for (const candidate of candidates) {
    try {
      await access(candidate)
      return candidate
    } catch {
      // Try the next packaged icon path.
    }
  }
  return null
}

function staticContentType(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case '.html':
      return 'text/html; charset=utf-8'
    case '.js':
    case '.mjs':
      return 'text/javascript; charset=utf-8'
    case '.css':
      return 'text/css; charset=utf-8'
    case '.json':
      return 'application/json; charset=utf-8'
    case '.svg':
      return 'image/svg+xml'
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.webp':
      return 'image/webp'
    case '.gif':
      return 'image/gif'
    case '.ico':
      return 'image/x-icon'
    case '.woff':
      return 'font/woff'
    case '.woff2':
      return 'font/woff2'
    case '.ttf':
      return 'font/ttf'
    case '.wasm':
      return 'application/wasm'
    case '.map':
      return 'application/json; charset=utf-8'
    default:
      return 'application/octet-stream'
  }
}

function isHashedStaticAsset(filePath: string): boolean {
  return /[.-][a-f0-9]{8,}\./i.test(basename(filePath))
}

function staticCacheControl(filePath: string): string {
  if (extname(filePath).toLowerCase() === '.html') return 'no-cache'
  if (isHashedStaticAsset(filePath)) return 'public, max-age=31536000, immutable'
  return 'public, max-age=3600'
}

function staticResponseHeaders(entry: StaticResponseCacheEntry): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': entry.cacheControl,
    'Content-Length': String(entry.size),
    'Content-Type': entry.contentType,
    ETag: entry.etag,
    'Last-Modified': entry.lastModified,
  }
}

function requestHasMatchingStaticValidator(
  request: Request,
  entry: StaticResponseCacheEntry,
): boolean {
  const ifNoneMatch = request.headers.get('if-none-match')
  if (
    ifNoneMatch
      ?.split(',')
      .map((value) => value.trim())
      .includes(entry.etag)
  )
    return true

  const ifModifiedSince = request.headers.get('if-modified-since')
  if (!ifModifiedSince) return false
  const modifiedSince = Date.parse(ifModifiedSince)
  return (
    Number.isFinite(modifiedSince) &&
    Math.floor(entry.mtimeMs / 1000) <= Math.floor(modifiedSince / 1000)
  )
}

function cacheStaticResponse(filePath: string, entry: StaticResponseCacheEntry): void {
  if (entry.size > STATIC_RESPONSE_CACHE_MAX_BYTES) return
  const previous = staticResponseCache.get(filePath)
  if (previous) staticResponseCacheBytes -= previous.size
  staticResponseCache.set(filePath, entry)
  staticResponseCacheBytes += entry.size

  for (const [cachedPath, cachedEntry] of staticResponseCache) {
    if (staticResponseCacheBytes <= STATIC_RESPONSE_CACHE_MAX_BYTES) break
    staticResponseCache.delete(cachedPath)
    staticResponseCacheBytes -= cachedEntry.size
  }
}

async function readStaticResponseEntry(filePath: string): Promise<StaticResponseCacheEntry> {
  const stats = await stat(filePath)
  const cached = staticResponseCache.get(filePath)
  if (cached && cached.size === stats.size && cached.mtimeMs === stats.mtimeMs) {
    return cached
  }

  const file = await readFile(filePath)
  const body = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer
  const entry: StaticResponseCacheEntry = {
    body,
    cacheControl: staticCacheControl(filePath),
    contentType: staticContentType(filePath),
    etag: `"${stats.size.toString(16)}-${Math.trunc(stats.mtimeMs).toString(16)}"`,
    lastModified: stats.mtime.toUTCString(),
    mtimeMs: stats.mtimeMs,
    size: stats.size,
  }
  cacheStaticResponse(filePath, entry)
  return entry
}

async function serveStaticFile(filePath: string, request: Request): Promise<Response> {
  if (request.signal.aborted) return clientClosedResponse()
  const entry = await readStaticResponseEntry(filePath)
  const headers = staticResponseHeaders(entry)
  if (requestHasMatchingStaticValidator(request, entry)) {
    const notModifiedHeaders = { ...headers }
    delete notModifiedHeaders['Content-Length']
    return new Response(null, { status: 304, headers: notModifiedHeaders })
  }
  return new Response(entry.body, { headers })
}

function clientClosedResponse(): Response {
  return new Response(null, { status: 499, statusText: 'Client Closed Request' })
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1'
}

function originFromHttpUrl(url: URL): string {
  return `${url.protocol}//${url.host}`
}

function isTrustedDesktopPermissionUrl(value: string | null | undefined): boolean {
  if (!value) return false
  try {
    const url = new URL(value)
    if (url.protocol === 'desktop-local:' && url.hostname === 'shadow') {
      return true
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
    if (isLoopbackHost(url.hostname)) return true
    return originFromHttpUrl(url) === new URL(getDesktopServerBaseUrl()).origin
  } catch {
    return false
  }
}

function isTrustedPermissionRequest(webContents: Electron.WebContents | null, origin?: string) {
  return (
    isTrustedDesktopPermissionUrl(origin) ||
    isTrustedDesktopPermissionUrl(webContents?.getURL() ?? '')
  )
}

function permissionDetailsOrigin(
  details: Electron.PermissionRequest | Electron.MediaAccessPermissionRequest,
): string | undefined {
  return 'securityOrigin' in details && typeof details.securityOrigin === 'string'
    ? details.securityOrigin
    : undefined
}

async function requestDarwinMediaAccess(
  details: Electron.PermissionRequest | Electron.MediaAccessPermissionRequest,
): Promise<boolean> {
  if (process.platform !== 'darwin') return true
  const mediaTypes =
    'mediaTypes' in details && Array.isArray(details.mediaTypes) && details.mediaTypes.length > 0
      ? details.mediaTypes
      : ['audio']
  for (const type of mediaTypes) {
    const mediaType = type === 'video' ? 'camera' : 'microphone'
    const status = systemPreferences.getMediaAccessStatus(mediaType)
    if (status === 'granted') continue
    if (status === 'denied' || status === 'restricted') return false
    const granted = await systemPreferences.askForMediaAccess(mediaType).catch(() => false)
    if (!granted) return false
  }
  return true
}

function registerDesktopPermissionHandlers(): void {
  session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
    if (permission !== 'media') return false
    return isTrustedPermissionRequest(webContents, requestingOrigin)
  })

  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback, details) => {
      if (!isTrustedPermissionRequest(webContents, permissionDetailsOrigin(details))) {
        callback(false)
        return
      }
      if (permission === 'media') {
        void requestDarwinMediaAccess(details).then(callback, () => callback(false))
        return
      }
      if (permission === 'display-capture') {
        callback(true)
        return
      }
      callback(false)
    },
  )

  session.defaultSession.setDisplayMediaRequestHandler(
    async (request, callback) => {
      if (
        !isTrustedDesktopPermissionUrl(request.securityOrigin) &&
        !isTrustedDesktopPermissionUrl(request.frame?.url)
      ) {
        callback({})
        return
      }
      try {
        const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] })
        const source = sources.find((item) => item.id.startsWith('screen:')) ?? sources[0]
        if (!source || !request.videoRequested) {
          callback({})
          return
        }
        callback({
          video: { id: source.id, name: source.name },
          ...(request.audioRequested && process.platform === 'win32' ? { audio: 'loopback' } : {}),
        })
      } catch {
        callback({})
      }
    },
    { useSystemPicker: true },
  )
}

function normalizeDesktopRouterPath(value: string | null | undefined): string {
  const input = typeof value === 'string' ? value.trim() : ''
  if (input === '/app') return '/'
  const path = input.startsWith('/app/') ? input.slice('/app'.length) : input
  if (!path || !path.startsWith('/') || path.startsWith('//') || /[\r\n\\]/.test(path)) {
    return '/discover'
  }
  return path
}

function collectDeepLinkSearchParams(rawUrl: string): URLSearchParams {
  const collected = new URLSearchParams()
  const collect = (value: string) => {
    const normalized = value.startsWith('?') || value.startsWith('#') ? value.slice(1) : value
    const queryStart = normalized.indexOf('?')
    const params = new URLSearchParams(
      queryStart >= 0 ? normalized.slice(queryStart + 1) : normalized,
    )
    params.forEach((paramValue, key) => collected.set(key, paramValue))
  }
  try {
    const url = new URL(rawUrl)
    collect(url.search)
    collect(url.hash)
  } catch {
    // Ignore malformed deep links.
  }
  return collected
}

function handleDesktopDeepLink(rawUrl: string): boolean {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return false
  }
  if (url.protocol !== 'shadow:') return false
  const isAuthCallback =
    url.hostname === 'oauth-callback' || url.pathname.includes('oauth-callback')
  if (!isAuthCallback) return false

  const params = collectDeepLinkSearchParams(rawUrl)
  const accessToken = params.get('access_token') ?? params.get('accessToken') ?? ''
  const refreshToken = params.get('refresh_token') ?? params.get('refreshToken') ?? ''
  rememberCommunityAuthSnapshot({ accessToken, refreshToken }, { reason: 'login' })
  void syncCommunityAuthStateToOpenWindows('login')
  showCommunityWindow(normalizeDesktopRouterPath(params.get('redirect')))
  return true
}

function findDesktopDeepLink(argv: readonly string[]): string | null {
  return argv.find((value) => value.startsWith('shadow://')) ?? null
}

function handleDesktopDeepLinkWhenReady(rawUrl: string): boolean {
  if (app.isReady()) return handleDesktopDeepLink(rawUrl)
  pendingDesktopDeepLink = rawUrl
  return true
}

function registerDesktopDeepLinkProtocol(): void {
  const defaultAppEntry = process.argv[1]
  if (process.defaultApp && defaultAppEntry) {
    app.setAsDefaultProtocolClient('shadow', process.execPath, [defaultAppEntry])
    return
  }
  app.setAsDefaultProtocolClient('shadow')
}

function communityBrowserLoginUrl(redirect?: string): string {
  const appBase = resolveDesktopAppBaseUrl()
  const url = new URL('desktop-auth-callback', appBase.endsWith('/') ? appBase : `${appBase}/`)
  url.searchParams.set('redirect', normalizeDesktopRouterPath(redirect))
  return url.toString()
}

app.on('open-url', (event, rawUrl) => {
  event.preventDefault()
  handleDesktopDeepLinkWhenReady(rawUrl)
})

app.on('second-instance', (_event, argv) => {
  const deepLink = findDesktopDeepLink(argv)
  if (deepLink && handleDesktopDeepLinkWhenReady(deepLink)) return
  showCommunityWindow()
})

async function applyDockIcon(): Promise<void> {
  if (process.platform !== 'darwin') return
  app.setActivationPolicy('regular')
  const iconPath = await resolveDesktopIconPath()
  if (iconPath) {
    const dockIcon = nativeImage.createFromPath(iconPath)
    if (!dockIcon.isEmpty()) app.dock?.setIcon(dockIcon)
  }
  await app.dock?.show()
}

function sanitizeFileName(value: string): string {
  const normalized = value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
  return normalized.slice(0, 160) || 'shadow-file'
}

function parseFileNameFromDisposition(value: string | null): string {
  if (!value) return ''
  const utf8 = value.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  if (utf8) {
    try {
      return decodeURIComponent(utf8)
    } catch {
      return utf8
    }
  }
  return value.match(/filename="?([^";]+)"?/i)?.[1] ?? ''
}

function inferContentType(url: URL, fallback = ''): string {
  const type = fallback.split(';')[0]?.trim().toLowerCase()
  if (type && type !== 'application/octet-stream') return type
  const path = url.pathname.toLowerCase()
  if (/\.(png)$/.test(path)) return 'image/png'
  if (/\.(jpe?g)$/.test(path)) return 'image/jpeg'
  if (/\.(webp)$/.test(path)) return 'image/webp'
  if (/\.(gif)$/.test(path)) return 'image/gif'
  if (/\.(svg)$/.test(path)) return 'image/svg+xml'
  if (/\.(pdf)$/.test(path)) return 'application/pdf'
  if (/\.(html?)$/.test(path)) return 'text/html'
  if (/\.(md|markdown)$/.test(path)) return 'text/markdown'
  if (/\.(txt|log|json|csv|tsv|xml|yaml|yml)$/.test(path)) return 'text/plain'
  return fallback || 'application/octet-stream'
}

function isTrustedCommunityUrl(url: URL): boolean {
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
  try {
    return (
      url.origin === new URL(getDesktopServerBaseUrl()).origin || url.hostname === 'shadowob.com'
    )
  } catch {
    return url.hostname === 'shadowob.com'
  }
}

function cleanupReaderResources(): void {
  while (readerResources.size > 32) {
    const oldest = [...readerResources.entries()].sort(
      (left, right) => left[1].createdAt - right[1].createdAt,
    )[0]?.[0]
    if (!oldest) break
    if (oldest === activeReaderResourceId && readerResources.size === 1) break
    readerResources.delete(oldest)
  }
}

function getReaderDisplayAddress(resource: ReaderResource): string {
  try {
    const url = new URL(resource.sourceUrl)
    if (url.protocol === 'file:') return `file://${resource.fileName}`
    return `${url.protocol}//${url.hostname}/${resource.fileName}`
  } catch {
    return resource.fileName
  }
}

function getReaderAssetUrl(resource: ReaderResource): string {
  return `shadow-reader://asset/${encodeURIComponent(resource.id)}/${encodeURIComponent(
    resource.fileName,
  )}`
}

function getReaderAssetId(url: URL): string {
  if (url.hostname !== 'asset') return ''
  const firstPathSegment = url.pathname.split('/').filter(Boolean).at(0)
  return decodeURIComponent(firstPathSegment ?? '')
}

function getReaderState(): { activeId: string | null; tabs: ReaderResourceSnapshot[] } {
  const tabs = [...readerResources.values()].map((resource) => ({
    id: resource.id,
    title: resource.title,
    sourceUrl: resource.sourceUrl,
    displayAddress: getReaderDisplayAddress(resource),
    contentType: resource.contentType,
    fileName: resource.fileName,
    assetUrl: getReaderAssetUrl(resource),
    createdAt: resource.createdAt,
  }))
  const activeId =
    activeReaderResourceId && readerResources.has(activeReaderResourceId)
      ? activeReaderResourceId
      : (tabs.at(-1)?.id ?? null)
  return { activeId, tabs }
}

function publishReaderState(): void {
  const win = getReaderWindow()
  if (!win || win.isDestroyed()) return
  const activeResource = activeReaderResourceId ? readerResources.get(activeReaderResourceId) : null
  if (activeResource) win.setTitle(activeResource.title)
  const send = () => {
    if (!win.isDestroyed()) win.webContents.send('desktop:reader:state', getReaderState())
  }
  if (win.webContents.isLoading()) win.webContents.once('did-finish-load', send)
  else send()
}

async function fetchReaderResource(rawUrl: string, title: string): Promise<ReaderResource> {
  const url = new URL(rawUrl)
  let buffer: Buffer
  let contentType = ''
  let fileName = sanitizeFileName(title)
  if (url.protocol === 'file:') {
    const filePath = fileURLToPath(url)
    buffer = await readFile(filePath)
    contentType = inferContentType(url)
    fileName = sanitizeFileName(title || basename(filePath))
  } else {
    const response = isTrustedCommunityUrl(url)
      ? await fetchCommunityUrlWithAuth(url.toString(), { headers: { Accept: '*/*' } })
      : await net.fetch(url.toString(), { headers: { Accept: '*/*' } })
    if (!response.ok) throw new Error(`READER_FETCH_FAILED_${response.status}`)
    buffer = Buffer.from(await response.arrayBuffer())
    contentType = inferContentType(url, response.headers.get('content-type') ?? '')
    fileName = sanitizeFileName(
      title ||
        parseFileNameFromDisposition(response.headers.get('content-disposition')) ||
        decodeURIComponent(basename(url.pathname)) ||
        'shadow-file',
    )
  }
  const extension = extname(fileName) || extname(url.pathname)
  if (extension && !fileName.toLowerCase().endsWith(extension.toLowerCase())) {
    fileName = `${fileName}${extension}`
  }
  const resource = {
    id: randomUUID(),
    title: title || fileName,
    sourceUrl: rawUrl,
    contentType,
    fileName,
    buffer,
    createdAt: Date.now(),
  }
  readerResources.set(resource.id, resource)
  cleanupReaderResources()
  return resource
}

async function resolveReaderAttachmentUrl(attachmentId: string): Promise<string> {
  const response = await fetchCommunityWithAuth(
    `/api/attachments/${encodeURIComponent(attachmentId)}/media-url?disposition=inline`,
    { headers: { 'Content-Type': 'application/json' } },
  )
  const text = await response.text()
  if (!response.ok) throw new Error(text || `READER_ATTACHMENT_URL_FAILED_${response.status}`)
  const payload = text ? (JSON.parse(text) as { url?: unknown }) : {}
  if (typeof payload.url !== 'string' || !payload.url)
    throw new Error('READER_ATTACHMENT_URL_EMPTY')
  return new URL(payload.url, getDesktopServerBaseUrl()).toString()
}

async function openReaderResourceWithDefaultApp(resource: ReaderResource): Promise<boolean> {
  const dir = join(app.getPath('temp'), 'shadow-reader')
  await mkdir(dir, { recursive: true })
  const filePath = join(dir, `${resource.id}-${resource.fileName}`)
  await writeFile(filePath, resource.buffer)
  const error = await shell.openPath(filePath)
  return !error
}

app.on('ready', async () => {
  app.setName('Shadow')
  app.setAppUserModelId('com.shadowob.app')
  registerDesktopDeepLinkProtocol()
  void applyDockIcon()

  const localRendererDir = join(__dirname, '../desktop-local')

  registerDesktopPermissionHandlers()

  async function findStaticFile(baseDir: string, filePath: string): Promise<string | null> {
    const normalizedPath = filePath === '/' || filePath === '' ? '/index.html' : filePath
    const cacheKey = `${baseDir}\0${normalizedPath}`
    if (staticFileLookupCache.has(cacheKey)) {
      return staticFileLookupCache.get(cacheKey) ?? null
    }
    const resolvedBaseDir = resolve(baseDir)
    const resolveCandidate = (path: string): string | null => {
      const candidate = resolve(resolvedBaseDir, `.${path}`)
      if (candidate !== resolvedBaseDir && !candidate.startsWith(`${resolvedBaseDir}${sep}`)) {
        return null
      }
      return candidate
    }
    const candidatePaths = normalizedPath.startsWith('/app/')
      ? [resolveCandidate(normalizedPath.slice('/app'.length)), resolveCandidate(normalizedPath)]
      : [resolveCandidate(normalizedPath)]
    let resolved: string | null = null
    for (const candidate of candidatePaths) {
      if (!candidate) continue
      try {
        if ((await stat(candidate)).isFile()) {
          resolved = candidate
          break
        }
      } catch {
        // Try the next safe static asset candidate.
      }
    }
    staticFileLookupCache.set(cacheKey, resolved)
    return resolved
  }

  function normalizeCommunityApiPath(rawPath: string): string {
    const url = new URL(rawPath, 'https://shadow.local')
    if (!url.pathname.startsWith('/api/')) {
      throw new Error(`Unsupported community path: ${url.pathname}`)
    }
    return `${url.pathname}${url.search}`
  }

  function extractCompletionText(data: unknown): string {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return ''
    const choices = (data as { choices?: unknown }).choices
    if (!Array.isArray(choices)) return ''
    return choices
      .map((choice) => {
        if (!choice || typeof choice !== 'object') return ''
        const record = choice as Record<string, unknown>
        const message = record.message as Record<string, unknown> | undefined
        const delta = record.delta as Record<string, unknown> | undefined
        return String(message?.content ?? delta?.content ?? record.text ?? '')
      })
      .join('')
  }

  function captureModelStreamEvent(event: string): string {
    const data = event
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n')
      .trim()
    if (!data || data === '[DONE]') return ''
    try {
      return extractCompletionText(JSON.parse(data) as unknown)
    } catch {
      return ''
    }
  }

  // desktop-local:// serves only desktop-owned windows such as the pet/settings.
  protocol.handle('desktop-local', async (request) => {
    const url = new URL(request.url)
    const filePath = decodeURIComponent(url.pathname)
    const fullPath = await findStaticFile(localRendererDir, filePath)
    return serveStaticFile(fullPath ?? join(localRendererDir, 'desktop-local.html'), request)
  })

  protocol.handle('shadow-reader', (request) => {
    const url = new URL(request.url)
    const id = getReaderAssetId(url)
    if (!id) {
      return new Response('Not Found', { status: 404 })
    }
    const resource = readerResources.get(id)
    if (!resource) {
      return new Response('Not Found', { status: 404 })
    }
    return new Response(new Uint8Array(resource.buffer), {
      headers: {
        'Content-Type': resource.contentType || 'application/octet-stream',
        'Content-Length': String(resource.buffer.byteLength),
        'Content-Disposition': `inline; filename="${encodeURIComponent(resource.fileName)}"`,
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      },
    })
  })

  protocol.handle('shadow-pet-asset', (request) => {
    const url = new URL(request.url)
    const packId = decodeURIComponent(url.hostname)
    const relativePath = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
    const filePath = resolveDesktopPetAssetPath(packId, relativePath)
    if (!filePath) return new Response('Not Found', { status: 404 })
    return serveStaticFile(filePath, request)
  })

  setupDesktopSettingsHandlers()
  setupDesktopPetAssetHandlers()
  setupConnectorDaemonHandlers()
  setupShortcutHandlers()
  setupPetVoiceHandlers()
  onDesktopSettingsApplied(() => {
    void syncCommunityAuthStateToOpenWindows('settings')
  })
  await applyDesktopNetworkSettings()

  const mainWindow = createWindow()
  const startupDeepLink = pendingDesktopDeepLink ?? findDesktopDeepLink(process.argv)
  pendingDesktopDeepLink = null
  if (startupDeepLink) handleDesktopDeepLink(startupDeepLink)
  mainWindow.webContents.once('did-finish-load', () => {
    void readCommunityAuthTokens()
      .then((tokens) => {
        if (tokens.accessToken || tokens.refreshToken) {
          return syncCommunityAuthStateToOpenWindows('startup')
        }
        return undefined
      })
      .catch(() => undefined)
  })
  if (readDesktopSettings().desktopPetVisible) createPetWindow()
  createTray()
  createAppMenu()
  registerGlobalShortcuts()
  setupNotificationHandler()
  setupProcessManager()
  setupAutoUpdater()
  startConnectorDaemonIfEnabled()

  ipcMain.handle('desktop:minimizeToTray', () => {
    const win = getMainWindow()
    if (win) {
      win.hide()
    }
  })

  ipcMain.handle('desktop:openExternal', (_event, rawUrl: string) => {
    try {
      const url = new URL(rawUrl)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
      void shell.openExternal(url.toString())
      return true
    } catch {
      return false
    }
  })
  ipcMain.handle(
    'desktop:openReader',
    async (
      _event,
      input: { url?: string; title?: string; useDefaultApp?: boolean; attachmentId?: string },
    ) => {
      try {
        const rawUrl = typeof input?.url === 'string' ? input.url : ''
        if (!rawUrl) return false
        const sourceUrl =
          typeof input?.attachmentId === 'string' && input.attachmentId
            ? await resolveReaderAttachmentUrl(input.attachmentId)
            : rawUrl
        const url = new URL(sourceUrl)
        if (!['http:', 'https:', 'file:'].includes(url.protocol)) return false
        const title = input.title || decodeURIComponent(basename(url.pathname)) || 'Shadow Reader'
        const resource = await fetchReaderResource(url.toString(), title)
        if (input?.useDefaultApp) {
          return openReaderResourceWithDefaultApp(resource)
        }
        activeReaderResourceId = resource.id
        showReaderWindow(title)
        publishReaderState()
        return true
      } catch (error) {
        console.warn('[reader] failed to open protected file', error)
        return false
      }
    },
  )
  ipcMain.handle('desktop:reader:getState', () => getReaderState())
  ipcMain.handle('desktop:reader:activate', (_event, input: { id?: unknown }) => {
    const id = typeof input?.id === 'string' ? input.id : ''
    if (readerResources.has(id)) activeReaderResourceId = id
    publishReaderState()
    return getReaderState()
  })
  ipcMain.handle('desktop:reader:close', (_event, input: { id?: unknown }) => {
    const id = typeof input?.id === 'string' ? input.id : ''
    if (id) readerResources.delete(id)
    if (activeReaderResourceId === id) {
      activeReaderResourceId = [...readerResources.values()].at(-1)?.id ?? null
    }
    publishReaderState()
    return getReaderState()
  })
  ipcMain.handle('desktop:reader:openDefault', (_event, input: { id?: unknown }) => {
    const id = typeof input?.id === 'string' ? input.id : ''
    const resource = readerResources.get(id)
    return resource ? openReaderResourceWithDefaultApp(resource) : false
  })
  ipcMain.handle(
    'desktop:selectDirectory',
    async (_event, input: { defaultPath?: string } = {}) => {
      const result = await dialog.showOpenDialog({
        title: 'Select Working Directory',
        defaultPath: typeof input.defaultPath === 'string' ? input.defaultPath : undefined,
        properties: ['openDirectory', 'createDirectory'],
      })
      return result.canceled ? null : (result.filePaths[0] ?? null)
    },
  )

  ipcMain.handle('desktop:quit', () => app.quit())
  ipcMain.on(
    'desktop:communityAuthSnapshot',
    (
      event,
      payload: {
        accessToken?: unknown
        refreshToken?: unknown
        reason?: unknown
        sourceUrl?: unknown
      },
    ) => {
      const reason = typeof payload?.reason === 'string' ? payload.reason : 'sync'
      rememberCommunityAuthSnapshot(
        {
          accessToken: payload?.accessToken as string,
          refreshToken: payload?.refreshToken as string,
        },
        {
          reason:
            reason === 'startup' ||
            reason === 'storage' ||
            reason === 'sync' ||
            reason === 'login' ||
            reason === 'refresh' ||
            reason === 'logout' ||
            reason === 'settings' ||
            reason === 'revoked'
              ? reason
              : 'sync',
        },
      )
    },
  )
  ipcMain.handle('desktop:getCommunityAuthToken', () => readCommunityAccessToken())
  ipcMain.handle('desktop:getCommunityAuthTokens', () => readCommunityAuthTokens())
  ipcMain.handle(
    'desktop:community:fetchJson',
    async (
      _event,
      input: {
        path: string
        method?: string
        body?: unknown
        headers?: Record<string, string>
        optional?: boolean
      },
    ) => {
      const path = normalizeCommunityApiPath(input.path)
      const response = await fetchCommunityWithAuth(path, {
        method: input.method ?? 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(input.headers ?? {}),
        },
        body: input.body === undefined ? undefined : JSON.stringify(input.body),
      })
      const text = await response.text()
      if (!response.ok) {
        if (input.optional === true && response.status === 404) {
          return { __desktopCommunityNotFound: true }
        }
        throw new Error(text || `REQUEST_FAILED_${response.status}`)
      }
      return text ? (JSON.parse(text) as unknown) : null
    },
  )
  ipcMain.handle(
    'desktop:pet:modelProxyStream',
    async (
      event,
      input: {
        requestId: string
        body: Record<string, unknown>
      },
    ) => {
      const response = await fetchCommunityWithAuth('/api/ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Accept: 'text/event-stream',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...input.body, stream: true }),
      })
      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new Error(text || `REQUEST_FAILED_${response.status}`)
      }
      if (!response.body) return { text: '' }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let output = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (!value) continue
        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split(/\r?\n\r?\n/)
        buffer = events.pop() ?? ''
        for (const streamEvent of events) {
          const delta = captureModelStreamEvent(streamEvent)
          if (!delta) continue
          output += delta
          event.sender.send('desktop:pet:modelProxyDelta', { requestId: input.requestId, delta })
        }
      }
      if (buffer) {
        const delta = captureModelStreamEvent(buffer)
        if (delta) {
          output += delta
          event.sender.send('desktop:pet:modelProxyDelta', { requestId: input.requestId, delta })
        }
      }
      return { text: output }
    },
  )
  ipcMain.handle('desktop:pet:speak', (_event, text: string) => speakWithDesktopVoice(text))
  ipcMain.handle('desktop:pet:cancelSpeech', () => cancelDesktopSpeech())
  ipcMain.handle('desktop:showMainWindow', () => showMainWindow())
  ipcMain.handle('desktop:showCommunity', (_event, input?: { path?: unknown } | string) => {
    const path =
      typeof input === 'string' ? input : typeof input?.path === 'string' ? input.path : undefined
    showCommunityWindow(path)
  })
  ipcMain.handle(
    'desktop:openCommunityLogin',
    (_event, input?: { redirect?: unknown } | string) => {
      const redirect =
        typeof input === 'string'
          ? input
          : typeof input?.redirect === 'string'
            ? input.redirect
            : '/discover'
      void shell.openExternal(communityBrowserLoginUrl(redirect))
      return true
    },
  )
  ipcMain.handle('desktop:showCreateBuddy', () => showCreateBuddyWindow())
  ipcMain.handle('desktop:showSettings', (_event, input?: { tab?: unknown } | string) => {
    const tab =
      typeof input === 'string' ? input : typeof input?.tab === 'string' ? input.tab : undefined
    showDesktopSettingsWindow(tab)
  })
  ipcMain.handle('desktop:pet:show', () => showPetWindow())
  ipcMain.handle('desktop:pet:hide', () => hidePetWindow())
  ipcMain.handle('desktop:showContextMenu', (event) => {
    showDesktopContextMenu(BrowserWindow.fromWebContents(event.sender))
  })
  ipcMain.handle('desktop:pet:panel-mode', (_event, mode: 'compact' | 'expanded') => {
    return setPetPanelMode(mode)
  })
  ipcMain.handle('desktop:pet:move-window', (_event, delta: { x: number; y: number }) => {
    movePetWindow(delta)
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  showCommunityWindow()
})

app.on('before-quit', () => {
  allowPetWindowClose()
})

app.on('will-quit', () => {
  void stopConnectorDaemon()
  unregisterAllShortcuts()
  killAllAgents()
})
