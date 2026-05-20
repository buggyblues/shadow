// AnimationManager v2 — unified tick architecture
//
// DeskLoop calls animationManager.tick(timestamp) at the START of each
// RAF step, BEFORE the card render pass.  This ensures:
//
//  Three.js:  scenes are rendered synchronously inside tick(), so the
//             canvas holds a fresh frame when the GPU compositor samples
//             the dynamic runtime layer. preserveDrawingBuffer: true
//             prevents UA from clearing the WebGL buffer between passes.
//
//  Lottie:    lottie-web drives its own RAF only while active; enterFrame
//             requests are throttled through AnimationScheduler before the
//             dynamic layer version is advanced.
//
//  Countdown: tick() detects the wall-clock second change and marks
//             countdown cards dirty.
//
// glTextureSystem reads isDirty(id) only for true face invalidations. Dynamic
// sources bump frameVersion and are uploaded by glAnimationLayerSystem.

import type { Card } from '@shadowob/flash-types'
import type { AnimationItem } from 'lottie-web'
import * as THREE from 'three'
import { resolveStyle } from '../components/styleComponent'
import { CARD_H, CARD_W } from '../constants'
import { CARD_PAD } from '../utils/canvasUtils'
import {
  type AnimationSchedulerBudget,
  type AnimationSchedulerStats,
  animationScheduler,
} from './animationScheduler'
import type { CompressedImageMeta } from './compressedTexturePipeline'
import { getSharedPixiRuntime, resetSharedPixiRuntime, type SharedPixiRuntime } from './pixiRuntime'
import {
  getSharedThreeRuntime,
  resetSharedThreeRuntime,
  type SharedThreeRuntime,
} from './threeRuntime'
import { createThreeSceneRuntime, hasThreeScenePreset } from './threeScenePresets'

// ─────────────────────────────────────
// Types
// ─────────────────────────────────────

export interface LottieState {
  kind: 'lottie'
  container: HTMLDivElement
  canvas: HTMLCanvasElement | null
  item: AnimationItem | null
  loading: boolean
  error: boolean
}

export interface ThreeState {
  kind: 'three'
  canvas: HTMLCanvasElement
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  tick: (elapsed: number) => void
  startTime: number
  w: number
  h: number
}

export interface CountdownState {
  kind: 'countdown'
}

export interface ImageState {
  kind: 'image'
  img: HTMLImageElement
  loaded: boolean
  animated: boolean // true for GIFs — mark dirty every tick
}

export interface Live2DState {
  kind: 'live2d'
  canvas: HTMLCanvasElement // 2D canvas we blit into (per-card)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  renderTexture: any // PIXI.RenderTexture (shared renderer)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: any // Live2DModel (dynamic import)
  loading: boolean
  error: boolean
  w: number
  h: number
}

type AnimState = LottieState | ThreeState | CountdownState | ImageState | Live2DState

export interface AnimationLayerRect {
  x: number
  y: number
  w: number
  h: number
  radius?: number
  fit?: 'fill' | 'contain' | 'cover'
}

export interface RuntimeAnimationLayer extends Required<AnimationLayerRect> {
  cardId: string
  source: TexImageSource
  sourceW: number
  sourceH: number
  version: number
}

// ─────────────────────────────────────
// AnimationManager
// ─────────────────────────────────────

class AnimationManager {
  private states = new Map<string, AnimState>()
  private dirty = new Set<string>()
  private frameVersion = new Map<string, number>()
  private layerRects = new Map<string, Required<AnimationLayerRect>>()
  private mountEl: HTMLElement | null = null
  private lastSecond = -1
  /** Currently hovered card id — only this card (+ autoplay cards) animate */
  private hoveredCardId: string | null = null
  /** Cards that explicitly request autoplay through card metadata. */
  private metaAutoplayIds = new Set<string>()
  /** Cards manually activated by runtime commands such as /play. */
  private manualAutoplayIds = new Set<string>()
  /** Cards currently present and visible enough for animation work. */
  private renderableIds: Set<string> | null = null
  // Shared PixiJS application — ONE WebGL context for all Live2D cards
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private pixiApp: any = null
  private pixiRuntime: SharedPixiRuntime | null = null
  private threeRuntime: SharedThreeRuntime | null = null
  /** Last render timestamp per live2d card — Live2D is sampled below the main RAF rate. */
  private _live2dLastRender = new Map<string, number>()

