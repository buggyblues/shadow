// ══════════════════════════════════════════════════════════════
// Interaction Finite State Machine
//
// Pure, side-effect-free description of desk interaction states
// and transitions.  No DOM, no Matter, no React.
//
// Architecture:
//   1. DeskInputHandler converts raw DOM/Matter events → InteractionEvent
//   2. FSM.dispatch(event) → { nextState, actions[] }
//   3. DeskInputHandler executes each Action against the real world
//
// ┌─────────────────────────────────────────────────────┐
// │                        STATES                       │
// │                                                     │
// │  ┌──────┐  space+down / mid-btn   ┌─────┐          │
// │  │      │ ─────────────────────▶ │ PAN │          │
// │  │      │ ◀─ mouse-up ────────── └─────┘          │
// │  │ IDLE │                                          │
// │  │      │  down(card)  ┌──────────────┐            │
// │  │      │ ────────────▶│  DRAG_CARD   │            │
// │  │      │ ◀ end-drag ──└──────────────┘            │
// │  │      │                                          │
// │  │      │  down(empty) ┌─────────┐                 │
// │  │      │ ────────────▶│ MARQUEE │                 │
// │  │      │ ◀ mouse-up ──└─────────┘                 │
// │  │      │                                          │
// │  │      │  down(arena-center) ┌────────────┐       │
// │  │      │ ───────────────────▶│ ARENA_MOVE │       │
// │  │      │ ◀ pointer-up ───────└────────────┘       │
// │  │      │                                          │
// │  │      │  down(arena-edge)  ┌───────────────┐     │
// │  │      │ ──────────────────▶│ ARENA_RESIZE  │     │
// │  └──────┘ ◀ pointer-up ──────└───────────────┘     │
// └─────────────────────────────────────────────────────┘
// ══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────
// State types (discriminated union — exactly one active at a time)
// ─────────────────────────────────────────────────────────────

export type InteractionState =
  | IdleState
  | PanState
  | DragState
  | MarqueeState
  | ArenaMoveState
  | ArenaResizeState

export interface IdleState {
  readonly tag: 'IDLE'
  /** Whether the spacebar is currently held (affects cursor + mousedown routing) */
  spaceHeld: boolean
}

export interface PanState {
  readonly tag: 'PAN'
  startX: number
  startY: number
  lastX: number
  lastY: number
  /** Smoothed velocity for inertia on release */
  vx: number
  vy: number
  lastTime: number
}

export interface DragState {
  readonly tag: 'DRAG'
  /** The card being directly dragged by Matter constraint */
  leaderId: string
  /** World position at drag start (for tap detection on enddrag) */
  dragStartWorldX: number
  dragStartWorldY: number
  /** Follower cards: id → offset relative to leader at drag start */
  followers: ReadonlyMap<string, { dx: number; dy: number }>
}

export interface MarqueeState {
  readonly tag: 'MARQUEE'
  startX: number
  startY: number
  curX: number
  curY: number
}

export interface ArenaMoveState {
  readonly tag: 'ARENA_MOVE'
  arenaId: string
  startWx: number
  startWy: number
}

export interface ArenaResizeState {
  readonly tag: 'ARENA_RESIZE'
  arenaId: string
  startPx: number
  startPy: number
  startRadius: number
  hasHalfHeight: boolean
}

// ─────────────────────────────────────────────────────────────
// Event types
// ─────────────────────────────────────────────────────────────

export type InteractionEvent =
  // Raw mouse events (screen coords, pre-computed hit results)
  | MouseDownEvent
  | MouseMoveEvent
  | MouseUpEvent
  | WheelEvent_
  // Keyboard
  | KeyDownEvent
  | KeyUpEvent
  // Matter.js drag lifecycle
  | MatterStartDragEvent
  | MatterEndDragEvent
  | MatterInvalidDragEvent
  // Arena pointer events (from the runtime input layer)
  | ArenaPointerDownEvent
  | ArenaPointerMoveEvent
  | ArenaPointerUpEvent

