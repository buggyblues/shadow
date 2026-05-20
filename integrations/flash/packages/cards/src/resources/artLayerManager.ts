// ══════════════════════════════════════════════════════════════
// Resource — Static Art Layers
//
// Large still images should not be baked into the full card face. This manager
// keeps them as independent GPU layers so card text/material can stay cached
// while art uploads and future KTX2 paths are handled separately.
// ══════════════════════════════════════════════════════════════

export interface ArtLayerRect {
  x: number
  y: number
  w: number
  h: number
  radius?: number
  fit?: 'fill' | 'contain' | 'cover'
}

export interface StaticArtLayer extends Required<ArtLayerRect> {
  cardId: string
  ownerKind?: string
  source: TexImageSource
  sourceW: number
  sourceH: number
  version: number
}

interface ImageArtState {
  url: string
  img: HTMLImageElement
  source: TexImageSource | null
  sourceW: number
  sourceH: number
  loaded: boolean
  version: number
}

const MAX_ART_SOURCE_EDGE = 1536

class ArtLayerManager {
  private images = new Map<string, ImageArtState>()
  private rects = new Map<string, Required<ArtLayerRect>>()
  private ownerKinds = new Map<string, string>()

  setLayerRect(cardId: string, rect: ArtLayerRect, ownerKind?: string): void {
    this.rects.set(cardId, {
      x: rect.x,
      y: rect.y,
      w: rect.w,
      h: rect.h,
      radius: rect.radius ?? 6,
      fit: rect.fit ?? 'cover',
    })
    if (ownerKind) this.ownerKinds.set(cardId, ownerKind)
  }

  registerImage(cardId: string, url: string): HTMLImageElement | null {
    const existing = this.images.get(cardId)
    if (existing?.url === url) return existing.loaded ? existing.img : null

    if (existing) existing.img.src = ''
    const img = new Image()
    img.crossOrigin = 'anonymous'
    const state: ImageArtState = {
      url,
      img,
      source: null,
      sourceW: 0,
      sourceH: 0,
      loaded: false,
      version: 0,
    }
    this.images.set(cardId, state)

    img.onload = () => {
      const prepared = prepareArtSource(img)
      state.source = prepared.source
      state.sourceW = prepared.w
      state.sourceH = prepared.h
      state.loaded = true
      state.version += 1
    }
    img.onerror = () => {
      state.loaded = false
    }
    img.src = url
    return null
  }

  getLayer(cardId: string): StaticArtLayer | null {
    const rect = this.rects.get(cardId)
    const state = this.images.get(cardId)
    if (!rect || !state?.loaded || !state.source) return null
    return {
      cardId,
      ownerKind: this.ownerKinds.get(cardId),
      source: state.source,
      sourceW: state.sourceW,
      sourceH: state.sourceH,
      version: state.version,
      ...rect,
    }
  }

  destroy(cardId: string): void {
    const state = this.images.get(cardId)
    if (state) state.img.src = ''
    this.images.delete(cardId)
    this.rects.delete(cardId)
    this.ownerKinds.delete(cardId)
  }

  destroyAll(): void {
    for (const state of this.images.values()) state.img.src = ''
    this.images.clear()
    this.rects.clear()
    this.ownerKinds.clear()
  }
}

export const artLayerManager = new ArtLayerManager()

function prepareArtSource(img: HTMLImageElement): { source: TexImageSource; w: number; h: number } {
  const w = img.naturalWidth
  const h = img.naturalHeight
  const edge = Math.max(w, h)
  if (edge <= MAX_ART_SOURCE_EDGE || w <= 0 || h <= 0) return { source: img, w, h }

  const scale = MAX_ART_SOURCE_EDGE / edge
  const targetW = Math.max(1, Math.round(w * scale))
  const targetH = Math.max(1, Math.round(h * scale))
  const canvas = document.createElement('canvas')
  canvas.width = targetW
  canvas.height = targetH
  const ctx = canvas.getContext('2d')
  if (!ctx) return { source: img, w, h }

  try {
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, targetW, targetH)
    return { source: canvas, w: targetW, h: targetH }
  } catch {
    return { source: img, w, h }
  }
}