  setMountElement(el: HTMLElement) {
    this.mountEl = el
  }

  configureScheduler(budget: Partial<AnimationSchedulerBudget>): void {
    animationScheduler.configure(budget)
  }

  getSchedulerStats(): AnimationSchedulerStats {
    return animationScheduler.getStats()
  }

  /**
   * Call when pointer enters/leaves a card.
   * Pauses/resumes Lottie animations; gates Three.js and GIF dirty marks.
   */
  setHoveredCard(cardId: string | null) {
    const prev = this.hoveredCardId
    this.hoveredCardId = cardId
    // Pause previously hovered lottie (unless autoplay)
    if (prev && prev !== cardId) {
      const s = this.states.get(prev)
      if (s?.kind === 'lottie' && s.item && !this.isAutoplayCard(prev)) {
        s.item.pause()
      }
      if (s) this.markFrameDirty(prev)
    }
    // Resume newly hovered lottie
    if (cardId) {
      const s = this.states.get(cardId)
      if (s?.kind === 'lottie' && s.item) {
        s.item.play()
      }
      if (s) this.markFrameDirty(cardId)
    }
  }

  /** Returns true if a card should animate this frame */
  isActive(cardId: string): boolean {
    const renderable = this.renderableIds === null || this.renderableIds.has(cardId)
    return renderable && (this.hoveredCardId === cardId || this.isAutoplayCard(cardId))
  }

  private isAutoplayCard(cardId: string): boolean {
    return this.metaAutoplayIds.has(cardId) || this.manualAutoplayIds.has(cardId)
  }

  /** Mark a card as manually active (for commands like /play). */
  markAutoplay(cardId: string) {
    this.manualAutoplayIds.add(cardId)
  }

  /** Clear command-driven autoplay without changing card metadata. */
  clearAutoplay(cardId: string) {
    this.manualAutoplayIds.delete(cardId)
  }

  /** Explicitly set metadata-driven autoplay state. */
  setAutoplay(cardId: string, enabled: boolean) {
    if (enabled) this.metaAutoplayIds.add(cardId)
    else this.metaAutoplayIds.delete(cardId)
  }

  /** Update the cards that are worth animating on the next tick. */
  setRenderableCards(cardIds: Iterable<string>): void {
    this.renderableIds = new Set(cardIds)
  }

  private markFrameDirty(cardId: string): void {
    this.frameVersion.set(cardId, (this.frameVersion.get(cardId) ?? 0) + 1)
  }

  private markRuntimePosterReady(cardId: string): void {
    this.markFrameDirty(cardId)
    this.dirty.add(cardId)
  }

  setLayerRect(cardId: string, rect: AnimationLayerRect): void {
    this.layerRects.set(cardId, {
      x: rect.x,
      y: rect.y,
      w: rect.w,
      h: rect.h,
      radius: rect.radius ?? 6,
      fit: rect.fit ?? 'fill',
    })
  }

  getRuntimeLayer(cardId: string): RuntimeAnimationLayer | null {
    if (!this.isActive(cardId)) return null
    const rect = this.layerRects.get(cardId)
    if (!rect) return null

    const state = this.states.get(cardId)
    let source: TexImageSource | null = null
    let sourceW = 0
    let sourceH = 0

    if (state?.kind === 'image' && state.animated && state.loaded) {
      source = state.img
      sourceW = state.img.naturalWidth
      sourceH = state.img.naturalHeight
    } else if (state?.kind === 'lottie' && state.canvas && !state.loading && !state.error) {
      source = state.canvas
      sourceW = state.canvas.width
      sourceH = state.canvas.height
    } else if (state?.kind === 'three') {
      source = state.canvas
      sourceW = state.canvas.width
      sourceH = state.canvas.height
    } else if (state?.kind === 'live2d' && !state.loading && !state.error) {
      source = state.canvas
      sourceW = state.canvas.width
      sourceH = state.canvas.height
    }

    if (!source || sourceW <= 0 || sourceH <= 0) return null
    return {
      cardId,
      source,
      sourceW,
      sourceH,
      version: this.frameVersion.get(cardId) ?? 0,
      ...rect,
    }
  }

