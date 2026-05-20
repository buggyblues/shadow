// ══════════════════════════════════════════════════════════════
// Component — Asset (SoA, bitECS)
//
// Runtime resource state for card-face assets. Rendering systems update this
// component as card faces are baked and uploaded to GPU memory.
// ══════════════════════════════════════════════════════════════

export const ASSET_BACKEND_NONE = 0
export const ASSET_BACKEND_CANVAS2D = 1
export const ASSET_BACKEND_OFFSCREEN_CANVAS = 2
export const ASSET_BACKEND_CANVASKIT = 3
export const ASSET_BACKEND_EXTERNAL = 4

/** bitECS SoA component: asset residency and upload state */
export const Asset = {
  faceVersion: [] as number[],
  faceLod: [] as number[],
  faceBytes: [] as number[],
  uploadPending: [] as number[],
  gpuResident: [] as number[],
  lastTouchedFrame: [] as number[],
  lastUploadedFrame: [] as number[],
  backend: [] as number[],
}

/** Legacy alias */
export const CAsset = Asset

export interface AssetData {
  faceVersion: number
  faceLod: number
  faceBytes: number
  uploadPending: boolean
  gpuResident: boolean
  lastTouchedFrame: number
  lastUploadedFrame: number
  backend: number
}

export function assetBackendCode(backend: string): number {
  switch (backend) {
    case 'canvas2d':
      return ASSET_BACKEND_CANVAS2D
    case 'offscreen-canvas':
      return ASSET_BACKEND_OFFSCREEN_CANVAS
    case 'canvaskit':
      return ASSET_BACKEND_CANVASKIT
    case 'external':
      return ASSET_BACKEND_EXTERNAL
    default:
      return ASSET_BACKEND_NONE
  }
}
