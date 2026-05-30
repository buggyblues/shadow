import { globalShortcut, ipcMain } from 'electron'
import { type DesktopShortcutAction, readDesktopSettings } from './desktop-settings'
import { getMainWindow, sendPetShortcut, showCommunityWindow, togglePetWindow } from './window'

type ShortcutRegistrationEntry = {
  action: DesktopShortcutAction
  accelerator: string
  reason?: 'empty' | 'duplicate' | 'system'
}

export type ShortcutRegistrationResult = {
  suspended: boolean
  registered: ShortcutRegistrationEntry[]
  failed: ShortcutRegistrationEntry[]
}

let shortcutsSuspended = false

function shortcutCallback(action: DesktopShortcutAction): () => void {
  if (action === 'openCommunity') {
    return () => {
      const win = getMainWindow()
      if (win && !win.isDestroyed()) {
        if (win.isVisible() && win.isFocused()) {
          win.hide()
          return
        }
        win.show()
        win.focus()
        return
      }
      showCommunityWindow()
    }
  }
  if (action === 'togglePet') return () => togglePetWindow()
  if (action === 'petVoice') return () => sendPetShortcut('voice')
  if (action === 'petChat') return () => sendPetShortcut('chat')
  return () => sendPetShortcut('notifications')
}

export function registerGlobalShortcuts(): ShortcutRegistrationResult {
  globalShortcut.unregisterAll()
  const result: ShortcutRegistrationResult = {
    suspended: shortcutsSuspended,
    registered: [],
    failed: [],
  }
  if (shortcutsSuspended) return result

  const shortcuts = readDesktopSettings().shortcuts
  const seen = new Map<string, DesktopShortcutAction>()
  for (const action of Object.keys(shortcuts) as DesktopShortcutAction[]) {
    const accelerator = shortcuts[action].trim()
    if (!accelerator) {
      result.failed.push({ action, accelerator, reason: 'empty' })
      continue
    }
    const normalized = accelerator.toLowerCase()
    if (seen.has(normalized)) {
      result.failed.push({ action, accelerator, reason: 'duplicate' })
      continue
    }
    seen.set(normalized, action)
    const registered = globalShortcut.register(accelerator, shortcutCallback(action))
    if (registered) {
      result.registered.push({ action, accelerator })
    } else {
      result.failed.push({ action, accelerator, reason: 'system' })
    }
  }
  return result
}

export function unregisterAllShortcuts(): void {
  globalShortcut.unregisterAll()
}

export function suspendGlobalShortcuts(): ShortcutRegistrationResult {
  shortcutsSuspended = true
  globalShortcut.unregisterAll()
  return { suspended: true, registered: [], failed: [] }
}

export function resumeGlobalShortcuts(): ShortcutRegistrationResult {
  shortcutsSuspended = false
  return registerGlobalShortcuts()
}

export function setupShortcutHandlers(): void {
  ipcMain.handle('desktop:shortcuts:reload', () => {
    return registerGlobalShortcuts()
  })
  ipcMain.handle('desktop:shortcuts:suspend', () => suspendGlobalShortcuts())
  ipcMain.handle('desktop:shortcuts:resume', () => resumeGlobalShortcuts())
}