  // ── Unified tick — called by DeskLoop every RAF ───────────

  tick(timestamp: number): void {
    animationScheduler.beginFrame(timestamp)

    // 1. Render all Three.js scenes — only when hovered or autoplay
    for (const [id, state] of this.states) {
      if (state.kind !== 'three') continue
      if (!this.isActive(id)) continue
      const hovered = this.hoveredCardId === id
      if (
        !animationScheduler.shouldTick({
          cardId: id,
          kind: 'three',
          hovered,
          autoplay: this.isAutoplayCard(id),
          timestamp,
        })
      ) {
        continue
      }
      const elapsed = timestamp - state.startTime
      state.tick(elapsed)
      this.renderThreeFrame(state)
      this.markFrameDirty(id)
    }

    // 2. Countdown: mark dirty when wall-clock second changes
    const second = Math.floor(timestamp / 1000)
    if (second !== this.lastSecond) {
      this.lastSecond = second
      for (const [id, state] of this.states) {
        if (state.kind === 'countdown') this.dirty.add(id)
      }
    }

    // 3. Animated images (GIFs): mark dirty only when active
    for (const [id, state] of this.states) {
      if (state.kind === 'image' && state.loaded && state.animated && this.isActive(id)) {
        const hovered = this.hoveredCardId === id
        if (
          animationScheduler.shouldMarkFrame({
            cardId: id,
            kind: 'gif',
            hovered,
            autoplay: this.isAutoplayCard(id),
            timestamp,
          })
        ) {
          this.markFrameDirty(id)
        }
      }
    }

    // 4. Live2D: render only when active
    // Drive Live2D animation updates manually (PIXI ticker is stopped; we own the clock).
    // Then render due active models directly to the shared PIXI canvas (no RenderTexture
    // extract → avoids gl.readPixels GPU stall). Sampling stays below the main RAF rate.
    if (this.pixiApp) {
      const activeLive2D: [string, Live2DState][] = []
      for (const [id, state] of this.states) {
        if (
          state.kind === 'live2d' &&
          !state.loading &&
          !state.error &&
          state.model &&
          this.isActive(id)
        ) {
          activeLive2D.push([id, state as Live2DState])
        }
      }
      const dueLive2D: [string, Live2DState][] = []
      for (const [id, state] of activeLive2D) {
        const hovered = this.hoveredCardId === id
        if (
          !animationScheduler.shouldTick({
            cardId: id,
            kind: 'live2d',
            hovered,
            autoplay: this.isAutoplayCard(id),
            timestamp,
          })
        ) {
          continue
        }
        this._live2dLastRender.set(id, timestamp)
        dueLive2D.push([id, state])
      }

      if (dueLive2D.length > 0) {
        // Tick PIXI Ticker manually so Live2D models update their skeletons/physics
        this.pixiRuntime?.tick(timestamp)
        for (const [id, state] of dueLive2D) {
          this.renderLive2DFrame(state)
          this.markFrameDirty(id)
        }
      }
    }
  }

  // ── Dirty set ────────────────────────────────────────────

  isDirty(cardId: string): boolean {
    return this.dirty.has(cardId)
  }

  clearDirty(cardId: string): void {
    this.dirty.delete(cardId)
  }

  markDirty(cardId: string): void {
    this.dirty.add(cardId)
  }

  // ── Lottie ───────────────────────────────────────────────

