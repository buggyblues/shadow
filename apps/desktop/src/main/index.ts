import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, net, protocol } from 'electron'
import { setupIpcHandlers } from './ipc'
import { createAppMenu } from './menu'
import { CommunityService } from './services/community'
import { SessionService } from './services/session'
import { ShadowApiService } from './services/shadow-api'
import { registerGlobalShortcuts, unregisterGlobalShortcuts } from './shortcuts'
import { createTray } from './tray'
import { allowPetWindowClose, createPetWindow, getPetWindow, showPetWindow } from './window'

const WEB_ORIGIN =
  process.env.DESKTOP_WEB_ORIGIN || process.env.VITE_API_BASE || 'https://shadowob.app'

if (process.env.DESKTOP_USER_DATA_DIR) {
  app.setPath('userData', process.env.DESKTOP_USER_DATA_DIR)
}

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
])

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

let sessionService: SessionService
let communityService: CommunityService

function registerStaticProtocol() {
  const rendererDir = join(__dirname, '../renderer')
  protocol.handle('app', (request) => {
    const url = new URL(request.url)
    let filePath = decodeURIComponent(url.pathname)
    if (!filePath || filePath === '/') filePath = '/index.html'
    return net.fetch(pathToFileURL(join(rendererDir, filePath)).toString())
  })
}

async function handleDeepLink(rawUrl: string) {
  try {
    await sessionService?.importCallback(rawUrl)
    showPetWindow()
  } catch {
    showPetWindow()
  }
}

app.on('second-instance', (_event, argv) => {
  const deepLink = argv.find((arg) => arg.startsWith('shadow://'))
  if (deepLink) void handleDeepLink(deepLink)
  showPetWindow()
})

app.on('open-url', (event, rawUrl) => {
  event.preventDefault()
  void handleDeepLink(rawUrl)
})

app.whenReady().then(() => {
  app.setName('XiaDou')
  if (process.defaultApp) {
    app.setAsDefaultProtocolClient('shadow', process.execPath, [process.argv[1] ?? ''])
  } else {
    app.setAsDefaultProtocolClient('shadow')
  }

  registerStaticProtocol()

  sessionService = new SessionService(WEB_ORIGIN)
  const apiService = new ShadowApiService(WEB_ORIGIN, sessionService)
  communityService = new CommunityService(WEB_ORIGIN, sessionService, apiService, getPetWindow)

  setupIpcHandlers({
    webOrigin: WEB_ORIGIN,
    session: sessionService,
    community: communityService,
  })

  createPetWindow()
  createTray(WEB_ORIGIN)
  createAppMenu(WEB_ORIGIN)
  registerGlobalShortcuts()
  communityService.start()
})

app.on('activate', () => showPetWindow())

app.on('window-all-closed', () => {
  // The tray owns the app lifecycle; closing the pet window hides it.
})

app.on('before-quit', () => {
  allowPetWindowClose()
})

app.on('will-quit', () => {
  unregisterGlobalShortcuts()
  communityService?.stop()
})
