import type { ShadowPetBridge } from '../preload'

declare global {
  interface Window {
    shadowPet: ShadowPetBridge
  }
}

export {}