  registerLottie(
    cardId: string,
    src: string,
    loop = true,
    autoplay = false,
  ): HTMLCanvasElement | null {
    // Track metadata autoplay without clobbering command-driven /play state.
    this.setAutoplay(cardId, autoplay)

    const existing = this.states.get(cardId)
    if (existing?.kind === 'lottie') {
      // If autoplay state changed, sync play/pause
      if (existing.item) {
        if (this.isActive(cardId)) existing.item.play()
        else existing.item.pause()
      }
      return existing.canvas
    }

    if (!this.mountEl) return null

    const container = document.createElement('div')
    container.dataset.cardId = cardId
    container.style.cssText =
      'position:absolute;left:-9999px;top:0;width:300px;height:400px;overflow:hidden;pointer-events:none'
    this.mountEl.appendChild(container)

    const state: LottieState = {
      kind: 'lottie',
      container,
      canvas: null,
      item: null,
      loading: true,
      error: false,
    }
    this.states.set(cardId, state)

    import('lottie-web').then(({ default: lottie }) => {
      try {
        const item = lottie.loadAnimation({
          container,
          renderer: 'canvas',
          loop: loop,
          autoplay: false, // always start paused; hover or autoplay drives playback
          path: src,
          rendererSettings: {
            clearCanvas: true,
            progressiveLoad: false,
          },
        })
        state.item = item

        item.addEventListener('DOMLoaded', () => {
          state.canvas = container.querySelector('canvas')
          state.loading = false
          // Start playing only if active
          if (this.isActive(cardId)) item.play()
          else {
            try {
              const posterFrame = Math.floor((item.totalFrames || 1) * 0.35)
              item.goToAndStop(posterFrame, true)
            } catch {
              /* first-frame poster is best-effort */
            }
          }
          this.markRuntimePosterReady(cardId)
        })

        // Mark each rendered frame so the dynamic GPU layer can upload it.
        item.addEventListener('enterFrame', () => {
          if (state.canvas && this.isActive(cardId)) {
            const timestamp = performance.now()
            if (
              animationScheduler.shouldMarkFrame({
                cardId,
                kind: 'lottie',
                hovered: this.hoveredCardId === cardId,
                autoplay: this.isAutoplayCard(cardId),
                timestamp,
              })
            ) {
              this.markFrameDirty(cardId)
            }
          }
        })

        item.addEventListener('error', () => {
          state.error = true
          state.loading = false
        })
      } catch {
        state.error = true
        state.loading = false
      }
    })

    return null
  }

  getLottieCanvas(cardId: string): HTMLCanvasElement | null {
    const s = this.states.get(cardId)
    if (s?.kind === 'lottie' && !s.loading && !s.error) return s.canvas
    return null
  }

  isLottieLoading(cardId: string): boolean {
    const s = this.states.get(cardId)
    return s?.kind === 'lottie' ? s.loading : false
  }

  // ── Three.js ─────────────────────────────────────────────

  registerThree(
    cardId: string,
    w: number,
    h: number,
    setupFn: (
      scene: THREE.Scene,
      camera: THREE.PerspectiveCamera,
      renderer: THREE.WebGLRenderer,
    ) => void,
    tickFn: (elapsed: number) => void,
  ): HTMLCanvasElement {
    const existing = this.states.get(cardId)
    if (existing?.kind === 'three') return existing.canvas

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.style.cssText = 'position:absolute;left:-9999px;pointer-events:none'
    this.mountEl?.appendChild(canvas)

    const runtime = getSharedThreeRuntime(this.mountEl)
    this.threeRuntime = runtime

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 1000)
    camera.position.set(0, 0, 3)

    setupFn(scene, camera, runtime.renderer)

    const state: ThreeState = {
      kind: 'three',
      canvas,
      scene,
      camera,
      tick: tickFn,
      startTime: performance.now(),
      w,
      h,
    }
    this.states.set(cardId, state)

    // Render one static frame immediately so the card has a non-empty texture
    // on its first bake (before any hover/autoplay event).
    state.tick(0)
    this.renderThreeFrame(state)
    this.markRuntimePosterReady(cardId)

