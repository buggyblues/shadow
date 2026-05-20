// ══════════════════════════════════════════════════════════════
// ECS Canvas Manager
//
// Handles HiDPI canvas creation and reuse for texture rendering.
// GPU memory is kept bounded by capping DPR at 2×.
// ══════════════════════════════════════════════════════════════

export interface CanvasSetupResult {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  /** Pixel-ratio scale applied (1 or 2). */
  texScale: number
}

/**
 * Return a canvas matched to (width × height) in logical pixels,
 * scaled up by the device pixel ratio (capped at 2×), unless `texScaleOverride`
 * is provided (used by the LOD system for sharper zoomed-in textures).
 *
 * Re-uses `existing` when provided; allocates a new element otherwise.
 * Resizes in-place if the required pixel dimensions changed.
 */
export function setupCanvas(
  existing: HTMLCanvasElement | OffscreenCanvas | undefined,
  width: number,
  height: number,
  texScaleOverride?: number,
): CanvasSetupResult {
  const texScale = texScaleOverride ?? Math.min(Math.ceil(window.devicePixelRatio || 1), 2)
  const pw = Math.round(width * texScale)
  const ph = Math.round(height * texScale)

  let canvas: HTMLCanvasElement
  if (existing && 'getContext' in existing) {
    canvas = existing as HTMLCanvasElement
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw
      canvas.height = ph
    }
  } else {
    canvas = document.createElement('canvas')
    canvas.width = pw
    canvas.height = ph
  }

  const ctx = canvas.getContext('2d', { alpha: true })!
  return { canvas, ctx, texScale }
}
