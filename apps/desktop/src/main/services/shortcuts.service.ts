import { globalShortcut } from 'electron'
import { type DesktopShortcutAction, desktopSettingsService } from './desktop-settings.service'
import { windowService } from './window.service'

type ShortcutRegistrationEntry = {
  action: DesktopShortcutAction
  accelerator: string
  reason?: 'duplicate' | 'system'
}

export type ShortcutRegistrationResult = {
  suspended: boolean
  registered: ShortcutRegistrationEntry[]
  failed: ShortcutRegistrationEntry[]
}

export class ShortcutsService {
  private shortcutsSuspended = false

  registerGlobalShortcuts(): ShortcutRegistrationResult {
    globalShortcut.unregisterAll()
    const result: ShortcutRegistrationResult = {
      suspended: this.shortcutsSuspended,
      registered: [],
      failed: [],
    }
    if (this.shortcutsSuspended) return result

    const shortcuts = desktopSettingsService.readSettingsSync().shortcuts
    const seen = new Map<string, DesktopShortcutAction>()
    for (const action of Object.keys(shortcuts) as DesktopShortcutAction[]) {
      const accelerator = shortcuts[action].trim()
      if (!accelerator) {
        continue
      }
      const normalized = accelerator.toLowerCase()
      if (seen.has(normalized)) {
        result.failed.push({ action, accelerator, reason: 'duplicate' })
        continue
      }
      seen.set(normalized, action)
      const registered = globalShortcut.register(accelerator, this.shortcutCallback(action))
      if (registered) {
        result.registered.push({ action, accelerator })
      } else {
        result.failed.push({ action, accelerator, reason: 'system' })
      }
    }
    return result
  }

  unregisterAllShortcuts(): void {
    globalShortcut.unregisterAll()
  }

  suspendGlobalShortcuts(): ShortcutRegistrationResult {
    this.shortcutsSuspended = true
    globalShortcut.unregisterAll()
    return { suspended: true, registered: [], failed: [] }
  }

  resumeGlobalShortcuts(): ShortcutRegistrationResult {
    this.shortcutsSuspended = false
    return this.registerGlobalShortcuts()
  }

  private shortcutCallback(action: DesktopShortcutAction): () => void {
    if (action === 'openCommunity') {
      return () => {
        const win = windowService.getMainWindow()
        if (win && !win.isDestroyed()) {
          if (win.isVisible() && win.isFocused()) {
            win.hide()
            return
          }
          win.show()
          win.focus()
          return
        }
        windowService.showCommunityWindow()
      }
    }
    if (action === 'togglePet') return () => windowService.togglePetWindow()
    if (action === 'petVoice') return () => windowService.sendPetShortcut('voice')
    if (action === 'petChat') return () => windowService.sendPetShortcut('chat')
    return () => windowService.sendPetShortcut('notifications')
  }
}
