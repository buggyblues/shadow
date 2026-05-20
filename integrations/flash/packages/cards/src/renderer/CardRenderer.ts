// ══════════════════════════════════════════════════════════════
// CardRenderer — thin facade over ECS resources and systems.
//
// Rendering backend: WebGL by default, with an opt-in WebGPU path
// while the GPU renderer is hardened.
//
// All per-card logic lives in ECS. This class owns only:
//   • GPUContext | GLContext  (graphics backend)
//   • ViewportData            (camera state)
//   • SceneWorld              (entity registry)
//   • InputState              (hover/drag/selection)
// and orchestrates each frame via sceneUpdateSystem + render system.
// ══════════════════════════════════════════════════════════════

import type { Card } from '@shadowob/flash-types'
import Matter from 'matter-js'
import { Asset } from '../components/assetComponent'
import { cardDataStore } from '../components/cardDataComponent'
import { isFlipped, toggleFlipTarget } from '../components/flipComponent'
import { glStateStore } from '../components/glStateComponent'
import { gpuStateStore } from '../components/gpuStateComponent'
import { isDynamicRuntimeKind } from '../components/runtimeComponent'
import type { ViewportData } from '../components/viewportComponent'
import { Visibility } from '../components/visibilityComponent'
import { CARD_H, CARD_PADDING, CARD_RADIUS, CARD_W, TILT_STRENGTH } from '../constants'
import { getEidCardId } from '../core/entity'
import { SceneWorld } from '../core/world'
import { animationManager } from '../resources/animationManager'
import type { AnimationSchedulerBudget } from '../resources/animationScheduler'
import { artLayerManager } from '../resources/artLayerManager'
import {
  type AssetMemoryBudget,
  cardAssetPipeline,
  type TextureUploadBudget,
} from '../resources/assetPipeline'
import {
  createGLContext,
  destroyGLContext,
  type GLContext,
  resizeGLContext,
} from '../resources/glContext'
import {
  createGPUContext,
  destroyGPUContext,
  type GPUContext,
  releaseTextureLayer,
  resizeGPUContext,
} from '../resources/gpuContext'
import { ktx2Runtime } from '../resources/ktx2Runtime'
import { CardSpatialIndex } from '../resources/spatialIndex'
import { clearAllTextures, removeCachedTexture, trimTextureCache } from '../resources/textureCache'
import {
  centerViewportOnCards,
  createViewport,
  panViewport,
  setViewportZoom,
  viewportScreenToWorld,
  zoomViewport,
} from '../resources/viewport'
import {
  clearAnimationLayerTextures,
  removeAnimationLayerTexture,
} from '../systems/render/glAnimationLayerSystem'
import { clearArtLayerTextures, removeArtLayerTexture } from '../systems/render/glArtLayerSystem'
import { glRenderSystem, type RenderConfig } from '../systems/render/glRenderSystem'
import { gpuRenderSystem } from '../systems/render/gpuRenderSystem'
import type { InputState } from '../systems/scene/inputSystem'
import { sceneUpdateSystem } from '../systems/scene/sceneUpdateSystem'

const RENDER_CONFIG: RenderConfig = {
  cardW: CARD_W,
  cardH: CARD_H,
  cardRadius: CARD_RADIUS,
  cardPadding: CARD_PADDING,
  tiltStrength: TILT_STRENGTH,
}

export type RenderBackend = 'webgpu' | 'webgl' | 'pending'
export type RenderBackendPreference = 'webgl' | 'webgpu' | 'auto'

export interface CardRendererOptions {
  backend?: RenderBackendPreference
  assetUploadBudget?: Partial<TextureUploadBudget>
  assetMemoryBudget?: Partial<AssetMemoryBudget>
  animationBudget?: Partial<AnimationSchedulerBudget>
  runtimePrewarmLimit?: number
  runtimePrewarmOverscanPx?: number
}

// ─────────────────────────────────────
// CardRenderer
// ─────────────────────────────────────

export class CardRenderer {
  /** WebGPU context, set after async init completes. null → use WebGL. */
  private gpuCtx: GPUContext | null = null
  /** WebGL context, initialised only when WebGPU is unavailable. */
  private glCtx: GLContext | null = null

