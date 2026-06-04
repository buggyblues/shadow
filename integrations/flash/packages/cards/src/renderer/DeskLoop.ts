// ══════════════════════════════════════════════════════════════
// DeskLoop — ECS orchestrator
//
// Owns the full physics-desk runtime:
//   PhysicsWorld + CardRenderer + DeskInputHandler
//
// Zero React dependencies. The React component creates one
// instance, calls syncCards() on card changes, and destroys
// it on unmount via a plain useEffect cleanup.
// ══════════════════════════════════════════════════════════════

import type { Card } from '@shadowob/flash-types'
import Matter from 'matter-js'
import {
  type CardCommand,
  type CommandContext,
  type CommandName,
  type CommandResult,
  dispatchCommand as dispatchCmd,
  parseCommand,
  tickCommands,
} from '../commands'
import { CARD_SPACING_X, CARD_SPACING_Y } from '../constants'
import { animationManager } from '../resources/animationManager'
import { cardAssetPipeline } from '../resources/assetPipeline'
import type {
  CardTransformSnapshot,
  DeskInputCallbacks,
  ViewportSnapshot,
} from '../resources/deskInputHandler'
import { DeskInputHandler } from '../resources/deskInputHandler'
import { FrameGovernor, type FrameGovernorOptions } from '../resources/frameGovernor'
import { ktx2Runtime } from '../resources/ktx2Runtime'
import { createPhysicsWorld, destroyPhysicsWorld } from '../resources/physicsWorld'
import { renderBudgetGovernor } from '../resources/renderBudget'
import { getTextureCacheStats } from '../resources/textureCache'
import { arenaStore } from '../systems/scene/arenaSystem'
import { physicsStep, seedBodies, syncBodies } from '../systems/scene/bodyLifecycleSystem'
import { CardRenderer, type CardRendererOptions, type RenderBackend } from './CardRenderer'

export type {
  CardCommand,
  CardTransformSnapshot,
  CommandName,
  CommandResult,
  DeskInputCallbacks,
  ViewportSnapshot,
}

export interface DeskLoopStats {
  fps: number
  frameMs: number
  physicsMs: number
  renderMs: number
  cardCount: number
  backend: RenderBackend
  dpr: number
  textureCacheEntries: number
  textureCacheBytes: number
  assetUploads: number
  assetUploadBytes: number
  assetSkippedUploads: number
  compressedTextureCandidates: number
  ktx2TextureCacheEntries: number
  animationTicks: number
  animationFrameMarks: number
  animationSkippedTicks: number
  physicsSteps: number
  physicsDroppedMs: number
  locallyControlledCards: number
  frameP95Ms: number
  overBudgetFrames: number
  renderQualityTier: string
  recommendedTextureUploadMaxUploads: number
  recommendedTextureUploadMaxBytes: number
  recommendedAnimationMaxTicks: number
}

function safeCards(cards: Card[] | null | undefined): Card[] {
  return Array.isArray(cards) ? cards.filter((card): card is Card => Boolean(card?.id)) : []
}

function hiddenCardIds(cards: Card[] | null | undefined) {
  return new Set(
    safeCards(cards)
      .filter((card) => {
        const direct = (card as Card & { layout?: { hidden?: boolean } }).layout
        if (direct?.hidden === true) return true
        const meta = card.meta as { layout?: { hidden?: boolean } } | null
        return meta?.layout?.hidden === true
      })
      .map((card) => card.id),
  )
}

export interface DeskLoopOptions {
  renderer?: CardRendererOptions
  physics?: Partial<FrameGovernorOptions>
  /** How long to keep locally committed transforms immune to old server echo. */
  localEchoHoldMs?: number
}

