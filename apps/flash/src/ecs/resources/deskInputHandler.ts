// ══════════════════════════════════════════════════════════════
// DeskInputHandler — ECS resource
//
// Manages all DOM input events for the physics desk:
//   - Mouse move / down / up / dblclick
//   - Wheel (pan + zoom)
//   - Keyboard (space = pan mode)
//   - Pan inertia
//
// No React. Gets attached / detached imperatively.
// ══════════════════════════════════════════════════════════════

import Matter from 'matter-js'
import type { Card } from '../../types'
import type { CardRenderer } from '../CardRenderer'
import type { PhysicsWorld } from './physicsWorld'

export interface DeskInputCallbacks {
  onCardTap?: (cardId: string) => void
  onHoverChange?: (cardId: string | null) => void
  onDragChange?: (cardId: string | null) => void
  onCardFlip?: (cardId: string) => void
}

type AnyFn = (...args: never[]) => void

export class DeskInputHandler {
  private container: HTMLDivElement
  private renderer: CardRenderer
  private physicsWorld: PhysicsWorld
  private callbacks: DeskInputCallbacks

  // pan state
  private isPanning = false
  private panStartX = 0
  private panStartY = 0
  private panVelocityX = 0
  private panVelocityY = 0
  private lastPanTime = 0
  private spaceDown = false

  // drag detection
  private dragStartPos = { x: 0, y: 0 }
  private dragBody: Matter.Body | null = null
  private isDragging = false // true once Matter fires startdrag

  // zoom settle — prevents LOD re-bakes during active zoom gesture
  private zoomSettleTimer: ReturnType<typeof setTimeout> | null = null
  private static readonly ZOOM_SETTLE_MS = 180

  // single-tap / double-click discrimination (fully manual — no browser dblclick event)
  // Pattern: two rapid taps (<DBLCLICK_MS ms apart) on the same card = flip
  private pendingTapId: ReturnType<typeof setTimeout> | null = null
  private lastTapCardId: string | null = null
  private lastTapTime = 0
  private static readonly TAP_DELAY = 320 // ms — single-tap fires after this
  private static readonly DBLCLICK_MS = 350 // ms — two taps within this = double-click

  // hover
  private lastHoveredId: string | null = null

  // live card list ref (updated externally)
  private cardsRef: Card[] = []

  // bound handlers (stored for removeEventListener)
  private handlerMouseMove: (e: MouseEvent) => void
  private handlerMouseDown: (e: MouseEvent) => void
  private handlerMouseUp: (e: MouseEvent) => void
  private handlerWheel: (e: WheelEvent) => void
  private handlerKeyDown: (e: KeyboardEvent) => void
  private handlerKeyUp: (e: KeyboardEvent) => void

  constructor(
    container: HTMLDivElement,
    renderer: CardRenderer,
    physicsWorld: PhysicsWorld,
    callbacks: DeskInputCallbacks,
  ) {
    this.container = container
    this.renderer = renderer
    this.physicsWorld = physicsWorld
    this.callbacks = callbacks

    this.handlerMouseMove = this.onMouseMove.bind(this)
    this.handlerMouseDown = this.onMouseDown.bind(this)
    this.handlerMouseUp = this.onMouseUp.bind(this)
    this.handlerWheel = this.onWheel.bind(this)
    this.handlerKeyDown = this.onKeyDown.bind(this)
    this.handlerKeyUp = this.onKeyUp.bind(this)

    this.attachEvents()
  }

  // ── Public API ─────────────────────────────

  updateCallbacks(cb: DeskInputCallbacks): void {
    this.callbacks = cb
  }

  updateCards(cards: Card[]): void {
    this.cardsRef = cards
  }

  destroy(): void {
    if (this.pendingTapId !== null) {
      clearTimeout(this.pendingTapId)
      this.pendingTapId = null
    }
    if (this.zoomSettleTimer !== null) {
      clearTimeout(this.zoomSettleTimer)
      this.zoomSettleTimer = null
    }
    this.detachEvents()
  }

  // ── Matter.js mouse constraint setup ───────