  private scene = new SceneWorld()
  private spatialIndex = new CardSpatialIndex()
  private viewport!: ViewportData
  private input: InputState = {
    hoveredId: null,
    activeId: null,
    selectedIds: new Set(),
    mouseScreenX: 0,
    mouseScreenY: 0,
  }
  private hiddenCardIds = new Set<string>()
  private startTime = performance.now()
  private lastTime = 0
  private runtimePrewarmIds = new Set<string>()
  private runtimePrewarmLimit: number
  private runtimePrewarmOverscanPx: number

  /** True once the async WebGPU path is ready. */
  private _gpuReady = false
  private _destroyed = false

  constructor(canvas: HTMLCanvasElement, options: CardRendererOptions = {}) {
    this.viewport = createViewport(Math.min(window.devicePixelRatio || 1, 4))
    if (options.assetUploadBudget) {
      cardAssetPipeline.configureTextureUploadBudget(options.assetUploadBudget)
    }
    if (options.assetMemoryBudget) {
      cardAssetPipeline.configureMemoryBudget(options.assetMemoryBudget)
    }
    if (options.animationBudget) {
      animationManager.configureScheduler(options.animationBudget)
    }
    this.runtimePrewarmLimit = Math.max(0, options.runtimePrewarmLimit ?? 8)
    this.runtimePrewarmOverscanPx = Math.max(0, options.runtimePrewarmOverscanPx ?? 320)

    const backend = options.backend ?? 'webgl'
    if (backend === 'webgpu' || (backend === 'auto' && navigator.gpu)) {
      this._initWebGPU(canvas)
    } else {
      this._initWebGL(canvas)
    }
  }

  private _initWebGL(canvas: HTMLCanvasElement): void {
    if (this._destroyed || this.glCtx || this.gpuCtx) return
    this.glCtx = createGLContext(canvas)
    ktx2Runtime.detectWebGLSupport(this.glCtx.gl)
    this.viewport.dpr = this.glCtx.dpr
    if (this.viewport.screenW > 0 && this.viewport.screenH > 0) {
      resizeGLContext(this.glCtx, this.viewport.screenW, this.viewport.screenH)
    }
  }

  private async _initWebGPU(canvas: HTMLCanvasElement): Promise<void> {
    try {
      const gpuCtx = await createGPUContext(canvas)
      if (this._destroyed) {
        destroyGPUContext(gpuCtx)
        return
      }
      this.gpuCtx = gpuCtx
      this._gpuReady = true
      this.viewport.dpr = this.gpuCtx.dpr
      if (this.viewport.screenW > 0 && this.viewport.screenH > 0) {
        resizeGPUContext(this.gpuCtx, this.viewport.screenW, this.viewport.screenH)
      }
      console.info('[Renderer] WebGPU backend active ✓')
    } catch (err) {
      console.warn('[Renderer] WebGPU unavailable, using WebGL fallback.', err)
      try {
        this._initWebGL(canvas)
      } catch (fallbackErr) {
        console.error('[Renderer] WebGL fallback init failed.', fallbackErr)
      }
    }
  }

  // ═══════════════════════════════════════
  // § Input state setters
  // ═══════════════════════════════════════

  setHoveredCard(id: string | null) {
    const prev = this.input.hoveredId
    if (prev !== id) {
      if (prev && this.hoverRequiresFaceRebake(prev)) animationManager.markDirty(prev)
      if (id && this.hoverRequiresFaceRebake(id)) animationManager.markDirty(id)
    }
    this.input.hoveredId = id
    animationManager.setHoveredCard(id)
  }
  setActiveCard(id: string | null) {
    this.input.activeId = id
  }
  setSelectedCards(ids: Set<string>) {
    this.input.selectedIds = ids
  }
  getSelectedCards() {
    return this.input.selectedIds
  }
  setHiddenCards(ids: Set<string>) {
    this.hiddenCardIds = ids
  }

  setMousePosition(x: number, y: number) {
    this.input.mouseScreenX = x
    this.input.mouseScreenY = y
  }