export class DeskLoop {
  private renderer: CardRenderer | null = null
  private physicsWorld = createPhysicsWorld()
  private inputHandler: DeskInputHandler | null = null
  private rafId = 0
  private size = { w: 0, h: 0 }
  private resizeObserver: ResizeObserver | null = null
  private initObserver: ResizeObserver | null = null
  private cards: Card[] = []
  private callbacks: DeskInputCallbacks = {}
  private stats: DeskLoopStats = {
    fps: 0,
    frameMs: 0,
    physicsMs: 0,
    renderMs: 0,
    cardCount: 0,
    backend: 'pending',
    dpr: 1,
    textureCacheEntries: 0,
    textureCacheBytes: 0,
    assetUploads: 0,
    assetUploadBytes: 0,
    assetSkippedUploads: 0,
    compressedTextureCandidates: 0,
    ktx2TextureCacheEntries: 0,
    animationTicks: 0,
    animationFrameMarks: 0,
    animationSkippedTicks: 0,
    physicsSteps: 0,
    physicsDroppedMs: 0,
    locallyControlledCards: 0,
    frameP95Ms: 0,
    overBudgetFrames: 0,
    renderQualityTier: 'high',
    recommendedTextureUploadMaxUploads: 6,
    recommendedTextureUploadMaxBytes: 16 * 1024 * 1024,
    recommendedAnimationMaxTicks: 22,
  }
  private statsWindowStart = 0
  private statsFrames = 0
  private options: DeskLoopOptions
  private frameGovernor: FrameGovernor
  private localControlIds = new Set<string>()
  private localLayoutPreserveUntil = new Map<string, number>()
  /** Constraint map for /link rope connections */
  private constraintsMap = new Map<string, Matter.Constraint>()
  /**
   * Arena store — module-level ECS resource.
   * Exposes same interface as the old ArenaManager for backward compat.
   */
  readonly arenaManager = arenaStore
  /** External callbacks for command results */
  private commandCallbacks: {
    onCardRemoved?: (cardId: string) => void
    onCardAdded?: (card: Card) => void
    onScanResult?: (cardId: string, nearby: Array<{ id: string; distance: number }>) => void
  } = {}

  constructor(options: DeskLoopOptions = {}) {
    this.options = options
    this.frameGovernor = new FrameGovernor(options.physics)
  }

  // ── Init ────────────────────────────────────────────────────

  /**
   * Attach to a canvas + container. If the container has no dimensions yet,
   * waits via ResizeObserver before initialising. Safe to call immediately
   * after refs are set.
   */
  mount(
    canvas: HTMLCanvasElement,
    container: HTMLDivElement,
    cards: Card[],
    callbacks: DeskInputCallbacks,
  ): void {
    const initialCards = safeCards(cards)
    const w = container.clientWidth
    const h = container.clientHeight
    if (w > 0 && h > 0) {
      this.init(canvas, container, initialCards, callbacks)
    } else {
      this.initObserver = new ResizeObserver(([entry]) => {
        const { width, height } = entry.contentRect
        if (width > 0 && height > 0) {
          this.initObserver!.disconnect()
          this.initObserver = null
          this.init(canvas, container, initialCards, callbacks)
        }
      })
      this.initObserver.observe(container)
    }
  }

  /**
   * Call once the container + canvas have non-zero dimensions.
   * Returns false if WebGL init fails.
   */
  private init(
    canvas: HTMLCanvasElement,
    container: HTMLDivElement,
    cards: Card[],
    callbacks: DeskInputCallbacks,
  ): boolean {
    const initialCards = safeCards(cards)
    this.callbacks = this.wrapInputCallbacks(callbacks)
    this.cards = initialCards

    try {
      this.renderer = new CardRenderer(canvas, this.options.renderer)
      const w = container.clientWidth
      const h = container.clientHeight
      this.size = { w, h }
      this.renderer.resize(w, h)
    } catch (err) {
      console.error('DeskLoop: WebGL init failed', err)
      return false
    }

    // Seed physics bodies
    seedBodies(this.physicsWorld, initialCards)

    // Input handler (sets up mouse constraint internally)
    this.inputHandler = new DeskInputHandler(
      container,
      this.renderer,
      this.physicsWorld,
      this.callbacks,
    )
    this.inputHandler.setupMouseConstraint()
    this.inputHandler.updateCards(initialCards)

    // Resize observer
    this.resizeObserver = new ResizeObserver(([entry]) => {
      const { width: w, height: h } = entry.contentRect
      if (w === 0 || h === 0) return
      if (Math.abs(w - this.size.w) < 5 && Math.abs(h - this.size.h) < 5) return
      this.size = { w, h }
      this.renderer?.resize(w, h)
    })
    this.resizeObserver.observe(container)

    // Start render loop
    this.startLoop()
    return true
  }

  // ── Card sync ───────────────────────────────────────────────