export interface MouseDownEvent {
  type: 'MOUSE_DOWN'
  screenX: number
  screenY: number
  button: number // 0=left, 1=middle, 2=right
  /** Pre-computed card hit at this position (null = empty space) */
  hitCardId: string | null
  /** Pre-computed arena hit at this position */
  hitArena: {
    arenaId: string
    zone: 'center' | 'edge'
    worldX: number
    worldY: number
    radius: number
    hasHalfHeight: boolean
  } | null
  shiftKey: boolean
  metaKey: boolean
  ctrlKey: boolean
}

export interface MouseMoveEvent {
  type: 'MOUSE_MOVE'
  screenX: number
  screenY: number
  /** Pre-computed card under cursor (null = no hit) */
  hitCardId: string | null
  /** Current leader body world position (when in DRAG state) */
  leaderWorldX?: number
  leaderWorldY?: number
}

export interface MouseUpEvent {
  type: 'MOUSE_UP'
  button: number
  /** Smoothed pan velocity at moment of release (for inertia) */
  panVx: number
  panVy: number
}

export interface WheelEvent_ {
  type: 'WHEEL'
  screenX: number
  screenY: number
  deltaX: number
  deltaY: number
  ctrlKey: boolean
}

export interface KeyDownEvent {
  type: 'KEY_DOWN'
  code: string
}

export interface KeyUpEvent {
  type: 'KEY_UP'
  code: string
}

export interface MatterStartDragEvent {
  type: 'MATTER_START_DRAG'
  bodyLabel: string
  worldX: number
  worldY: number
  /** Pre-computed follower offsets (empty if single selection) */
  followers: ReadonlyMap<string, { dx: number; dy: number }>
}

export interface MatterEndDragEvent {
  type: 'MATTER_END_DRAG'
  bodyLabel: string
  /** Magnitude of world-space displacement from drag start */
  worldDeltaMag: number
  now: number
  /** Tap discrimination context (populated by handler) */
  lastTapCardId: string | null
  lastTapTime: number
}

export interface MatterInvalidDragEvent {
  type: 'MATTER_INVALID_DRAG'
}

export interface ArenaPointerDownEvent {
  type: 'ARENA_POINTER_DOWN'
  arenaId: string
  zone: 'center' | 'edge'
  worldX: number
  worldY: number
  screenX: number
  screenY: number
  radius: number
  hasHalfHeight: boolean
}

export interface ArenaPointerMoveEvent {
  type: 'ARENA_POINTER_MOVE'
  screenX: number
  screenY: number
  worldX: number
  worldY: number
}

export interface ArenaPointerUpEvent {
  type: 'ARENA_POINTER_UP'
}

// ─────────────────────────────────────────────────────────────
// Action types (side effects the handler must execute)
// ─────────────────────────────────────────────────────────────

export type InteractionAction =
  | { do: 'PAN_BY'; dx: number; dy: number }
  | { do: 'ZOOM_AT'; screenX: number; screenY: number; factor: number }
  | { do: 'SET_CURSOR'; cursor: string }
  | { do: 'SYNC_MATTER_VIEWPORT' }
  | { do: 'STORE_MOUSEDOWN_SCREEN'; x: number; y: number }
  | { do: 'CANCEL_MATTER_DRAG' }
  | { do: 'CARD_SET_ACTIVE'; cardId: string | null }
  | { do: 'CARD_SET_HOVER'; cardId: string | null }
  | { do: 'CARD_BRING_FRONT'; cardId: string }
  | { do: 'CARD_TAP'; cardId: string }
  | { do: 'CARD_FLIP'; cardId: string }
  | { do: 'SELECTION_SET'; hitCardId: string; multi: boolean; toggle: boolean }
  | { do: 'SELECTION_CLEAR' }
  | { do: 'SELECTION_ALL' }
  | { do: 'DRAG_NOTIFY_START'; cardId: string }
  | { do: 'DRAG_NOTIFY_END' }
  | {
      do: 'DRAG_MOVE_FOLLOWERS'
      leaderX: number
      leaderY: number
      followers: ReadonlyMap<string, { dx: number; dy: number }>
    }
  | { do: 'MARQUEE_START'; x: number; y: number }
  | { do: 'MARQUEE_UPDATE'; x1: number; y1: number; x2: number; y2: number }
  | { do: 'MARQUEE_END' }
  | { do: 'PAN_INERTIA'; vx: number; vy: number }
  | { do: 'MARK_ZOOM_ACTIVE' }
  | { do: 'ARENA_SELECT'; arenaId: string | null }
  | { do: 'ARENA_MOVE_DELTA'; arenaId: string; dwx: number; dwy: number }
  | {
      do: 'ARENA_RESIZE'
      arenaId: string
      screenDx: number
      screenDy: number
      startRadius: number
      hasHalfHeight: boolean
    }
  | { do: 'DELETE_SELECTED' }
  | { do: 'CANCEL_MARQUEE' }
  | { do: 'TAP_SCHEDULE'; cardId: string }
  | { do: 'TAP_RECORD'; cardId: string; time: number }
  | { do: 'TAP_RESET' }
  | { do: 'LINK_CARDS'; fromId: string; toId: string }

