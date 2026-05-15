import type { ShadowPetBridge } from '../../preload'

export function getDesktopApi(): ShadowPetBridge | null {
  return window.shadowPet ?? null
}