  bringToFront(cardId: string) {
    this.scene.bringToFront(cardId)
  }

  // ═══════════════════════════════════════
  // § Viewport controls
  // ═══════════════════════════════════════

  getViewOffset() {
    return { x: this.viewport.offsetX, y: this.viewport.offsetY }
  }
  getViewZoom() {
    return this.viewport.zoom
  }
  getDpr() {
    if (this._gpuReady && this.gpuCtx) return this.gpuCtx.dpr
    if (this.glCtx) return this.glCtx.dpr
    return this.viewport.dpr
  }
  getBackend(): RenderBackend {
    if (this._gpuReady && this.gpuCtx) return 'webgpu'
    if (this.glCtx) return 'webgl'
    return 'pending'
  }

  setViewOffset(x: number, y: number) {
    this.viewport.offsetX = x
    this.viewport.offsetY = y
  }

  setViewZoom(zoom: number) {
    setViewportZoom(this.viewport, zoom)
  }
  panBy(dx: number, dy: number) {
    panViewport(this.viewport, dx, dy)
  }

  zoomAt(screenX: number, screenY: number, factor: number) {
    zoomViewport(this.viewport, screenX, screenY, factor)
  }

  setZoomSettled(settled: boolean) {
    this.viewport.zoomSettled = settled
  }

  screenToWorld(sx: number, sy: number) {
    return viewportScreenToWorld(this.viewport, sx, sy)
  }

  centerOnCards(bodiesMap: Map<string, Matter.Body>, screenW: number, screenH: number) {
    centerViewportOnCards(this.viewport, bodiesMap, screenW, screenH, CARD_W, CARD_H)
  }

  // ═══════════════════════════════════════
  // § 3D Flip (ECS-driven)
  // ═══════════════════════════════════════

  toggleFlip(cardId: string) {
    const eid = this.scene.get(cardId)
    if (eid == null) return
    toggleFlipTarget(eid)
  }

  isCardFlipped(cardId: string): boolean {
    const eid = this.scene.get(cardId)
    if (eid == null) return false
    return isFlipped(eid)
  }

  // ═══════════════════════════════════════
  // § Resize
  // ═══════════════════════════════════════

  resize(width: number, height: number) {
    if (this._gpuReady && this.gpuCtx) {
      resizeGPUContext(this.gpuCtx, width, height)
    } else if (this.glCtx) {
      resizeGLContext(this.glCtx, width, height)
    }
    this.viewport.screenW = width
    this.viewport.screenH = height
  }

  // ═══════════════════════════════════════
  // § Main Render Loop
  // ═══════════════════════════════════════

  render(cards: Card[], bodiesMap: Map<string, Matter.Body>, width: number, height: number) {
    if (cards.length === 0) return

    const now = performance.now()
    const time = (now - this.startTime) / 1000
    const dt = Math.min(1 / 20, time - this.lastTime)
    this.lastTime = time

    this.viewport.screenW = width
    this.viewport.screenH = height

    if (this._gpuReady && this.gpuCtx) {
      // ── WebGPU path ──
      sceneUpdateSystem(
        this.scene,
        cards,
        bodiesMap,
        this.input,
        this.viewport,
        (eid, cardId) => {
          const gpuState = gpuStateStore[eid]
          if (gpuState) releaseTextureLayer(this.gpuCtx!, cardId)
          gpuStateStore[eid] = undefined
          removeCachedTexture(cardId)
          artLayerManager.destroy(cardId)
          animationManager.destroy(cardId)
        },
        dt,
        CARD_W,
        CARD_H,
        this.runtimePrewarmIds,
      )
      this.spatialIndex.rebuild(this.scene, cards, CARD_W, CARD_H, this.hiddenCardIds)
      this.runtimePrewarmIds = this.computeRuntimePrewarmIds(cards)
      animationManager.setRenderableCards(this.visibleCardIds(cards))
      gpuRenderSystem(
        this.scene,
        this.gpuCtx,
        this.viewport,
        this.hiddenCardIds,
        time,
        RENDER_CONFIG,
      )
      this.pruneAssetResidency(cards)
    } else if (this.glCtx) {
      const glCtx = this.glCtx
      // ── WebGL fallback path ──
      sceneUpdateSystem(
        this.scene,
        cards,
        bodiesMap,
        this.input,
        this.viewport,
        (eid, cardId) => {
          const glState = glStateStore[eid]
          if (glState) glCtx.gl.deleteTexture(glState.texture)
          glStateStore[eid] = undefined
          removeArtLayerTexture(cardId, glCtx.gl)
          removeAnimationLayerTexture(cardId, glCtx.gl)
          removeCachedTexture(cardId)
          artLayerManager.destroy(cardId)
          animationManager.destroy(cardId)
        },
        dt,
        CARD_W,
        CARD_H,
        this.runtimePrewarmIds,
      )
      this.spatialIndex.rebuild(this.scene, cards, CARD_W, CARD_H, this.hiddenCardIds)
      this.runtimePrewarmIds = this.computeRuntimePrewarmIds(cards)
      animationManager.setRenderableCards(this.visibleCardIds(cards))
      glRenderSystem(this.scene, glCtx, this.viewport, this.hiddenCardIds, time, RENDER_CONFIG)
      this.pruneAssetResidency(cards)
    }
  }

