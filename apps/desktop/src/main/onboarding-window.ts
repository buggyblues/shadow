/**
 * Desktop Onboarding Window
 *
 * 独立的 Onboarding 窗口，流程：
 * 1. 欢迎
 * 2. 登录/注册
 * 3. 配置模型
 * 4. 创建龙虾
 * 5. 绑定 Buddy
 * 6. 完成
 */

import { join } from 'node:path'
import { BrowserWindow, shell } from 'electron'

let onboardingWindow: BrowserWindow | null = null

const isDev = !!process.env.DESKTOP_DEV_URL

function getPreloadPath(): string {
  return join(__dirname, '../preload/index.js')
}

function getRendererURL(): string {
  if (process.env.DESKTOP_DEV_URL) {
    return `${process.env.DESKTOP_DEV_URL}#/onboard`
  }
  return 'app://shadow/index.html#/onboard'
}

export interface OnboardingResult {
  completed: boolean
  userId?: string
  agentId?: string
  buddyConnectionId?: string
}

export function createOnboardingWindow(): Promise<OnboardingResult> {
  return new Promise((resolve) => {
    if (onboardingWindow && !onboardingWindow.isDestroyed()) {
      onboardingWindow.focus()
      resolve({ completed: false })
      return
    }

    onboardingWindow = new BrowserWindow({
      width: 480,
      height: 680,
      minWidth: 480,
      minHeight: 680,
      maxWidth: 600,
      maxHeight: 800,
      resizable: true,
      frame: process.platform === 'darwin',
      titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
      ...(process.platform === 'win32' && {
        titleBarOverlay: { color: '#1a1a2e', symbolColor: '#e1e1e6', height: 40 },
      }),
      title: 'OpenClaw 设置向导',
      icon: join(__dirname, '../../assets/icon.png'),
      webPreferences: {
        preload: getPreloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
      show: false,
      backgroundColor: '#1a1a2e',
      // 防止关闭时退出应用
      closable: true,
    })

    // Load onboarding page
    onboardingWindow.loadURL(getRendererURL())

    // Open external links in system browser
    onboardingWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('http://') || url.startsWith('https://')) {
        shell.openExternal(url)
      }
      return { action: 'deny' }
    })

    // Open DevTools in development
    if (isDev) {
      onboardingWindow.webContents.openDevTools({ mode: 'detach' })
    }

    // Show when ready
    onboardingWindow.once('ready-to-show', () => {
      onboardingWindow?.show()
    })

    // Handle close - user skipped onboarding
    onboardingWindow.on('close', () => {
      resolve({ completed: false })
    })

    onboardingWindow.on('closed', () => {
      onboardingWindow = null
    })

    // IPC handler for completion
    const { ipcMain } = require('electron')
    const handleComplete = (_event: Electron.IpcMainInvokeEvent, result: OnboardingResult) => {
      ipcMain.removeHandler('onboarding:complete')
      resolve(result)
      onboardingWindow?.close()
    }
    ipcMain.handle('onboarding:complete', handleComplete)
  })
}

export function getOnboardingWindow(): BrowserWindow | null {
  return onboardingWindow
}

export function closeOnboardingWindow(): void {
  if (onboardingWindow && !onboardingWindow.isDestroyed()) {
    onboardingWindow.close()
  }
}
