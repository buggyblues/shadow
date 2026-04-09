import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, BrowserWindow, ipcMain, net, protocol } from 'electron'

// Suppress EPIPE errors that occur when a child process dies while the main
// process writes to its stdio pipe (e.g. gateway process exit).
process.on('uncaughtException', (err) => {
  if ((err as NodeJS.ErrnoException).code === 'EPIPE') return
  throw err
})

import { setupAutoUpdater } from './auto-updater'
import { createAppMenu } from './menu'
import { setupNotificationHandler } from './notifications'
import { closeOnboardingWindow, createOnboardingWindow } from './onboarding-window'
import { cleanupOpenClaw, initOpenClaw } from './openclaw'
import { killAllAgents, setupProcessManager } from './process-manager'
import { registerGlobalShortcuts, unregisterAllShortcuts } from './shortcuts'
import { createTray } from './tray'
import { createWindow, getMainWindow } from './window'

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
])

const API_ORIGIN = 'https://shadowob.com'

// Check if onboarding is needed
function needsOnboarding(): boolean {
  // Check if user has completed onboarding
  const completed = app.getPath('userData') + '/.onboarding-completed'
  const fs = require('fs')
  return !fs.existsSync(completed)
}

function markOnboardingCompleted(): void {
  const completed = app.getPath('userData') + '/.onboarding-completed'
  const fs = require('fs')
  fs.writeFileSync(completed, new Date().toISOString())
}

app.on('ready', async () => {
  // Handle app:// protocol — serve renderer files from dist/renderer/
  const rendererDir = join(__dirname, '../renderer')
  protocol.handle('app', (request) => {
    const url = new URL(request.url)
    let filePath = decodeURIComponent(url.pathname)

    // Proxy server-hosted media and API paths to the remote server
    if (filePath.startsWith('/shadow/')) {
      return net.fetch(`${API_ORIGIN}${filePath}`)
    }

    if (filePath === '/' || filePath === '') {
      filePath = '/index.html'
    }
    const fullPath = join(rendererDir, filePath)
    return net.fetch(pathToFileURL(fullPath).toString())
  })

  // Check if onboarding is needed
  if (needsOnboarding()) {
    const result = await createOnboardingWindow()
    if (result.completed) {
      markOnboardingCompleted()
    }
  }

  // Create main window after onboarding or if skipped
  createWindow()
  createTray()
  createAppMenu()
  registerGlobalShortcuts()
  setupNotificationHandler()
  setupProcessManager()
  setupAutoUpdater()
  initOpenClaw()

  ipcMain.handle('desktop:minimizeToTray', () => {
    const win = getMainWindow()
    if (win) {
      win.hide()
    }
  })

  // Handle onboarding completion from renderer
  ipcMain.handle('onboarding:complete', (_event, result: { completed: boolean }) => {
    if (result.completed) {
      markOnboardingCompleted()
    }
    closeOnboardingWindow()
    // Show main window
    const mainWindow = getMainWindow()
    if (mainWindow) {
      mainWindow.show()
    } else {
      createWindow()
    }
    return { success: true }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  // On macOS, re-create a window when dock icon is clicked and no windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  } else {
    getMainWindow()?.show()
  }
})

app.on('will-quit', () => {
  unregisterAllShortcuts()
  killAllAgents()
  cleanupOpenClaw()
})