  syncCards(cards: Card[], options: { preserveLayoutIds?: Set<string> } = {}): void {
    const nextCards = safeCards(cards)
    this.cards = nextCards
    this.inputHandler?.updateCards(nextCards)
    this.renderer?.setHiddenCards(hiddenCardIds(nextCards))
    this.purgeExpiredLocalLayoutPreserves()
    const preserveLayoutIds = new Set(options.preserveLayoutIds ?? [])
    for (const cardId of this.localControlIds) preserveLayoutIds.add(cardId)
    for (const cardId of this.localLayoutPreserveUntil.keys()) preserveLayoutIds.add(cardId)
    syncBodies(this.physicsWorld, nextCards, { preserveLayoutIds })
    // Eagerly start loading animation assets so they are ready when visible
    for (const card of nextCards) {
      animationManager.preregisterCard(card as any)
    }
  }

  // ── Callbacks ───────────────────────────────────────────────

  updateCallbacks(cb: DeskInputCallbacks): void {
    this.callbacks = this.wrapInputCallbacks(cb)
    this.inputHandler?.updateCallbacks(this.callbacks)
  }

  private wrapInputCallbacks(callbacks: DeskInputCallbacks): DeskInputCallbacks {
    return {
      ...callbacks,
      onLocalControlChange: (cardIds) => {
        this.setLocalControl(cardIds)
        callbacks.onLocalControlChange?.(cardIds)
      },
      onCardTransformsCommit: (transforms) => {
        this.holdTransformEcho(transforms)
        callbacks.onCardTransformsCommit?.(transforms)
      },
    }
  }

  private localEchoHoldMs(): number {
    return this.options.localEchoHoldMs ?? 1500
  }

  private setLocalControl(cardIds: Set<string>): void {
    const now = performance.now()
    const holdUntil = now + this.localEchoHoldMs()
    for (const cardId of this.localControlIds) {
      if (!cardIds.has(cardId)) this.localLayoutPreserveUntil.set(cardId, holdUntil)
    }
    for (const cardId of cardIds)
      this.localLayoutPreserveUntil.set(cardId, Number.POSITIVE_INFINITY)
    this.localControlIds = new Set(cardIds)
    this.stats.locallyControlledCards = this.localControlIds.size
  }

  private holdTransformEcho(transforms: CardTransformSnapshot[]): void {
    const until = performance.now() + this.localEchoHoldMs()
    for (const transform of transforms) this.localLayoutPreserveUntil.set(transform.cardId, until)
  }

  private purgeExpiredLocalLayoutPreserves(): void {
    const now = performance.now()
    for (const [cardId, until] of this.localLayoutPreserveUntil) {
      if (until <= now) this.localLayoutPreserveUntil.delete(cardId)
    }
  }

  // ── Viewport / physics passthrough ─────────────────────────

  getRenderer(): CardRenderer | null {
    return this.renderer
  }
  getBodiesMap() {
    return this.physicsWorld.bodiesMap
  }
  getMouseConstraint() {
    return this.physicsWorld.mouseConstraint
  }
  getConstraintsMap() {
    return this.constraintsMap
  }
  getViewport(): ViewportSnapshot | null {
    if (!this.renderer) return null
    const offset = this.renderer.getViewOffset()
    return {
      offsetX: offset.x,
      offsetY: offset.y,
      zoom: this.renderer.getViewZoom(),
    }
  }
  setViewport(viewport: ViewportSnapshot): void {
    if (!this.renderer) return
    this.renderer.setViewZoom(viewport.zoom)
    this.renderer.setViewOffset(viewport.offsetX, viewport.offsetY)
    this.inputHandler?.syncViewport()
  }

  focusCards(cards: Card[]): void {
    const targetCards = safeCards(cards)
    if (!this.renderer || targetCards.length === 0 || this.size.w <= 0 || this.size.h <= 0) return

    const center = this.renderer.screenToWorld(this.size.w / 2, this.size.h / 2)
    const cols = Math.max(1, Math.ceil(Math.sqrt(targetCards.length)))
    const rows = Math.max(1, Math.ceil(targetCards.length / cols))
    const gridW = (cols - 1) * CARD_SPACING_X
    const gridH = (rows - 1) * CARD_SPACING_Y
    const startX = center.x - gridW / 2
    const startY = center.y - gridH / 2

    targetCards.forEach((card, index) => {
      const body = this.physicsWorld.bodiesMap.get(card.id)
      if (!body) return
      const col = index % cols
      const row = Math.floor(index / cols)
      Matter.Body.setPosition(body, {
        x: startX + col * CARD_SPACING_X,
        y: startY + row * CARD_SPACING_Y,
      })
      Matter.Body.setVelocity(body, { x: 0, y: 0 })
      Matter.Body.setAngularVelocity(body, 0)
      Matter.Body.setAngle(body, ((col - (cols - 1) / 2) / Math.max(1, cols)) * 0.12)
    })

    this.renderer.centerOnCards(this.physicsWorld.bodiesMap, this.size.w, this.size.h)
    const zoom = this.renderer.getViewZoom()
    if (zoom < 0.45 && targetCards.length <= 12) {
      this.renderer.setViewZoom(0.45)
      this.renderer.setViewOffset(
        center.x - this.size.w / (2 * 0.45),
        center.y - this.size.h / (2 * 0.45),
      )
    }
  }

