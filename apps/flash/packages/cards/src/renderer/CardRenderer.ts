// ══════════════════════════════════════════════════════════════
// CardRenderer — thin facade over ECS resources and systems.
//
// Rendering backend: WebGPU (primary), with transparent fallback
// to WebGL if the device or browser does not support WebGPU.
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
import { isFlipped, toggleFlipTarget } from '../components/flipComponent'
import { glStateStore } from '../components/glStateComponent'
import { gpuStateStore } from '../components/gpuStateComponent'
import { RenderOrder } from '../components/renderOrderComponent'
import { Transform } from '../components/transformComponent'
import type { ViewportData } from '../components/viewportComponent'
import { CARD_H, CARD_PADDING, CARD_RADIUS, CARD_W, TILT_STRENGTH } from '../constants'
import { SceneWorld } from '../core/world'
import { animationManager } from '../resources/animationManager'
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
import { clearAllTextures } from '../resources/textureCache'
import {
  centerViewportOnCards,
  createViewport,
  panViewport,
  setViewportZoom,
  viewportScreenToWorld,
  zoomViewport,
} from '../resources/viewport'
import { glRenderSystem, type RenderConfig } from '../systems/render/glRenderSystem'
import { type GPURenderConfig, gpuRenderSystem } from '../systems/render/gpuRenderSystem'
import { hitTestPoint, hitTestRect as hitTestRectSystem } from '../systems/render/hitTestSystem'
import type { InputState } from '../systems/scene/inputSystem'
import { sceneUpdateSystem } from '../systems/scene/sceneUpdateSystem'

const RENDER_CONFIG: RenderConfig = {
  cardW: CARD_W,
  cardH: CARD_H,
  cardRadius: CARD_RADIUS,
  cardPadding: CARD_PADDING,
  tiltStrength: TILT_STRENGTH,
}

const GPU_RENDER_CONFIG: GPURenderConfig = {
  cardW: CARD_W,
  cardH: CARD_H,
  cardRadius: CARD_RADIUS,
  cardPadding: CARD_PADDING,
  tiltStrength: TILT_STRENGTH,
}

// ─────────────────────────────────────
// CardRenderer
// ─────────────────────────────────────

export class CardRenderer {
  /** WebGPU context, set after async init completes. null → use WebGL. */
  private gpuCtx: GPUContext | null = null
  /** WebGL context — always initialised as synchronous fallback. */
  private glCtx!: GLContext

  private scene = new SceneWorld()
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

  /** True once the async WebGPU path is ready. */
  private _gpuReady = false
  /** Canvas stored for deferred GPU init. */
  private _canvas: HTMLCanvasElement

  constructor(canvas: HTMLCanvasElement) {
    this._canvas = canvas

    // Always bootstrap the WebGL fallback synchronously.
    this.glCtx = createGLContext(canvas)
    this.viewport = createViewport(this.glCtx.dpr)

    // Attempt WebGPU init in the background.
    this._initWebGPU(canvas)
  }

  private async _initWebGPU(canvas: HTMLCanvasElement): Promise<void> {
    try {
      this.gpuCtx = await createGPUContext(canvas)
      this._gpuReady = true
      // Sync viewport dpr to the GPU context.
      this.viewport = createViewport(this.gpuCtx.dpr)
      console.info('[Renderer] WebGPU backend active ✓')
    } catch (err) {
      console.warn('[Renderer] WebGPU unavailable, using WebGL fallback.', err)
    }
  }

  // ═══════════════════════════════════════
  // § Input state setters
  // ═══════════════════════════════════════

  setHoveredCard(id: string | null) {
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
    return this._gpuReady ? this.gpuCtx!.dpr : this.glCtx.dpr
  }
  getBackend(): 'webgpu' | 'webgl' {
    return this._gpuReady ? 'webgpu' : 'webgl'
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
    } else {
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
        },
        dt,
        CARD_W,
        CARD_H,
      )
      gpuRenderSystem(
        this.scene,
        this.gpuCtx,
        this.viewport,
        this.hiddenCardIds,
        time,
        GPU_RENDER_CONFIG,
      )
    } else {
      // ── WebGL fallback path ──
      sceneUpdateSystem(
        this.scene,
        cards,
        bodiesMap,
        this.input,
        this.viewport,
        (eid, _cardId) => {
          const glState = glStateStore[eid]
          if (glState) this.glCtx.gl.deleteTexture(glState.texture)
        },
        dt,
        CARD_W,
        CARD_H,
      )
      glRenderSystem(this.scene, this.glCtx, this.viewport, this.hiddenCardIds, time, RENDER_CONFIG)
    }
  }

  // ═══════════════════════════════════════
  // § Hit Testing
  // ═══════════════════════════════════════

  hitTest(
    screenX: number,
    screenY: number,
    cards: Card[],
    bodiesMap: Map<string, Matter.Body>,
  ): string | null {
    const world = viewportScreenToWorld(this.viewport, screenX, screenY)

    const sorted = [...cards].filter((c) => c && c.id)
    sorted.sort((a, b) => {
      const eidA = this.scene.get(a.id)
      const eidB = this.scene.get(b.id)
      const za = eidA != null ? (RenderOrder.z[eidA] ?? 0) : 0
      const zb = eidB != null ? (RenderOrder.z[eidB] ?? 0) : 0
      return zb - za
    })

    for (const card of sorted) {
      const eid = this.scene.get(card.id)
      if (eid == null) continue

      if (Transform.x[eid] != null) {
        if (hitTestPoint(eid, world.x, world.y, CARD_W, CARD_H)) return card.id
      } else {
        const body = bodiesMap.get(card.id)
        if (!body) continue
        const dx = world.x - body.position.x
        const dy = world.y - body.position.y
        const cos = Math.cos(-body.angle)
        const sin = Math.sin(-body.angle)
        const lx = dx * cos - dy * sin
        const ly = dx * sin + dy * cos
        if (Math.abs(lx) <= CARD_W / 2 && Math.abs(ly) <= CARD_H / 2) return card.id
      }
    }
    return null
  }

  hitTestRect(
    sx1: number,
    sy1: number,
    sx2: number,
    sy2: number,
    cards: Card[],
    _bodiesMap: Map<string, Matter.Body>,
  ): Set<string> {
    const result = new Set<string>()
    const w1 = viewportScreenToWorld(this.viewport, Math.min(sx1, sx2), Math.min(sy1, sy2))
    const w2 = viewportScreenToWorld(this.viewport, Math.max(sx1, sx2), Math.max(sy1, sy2))

    for (const card of cards) {
      if (!card || !card.id) continue
      const eid = this.scene.get(card.id)
      if (eid == null) continue
      if (hitTestRectSystem(eid, w1.x, w1.y, w2.x, w2.y)) result.add(card.id)
    }
    return result
  }

  // ═══════════════════════════════════════
  // § Cleanup
  // ═══════════════════════════════════════

  destroy() {
    if (this._gpuReady && this.gpuCtx) {
      destroyGPUContext(this.gpuCtx)
    } else {
      destroyGLContext(this.glCtx)
    }
    this.scene.clear()
    clearAllTextures()
  }
}
