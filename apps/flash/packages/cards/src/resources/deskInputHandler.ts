// ══════════════════════════════════════════════════════════════
// DeskInputHandler — ECS resource  (FSM-driven)
//
// Bridges raw DOM / Matter.js events to the InteractionFSM, then
// executes the returned Action list against the real world (DOM,
// renderer, physics).
//
// Event flow:
//   DOM event  →  buildEvent()  →  FSM.dispatch()  →  execute(actions)
//
// No ad-hoc boolean "is-panning / is-dragging" flags — all state
// lives in FSM.state (a discriminated union).
// ══════════════════════════════════════════════════════════════

import type { Card } from '@shadowob/flash-types'
import Matter from 'matter-js'
import type { CardRenderer } from '../renderer/CardRenderer'
import type { InteractionAction, InteractionEvent } from './interactionFSM'
import { InteractionFSM, TAP_DELAY_MS } from './interactionFSM'
import type { PhysicsWorld } from './physicsWorld'

// ─────────────────────────────────────────────────────────────
// Callback surface exposed to Playground (and DeskLoop)
// ─────────────────────────────────────────────────────────────

export interface DeskInputCallbacks {
  /** Single-tap on a card (after TAP_DELAY, not a double-tap) */
  onCardTap?: (cardId: string) => void
  /** Hover state changed */
  onHoverChange?: (cardId: string | null) => void
  /** Drag started or ended for a card */
  onDragChange?: (cardId: string | null) => void
  /** Card double-tapped → flip */
  onCardFlip?: (cardId: string) => void
  /** Marquee rect changed (null = ended) */
  onMarqueeChange?: (rect: { x1: number; y1: number; x2: number; y2: number } | null) => void
  /** Marquee rectangle finished — resolved set of card IDs enclosed */
  onMarqueeSelect?: (ids: Set<string>) => void
  /** Selection should change */
  onSelectionChange?: (ids: Set<string>) => void
  /** Arena move delta in world units */
  onArenaDelta?: (arenaId: string, dwx: number, dwy: number) => void
  /** Arena resize: new radius */
  onArenaResize?: (arenaId: string, radius: number, hasHalfHeight: boolean) => void
  /** Arena selected / deselected */
  onArenaSelect?: (arenaId: string | null) => void
  /** Quick-link request (Cmd+click second card) */
  onLinkRequest?: (fromId: string, toId: string) => void
}

type AnyFn = (...args: never[]) => void

export class DeskInputHandler {
  private container: HTMLDivElement
  private renderer: CardRenderer
  private physicsWorld: PhysicsWorld
  private callbacks: DeskInputCallbacks
  private fsm: InteractionFSM

  // Tap discrimination (managed here because they involve timers)
  private pendingTapId: ReturnType<typeof setTimeout> | null = null
  private lastTapCardId: string | null = null
  private lastTapTime: number = 0

  // Zoom settle
  private zoomSettleTimer: ReturnType<typeof setTimeout> | null = null
  private static readonly ZOOM_SETTLE_MS = 180

  // Screen position of last mousedown
  private mouseDownScreenX = 0
  private mouseDownScreenY = 0

  // Live card list & selection (updated externally)
  private cardsRef: Card[] = []
  private selectedCardIds: Set<string> = new Set()

  // Currently hovered card
  private lastHoveredId: string | null = null

  // Bound DOM handlers
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
    this.fsm = new InteractionFSM()

    this.handlerMouseMove = this.onMouseMove.bind(this)
    this.handlerMouseDown = this.onMouseDown.bind(this)
    this.handlerMouseUp = this.onMouseUp.bind(this)
    this.handlerWheel = this.onWheel.bind(this)
    this.handlerKeyDown = this.onKeyDown.bind(this)
    this.handlerKeyUp = this.onKeyUp.bind(this)