  private visibleCardIds(cards: Card[]): Set<string> {
    const ids = new Set<string>()
    for (const card of cards) {
      const eid = this.scene.get(card.id)
      if (eid !== undefined && Visibility.visible[eid]) ids.add(card.id)
    }
    return ids
  }

  private hoverRequiresFaceRebake(cardId: string): boolean {
    const eid = this.scene.get(cardId)
    if (eid === undefined) return true
    const kind = cardDataStore[eid]?.card.kind
    return kind !== 'gif' && kind !== 'lottie' && kind !== 'threed' && kind !== 'live2d'
  }

  private pruneAssetResidency(cards: Card[]): void {
    const activeIds = this.visibleCardIds(cards)
    const budget = cardAssetPipeline.getMemoryBudget()
    trimTextureCache(activeIds, budget.maxCpuTextureBytes)
    this.evictGpuResidency(activeIds, budget)
  }

  private computeRuntimePrewarmIds(cards: Card[]): Set<string> {
    const ids = new Set<string>()
    if (this.runtimePrewarmLimit <= 0 || this.viewport.screenW <= 0 || this.viewport.screenH <= 0) {
      return ids
    }

    const overscan = this.runtimePrewarmOverscanPx
    const p1 = viewportScreenToWorld(this.viewport, -overscan, -overscan)
    const p2 = viewportScreenToWorld(
      this.viewport,
      this.viewport.screenW + overscan,
      this.viewport.screenH + overscan,
    )
    const minX = Math.min(p1.x, p2.x)
    const minY = Math.min(p1.y, p2.y)
    const maxX = Math.max(p1.x, p2.x)
    const maxY = Math.max(p1.y, p2.y)
    const centerX = (minX + maxX) * 0.5
    const centerY = (minY + maxY) * 0.5
    const cardById = new Map(cards.map((card) => [card.id, card]))
    const candidates = this.spatialIndex.search(minX, minY, maxX, maxY)
    candidates.sort((a, b) => {
      const adx = (a.minX + a.maxX) * 0.5 - centerX
      const ady = (a.minY + a.maxY) * 0.5 - centerY
      const bdx = (b.minX + b.maxX) * 0.5 - centerX
      const bdy = (b.minY + b.maxY) * 0.5 - centerY
      return adx * adx + ady * ady - (bdx * bdx + bdy * bdy)
    })

    for (const item of candidates) {
      if (ids.size >= this.runtimePrewarmLimit) break
      const card = cardById.get(item.cardId)
      if (!card || !isDynamicRuntimeKind(card.kind)) continue
      ids.add(item.cardId)
    }
    return ids
  }

