import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeImage,
  net,
  protocol,
  session,
  shell,
} from 'electron'
import { DESKTOP_COMMUNITY_AUTH_REQUIRED } from '../shared/community-auth'

// Suppress EPIPE errors that occur when a child process dies while the main
// process writes to its stdio pipe (e.g. gateway process exit).
process.on('uncaughtException', (err) => {
  if ((err as NodeJS.ErrnoException).code === 'EPIPE') return
  throw err
})

import { setupAutoUpdater } from './auto-updater'
import {
  readCommunityAccessToken,
  rememberCommunityAccessToken,
  setupConnectorDaemonHandlers,
  startConnectorDaemonIfEnabled,
  stopConnectorDaemon,
} from './connector-daemon'
import {
  applyDesktopNetworkSettings,
  getDesktopServerBaseUrl,
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

// Register custom protocol for serving renderer files (must be before app.ready)
// This makes absolute paths like /Logo.svg work correctly in production
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
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
let activeReaderResourceId: string | null = null

function resolveDesktopIconPath(): string | null {
  const candidates = [
    join(__dirname, '../../assets/icon.icns'),
    join(__dirname, '../../assets/icon.png'),
    join(process.resourcesPath, 'icon.icns'),
    join(process.resourcesPath, 'icon.png'),
    join(process.resourcesPath, 'assets/icon.icns'),
    join(process.resourcesPath, 'assets/icon.png'),
  ]
  return candidates.find((candidate) => existsSync(candidate)) ?? null
}

function applyDockIcon(): void {
  if (process.platform !== 'darwin') return
  const iconPath = resolveDesktopIconPath()
  if (iconPath) {
    const dockIcon = nativeImage.createFromPath(iconPath)
    if (!dockIcon.isEmpty()) app.dock?.setIcon(dockIcon)
  }
  void app.dock?.show()
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
    buffer = readFileSync(filePath)
    contentType = inferContentType(url)
    fileName = sanitizeFileName(title || basename(filePath))
  } else {
    const headers = new Headers({ Accept: '*/*' })
    const token = await readCommunityAccessToken()
    if (token && isTrustedCommunityUrl(url)) headers.set('Authorization', `Bearer ${token}`)
    const response = await net.fetch(url.toString(), { headers })
    if (response.status === 401 || response.status === 403)
      throw new Error(DESKTOP_COMMUNITY_AUTH_REQUIRED)
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
  const token = await readCommunityAccessToken()
  if (!token) throw new Error(DESKTOP_COMMUNITY_AUTH_REQUIRED)
  const response = await net.fetch(
    `${getDesktopServerBaseUrl()}/api/attachments/${encodeURIComponent(
      attachmentId,
    )}/media-url?disposition=inline`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    },
  )
  const text = await response.text()
  if (response.status === 401 || response.status === 403)
    throw new Error(DESKTOP_COMMUNITY_AUTH_REQUIRED)
  if (!response.ok) throw new Error(text || `READER_ATTACHMENT_URL_FAILED_${response.status}`)
  const payload = text ? (JSON.parse(text) as { url?: unknown }) : {}
  if (typeof payload.url !== 'string' || !payload.url)
    throw new Error('READER_ATTACHMENT_URL_EMPTY')
  return new URL(payload.url, getDesktopServerBaseUrl()).toString()
}

async function openReaderResourceWithDefaultApp(resource: ReaderResource): Promise<boolean> {
  const dir = join(app.getPath('temp'), 'shadow-reader')
  mkdirSync(dir, { recursive: true })
  const filePath = join(dir, `${resource.id}-${resource.fileName}`)
  writeFileSync(filePath, resource.buffer)
  const error = await shell.openPath(filePath)
  return !error
}

