// AnimationManager v2 — unified tick architecture
//
// DeskLoop calls animationManager.tick(timestamp) at the START of each
// RAF step, BEFORE the card render pass.  This ensures:
//
//  Three.js:  scenes are rendered synchronously inside tick(), so the
//             canvas holds a fresh frame when threeSystem does drawImage.
//             preserveDrawingBuffer: true prevents UA from clearing the
//             WebGL buffer between the Three.js render and drawImage.
//
//  Lottie:    lottie-web drives its own RAF; its enterFrame event marks
//             the card dirty so glTextureSystem forces a cache-bust.
//
//  Countdown: tick() detects the wall-clock second change and marks
//             countdown cards dirty.
//
// glTextureSystem reads isDirty(id) → removeCachedTexture(id) → normal
// runPipeline path → threeSystem/lottieSystem blits fresh canvas → upload.

import type { AnimationItem } from 'lottie-web'
import * as THREE from 'three'

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
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  tick: (elapsed: number) => void
  startTime: number
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

// ─────────────────────────────────────
// AnimationManager
// ─────────────────────────────────────

class AnimationManager {
  private states = new Map<string, AnimState>()
  private dirty = new Set<string>()
  private mountEl: HTMLElement | null = null
  private lastSecond = -1
  /** Currently hovered card id — only this card (+ autoplay cards) animate */
  private hoveredCardId: string | null = null
  /** Cards that always animate regardless of hover */
  private autoplayIds = new Set<string>()
  // Shared PixiJS application — ONE WebGL context for all Live2D cards
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private pixiApp: any = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private pixiInitPromise: Promise<any> | null = null