  private evictGpuResidency(activeIds: Set<string>, budget: AssetMemoryBudget): void {
    const frameId = cardAssetPipeline.currentFrame().frameId
    const residents: Array<{
      eid: number
      cardId: string
      bytes: number
      lastTouchedFrame: number
      active: boolean
    }> = []
    let totalBytes = 0

    for (const eid of this.scene.all()) {
      const cardId = getEidCardId(eid)
      if (!cardId) continue
      const hasGpuState =
        (this._gpuReady && this.gpuCtx && gpuStateStore[eid]) || (this.glCtx && glStateStore[eid])
      if (!hasGpuState) continue

      const bytes = Math.max(Asset.faceBytes[eid] || 0, 1)
      const lastTouchedFrame = Asset.lastTouchedFrame[eid] || 0
      totalBytes += bytes
      residents.push({
        eid,
        cardId,
        bytes,
        lastTouchedFrame,
        active: activeIds.has(cardId),
      })
    }

    const candidates = residents
      .filter((item) => !item.active)
      .sort((a, b) => a.lastTouchedFrame - b.lastTouchedFrame)

    for (const item of candidates) {
      const idleFrames = frameId - item.lastTouchedFrame
      if (idleFrames < budget.maxGpuIdleFrames && totalBytes <= budget.maxGpuTextureBytes) continue
      this.releaseGpuResidentTexture(item.eid, item.cardId)
      totalBytes -= item.bytes
    }
  }

  private releaseGpuResidentTexture(eid: number, cardId: string): void {
    if (this._gpuReady && this.gpuCtx) {
      const gpuState = gpuStateStore[eid]
      if (gpuState) {
        releaseTextureLayer(this.gpuCtx, cardId)
        gpuStateStore[eid] = undefined
      }
    }

    if (this.glCtx) {
      const glState = glStateStore[eid]
      if (glState) {
        this.glCtx.gl.deleteTexture(glState.texture)
        glStateStore[eid] = undefined
      }
      removeAnimationLayerTexture(cardId, this.glCtx.gl)
      removeArtLayerTexture(cardId, this.glCtx.gl)
    }

    Asset.gpuResident[eid] = 0
    Asset.uploadPending[eid] = 1
  }

  // ═══════════════════════════════════════
  // § Hit Testing
  // ═══════════════════════════════════════

  hitTest(
    screenX: number,
    screenY: number,
    cards: Card[],
    _bodiesMap: Map<string, Matter.Body>,
  ): string | null {
    const world = viewportScreenToWorld(this.viewport, screenX, screenY)
    if (this.spatialIndex.getStats().indexed === 0 && cards.length > 0) {
      this.spatialIndex.rebuild(this.scene, cards, CARD_W, CARD_H, this.hiddenCardIds)
    }
    return this.spatialIndex.hitTestPoint(world.x, world.y, CARD_W, CARD_H)
  }

  hitTestRect(
    sx1: number,
    sy1: number,
    sx2: number,
    sy2: number,
    cards: Card[],
    _bodiesMap: Map<string, Matter.Body>,
  ): Set<string> {
    const w1 = viewportScreenToWorld(this.viewport, Math.min(sx1, sx2), Math.min(sy1, sy2))
    const w2 = viewportScreenToWorld(this.viewport, Math.max(sx1, sx2), Math.max(sy1, sy2))
    if (this.spatialIndex.getStats().indexed === 0 && cards.length > 0) {
      this.spatialIndex.rebuild(this.scene, cards, CARD_W, CARD_H, this.hiddenCardIds)
    }
    return this.spatialIndex.hitTestRect(w1.x, w1.y, w2.x, w2.y)
  }

  // ═══════════════════════════════════════
  // § Cleanup
  // ═══════════════════════════════════════

  destroy() {
    this._destroyed = true
    if (this._gpuReady && this.gpuCtx) {
      destroyGPUContext(this.gpuCtx)
    }
    if (this.glCtx) {
      destroyGLContext(this.glCtx)
    }
    this.scene.clear()
    this.spatialIndex.clear()
    clearAllTextures()
    clearAnimationLayerTextures(this.glCtx?.gl)
    clearArtLayerTextures(this.glCtx?.gl)
    artLayerManager.destroyAll()
    animationManager.destroyAll()
  }
}