app.on('ready', async () => {
  app.setName('Shadow')
  app.setAppUserModelId('com.shadowob.app')
  applyDockIcon()

  const rendererDir = join(__dirname, '../renderer')
  const localRendererDir = join(__dirname, '../desktop-local')

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const currentUrl = webContents.getURL()
    const permissionName = String(permission)
    const isDesktopLocal =
      currentUrl.startsWith('desktop-local://') || currentUrl.includes('/desktop-local.html')
    if (isDesktopLocal && (permissionName === 'media' || permissionName === 'audioCapture')) {
      callback(true)
      return
    }
    callback(false)
  })

  function findStaticFile(baseDir: string, filePath: string): string | null {
    const normalizedPath = filePath === '/' || filePath === '' ? '/index.html' : filePath
    const cacheKey = `${baseDir}\0${normalizedPath}`
    if (staticFileLookupCache.has(cacheKey)) {
      return staticFileLookupCache.get(cacheKey) ?? null
    }
    const candidatePaths = normalizedPath.startsWith('/app/')
      ? [join(baseDir, normalizedPath.slice('/app'.length)), join(baseDir, normalizedPath)]
      : [join(baseDir, normalizedPath)]
    const resolved =
      candidatePaths.find((candidate) => {
        try {
          return existsSync(candidate) && statSync(candidate).isFile()
        } catch {
          return false
        }
      }) ?? null
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

  // app:// serves the exact apps/web build artifact plus API/socket/media proxying.
  protocol.handle('app', async (request) => {
    const url = new URL(request.url)
    const filePath = decodeURIComponent(url.pathname)

    // Proxy server-hosted API/media paths to the remote server
    if (
      filePath.startsWith('/api/') ||
      filePath === '/api' ||
      filePath.startsWith('/socket.io/') ||
      filePath === '/socket.io' ||
      filePath.startsWith('/shadow/')
    ) {
      const body =
        request.method === 'GET' || request.method === 'HEAD'
          ? undefined
          : await request.arrayBuffer()
      return net.fetch(`${getDesktopServerBaseUrl()}${filePath}${url.search}`, {
        method: request.method,
        headers: request.headers,
        body,
      })
    }

    const fullPath = findStaticFile(rendererDir, filePath)
    if (fullPath) {
      return net.fetch(pathToFileURL(fullPath).toString())
    }

    return net.fetch(pathToFileURL(join(rendererDir, 'index.html')).toString())
  })

  // desktop-local:// serves only desktop-owned windows such as the pet/settings.
  protocol.handle('desktop-local', (request) => {
    const url = new URL(request.url)
    const filePath = decodeURIComponent(url.pathname)
    const fullPath = findStaticFile(localRendererDir, filePath)
    return net.fetch(
      pathToFileURL(fullPath ?? join(localRendererDir, 'desktop-local.html')).toString(),
    )
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
    return net.fetch(pathToFileURL(filePath).toString())
  })

  setupDesktopSettingsHandlers()
  setupDesktopPetAssetHandlers()
  setupConnectorDaemonHandlers()
  setupShortcutHandlers()
  setupPetVoiceHandlers()
  await applyDesktopNetworkSettings()

  createWindow()
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
  ipcMain.on('desktop:communityAuthSnapshot', (_event, payload: { accessToken?: unknown }) => {
    rememberCommunityAccessToken(
      typeof payload?.accessToken === 'string' ? payload.accessToken : '',
    )
  })
  ipcMain.handle('desktop:getCommunityAuthToken', () => readCommunityAccessToken())
  ipcMain.handle(
    'desktop:community:fetchJson',
    async (
      _event,
      input: {
        path: string
        method?: string
        body?: unknown
        headers?: Record<string, string>
      },
    ) => {
      const token = await readCommunityAccessToken()
      if (!token) throw new Error(DESKTOP_COMMUNITY_AUTH_REQUIRED)
      const path = normalizeCommunityApiPath(input.path)
      const response = await net.fetch(`${getDesktopServerBaseUrl()}${path}`, {
        method: input.method ?? 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...(input.headers ?? {}),
        },
        body: input.body === undefined ? undefined : JSON.stringify(input.body),
      })
      const text = await response.text()
      if (response.status === 401 || response.status === 403)
        throw new Error(DESKTOP_COMMUNITY_AUTH_REQUIRED)
      if (!response.ok) throw new Error(text || `REQUEST_FAILED_${response.status}`)
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
      const token = await readCommunityAccessToken()
      if (!token) throw new Error(DESKTOP_COMMUNITY_AUTH_REQUIRED)
      const response = await net.fetch(`${getDesktopServerBaseUrl()}/api/ai/v1/chat/completions`, {
        method: 'POST',
        headers: {
          Accept: 'text/event-stream',
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...input.body, stream: true }),
      })
      if (!response.ok) {
        if (response.status === 401 || response.status === 403)
          throw new Error(DESKTOP_COMMUNITY_AUTH_REQUIRED)
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
    setPetPanelMode(mode)
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
  // On macOS, re-create a window when dock icon is clicked and no windows open.
  if (!getMainWindow() || getMainWindow()?.isDestroyed()) {
    createWindow()
  } else {
    getMainWindow()?.show()
  }
})

app.on('before-quit', () => {
  allowPetWindowClose()
})

app.on('will-quit', () => {
  void stopConnectorDaemon()
  unregisterAllShortcuts()
  killAllAgents()
})
