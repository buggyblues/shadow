import { globalShortcut } from 'electron'
import { getPetWindow, showPetWindow } from './window'

export function registerGlobalShortcuts() {
  globalShortcut.register('CommandOrControl+Shift+Space', () => {
    const win = getPetWindow()
    if (win?.isVisible()) {
      win.hide()
      return
    }
    showPetWindow()
  })
}

export function unregisterGlobalShortcuts() {
  globalShortcut.unregisterAll()
}
