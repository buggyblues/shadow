import type { DesktopRuntimeSettings } from './desktop-settings.service'
import { desktopSettingsService } from './desktop-settings.service'

export type DesktopPetVisibilityReason =
  | 'startup'
  | 'tray'
  | 'shortcut'
  | 'window'
  | 'settings'
  | 'ipc'

type DesktopPetVisibilityState = {
  visible: boolean
  reason: DesktopPetVisibilityReason
  settings: DesktopRuntimeSettings
}

type DesktopPetVisibilityListener = (state: DesktopPetVisibilityState) => void

const listeners = new Set<DesktopPetVisibilityListener>()

let lastVisible: boolean | null = null

function notify(state: DesktopPetVisibilityState): void {
  for (const listener of listeners) listener(state)
}

export class PetVisibilityService {
  isDesktopPetVisible(): boolean {
    return desktopSettingsService.readSettingsSync().desktopPetVisible === true
  }

  setDesktopPetVisible(
    visible: boolean,
    reason: DesktopPetVisibilityReason,
  ): DesktopRuntimeSettings {
    const current = desktopSettingsService.readSettingsSync()
    if (current.desktopPetVisible === visible) {
      lastVisible = visible
      return current
    }
    const next = desktopSettingsService.saveSettingsSync({ desktopPetVisible: visible })
    lastVisible = visible
    desktopSettingsService.broadcastSettings(next)
    notify({ visible, reason, settings: next })
    return next
  }

  syncDesktopPetVisibilityFromSettings(
    settings: DesktopRuntimeSettings,
    reason: DesktopPetVisibilityReason = 'settings',
  ): void {
    const visible = settings.desktopPetVisible === true
    const changed = lastVisible !== null && lastVisible !== visible
    lastVisible = visible
    if (changed) notify({ visible, reason, settings })
  }

  onDesktopPetVisibilityChanged(listener: DesktopPetVisibilityListener): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }
}

export const petVisibilityService = new PetVisibilityService()