    this.attachEvents()
  }

  // ── Public API ─────────────────────────────────────────────

  updateCallbacks(cb: DeskInputCallbacks): void {
    this.callbacks = cb
  }

  updateCards(cards: Card[]): void {
    this.cardsRef = cards
  }

  updateSelectedCards(ids: Set<string>): void {
    this.selectedCardIds = ids
  }

  getStateName(): string {
    return this.fsm.getState().tag
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

  // ── Matter.js mouse constraint setup ───────────────────────

  setupMouseConstraint(): void {
    const { engine } = this.physicsWorld
    const mouse = Matter.Mouse.create(this.container)
    ;(mouse.element as HTMLElement).removeEventListener(
      'mousewheel',
      (mouse as unknown as Record<string, AnyFn>).mousewheel as EventListener,
    )
    ;(mouse.element as HTMLElement).removeEventListener(
      'DOMMouseScroll',
      (mouse as unknown as Record<string, AnyFn>).mousewheel as EventListener,
    )
    const mc = Matter.MouseConstraint.create(engine, {
      mouse,
      constraint: { stiffness: 0.6, damping: 0.12, render: { visible: false } },
    })
    this.physicsWorld.mouseConstraint = mc
    Matter.World.add(engine.world, mc)
    ;(mc as unknown as Record<string, unknown>)._deskMouse = mouse
    this.syncMatterViewport()
    this.attachMatterEvents()
  }

  // ── Arena pointer events (called from Playground) ──────────

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
    this.execute(
      this.fsm.dispatch({
        type: 'ARENA_POINTER_DOWN',
        arenaId,
        zone,
        worldX,
        worldY,
        screenX,
        screenY,
        radius,
        hasHalfHeight,
      }),
    )
  }

  handleArenaPointerMove(worldX: number, worldY: number, screenX: number, screenY: number): void {
    const s = this.fsm.getState()
    if (s.tag !== 'ARENA_MOVE' && s.tag !== 'ARENA_RESIZE') return
    this.execute(
      this.fsm.dispatch({ type: 'ARENA_POINTER_MOVE', worldX, worldY, screenX, screenY }),
    )
  }

  handleArenaPointerUp(): void {
    this.execute(this.fsm.dispatch({ type: 'ARENA_POINTER_UP' }))
  }

  // ── Internal helpers ───────────────────────────────────────

  private get mouse(): Matter.Mouse | undefined {
    const mc = this.physicsWorld.mouseConstraint
    return mc ? (mc as unknown as Record<string, Matter.Mouse>)._deskMouse : undefined
  }

  private syncMatterViewport(): void {
    const m = this.mouse
    if (!m) return
    const zoom = this.renderer.getViewZoom()
    const off = this.renderer.getViewOffset()
    Matter.Mouse.setScale(m, { x: 1 / zoom, y: 1 / zoom })
    Matter.Mouse.setOffset(m, { x: off.x, y: off.y })
  }

  private screenCoords(e: MouseEvent | WheelEvent): { mx: number; my: number } {
    const rect = this.container.getBoundingClientRect()
    return { mx: e.clientX - rect.left, my: e.clientY - rect.top }
  }

  // ── Matter drag events ────────────────────────────────────

  private attachMatterEvents(): void {
    const mc = this.physicsWorld.mouseConstraint
    if (!mc) return

    Matter.Events.on(mc, 'startdrag', (e: any) => {
      const s = this.fsm.getState()
      if (s.tag === 'PAN') return

      const visualHit = this.renderer.hitTest(
        this.mouseDownScreenX,
        this.mouseDownScreenY,
        this.cardsRef,
        this.physicsWorld.bodiesMap,
      )
      if (!visualHit) {
        this.execute(this.fsm.dispatch({ type: 'MATTER_INVALID_DRAG' }))
        return
      }

      const leaderId = e.body.label as string
      const followers = new Map<string, { dx: number; dy: number }>()
      if (this.selectedCardIds.has(leaderId) && this.selectedCardIds.size > 1) {
        for (const id of this.selectedCardIds) {
          if (id === leaderId) continue
          const fb = this.physicsWorld.bodiesMap.get(id)
          if (!fb) continue
          followers.set(id, {
            dx: fb.position.x - e.body.position.x,
            dy: fb.position.y - e.body.position.y,
          })
        }
      }

      const m = this.mouse
      this.execute(
        this.fsm.dispatch({
          type: 'MATTER_START_DRAG',
          bodyLabel: leaderId,
          worldX: m ? m.position.x : e.body.position.x,
          worldY: m ? m.position.y : e.body.position.y,
          followers,
        }),
      )
    })

    Matter.Events.on(mc, 'enddrag', (e: any) => {
      const s = this.fsm.getState()
      if (s.tag !== 'DRAG') return

      const m = this.mouse
      const ddx = m ? m.position.x - s.dragStartWorldX : 0
      const ddy = m ? m.position.y - s.dragStartWorldY : 0

      if (this.pendingTapId !== null) {
        clearTimeout(this.pendingTapId)
        this.pendingTapId = null
      }

      this.execute(
        this.fsm.dispatch({
          type: 'MATTER_END_DRAG',
          bodyLabel: e.body.label,
          worldDeltaMag: Math.sqrt(ddx * ddx + ddy * ddy),
          now: performance.now(),
          lastTapCardId: this.lastTapCardId,
          lastTapTime: this.lastTapTime,
        }),
      )
    })
  }

  // ── DOM event handlers ────────────────────────────────────

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

  private onMouseDown(e: MouseEvent): void {
    const { mx, my } = this.screenCoords(e)
    const s = this.fsm.getState()

    const hitCardId =
      e.button === 0 && s.tag === 'IDLE' && !s.spaceHeld
        ? this.renderer.hitTest(mx, my, this.cardsRef, this.physicsWorld.bodiesMap)
        : null

    // Cmd/Ctrl+click quick-link: handled here (needs selectedCardIds)
    if (e.button === 0 && (e.metaKey || e.ctrlKey) && hitCardId) {
      const prevIds = Array.from(this.selectedCardIds)
      if (prevIds.length === 1 && prevIds[0] !== hitCardId) {
        this.callbacks.onLinkRequest?.(prevIds[0], hitCardId)
        e.stopPropagation()
        return
      }
    }

    // Multi-select drag: if clicking a card that's already in the multi-selection,
    // don't change selection — just let Matter.js pick it up and drag all followers.
    if (
      e.button === 0 &&
      hitCardId &&
      !e.shiftKey &&
      !e.metaKey &&
      !e.ctrlKey &&
      this.selectedCardIds.has(hitCardId) &&
      this.selectedCardIds.size > 1
    ) {
      this.mouseDownScreenX = mx
      this.mouseDownScreenY = my
      this.syncMatterViewport()
      return
    }

    const event: InteractionEvent = {
      type: 'MOUSE_DOWN',
      screenX: mx,
      screenY: my,
      button: e.button,
      hitCardId,
      hitArena: null,
      shiftKey: e.shiftKey,
      metaKey: e.metaKey,
      ctrlKey: e.ctrlKey,
    }

    this.execute(this.fsm.dispatch(event))
    if (e.button === 1 || (e.button === 0 && s.tag === 'IDLE' && s.spaceHeld)) e.preventDefault()
  }

  private onMouseMove(e: MouseEvent): void {
    const { mx, my } = this.screenCoords(e)
    const s = this.fsm.getState()

    if (s.tag === 'PAN') {
      const dx = mx - s.lastX
      const dy = my - s.lastY
      const now = performance.now()
      const dt = Math.max(1, now - s.lastTime)
      s.vx = (dx / dt) * 16
      s.vy = (dy / dt) * 16
      s.lastTime = now
      s.lastX = mx
      s.lastY = my
      this.renderer.panBy(dx, dy)
      this.syncMatterViewport()
      return
    }

    const hitCardId =
      s.tag === 'IDLE' || s.tag === 'DRAG'
        ? this.renderer.hitTest(mx, my, this.cardsRef, this.physicsWorld.bodiesMap)
        : null

    let leaderWorldX: number | undefined
    let leaderWorldY: number | undefined
    if (s.tag === 'DRAG' && s.followers.size > 0) {
      const lb = this.physicsWorld.bodiesMap.get(s.leaderId)
      if (lb) {
        leaderWorldX = lb.position.x
        leaderWorldY = lb.position.y
      }
    }

    this.execute(
      this.fsm.dispatch({
        type: 'MOUSE_MOVE',
        screenX: mx,
        screenY: my,
        hitCardId,
        leaderWorldX,
        leaderWorldY,
      }),
    )
  }

  private onMouseUp(e: MouseEvent): void {
    const s = this.fsm.getState()
    let panVx = 0,
      panVy = 0
    if (s.tag === 'PAN') {
      panVx = s.vx
      panVy = s.vy
    }
    this.execute(this.fsm.dispatch({ type: 'MOUSE_UP', button: e.button, panVx, panVy }))
    if (e.button === 1) e.preventDefault()
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault()
    const { mx, my } = this.screenCoords(e)
    this.execute(
      this.fsm.dispatch({
        type: 'WHEEL',
        screenX: mx,
        screenY: my,
        deltaX: e.deltaX,
        deltaY: e.deltaY,
        ctrlKey: e.ctrlKey,
      }),
    )
  }

  private onKeyDown(e: KeyboardEvent): void {
    this.execute(this.fsm.dispatch({ type: 'KEY_DOWN', code: e.code }))
  }

  private onKeyUp(e: KeyboardEvent): void {
    this.execute(this.fsm.dispatch({ type: 'KEY_UP', code: e.code }))
  }

  // ── Action executor ───────────────────────────────────────

  private execute(actions: InteractionAction[]): void {
    const mc = this.physicsWorld.mouseConstraint

    for (const a of actions) {
      switch (a.do) {
        case 'PAN_BY':
          if (a.dx !== 0 || a.dy !== 0) this.renderer.panBy(a.dx, a.dy)
          break

        case 'ZOOM_AT':
          this.renderer.zoomAt(a.screenX, a.screenY, a.factor)
          break

        case 'SET_CURSOR':
          this.container.style.cursor = a.cursor
          break

        case 'SYNC_MATTER_VIEWPORT':
          this.syncMatterViewport()
          break

        case 'STORE_MOUSEDOWN_SCREEN':
          this.mouseDownScreenX = a.x
          this.mouseDownScreenY = a.y
          this.syncMatterViewport()
          break

        case 'CANCEL_MATTER_DRAG':
          if (mc) {
            ;(mc as unknown as Record<string, null>).body = null
            ;(mc.constraint as unknown as Record<string, unknown>).bodyB = null
            ;(mc.constraint as unknown as Record<string, unknown>).pointB = { x: 0, y: 0 }
          }
          break

        case 'CARD_SET_ACTIVE':
          this.renderer.setActiveCard(a.cardId)
          break

        case 'CARD_SET_HOVER':
          if (a.cardId !== this.lastHoveredId) {
            this.lastHoveredId = a.cardId
            this.renderer.setHoveredCard(a.cardId)
            this.callbacks.onHoverChange?.(a.cardId)
          }
          break

        case 'CARD_BRING_FRONT':
          this.renderer.bringToFront(a.cardId)
          break

        case 'CARD_TAP':
          this.callbacks.onCardTap?.(a.cardId)
          break

        case 'CARD_FLIP':
          this.renderer.toggleFlip(a.cardId)
          this.callbacks.onCardFlip?.(a.cardId)
          break

        case 'DRAG_NOTIFY_START':
          this.callbacks.onDragChange?.(a.cardId)
          break

        case 'DRAG_NOTIFY_END':
          this.callbacks.onDragChange?.(null)
          break

        case 'DRAG_MOVE_FOLLOWERS':
          for (const [id, off] of a.followers) {
            const fb = this.physicsWorld.bodiesMap.get(id)
            if (!fb) continue
            Matter.Body.setPosition(fb, { x: a.leaderX + off.dx, y: a.leaderY + off.dy })
            Matter.Body.setVelocity(fb, { x: 0, y: 0 })
          }
          break

        case 'SELECTION_SET': {
          let nextArr: string[]
          if (a.toggle) {
            nextArr = this.selectedCardIds.has(a.hitCardId)
              ? [...this.selectedCardIds].filter((id) => id !== a.hitCardId)
              : [...this.selectedCardIds, a.hitCardId]
          } else if (a.multi) {
            nextArr = [...this.selectedCardIds, a.hitCardId]
          } else {
            nextArr = [a.hitCardId]
          }
          const next = new Set(nextArr)
          this.selectedCardIds = next
          this.renderer.setSelectedCards(next)
          this.callbacks.onSelectionChange?.(next)
          break
        }

        case 'SELECTION_CLEAR': {
          const empty = new Set<string>()
          this.selectedCardIds = empty
          this.renderer.setSelectedCards(empty)
          this.callbacks.onSelectionChange?.(empty)
          break
        }

        case 'SELECTION_ALL':
        case 'DELETE_SELECTED':
          // Handled by Playground global keydown handler
          break

        case 'MARQUEE_START':
          this.callbacks.onMarqueeChange?.({ x1: a.x, y1: a.y, x2: a.x, y2: a.y })
          break

        case 'MARQUEE_UPDATE': {
          this.callbacks.onMarqueeChange?.({ x1: a.x1, y1: a.y1, x2: a.x2, y2: a.y2 })
          const ids = this.renderer.hitTestRect(
            a.x1,
            a.y1,
            a.x2,
            a.y2,
            this.cardsRef,
            this.physicsWorld.bodiesMap,
          )
          this.selectedCardIds = ids
          this.renderer.setSelectedCards(ids)
          this.callbacks.onSelectionChange?.(ids)
          break
        }

        case 'MARQUEE_END':
          this.callbacks.onMarqueeChange?.(null)
          this.callbacks.onMarqueeSelect?.(this.selectedCardIds)
          break

        case 'CANCEL_MARQUEE':
          this.callbacks.onMarqueeChange?.(null)
          break

        case 'PAN_INERTIA': {
          let vx = a.vx,
            vy = a.vy
          const inertia = () => {
            if (this.fsm.getState().tag === 'PAN') return
            if (Math.sqrt(vx * vx + vy * vy) < 0.3) return
            this.renderer.panBy(vx, vy)
            vx *= 0.92
            vy *= 0.92
            this.syncMatterViewport()
            requestAnimationFrame(inertia)
          }
          requestAnimationFrame(inertia)
          break
        }

        case 'MARK_ZOOM_ACTIVE':
          this.renderer.setZoomSettled(false)
          if (this.zoomSettleTimer !== null) clearTimeout(this.zoomSettleTimer)
          this.zoomSettleTimer = setTimeout(() => {
            this.zoomSettleTimer = null
            this.renderer.setZoomSettled(true)
          }, DeskInputHandler.ZOOM_SETTLE_MS)
          break

        case 'ARENA_SELECT':
          this.callbacks.onArenaSelect?.(a.arenaId)
          break

        case 'ARENA_MOVE_DELTA':
          this.callbacks.onArenaDelta?.(a.arenaId, a.dwx, a.dwy)
          break

        case 'ARENA_RESIZE': {
          const zoom = this.renderer.getViewZoom()
          const delta =
            Math.sqrt(a.screenDx * a.screenDx + a.screenDy * a.screenDy) *
            (a.screenDx + a.screenDy > 0 ? 1 : -1)
          const radius = Math.max(100, a.startRadius + delta / zoom)
          this.callbacks.onArenaResize?.(a.arenaId, radius, a.hasHalfHeight)
          break
        }

        case 'TAP_SCHEDULE': {
          const cardId = a.cardId
          this.pendingTapId = setTimeout(() => {
            this.pendingTapId = null
            this.lastTapCardId = null
            this.callbacks.onCardTap?.(cardId)
          }, TAP_DELAY_MS)
          break
        }

        case 'TAP_RECORD':
          this.lastTapCardId = a.cardId
          this.lastTapTime = a.time
          break

        case 'TAP_RESET':
          this.lastTapCardId = null
          this.lastTapTime = 0
          break

        case 'LINK_CARDS':
          this.callbacks.onLinkRequest?.(a.fromId, a.toId)
          break
      }
    }
  }
}