  setupMouseConstraint(): void {
    const { engine } = this.physicsWorld
    const mouse = Matter.Mouse.create(this.container)
    // Remove wheel events handled by Matter (we handle ourselves)
    ;(mouse.element as HTMLElement).removeEventListener(
      'mousewheel',
      (mouse as unknown as Record<string, AnyFn>).mousewheel,
    )
    ;(mouse.element as HTMLElement).removeEventListener(
      'DOMMouseScroll',
      (mouse as unknown as Record<string, AnyFn>).mousewheel,
    )
    const mc = Matter.MouseConstraint.create(engine, {
      mouse,
      constraint: { stiffness: 0.6, damping: 0.12, render: { visible: false } },
    })
    this.physicsWorld.mouseConstraint = mc
    Matter.World.add(engine.world, mc)

    // Store mouse ref on constraint for coordinate sync
    ;(mc as unknown as Record<string, unknown>)._deskMouse = mouse

    // Immediately sync the viewport transform so Matter interprets
    // DOM events as world coordinates from the very first frame.
    this.syncMatterViewport()

    // Now that the constraint exists, register drag events
    this.attachMatterEvents()
  }

  // ── Internal ───────────────────────────────

  private get mouse(): Matter.Mouse | undefined {
    const mc = this.physicsWorld.mouseConstraint
    return mc ? (mc as unknown as Record<string, Matter.Mouse>)._deskMouse : undefined
  }

  /**
   * Sync Matter.js mouse offset/scale so its internal event handler
   * converts DOM coords directly to world coords.
   *
   * Matter computes:  position = absolute * scale + offset
   * We want:          position = screenX / zoom + pan
   * So:               scale = 1/zoom,  offset = pan
   */
  private syncMatterViewport(): void {
    const m = this.mouse
    if (!m) return
    const zoom = this.renderer.getViewZoom()
    const off = this.renderer.getViewOffset()
    Matter.Mouse.setScale(m, { x: 1 / zoom, y: 1 / zoom })
    Matter.Mouse.setOffset(m, { x: off.x, y: off.y })
  }

  private updateMatterMouse(screenX: number, screenY: number): void {
    const m = this.mouse
    if (!m) return
    const world = this.renderer.screenToWorld(screenX, screenY)
    m.position.x = world.x
    m.position.y = world.y
  }

  private attachMatterEvents(): void {
    const mc = this.physicsWorld.mouseConstraint
    if (!mc) return

    Matter.Events.on(mc, 'startdrag', (e: { body: Matter.Body }) => {
      if (this.isPanning) return
      this.dragBody = e.body
      this.isDragging = true
      const m = this.mouse
      this.dragStartPos = m ? { x: m.position.x, y: m.position.y } : { x: 0, y: 0 }
      this.renderer.setActiveCard(e.body.label)
      this.renderer.bringToFront(e.body.label)
      this.callbacks.onDragChange?.(e.body.label)
      this.container.style.cursor = 'grabbing'
    })

    Matter.Events.on(mc, 'enddrag', (e: { body: Matter.Body }) => {
      if (!this.dragBody) return
      const m = this.mouse
      const dx = m ? m.position.x - this.dragStartPos.x : 0
      const dy = m ? m.position.y - this.dragStartPos.y : 0

      // Cancel any in-flight tap before processing this one
      if (this.pendingTapId !== null) {
        clearTimeout(this.pendingTapId)
        this.pendingTapId = null
      }

      // Tap = drag ended with negligible movement
      if (Math.sqrt(dx * dx + dy * dy) < 5) {
        const cardId = e.body.label
        const now = performance.now()
        const isSameCard = cardId === this.lastTapCardId
        const isQuick = now - this.lastTapTime < DeskInputHandler.DBLCLICK_MS

        if (isSameCard && isQuick) {
          // Double-tap detected — flip the card, suppress single-tap
          this.lastTapCardId = null
          this.lastTapTime = 0
          this.renderer.toggleFlip(cardId)
          this.callbacks.onCardFlip?.(cardId)
        } else {
          // First tap of a potential double-tap sequence
          this.lastTapCardId = cardId
          this.lastTapTime = now
          this.pendingTapId = setTimeout(() => {
            this.pendingTapId = null
            this.lastTapCardId = null
            this.callbacks.onCardTap?.(cardId)
          }, DeskInputHandler.TAP_DELAY)
        }
      }

      this.dragBody = null
      this.isDragging = false
      this.renderer.setActiveCard(null)
      this.callbacks.onDragChange?.(null)
      this.container.style.cursor = this.spaceDown ? 'grab' : ''
    })
  }

  private attachEvents(): void {
    this.container.addEventListener('mousemove', this.handlerMouseMove)
    this.container.addEventListener('mousedown', this.handlerMouseDown)
    this.container.addEventListener('mouseup', this.handlerMouseUp)
    this.container.addEventListener('wheel', this.handlerWheel as EventListener, { passive: false })
    window.addEventListener('keydown', this.handlerKeyDown)
    window.addEventListener('keyup', this.handlerKeyUp)
  }