    return canvas
  }

  getThreeCanvas(cardId: string): HTMLCanvasElement | null {
    const s = this.states.get(cardId)
    return s?.kind === 'three' ? s.canvas : null
  }

  private renderThreeFrame(state: ThreeState): void {
    const runtime = this.threeRuntime ?? getSharedThreeRuntime(this.mountEl)
    this.threeRuntime = runtime
    runtime.renderToCanvas(state.scene, state.camera, state.canvas, state.w, state.h)
  }

  // ── Static / Animated Images ─────────────────────────────

  /**
   * Register an image URL for a card. Returns the img element once loaded, null while loading.
   * Set animated=true for GIFs so the card is re-blitted each frame.
   */
  registerImage(
    cardId: string,
    url: string,
    animated = false,
    autoplay = false,
  ): HTMLImageElement | null {
    if (animated) this.setAutoplay(cardId, autoplay)
    const existing = this.states.get(cardId)
    if (existing?.kind === 'image') {
      return existing.loaded ? existing.img : null
    }

    const img = new Image()
    img.crossOrigin = 'anonymous'
    const state: ImageState = { kind: 'image', img, loaded: false, animated }
    this.states.set(cardId, state)

    img.onload = () => {
      state.loaded = true
      if (animated) this.markRuntimePosterReady(cardId)
      else this.dirty.add(cardId)
    }
    img.onerror = () => {
      // Leave as loaded: false — systems should handle gracefully
      state.loaded = false
    }
    img.src = url

    return null
  }

  getImage(cardId: string): HTMLImageElement | null {
    const s = this.states.get(cardId)
    return s?.kind === 'image' && s.loaded ? s.img : null
  }

  // ── Live2D ───────────────────────────────────────────────

  /**
   * Register a Live2D model URL for a card.
   * Uses a SINGLE shared PixiJS Application (one WebGL context for all cards).
   * Each card renders to the shared PIXI canvas sequentially; pixels are copied
   * to a per-card 2D canvas via drawImage (GPU compositor path — no gl.readPixels stall).
   */
  registerLive2D(
    cardId: string,
    modelUrl: string,
    w: number,
    h: number,
    autoMotion = true,
  ): HTMLCanvasElement | null {
    const existing = this.states.get(cardId)
    if (existing?.kind === 'live2d') return existing.loading ? null : existing.canvas

    // Per-card 2D canvas that we blit image data into
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.style.cssText = 'position:absolute;left:-9999px;pointer-events:none'
    this.mountEl?.appendChild(canvas)

    const state: Live2DState = {
      kind: 'live2d',
      canvas,
      renderTexture: null,
      model: null,
      loading: true,
      error: false,
      w,
      h,
    }
    this.states.set(cardId, state)

    this._getPixiApp()
      .then(([PIXI, Live2DModel]: [any, any]) => {
        Live2DModel.from(modelUrl, { autoInteract: false })
          .then((model: any) => {
            state.model = model
            // Scale to fit with slight padding (contain ratio)
            const origW = model.width,
              origH = model.height
            const scale = Math.min(w / origW, h / origH) * 0.92
            model.scale.set(scale)
            model.x = (w - model.width) / 2
            model.y = (h - model.height) / 2

            // No per-card RenderTexture needed — we render directly to the PIXI canvas.
            // Wrap model in a container for clean transform isolation.
            const container = new PIXI.Container()
            container.addChild(model)
            state.model._container = container

            if (autoMotion) {
              try {
                model.motion('idle')
              } catch {
                /* no idle group */
              }
            }
            state.loading = false
            this.renderLive2DFrame(state)
            this.markRuntimePosterReady(cardId)
          })
          .catch(() => {
            state.error = true
            state.loading = false
          })
      })
      .catch(() => {
        state.error = true
        state.loading = false
      })

    return null
  }

  /** Initialize (or return cached) shared PixiJS Application. */
  private _getPixiApp(): Promise<[any, any]> {
    return getSharedPixiRuntime(this.mountEl).then((runtime) => {
      this.pixiRuntime = runtime
      this.pixiApp = runtime.app
      return [runtime.PIXI, runtime.Live2DModel]
    })
  }

  getLive2DCanvas(cardId: string): HTMLCanvasElement | null {
    const s = this.states.get(cardId)
    return s?.kind === 'live2d' && !s.loading && !s.error ? s.canvas : null
  }

  isLive2DLoading(cardId: string): boolean {
    const s = this.states.get(cardId)
    return s?.kind === 'live2d' ? s.loading : false
  }

  /**
   * Forward pointer position to Live2D model for face/body tracking.
   * lx, ly: normalized card-local coords (-0.5..0.5)
   */
  focusLive2D(cardId: string, lx: number, ly: number): void {
    const s = this.states.get(cardId)
    if (s?.kind !== 'live2d' || !s.model) return
    const cx = (0.5 + lx) * s.w
    const cy = (0.5 + ly) * s.h
    try {
      s.model.focus(cx, cy)
    } catch {
      /* ignore */
    }
  }

  private renderLive2DFrame(state: Live2DState): void {
    if (!this.pixiRuntime || !state.model || state.loading || state.error) return
    const container = state.model._container ?? state.model
    this.pixiRuntime.renderToCanvas(container, state.canvas, state.w, state.h)
  }

  // ── Countdown ────────────────────────────────────────────

  registerCountdown(cardId: string) {
    if (this.states.has(cardId)) return
    this.states.set(cardId, { kind: 'countdown' })
    // Mark dirty immediately so first render shows current time
    this.dirty.add(cardId)
  }

  // ── Preload ──────────────────────────────────────────────

  /**
   * Eagerly start loading animation assets for a card so they are
   * ready by the time the card first enters the viewport.
   * Safe to call multiple times — internally deduplicates.
   */
  preregisterCard(card: { id: string; kind: string; meta?: Record<string, unknown> | null }): void {
    const meta = card.meta as Record<string, unknown> | undefined | null
    if (!meta) return
    switch (card.kind) {
      case 'gif':
        if (
          typeof meta.src === 'string' &&
          meta.src &&
          (meta.autoplay === true || meta.preload === true)
        ) {
          this.registerImage(card.id, meta.src, true, meta.autoplay === true)
        }
        break
      case 'image':
        // Static image cards are owned by ArtLayerManager, not animation state.
        break
      case 'lottie':
        if (
          typeof meta.src === 'string' &&
          meta.src &&
          (meta.autoplay === true || meta.preload === true)
        ) {
          this.registerLottie(card.id, meta.src, meta.loop !== false, meta.autoplay === true)
        }
        break
      case 'threed':
      case 'live2d':
        if (meta.autoplay === true || meta.preload === true) {
          this.prepareRuntimeCard(card as Pick<Card, 'id' | 'kind' | 'meta'>)
        }
        break
      case 'person':
        if (typeof meta.avatar === 'string' && meta.avatar) {
          this.registerImage(card.id, meta.avatar, false)
        }
        break
    }
  }

  prepareRuntimeCard(card: Pick<Card, 'id' | 'kind' | 'meta'>): void {
    const meta = card.meta as Record<string, unknown> | undefined | null
    if (!meta) return
    switch (card.kind) {
      case 'gif':
        if (typeof meta.src === 'string' && meta.src) {
          this.registerImage(card.id, meta.src, true, meta.autoplay === true)
        }
        break
      case 'lottie':
        if (typeof meta.src === 'string' && meta.src) {
          this.registerLottie(card.id, meta.src, meta.loop !== false, meta.autoplay === true)
        }
        break
      case 'threed':
        this.prepareThreeRuntimeCard(card.id, meta)
        break
      case 'live2d':
        this.prepareLive2DRuntimeCard(card.id, meta)
        break
    }
  }

  private prepareThreeRuntimeCard(cardId: string, meta: Record<string, unknown>): void {
    const sceneKey = typeof meta.scene === 'string' ? meta.scene : ''
    if (!sceneKey || !hasThreeScenePreset(sceneKey)) return
    if (this.states.get(cardId)?.kind === 'three') return

    const contentW = CARD_W - CARD_PAD * 2
    const w = Math.round(contentW * 2)
    const h = Math.round(contentW * 1.1 * 2)
    const style = resolveStyle('threed')
    const runtime = createThreeSceneRuntime({
      cardId,
      sceneKey,
      color: typeof meta.color === 'string' ? meta.color : style.accentColor,
      color2: typeof meta.color2 === 'string' ? meta.color2 : '#ffffff',
      wireframe: meta.wireframe === true,
      textureMeta: {
        ktx2: typeof meta.ktx2 === 'string' ? meta.ktx2 : undefined,
        basis: typeof meta.basis === 'string' ? meta.basis : undefined,
        fallbackSrc: typeof meta.fallbackSrc === 'string' ? meta.fallbackSrc : undefined,
        compressed: parseCompressedImageMeta(meta.compressed),
      },
      onFrameDirty: () => {
        const state = this.states.get(cardId)
        if (state?.kind === 'three') this.renderThreeFrame(state)
        this.markRuntimePosterReady(cardId)
      },
    })

    this.registerThree(cardId, w, h, runtime.setup, runtime.tick)
  }

  private prepareLive2DRuntimeCard(cardId: string, meta: Record<string, unknown>): void {
    const modelUrl = typeof meta.modelUrl === 'string' ? meta.modelUrl : ''
    if (!modelUrl) return
    if (this.states.get(cardId)?.kind === 'live2d') return

    const contentW = CARD_W - CARD_PAD * 2
    const viewH = Math.min(CARD_H - CARD_PAD * 2 - 8, contentW * 1.4)
    this.registerLive2D(
      cardId,
      modelUrl,
      Math.round(contentW * 1.5),
      Math.round(viewH * 1.5),
      meta.autoMotion !== false,
    )
  }

  // ── Lifecycle ────────────────────────────────────────────

  destroy(cardId: string) {
    this.metaAutoplayIds.delete(cardId)
    this.manualAutoplayIds.delete(cardId)
    animationScheduler.resetCard(cardId)
    this.frameVersion.delete(cardId)
    this.layerRects.delete(cardId)
    this._live2dLastRender.delete(cardId)
    const state = this.states.get(cardId)
    if (!state) return
    if (state.kind === 'lottie') {
      state.item?.destroy()
      state.container.remove()
    } else if (state.kind === 'three') {
      disposeThreeState(state)
      state.canvas.remove()
    } else if (state.kind === 'image') {
      state.img.src = ''
    } else if (state.kind === 'live2d') {
      try {
        state.renderTexture?.destroy()
      } catch {
        /* ignore */
      }
      try {
        state.model?.destroy()
      } catch {
        /* ignore */
      }
      state.canvas.remove()
    }
    this.dirty.delete(cardId)
    this.states.delete(cardId)
  }

  destroyAll() {
    const ids = [...this.states.keys()]
    ids.forEach((id) => this.destroy(id))
    this.renderableIds = null
    animationScheduler.reset()
    this.frameVersion.clear()
    this.layerRects.clear()
    this._live2dLastRender.clear()
    this.pixiApp = null
    this.pixiRuntime = null
    this.threeRuntime = null
    resetSharedPixiRuntime()
    resetSharedThreeRuntime()
  }
}