// ─────────────────────────────────────────────────────────────
// Transition result
// ─────────────────────────────────────────────────────────────

export interface TransitionResult {
  state: InteractionState
  actions: InteractionAction[]
}

// Double-click / tap constants
export const TAP_DELAY_MS = 320
export const DBLCLICK_MS = 350
export const DRAG_THRESHOLD = 5 // world units

// ─────────────────────────────────────────────────────────────
// The FSM
// ─────────────────────────────────────────────────────────────

export class InteractionFSM {
  state: InteractionState = { tag: 'IDLE', spaceHeld: false }

  dispatch(event: InteractionEvent): InteractionAction[] {
    const result = this._transition(this.state, event)
    this.state = result.state
    return result.actions
  }

  getState(): InteractionState {
    return this.state
  }

  // ── Core transition function ──────────────────────────────

  private _transition(s: InteractionState, e: InteractionEvent): TransitionResult {
    switch (e.type) {
      // ── KEYBOARD ───────────────────────────────────────────

      case 'KEY_DOWN': {
        if (e.code === 'Space' && s.tag === 'IDLE' && !s.spaceHeld) {
          return {
            state: { ...s, spaceHeld: true },
            actions: [{ do: 'SET_CURSOR', cursor: 'grab' }],
          }
        }
        if (e.code === 'Escape') {
          if (s.tag === 'MARQUEE') {
            return {
              state: idle(false),
              actions: [
                { do: 'CANCEL_MARQUEE' },
                { do: 'SELECTION_CLEAR' },
                { do: 'SET_CURSOR', cursor: '' },
              ],
            }
          }
          return {
            state: idle(s.tag === 'IDLE' ? s.spaceHeld : false),
            actions: [{ do: 'SELECTION_CLEAR' }],
          }
        }
        if (e.code === 'KeyA') {
          // Cmd+A is handled upstream (global keydown in Playground), just pass through
          return pass(s)
        }
        if ((e.code === 'Delete' || e.code === 'Backspace') && s.tag === 'IDLE') {
          return { state: s, actions: [{ do: 'DELETE_SELECTED' }] }
        }
        return pass(s)
      }

      case 'KEY_UP': {
        if (e.code === 'Space') {
          if (s.tag === 'IDLE') {
            return {
              state: { ...s, spaceHeld: false },
              actions: [{ do: 'SET_CURSOR', cursor: '' }],
            }
          }
          if (s.tag === 'PAN') {
            // Space released during pan: finish pan
            return {
              state: idle(false),
              actions: [
                { do: 'PAN_INERTIA', vx: s.vx, vy: s.vy },
                { do: 'SET_CURSOR', cursor: '' },
              ],
            }
          }
        }
        return pass(s)
      }

      // ── WHEEL ──────────────────────────────────────────────

      case 'WHEEL': {
        if (e.ctrlKey) {
          return {
            state: s,
            actions: [
              { do: 'MARK_ZOOM_ACTIVE' },
              {
                do: 'ZOOM_AT',
                screenX: e.screenX,
                screenY: e.screenY,
                factor: Math.pow(2, -e.deltaY * 0.008),
              },
              { do: 'SYNC_MATTER_VIEWPORT' },
            ],
          }
        }
        const isTrackpad =
          Math.abs(e.deltaX) > 0.5 || Math.abs(e.deltaY) < 60 || e.deltaY !== Math.round(e.deltaY)
        if (isTrackpad) {
          return {
            state: s,
            actions: [
              { do: 'PAN_BY', dx: -e.deltaX, dy: -e.deltaY },
              { do: 'SYNC_MATTER_VIEWPORT' },
            ],
          }
        }
        return {
          state: s,
          actions: [
            { do: 'MARK_ZOOM_ACTIVE' },
            {
              do: 'ZOOM_AT',
              screenX: e.screenX,
              screenY: e.screenY,
              factor: e.deltaY > 0 ? 0.92 : 1.08,
            },
            { do: 'SYNC_MATTER_VIEWPORT' },
          ],
        }
      }

      // ── MOUSE DOWN ─────────────────────────────────────────

      case 'MOUSE_DOWN': {
        // Middle button or Space+Left → pan
        if (e.button === 1 || (e.button === 0 && s.tag === 'IDLE' && s.spaceHeld)) {
          return {
            state: {
              tag: 'PAN',
              startX: e.screenX,
              startY: e.screenY,
              lastX: e.screenX,
              lastY: e.screenY,
              vx: 0,
              vy: 0,
              lastTime: Date.now(),
            },
            actions: [{ do: 'SET_CURSOR', cursor: 'grabbing' }],
          }
        }

        // Only process left-button from here
        if (e.button !== 0) return pass(s)
        // Only from IDLE state
        if (s.tag !== 'IDLE') return pass(s)

        // Arena takes priority
        if (e.hitArena) {
          const a = e.hitArena
          if (a.zone === 'center') {
            return {
              state: {
                tag: 'ARENA_MOVE',
                arenaId: a.arenaId,
                startWx: a.worldX,
                startWy: a.worldY,
              },
              actions: [
                { do: 'ARENA_SELECT', arenaId: a.arenaId },
                { do: 'SET_CURSOR', cursor: 'move' },
              ],
            }
          } else {
            return {
              state: {
                tag: 'ARENA_RESIZE',
                arenaId: a.arenaId,
                startPx: e.screenX,
                startPy: e.screenY,
                startRadius: a.radius,
                hasHalfHeight: a.hasHalfHeight,
              },
              actions: [
                { do: 'ARENA_SELECT', arenaId: a.arenaId },
                { do: 'SET_CURSOR', cursor: 'nwse-resize' },
              ],
            }
          }
        }

        // Store mousedown position for Matter startdrag validation
        const commonActions: InteractionAction[] = [
          { do: 'STORE_MOUSEDOWN_SCREEN', x: e.screenX, y: e.screenY },
          { do: 'SYNC_MATTER_VIEWPORT' },
        ]

        if (e.hitCardId) {
          // Quick-link with Cmd/Ctrl
          if (e.metaKey || e.ctrlKey) {
            // Actual link action dispatched downstream (needs selectedCardIds — handled in handler)
            return {
              state: s,
              actions: [
                ...commonActions,
                { do: 'SELECTION_SET', hitCardId: e.hitCardId, multi: false, toggle: false },
              ],
            }
          }
          // Toggle selection with Shift
          if (e.shiftKey) {
            return {
              state: s,
              actions: [
                ...commonActions,
                { do: 'SELECTION_SET', hitCardId: e.hitCardId, multi: true, toggle: true },
              ],
            }
          }
          // Normal click on card — select it; Matter will fire startdrag shortly
          return {
            state: s,
            actions: [
              ...commonActions,
              { do: 'SELECTION_SET', hitCardId: e.hitCardId, multi: false, toggle: false },
            ],
          }
        }

        // Empty space — deselect + start marquee (unless shift)
        const marqueeActions: InteractionAction[] = [...commonActions, { do: 'SELECTION_CLEAR' }]
        if (!e.shiftKey) {
          marqueeActions.push({ do: 'MARQUEE_START', x: e.screenX, y: e.screenY })
        }
        return {
          state: e.shiftKey
            ? s
            : {
                tag: 'MARQUEE',
                startX: e.screenX,
                startY: e.screenY,
                curX: e.screenX,
                curY: e.screenY,
              },
          actions: marqueeActions,
        }
      }

      // ── MOUSE MOVE ─────────────────────────────────────────

      case 'MOUSE_MOVE': {
        if (s.tag === 'PAN') {
          // Computed outside: panStartX/Y are stored in state
          // We can't compute dx/dy here without knowing previous pos — it's in state
          return {
            state: { ...s },
            actions: [
              // PAN_BY delta computed in handler from s.lastX/Y
              { do: 'PAN_BY', dx: 0, dy: 0 }, // placeholder — handler will override with correct delta
              { do: 'SYNC_MATTER_VIEWPORT' },
            ],
          }
        }

        if (s.tag === 'MARQUEE') {
          return {
            state: { ...s, curX: e.screenX, curY: e.screenY },
            actions: [
              {
                do: 'MARQUEE_UPDATE',
                x1: s.startX,
                y1: s.startY,
                x2: e.screenX,
                y2: e.screenY,
              },
            ],
          }
        }

        if (
          s.tag === 'DRAG' &&
          s.followers.size > 0 &&
          e.leaderWorldX !== undefined &&
          e.leaderWorldY !== undefined
        ) {
          return {
            state: s,
            actions: [
              { do: 'SYNC_MATTER_VIEWPORT' },
              {
                do: 'DRAG_MOVE_FOLLOWERS',
                leaderX: e.leaderWorldX,
                leaderY: e.leaderWorldY,
                followers: s.followers,
              },
              { do: 'CARD_SET_HOVER', cardId: e.hitCardId },
            ],
          }
        }

        // Default: hover + sync
        const moveActions: InteractionAction[] = [{ do: 'SYNC_MATTER_VIEWPORT' }]
        if (s.tag === 'IDLE') {
          moveActions.push({ do: 'CARD_SET_HOVER', cardId: e.hitCardId })
          moveActions.push({ do: 'SET_CURSOR', cursor: e.hitCardId ? 'grab' : '' })
        }
        return { state: s, actions: moveActions }
      }

      // ── MOUSE UP ───────────────────────────────────────────

      case 'MOUSE_UP': {
        if (s.tag === 'PAN') {
          return {
            state: idle(false),
            actions: [
              { do: 'PAN_INERTIA', vx: s.vx, vy: s.vy },
              { do: 'SET_CURSOR', cursor: '' },
            ],
          }
        }
        if (s.tag === 'MARQUEE') {
          return {
            state: idle(false),
            actions: [{ do: 'MARQUEE_END' }, { do: 'SET_CURSOR', cursor: '' }],
          }
        }
        if (s.tag === 'IDLE') {
          // Click on empty space with arena selected → deselect arena
          return { state: s, actions: [{ do: 'ARENA_SELECT', arenaId: null }] }
        }
        return pass(s)
      }

      // ── MATTER DRAG EVENTS ─────────────────────────────────

      case 'MATTER_INVALID_DRAG': {
        // Hit-test failed — cancel the phantom drag
        return { state: s, actions: [{ do: 'CANCEL_MATTER_DRAG' }] }
      }

      case 'MATTER_START_DRAG': {
        if (s.tag === 'IDLE') {
          return {
            state: {
              tag: 'DRAG',
              leaderId: e.bodyLabel,
              dragStartWorldX: e.worldX,
              dragStartWorldY: e.worldY,
              followers: e.followers,
            },
            actions: [
              { do: 'CARD_SET_ACTIVE', cardId: e.bodyLabel },
              { do: 'CARD_BRING_FRONT', cardId: e.bodyLabel },
              { do: 'DRAG_NOTIFY_START', cardId: e.bodyLabel },
              { do: 'SET_CURSOR', cursor: 'grabbing' },
            ],
          }
        }
        return pass(s)
      }

      case 'MATTER_END_DRAG': {
        if (s.tag !== 'DRAG') return pass(s)

        const endActions: InteractionAction[] = [
          { do: 'CARD_SET_ACTIVE', cardId: null },
          { do: 'DRAG_NOTIFY_END' },
        ]

        const isTap = e.worldDeltaMag < DRAG_THRESHOLD
        if (isTap) {
          const isSameCard = e.bodyLabel === e.lastTapCardId
          const isQuick = e.lastTapCardId !== null && e.now - e.lastTapTime < DBLCLICK_MS

          if (isSameCard && isQuick) {
            // Double-tap → flip
            endActions.push({ do: 'CARD_FLIP', cardId: e.bodyLabel })
            endActions.push({ do: 'TAP_RESET' })
          } else {
            // First tap — schedule single-tap callback
            endActions.push({ do: 'TAP_SCHEDULE', cardId: e.bodyLabel })
            endActions.push({ do: 'TAP_RECORD', cardId: e.bodyLabel, time: e.now })
          }
        }

        const spaceHeld = false // drag doesn't track space; reset to safe default
        endActions.push({
          do: 'SET_CURSOR',
          cursor: spaceHeld ? 'grab' : '',
        })

        return { state: idle(false), actions: endActions }
      }

      // ── ARENA POINTER EVENTS ───────────────────────────────

      case 'ARENA_POINTER_DOWN': {
        if (e.zone === 'center') {
          return {
            state: { tag: 'ARENA_MOVE', arenaId: e.arenaId, startWx: e.worldX, startWy: e.worldY },
            actions: [
              { do: 'ARENA_SELECT', arenaId: e.arenaId },
              { do: 'SET_CURSOR', cursor: 'move' },
            ],
          }
        }
        return {
          state: {
            tag: 'ARENA_RESIZE',
            arenaId: e.arenaId,
            startPx: e.screenX,
            startPy: e.screenY,
            startRadius: e.radius,
            hasHalfHeight: e.hasHalfHeight,
          },
          actions: [
            { do: 'ARENA_SELECT', arenaId: e.arenaId },
            { do: 'SET_CURSOR', cursor: 'nwse-resize' },
          ],
        }
      }

      case 'ARENA_POINTER_MOVE': {
        if (s.tag === 'ARENA_MOVE') {
          return {
            state: { ...s, startWx: e.worldX, startWy: e.worldY },
            actions: [
              {
                do: 'ARENA_MOVE_DELTA',
                arenaId: s.arenaId,
                dwx: e.worldX - s.startWx,
                dwy: e.worldY - s.startWy,
              },
            ],
          }
        }
        if (s.tag === 'ARENA_RESIZE') {
          const dx = e.screenX - s.startPx
          const dy = e.screenY - s.startPy
          return {
            state: s,
            actions: [
              {
                do: 'ARENA_RESIZE',
                arenaId: s.arenaId,
                screenDx: dx,
                screenDy: dy,
                startRadius: s.startRadius,
                hasHalfHeight: s.hasHalfHeight,
              },
            ],
          }
        }
        return pass(s)
      }

      case 'ARENA_POINTER_UP': {
        if (s.tag === 'ARENA_MOVE' || s.tag === 'ARENA_RESIZE') {
          return { state: idle(false), actions: [{ do: 'SET_CURSOR', cursor: '' }] }
        }
        return pass(s)
      }

      default:
        return pass(s)
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function idle(spaceHeld: boolean): IdleState {
  return { tag: 'IDLE', spaceHeld }
}

function pass(s: InteractionState): TransitionResult {
  return { state: s, actions: [] }
}