  getStats(): DeskLoopStats {
    const renderer = this.renderer
    const textureCache = getTextureCacheStats()
    const assetStats = cardAssetPipeline.getStats()
    const assetFrame = assetStats.frame
    const ktx2Stats = ktx2Runtime.getStats()
    const animationFrame = animationManager.getSchedulerStats().frame
    const budgetStats = renderBudgetGovernor.getStats()
    return {
      ...this.stats,
      cardCount: this.cards.length,
      backend: renderer?.getBackend() ?? 'pending',
      dpr: renderer?.getDpr() ?? this.stats.dpr,
      textureCacheEntries: textureCache.entries,
      textureCacheBytes: textureCache.totalBytes,
      assetUploads: assetFrame.usedUploads,
      assetUploadBytes: assetFrame.usedBytes,
      assetSkippedUploads: assetFrame.skippedUploads,
      compressedTextureCandidates: assetStats.compressedTextureCandidates,
      ktx2TextureCacheEntries: ktx2Stats.cacheEntries,
      animationTicks: animationFrame.usedTicks,
      animationFrameMarks: animationFrame.usedFrameMarks,
      animationSkippedTicks: animationFrame.skippedTicks,
      frameP95Ms: budgetStats.frameP95Ms,
      overBudgetFrames: budgetStats.overBudgetFrames,
      renderQualityTier: budgetStats.qualityTier,
      recommendedTextureUploadMaxUploads: budgetStats.textureUploadMaxUploads,
      recommendedTextureUploadMaxBytes: budgetStats.textureUploadMaxBytes,
      recommendedAnimationMaxTicks: budgetStats.animationMaxTicks,
    }
  }

  updateSelectedCards(ids: Set<string>): void {
    this.renderer?.setSelectedCards(ids)
    this.inputHandler?.updateSelectedCards(ids)
  }

  handleArenaPointerDown(
    arenaId: string,
    zone: 'center' | 'edge',
    worldX: number,
    worldY: number,
    screenX: number,
    screenY: number,
    radius: number,
    hasHalfHeight: boolean,
  ): void {
    this.inputHandler?.handleArenaPointerDown(
      arenaId,
      zone,
      worldX,
      worldY,
      screenX,
      screenY,
      radius,
      hasHalfHeight,
    )
  }

  handleArenaPointerMove(worldX: number, worldY: number, screenX: number, screenY: number): void {
    this.inputHandler?.handleArenaPointerMove(worldX, worldY, screenX, screenY)
  }

  handleArenaPointerUp(): void {
    this.inputHandler?.handleArenaPointerUp()
  }

  // ── Command System ──────────────────────────────────────────

  setCommandCallbacks(cb: typeof this.commandCallbacks): void {
    this.commandCallbacks = cb
  }

  /** Dispatch a structured command */
  dispatchCommand<T extends CommandName>(cmd: CardCommand<T>): CommandResult {
    if (!this.renderer) return { success: false, error: 'Not initialized' }
    const ctx: CommandContext = {
      bodiesMap: this.physicsWorld.bodiesMap,
      engine: this.physicsWorld.engine,
      renderer: this.renderer,
      screenW: this.size.w,
      screenH: this.size.h,
      cards: this.cards,
      animationManager,
      constraintsMap: this.constraintsMap,
      onCardRemoved: this.commandCallbacks.onCardRemoved,
      onCardAdded: this.commandCallbacks.onCardAdded,
      onScanResult: this.commandCallbacks.onScanResult,
    }
    return dispatchCmd(cmd, ctx)
  }

  /** Parse and dispatch a text command like "/move card1 x=200" */
  executeTextCommand(text: string): CommandResult | null {
    const cmd = parseCommand(text, this.cards)
    if (!cmd) return null
    return this.dispatchCommand(cmd)
  }

  // ── Loop ────────────────────────────────────────────────────