const MATERIAL_TEXTURE_KEYS = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'emissiveMap',
  'alphaMap',
  'aoMap',
  'bumpMap',
  'displacementMap',
  'envMap',
] as const

function disposeThreeState(state: ThreeState): void {
  state.scene.traverse((object) => {
    const mesh = object as THREE.Mesh
    mesh.geometry?.dispose()

    const material = mesh.material
    if (!material) return
    const materials = Array.isArray(material) ? material : [material]
    for (const item of materials) disposeThreeMaterial(item)
  })
}

function disposeThreeMaterial(material: THREE.Material): void {
  const record = material as THREE.Material &
    Partial<Record<(typeof MATERIAL_TEXTURE_KEYS)[number], THREE.Texture>>
  for (const key of MATERIAL_TEXTURE_KEYS) {
    record[key]?.dispose()
  }
  material.dispose()
}

function parseCompressedImageMeta(value: unknown): CompressedImageMeta | undefined {
  if (!value || typeof value !== 'object') return undefined
  const source = value as Record<string, unknown>
  const colorSpace =
    source.colorSpace === 'srgb' || source.colorSpace === 'linear' ? source.colorSpace : undefined

  return {
    ktx2: typeof source.ktx2 === 'string' ? source.ktx2 : undefined,
    basis: typeof source.basis === 'string' ? source.basis : undefined,
    fallback: typeof source.fallback === 'string' ? source.fallback : undefined,
    width: typeof source.width === 'number' ? source.width : undefined,
    height: typeof source.height === 'number' ? source.height : undefined,
    colorSpace,
  }
}

export const animationManager = new AnimationManager()
