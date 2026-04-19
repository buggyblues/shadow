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

import type { Card } from '../types'
import { CardRenderer } from './CardRenderer'
import { animationManager } from './resources/animationManager'
import type { DeskInputCallbacks } from './resources/deskInputHandler'
import { DeskInputHandler } from './resources/deskInputHandler'
import { createPhysicsWorld, destroyPhysicsWorld } from './resources/physicsWorld'
import { physicsStep, seedBodies, syncBodies } from './systems/bodyLifecycleSystem'

export type { DeskInputCallbacks }

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

  // ── Loop ────────────────────────────────────────────────────

  private startLoop(): void {
    let lastTime = performance.now()
    const step = (time: number) => {
      // Tick animation manager FIRST so Three.js renders before card texture bake
      animationManager.tick(time)
      const delta = Math.min(time - lastTime, 32)
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
    destroyPhysicsWorld(this.physicsWorld)
    this.renderer = null
    this.inputHandler = null
  }
}
