import { globalShortcut } from 'electron'
import { getMainWindow } from './window'

export function registerGlobalShortcuts(): void {
  // Toggle window visibility
  globalShortcut.register('CommandOrControl+Shift+S', () => {
    const win = getMainWindow()
    if (!win) return
    if (win.isVisible() && win.isFocused()) {
      win.hide()
    } else {
      win.show()
      win.focus()
    }
  })
}

export function unregisterAllShortcuts(): void {
  globalShortcut.unregisterAll()
}
