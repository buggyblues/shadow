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
import { animationManager } from '../resources/animationManager'
import type { DeskInputCallbacks } from '../resources/deskInputHandler'
import { DeskInputHandler } from '../resources/deskInputHandler'
import { createPhysicsWorld, destroyPhysicsWorld } from '../resources/physicsWorld'
import { arenaStore } from '../systems/scene/arenaSystem'
import { physicsStep, seedBodies, syncBodies } from '../systems/scene/bodyLifecycleSystem'
import { CardRenderer } from './CardRenderer'

export type { CardCommand, CommandName, CommandResult, DeskInputCallbacks }

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
    const w = container.clientWidth
    const h = container.clientHeight
    if (w > 0 && h > 0) {
      this.init(canvas, container, cards, callbacks)
    } else {
      this.initObserver = new ResizeObserver(([entry]) => {
        const { width, height } = entry.contentRect
        if (width > 0 && height > 0) {
          this.initObserver!.disconnect()
          this.initObserver = null
          this.init(canvas, container, cards, callbacks)
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
    this.callbacks = callbacks
    this.cards = cards

    try {
      this.renderer = new CardRenderer(canvas)
      const w = container.clientWidth
      const h = container.clientHeight
      this.size = { w, h }
      this.renderer.resize(w, h)
    } catch (err) {
      console.error('DeskLoop: WebGL init failed', err)
      return false
    }

    // Seed physics bodies
    seedBodies(this.physicsWorld, cards)

    // Input handler (sets up mouse constraint internally)
    this.inputHandler = new DeskInputHandler(container, this.renderer, this.physicsWorld, callbacks)
    this.inputHandler.setupMouseConstraint()
    this.inputHandler.updateCards(cards)

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

  syncCards(cards: Card[]): void {
    this.cards = cards
    this.inputHandler?.updateCards(cards)
    syncBodies(this.physicsWorld, cards)
    // Eagerly start loading animation assets so they are ready when visible
    for (const card of cards) {
      animationManager.preregisterCard(card as any)
    }
  }

  // ── Callbacks ───────────────────────────────────────────────

  updateCallbacks(cb: DeskInputCallbacks): void {
    this.callbacks = cb
    this.inputHandler?.updateCallbacks(cb)
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

  updateSelectedCards(ids: Set<string>): void {
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
    let lastTime = -1 // -1 = first frame sentinel
    const step = (time: number) => {
      // Tick animation manager FIRST so Three.js renders before card texture bake
      animationManager.tick(time)
      // Tick command animations (move, rotate, highlight, etc.)
      tickCommands(time)
      // On the very first frame, use a single-step delta of 0 to avoid the
      // "delta > 16.667ms" warning that fires when lastTime was set before RAF.
      const raw = lastTime < 0 ? 0 : time - lastTime
      const delta = Math.min(raw, 16) // hard cap at 16ms (< 16.667 threshold)
      lastTime = time
      physicsStep(this.physicsWorld.engine, delta)
      if (this.renderer) {
        const { w, h } = this.size
        this.renderer.render(this.cards, this.physicsWorld.bodiesMap, w, h)
      }
      this.rafId = requestAnimationFrame(step)
    }
    this.rafId = requestAnimationFrame(step)
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
    destroyPhysicsWorld(this.physicsWorld)
    this.renderer = null
    this.inputHandler = null
  }
}