  private startLoop(): void {
    this.frameGovernor.reset()
    renderBudgetGovernor.reset()
    const step = (time: number) => {
      const frameStart = performance.now()
      const budget = renderBudgetGovernor.beginFrame(time, this.cards.length)
      cardAssetPipeline.configureTextureUploadBudget({
        maxUploads: budget.textureUploadMaxUploads,
        maxBytes: budget.textureUploadMaxBytes,
      })
      animationManager.configureScheduler({
        maxTicksPerFrame: budget.animationMaxTicks,
        maxThreeTicksPerFrame: budget.animationMaxThreeTicks,
        maxLive2DTicksPerFrame: budget.animationMaxLive2DTicks,
        maxFrameMarksPerFrame: budget.animationMaxFrameMarks,
      })
      this.purgeExpiredLocalLayoutPreserves()
      // Tick animation manager FIRST so Three.js renders before card texture bake
      animationManager.tick(time)
      // Tick command animations (move, rotate, highlight, etc.)
      tickCommands(time)
      const frame = this.frameGovernor.next(time)
      const physicsStart = performance.now()
      for (let i = 0; i < frame.physicsSteps; i++) {
        physicsStep(this.physicsWorld.engine, frame.fixedStepMs)
      }
      const physicsMs = performance.now() - physicsStart
      let renderMs = 0
      if (this.renderer) {
        const { w, h } = this.size
        const renderStart = performance.now()
        this.renderer.render(this.cards, this.physicsWorld.bodiesMap, w, h)
        renderMs = performance.now() - renderStart
      }
      this.recordStats(
        time,
        performance.now() - frameStart,
        physicsMs,
        renderMs,
        frame.physicsSteps,
        frame.droppedMs,
      )
      this.rafId = requestAnimationFrame(step)
    }
    this.rafId = requestAnimationFrame(step)
  }

  private recordStats(
    time: number,
    frameMs: number,
    physicsMs: number,
    renderMs: number,
    physicsSteps: number,
    physicsDroppedMs: number,
  ): void {
    const smooth = (prev: number, next: number) => (prev === 0 ? next : prev * 0.85 + next * 0.15)
    this.stats.frameMs = smooth(this.stats.frameMs, frameMs)
    this.stats.physicsMs = smooth(this.stats.physicsMs, physicsMs)
    this.stats.renderMs = smooth(this.stats.renderMs, renderMs)
    this.stats.cardCount = this.cards.length
    this.stats.backend = this.renderer?.getBackend() ?? 'pending'
    this.stats.dpr = this.renderer?.getDpr() ?? this.stats.dpr
    this.stats.physicsSteps = physicsSteps
    this.stats.physicsDroppedMs = smooth(this.stats.physicsDroppedMs, physicsDroppedMs)
    this.stats.locallyControlledCards = this.localControlIds.size
    const budgetStats = renderBudgetGovernor.recordFrame({
      frameMs,
      physicsMs,
      renderMs,
      cardCount: this.cards.length,
      physicsSteps,
      droppedMs: physicsDroppedMs,
    })
    this.stats.frameP95Ms = budgetStats.frameP95Ms
    this.stats.overBudgetFrames = budgetStats.overBudgetFrames
    this.stats.renderQualityTier = budgetStats.qualityTier
    this.stats.recommendedTextureUploadMaxUploads = budgetStats.textureUploadMaxUploads
    this.stats.recommendedTextureUploadMaxBytes = budgetStats.textureUploadMaxBytes
    this.stats.recommendedAnimationMaxTicks = budgetStats.animationMaxTicks

    if (this.statsWindowStart === 0) this.statsWindowStart = time
    this.statsFrames += 1
    const elapsed = time - this.statsWindowStart
    if (elapsed >= 500) {
      this.stats.fps = Math.round((this.statsFrames * 1000) / elapsed)
      this.statsFrames = 0
      this.statsWindowStart = time
    }
  }

  // ── Destroy ─────────────────────────────────────────────────

  destroy(): void {
    this.initObserver?.disconnect()
    cancelAnimationFrame(this.rafId)
    this.resizeObserver?.disconnect()
    this.inputHandler?.destroy()
    this.renderer?.destroy()
    // Remove all link constraints
    for (const [key, constraint] of this.constraintsMap) {
      Matter.World.remove(this.physicsWorld.engine.world, constraint)
    }
    this.constraintsMap.clear()
    this.localControlIds.clear()
    this.localLayoutPreserveUntil.clear()
    destroyPhysicsWorld(this.physicsWorld)
    this.renderer = null
    this.inputHandler = null
  }
}