  private detachEvents(): void {
    this.container.removeEventListener('mousemove', this.handlerMouseMove)
    this.container.removeEventListener('mousedown', this.handlerMouseDown)
    this.container.removeEventListener('mouseup', this.handlerMouseUp)
    this.container.removeEventListener('wheel', this.handlerWheel as EventListener)
    window.removeEventListener('keydown', this.handlerKeyDown)
    window.removeEventListener('keyup', this.handlerKeyUp)
  }

  private markZoomActive(): void {
    this.renderer.setZoomSettled(false)
    if (this.zoomSettleTimer !== null) clearTimeout(this.zoomSettleTimer)
    this.zoomSettleTimer = setTimeout(() => {
      this.zoomSettleTimer = null
      this.renderer.setZoomSettled(true)
    }, DeskInputHandler.ZOOM_SETTLE_MS)
  }

  private onMouseMove(e: MouseEvent): void {
    const rect = this.container.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top

    if (this.isPanning) {
      const dx = mx - this.panStartX
      const dy = my - this.panStartY
      const now = performance.now()
      const dt = Math.max(1, now - this.lastPanTime)
      this.panVelocityX = (dx / dt) * 16
      this.panVelocityY = (dy / dt) * 16
      this.lastPanTime = now
      this.renderer.panBy(dx, dy)
      this.panStartX = mx
      this.panStartY = my
      // Keep Matter mouse in sync after panning
      this.syncMatterViewport()
      return
    }

    // Keep Matter's internal coordinate transform current.
    // Must be called before hitTest so drag constraint uses world coords.
    this.syncMatterViewport()
    this.renderer.setMousePosition(mx, my)

    const hitId = this.renderer.hitTest(mx, my, this.cardsRef, this.physicsWorld.bodiesMap)
    if (hitId !== this.lastHoveredId) {
      this.lastHoveredId = hitId
      this.renderer.setHoveredCard(hitId)
      this.callbacks.onHoverChange?.(hitId)
    }

    // Update cursor style when not dragging / panning
    if (!this.isDragging) {
      this.container.style.cursor = hitId ? 'grab' : ''
    }
  }

  private onMouseDown(e: MouseEvent): void {
    const rect = this.container.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top

    if (e.button === 1 || (e.button === 0 && this.spaceDown)) {
      this.isPanning = true
      this.panStartX = mx
      this.panStartY = my
      this.panVelocityX = 0
      this.panVelocityY = 0
      this.lastPanTime = performance.now()
      this.container.style.cursor = 'grabbing'
      e.preventDefault()
      return
    }
    // Sync viewport transform BEFORE Matter processes this mousedown,
    // ensuring the constraint attachment point is in world-space.
    this.syncMatterViewport()
  }

  private onMouseUp(e: MouseEvent): void {
    if (this.isPanning) {
      this.isPanning = false
      const startVX = this.panVelocityX
      const startVY = this.panVelocityY
      let vx = startVX,
        vy = startVY
      const inertia = () => {
        if (this.isPanning) return
        const speed = Math.sqrt(vx * vx + vy * vy)
        if (speed < 0.3) return
        this.renderer.panBy(vx, vy)
        vx *= 0.92
        vy *= 0.92
        requestAnimationFrame(inertia)
      }
      requestAnimationFrame(inertia)
      e.preventDefault()
    }
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault()
    const rect = this.container.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top

    if (e.ctrlKey) {
      this.markZoomActive()
      this.renderer.zoomAt(mx, my, Math.pow(2, -e.deltaY * 0.008))
      this.syncMatterViewport()
      return
    }

    const isTrackpad =
      Math.abs(e.deltaX) > 0.5 || Math.abs(e.deltaY) < 60 || e.deltaY !== Math.round(e.deltaY)

    if (isTrackpad) {
      this.renderer.panBy(-e.deltaX, -e.deltaY)
    } else {
      this.markZoomActive()
      this.renderer.zoomAt(mx, my, e.deltaY > 0 ? 0.92 : 1.08)
    }
    this.syncMatterViewport()
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.code === 'Space' && !this.spaceDown) {
      this.spaceDown = true
      if (!this.isDragging) this.container.style.cursor = 'grab'
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    if (e.code === 'Space') {
      this.spaceDown = false
      this.isPanning = false
      if (!this.isDragging) this.container.style.cursor = ''
    }
  }
}