  setMountElement(el: HTMLElement) {
    this.mountEl = el
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
      if (s?.kind === 'lottie' && s.item && !this.autoplayIds.has(prev)) {
        s.item.pause()
      }
    }
    // Resume newly hovered lottie
    if (cardId) {
      const s = this.states.get(cardId)
      if (s?.kind === 'lottie' && s.item) {
        s.item.play()
      }
      // Mark dirty immediately so the card re-bakes on the very next frame
      // (GIF / Three.js will also start animating via tick(), but the first
      //  dirty mark ensures we don't skip a frame waiting for enterFrame events)
      this.dirty.add(cardId)
    }
  }

  /** Returns true if a card should animate this frame */
  private isActive(cardId: string): boolean {
    return this.hoveredCardId === cardId || this.autoplayIds.has(cardId)
  }

  /** Mark a card as always-active (autoplay) */
  markAutoplay(cardId: string) {
    this.autoplayIds.add(cardId)
  }

  // ── Unified tick — called by DeskLoop every RAF ───────────

  tick(timestamp: number): void {
    // 1. Render all Three.js scenes — only when hovered or autoplay
    for (const [id, state] of this.states) {
      if (state.kind !== 'three') continue
      if (!this.isActive(id)) continue
      const elapsed = timestamp - state.startTime
      state.tick(elapsed)
      state.renderer.render(state.scene, state.camera)
      this.dirty.add(id)
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
      if (state.kind === 'image' && state.loaded && state.animated && this.isActive(id))
        this.dirty.add(id)
    }

    // 4. Live2D: render only when active
    if (this.pixiApp) {
      const renderer = this.pixiApp.renderer
      for (const [id, state] of this.states) {
        if (
          state.kind !== 'live2d' ||
          state.loading ||
          state.error ||
          !state.model ||
          !state.renderTexture
        )
          continue
        if (!this.isActive(id)) continue
        const container = state.model._container ?? state.model
        renderer.render(container, { renderTexture: state.renderTexture, clear: true })
        const extracted: HTMLCanvasElement = renderer.extract.canvas(state.renderTexture)
        const ctx2d = state.canvas.getContext('2d')
        if (ctx2d && extracted) {
          ctx2d.clearRect(0, 0, state.w, state.h)
          ctx2d.drawImage(extracted, 0, 0)
        }
        this.dirty.add(id)
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
    // Track autoplay preference
    if (autoplay) this.autoplayIds.add(cardId)
    else this.autoplayIds.delete(cardId)

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
          this.dirty.add(cardId)
        })

        // Mark dirty on every rendered frame so glTextureSystem re-uploads
        item.addEventListener('enterFrame', () => {
          if (state.canvas) this.dirty.add(cardId)
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
    setupFn: (scene: THREE.Scene, camera: THREE.PerspectiveCamera) => void,
    tickFn: (elapsed: number) => void,
  ): HTMLCanvasElement {
    const existing = this.states.get(cardId)
    if (existing?.kind === 'three') return existing.canvas

    // Enforce WebGL context limit — browsers cap at ~8; keep 6 max
    const threeCount = [...this.states.values()].filter((s) => s.kind === 'three').length
    if (threeCount >= 6) {
      // Return a tiny placeholder canvas rather than creating another WebGL context
      const placeholder = document.createElement('canvas')
      placeholder.width = w
      placeholder.height = h
      return placeholder
    }

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.style.cssText = 'position:absolute;left:-9999px;pointer-events:none'
    this.mountEl?.appendChild(canvas)

    // preserveDrawingBuffer: true ensures the canvas is readable after
    // the WebGL frame is composited — critical for ctx.drawImage() in threeSystem
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    })
    renderer.setSize(w, h, false)
    renderer.setPixelRatio(1)
    renderer.setClearColor(0x000000, 0)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 1000)
    camera.position.set(0, 0, 3)

    setupFn(scene, camera)

    const state: ThreeState = {
      kind: 'three',
      canvas,
      renderer,
      scene,
      camera,
      tick: tickFn,
      startTime: performance.now(),
    }
    this.states.set(cardId, state)

    // Render one static frame immediately so the card has a non-empty texture
    // on its first bake (before any hover/autoplay event).
    state.tick(0)
    renderer.render(scene, camera)
    this.dirty.add(cardId)

    return canvas
  }

  getThreeCanvas(cardId: string): HTMLCanvasElement | null {
    const s = this.states.get(cardId)
    return s?.kind === 'three' ? s.canvas : null
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
    if (animated && autoplay) this.autoplayIds.add(cardId)
    else if (animated && !autoplay) this.autoplayIds.delete(cardId)
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
      this.dirty.add(cardId)
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
   * Each card gets its own RenderTexture; we extract pixels and draw to a 2D canvas.
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

            // Create a RenderTexture for this card
            state.renderTexture = PIXI.RenderTexture.create({ width: w, height: h })

            // Add model to a temporary container for rendering
            const container = new PIXI.Container()
            container.addChild(model)
            state.model._container = container // store for tick

            if (autoMotion) {
              try {
                model.motion('idle')
              } catch {
                /* no idle group */
              }
            }
            state.loading = false
            this.dirty.add(cardId)
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
    if (this.pixiInitPromise) return this.pixiInitPromise
    this.pixiInitPromise = Promise.all([
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      import('pixi.js'),
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      import('pixi-live2d-display/cubism4').then((m: any) => m.Live2DModel),
    ]).then(([PIXI, Live2DModel]) => {
      // Fix CORS: pixi-live2d-display v0.4 uses the legacy PIXI.Loader internally.
      // Without crossOrigin='anonymous', WebGL's texImage2D throws SecurityError for
      // cross-origin CDN textures (tainted canvas).
      if (PIXI.Loader?.shared) {
        PIXI.Loader.shared.pre((resource: any, next: any) => {
          resource.crossOrigin = 'anonymous'
          next()
        })
      }
      // Also patch PIXI v7 Assets loader if present
      if (PIXI.Assets?.setPreferences) {
        PIXI.Assets.setPreferences({ crossOrigin: 'anonymous' })
      }
      Live2DModel.registerTicker(PIXI.Ticker)
      if (!this.pixiApp) {
        // 1×1 off-screen canvas — we render to RenderTextures, not this canvas
        const offscreen = document.createElement('canvas')
        offscreen.width = 1
        offscreen.height = 1
        offscreen.style.cssText = 'position:absolute;left:-9999px;pointer-events:none'
        this.mountEl?.appendChild(offscreen)
        this.pixiApp = new PIXI.Application({
          view: offscreen,
          width: 1,
          height: 1,
          backgroundAlpha: 0,
          antialias: true,
          resolution: 1,
        })
        // Let PIXI manage its own RAF for model animation
        this.pixiApp.ticker.start()
      }
      return [PIXI, Live2DModel]
    })
    return this.pixiInitPromise
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
        if (typeof meta.src === 'string' && meta.src) {
          this.registerImage(card.id, meta.src, true, meta.autoplay === true)
        }
        break
      case 'image':
        if (typeof meta.src === 'string' && meta.src) {
          this.registerImage(card.id, meta.src, false)
        }
        break
      case 'lottie':
        if (typeof meta.src === 'string' && meta.src) {
          this.registerLottie(card.id, meta.src, meta.loop !== false, meta.autoplay === true)
        }
        break
      case 'person':
        if (typeof meta.avatar === 'string' && meta.avatar) {
          this.registerImage(card.id, meta.avatar, false)
        }
        break
    }
  }

  // ── Lifecycle ────────────────────────────────────────────

  destroy(cardId: string) {
    this.autoplayIds.delete(cardId)
    const state = this.states.get(cardId)
    if (!state) return
    if (state.kind === 'lottie') {
      state.item?.destroy()
      state.container.remove()
    } else if (state.kind === 'three') {
      state.renderer.dispose()
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
  }
}

export const animationManager = new AnimationManager()
