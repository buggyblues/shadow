// ══════════════════════════════════════════════════════════════
// Arena System — ECS scene system for arena management
//
// Replaces arenas/arenaManager.ts. Follows the module-level
// singleton pattern used by other ECS systems.
//
// All arena state lives in the module-level _arenas Map.
// Built-in behaviors (magic-circle, grid) are default scripts.
// Custom arenas can supply any JS string via arena.script.
// The script API is the single unified execution path.
// ══════════════════════════════════════════════════════════════

import type { Card } from '@shadowob/flash-types'
import Matter from 'matter-js'
import { CARD_H, CARD_W } from '../../constants'
import { getCardEid } from '../../core/entity'

// ─────────────────────────────────────
// CArena — SoA ECS component (inline, belongs to this system)
// ─────────────────────────────────────

/** SoA component: arena membership per entity. '' = no arena. */
const CArenaId: string[] = []

function setCardArena(eid: number, arenaId: string | null): void {
  CArenaId[eid] = arenaId ?? ''
}

function getCardArena(eid: number): string | null {
  const id = CArenaId[eid]
  return id && id.length > 0 ? id : null
}

// ─────────────────────────────────────
// Types
// ─────────────────────────────────────

export type ArenaKind = 'magic-circle' | 'grid' | 'custom'
export type ArenaShape = 'circle' | 'rect'

export interface ArenaGridOptions {
  sortBy?: 'title' | 'kind' | 'priority' | 'none'
  gap?: number
  cols?: number
}

export interface ArenaMagicOptions {
  flip?: boolean
  scatter?: boolean
  rotationRange?: number
}

/** API exposed to arena scripts. All built-in behaviors use this same API. */
export interface ArenaScriptAPI {
  arena: Readonly<Arena>
  cards: ReadonlyArray<{ id: string; title: string; kind: string }>
  /** True only on the very first activation of this arena */
  isFirstActivation: boolean
  move: (cardId: string, x: number, y: number, duration?: number) => void
  rotate: (cardId: string, degrees: number) => void
  flip: (cardId: string, face?: 'front' | 'back' | 'toggle') => void
  highlight: (cardId: string, color?: string, duration?: number) => void
  /** Make a card orbit the arena center (or custom cx/cy) for multiple rounds then stop */
  orbit: (
    cardId: string,
    params?: {
      cx?: number
      cy?: number
      rounds?: number
      duration?: number
      speedVariation?: number
    },
  ) => void
  /** Scatter cards randomly within the arena (shuffle-style) */
  scatter: () => void
  /** Arrange cards in a sorted grid within the arena */
  grid: (sortBy?: 'title' | 'kind' | 'priority' | 'none') => void
}

export interface Arena {
  id: string
  label: string
  kind: ArenaKind
  shape: ArenaShape
  /** World-space center X */
  x: number
  /** World-space center Y */
  y: number
  /** Radius (circle) or half-width (rect) */
  radius: number
  /** Half-height (rect only) */
  halfHeight: number
  /** Cards currently inside this arena (updated by syncArenaMembership) */
  cardIds: string[]
  activated: boolean
  /** Number of times this arena has been activated */
  activationCount: number
  color: string
  gridOptions?: ArenaGridOptions
  magicOptions?: ArenaMagicOptions
  /**
   * JS script body executed on activation.
   * Receives `api: ArenaScriptAPI` as the only variable.
   * Set to override the built-in behavior for any kind.
   */
  script?: string
}

// ─────────────────────────────────────
// Built-in behavior scripts
// ─────────────────────────────────────

/** Shuffle-scatter with multi-round orbital spin then settle */
const SCRIPT_MAGIC_CIRCLE = `
var n = api.cards.length;
if (n === 0) return;
// Flip all cards to back face first (hide identity before shuffle)
api.cards.forEach(function(card) {
  api.flip(card.id, 'back');
});
// Each card orbits the arena center for 2-4 rounds at varying speeds.
// Cards are placed on different radial rings and end at different angles = shuffled positions.
api.cards.forEach(function(card, i) {
  var rounds = 2 + Math.floor(Math.random() * 3);
  var dur = 1800 + Math.random() * 1200;
  var r = api.arena.radius * (0.25 + 0.6 * Math.sqrt((i + 0.5) / n));
  api.orbit(card.id, { cx: api.arena.x, cy: api.arena.y, radius: r, rounds: rounds, duration: dur, speedVariation: 0.5 });
  api.highlight(card.id);
});
`.trim()

/** Grid snap + sort */
const SCRIPT_GRID = `
var sortBy = api.arena.gridOptions && api.arena.gridOptions.sortBy ? api.arena.gridOptions.sortBy : 'kind';
api.grid(sortBy);
api.cards.forEach(function(card) { api.highlight(card.id, undefined, 800); });
`.trim()

function _getBuiltinScript(kind: ArenaKind): string {
  if (kind === 'magic-circle') return SCRIPT_MAGIC_CIRCLE
  if (kind === 'grid') return SCRIPT_GRID
  return '// custom script — no default behavior'
}

// ─────────────────────────────────────
// Module-level arena store (ECS resource)
// ─────────────────────────────────────

let _nextArenaId = 1
const _arenas = new Map<string, Arena>()

// ─────────────────────────────────────
// CRUD
// ─────────────────────────────────────

export function createArena(opts: {
  kind?: ArenaKind
  shape?: ArenaShape
  x: number
  y: number
  radius?: number
  halfHeight?: number
  label?: string
  color?: string
  gridOptions?: ArenaGridOptions
  magicOptions?: ArenaMagicOptions
  script?: string
}): Arena {
  const kind: ArenaKind = opts.kind ?? 'magic-circle'
  const shape: ArenaShape = opts.shape ?? (kind === 'grid' ? 'rect' : 'circle')
  const radius = opts.radius ?? 280
  const halfHeight = opts.halfHeight ?? radius * 0.7

  const defaultColors: Record<ArenaKind, string> = {
    'magic-circle': '#a855f7',
    grid: '#3b82f6',
    custom: '#f59e0b',
  }

  const arena: Arena = {
    id: `arena-${_nextArenaId++}`,
    label: opts.label ?? `${kind} arena`,
    kind,
    shape,
    x: opts.x,
    y: opts.y,
    radius,
    halfHeight,
    cardIds: [],
    activated: false,
    activationCount: 0,
    color: opts.color ?? defaultColors[kind],
    gridOptions: opts.gridOptions ?? { sortBy: 'kind', gap: 20 },
    magicOptions: opts.magicOptions ?? { flip: true, scatter: true, rotationRange: 30 },
    script: opts.script,
  }
  _arenas.set(arena.id, arena)
  return arena
}

export function getArena(id: string): Arena | undefined {
  return _arenas.get(id)
}

export function getAllArenas(): Arena[] {
  return Array.from(_arenas.values())
}

export function removeArena(id: string): boolean {
  return _arenas.delete(id)
}

export function clearArenas(): void {
  _arenas.clear()
}

/** Unified interface for DeskLoop backward compat (same surface as old ArenaManager) */
export const arenaStore = {
  create: createArena,
  get: getArena,
  getAll: getAllArenas,
  remove: removeArena,
  clear: clearArenas,
  hitTest: hitTestArena,
  syncMembership: syncArenaMembership,
  /** Same signature as old activate(arenaId, bodiesMap, cards, dispatch) but dispatch is now a fn */
  activate: activateArena,
  moveCardTo: moveCardToArena,
}

// ─────────────────────────────────────
// Hit testing
// ─────────────────────────────────────

export function hitTestArena(wx: number, wy: number): Arena | null {
  for (const arena of _arenas.values()) {
    if (_contains(arena, wx, wy)) return arena
  }
  return null
}

/** Returns first arena containing point (world coords) */
export function hitTestArenas(wx: number, wy: number): Arena[] {
  const result: Arena[] = []
  for (const arena of _arenas.values()) {
    if (_contains(arena, wx, wy)) result.push(arena)
  }
  return result
}

function _contains(arena: Arena, wx: number, wy: number): boolean {
  const dx = wx - arena.x
  const dy = wy - arena.y
  if (arena.shape === 'circle') {
    return dx * dx + dy * dy <= arena.radius * arena.radius
  } else {
    return Math.abs(dx) <= arena.radius && Math.abs(dy) <= arena.halfHeight
  }
}

// ─────────────────────────────────────
// Membership sync (frame-level ECS system)
// ─────────────────────────────────────

/**
 * Update arena.cardIds and CArena ECS components based on current physics positions.
 * Call once per frame from the render loop.
 */
export function syncArenaMembership(bodiesMap: Map<string, Matter.Body>): void {
  for (const arena of _arenas.values()) {
    arena.cardIds = []
  }
  for (const [cardId, body] of bodiesMap) {
    let foundArenaId: string | null = null
    for (const arena of _arenas.values()) {
      if (_contains(arena, body.position.x, body.position.y)) {
        arena.cardIds.push(cardId)
        foundArenaId = arena.id // last match wins on overlap
      }
    }
    const eid = getCardEid(cardId)
    if (eid !== undefined) {
      const prev = getCardArena(eid)
      if (prev !== foundArenaId) {
        setCardArena(eid, foundArenaId)
      }
    }
  }
}

// ─────────────────────────────────────
// Activation (script execution)
// ─────────────────────────────────────

/**
 * Activate an arena. Runs the arena's script (or built-in preset).
 * The script receives an ArenaScriptAPI object.
 */
export function activateArena(
  arenaId: string,
  bodiesMap: Map<string, Matter.Body>,
  cards: Card[],
  dispatch: (name: string, cardId: string, params: Record<string, unknown>) => void,
): { success: boolean; error?: string } {
  const arena = _arenas.get(arenaId)
  if (!arena) return { success: false, error: `Arena "${arenaId}" not found` }

  // Sync membership before activation
  syncArenaMembership(bodiesMap)

  if (arena.cardIds.length === 0) {
    return { success: false, error: 'No cards in arena' }
  }

  arena.activationCount++
  arena.activated = true
  const isFirstActivation = arena.activationCount === 1

  // Build ArenaScriptAPI
  const arenaCards = arena.cardIds
    .map((id) => cards.find((c) => c.id === id))
    .filter((c): c is Card => c !== undefined)
    .map((c) => ({ id: c.id, title: c.title, kind: c.kind }))

  const api: ArenaScriptAPI = {
    arena,
    cards: arenaCards,
    isFirstActivation,
    move: (cardId, x, y, duration) => {
      dispatch('move', cardId, { x, y, duration: duration ?? 600, easing: 'spring' })
    },
    rotate: (cardId, degrees) => {
      dispatch('rotate', cardId, { delta: degrees, duration: 500 })
    },
    flip: (cardId, face) => {
      dispatch('flip', cardId, { face: face ?? 'toggle' })
    },
    highlight: (cardId, color, duration) => {
      dispatch('highlight', cardId, {
        color: color ?? arena.color,
        duration: duration ?? 1200,
        pulse: true,
      })
    },
    orbit: (cardId, params = {}) => {
      dispatch('orbit', cardId, {
        cx: params.cx ?? arena.x,
        cy: params.cy ?? arena.y,
        rounds: params.rounds ?? 3,
        duration: params.duration ?? 2400,
        speedVariation: params.speedVariation ?? 0.4,
      })
    },
    scatter: () => _runScatter(arena, arenaCards, dispatch),
    grid: (sortBy) => _runGrid(arena, arenaCards, cards, dispatch, sortBy),
  }

  const scriptBody = arena.script ?? _getBuiltinScript(arena.kind)

  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function('api', scriptBody)
    fn(api)
  } catch (err) {
    return { success: false, error: `Script error: ${(err as Error).message}` }
  }

  return { success: true }
}

// ─────────────────────────────────────
// Script API helpers (internal)
// ─────────────────────────────────────

function _runScatter(
  arena: Arena,
  arenaCards: Array<{ id: string; title: string; kind: string }>,
  dispatch: (name: string, cardId: string, params: Record<string, unknown>) => void,
): void {
  const n = arenaCards.length
  if (n === 0) return

  const positions = arenaCards.map((_, i) => {
    const angle = i * 2.399963 + (Math.random() * 0.8 - 0.4)
    const r =
      arena.radius * 0.65 * Math.sqrt((i + 0.5) / n) + (Math.random() - 0.5) * arena.radius * 0.12
    return {
      x: arena.x + Math.cos(angle) * r,
      y: arena.y + Math.sin(angle) * r,
    }
  })

  // Fisher-Yates shuffle
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[positions[i], positions[j]] = [positions[j], positions[i]]
  }

  arenaCards.forEach((card, i) => {
    dispatch('move', card.id, {
      x: positions[i].x,
      y: positions[i].y,
      duration: 600 + Math.random() * 400,
      easing: 'spring',
    })
    dispatch('rotate', card.id, { delta: (Math.random() - 0.5) * 60, duration: 500 })
  })
}

function _runGrid(
  arena: Arena,
  arenaCards: Array<{ id: string; title: string; kind: string }>,
  allCards: Card[],
  dispatch: (name: string, cardId: string, params: Record<string, unknown>) => void,
  sortBy?: string,
): void {
  const opts = arena.gridOptions ?? {}
  const gap = opts.gap ?? 20
  const resolvedSortBy = sortBy ?? opts.sortBy ?? 'kind'

  let sorted = [...arenaCards]
  if (resolvedSortBy !== 'none') {
    const cardMap = new Map(allCards.map((c) => [c.id, c]))
    sorted.sort((a, b) => {
      const ca = cardMap.get(a.id)
      const cb = cardMap.get(b.id)
      if (!ca || !cb) return 0
      if (resolvedSortBy === 'title') return (ca.title ?? '').localeCompare(cb.title ?? '')
      if (resolvedSortBy === 'kind') return (ca.kind ?? '').localeCompare(cb.kind ?? '')
      if (resolvedSortBy === 'priority') {
        const order = { high: 0, medium: 1, low: 2 }
        return (
          (order[ca.priority as keyof typeof order] ?? 1) -
          (order[cb.priority as keyof typeof order] ?? 1)
        )
      }
      return 0
    })
  }

  const n = sorted.length
  const availW = arena.radius * 2
  const availH = (arena.halfHeight ?? arena.radius * 0.7) * 2

  // Prefer to fill horizontal space: max columns that fit
  const maxColsByWidth = Math.max(1, Math.floor((availW + gap) / (CARD_W + gap)))

  let cols: number
  let effectiveGapX = gap
  let effectiveGapY = gap

  if (opts.cols) {
    cols = opts.cols
  } else {
    // Start with max cols that fit width
    cols = maxColsByWidth
    const rows = Math.ceil(n / cols)
    const neededH = rows * (CARD_H + gap) - gap
    if (neededH > availH) {
      // Won't fit vertically — allow stacking (vertical overlap) while keeping columns
      // Compute gap to evenly distribute rows in availH
      const rowCount = Math.ceil(n / cols)
      if (rowCount > 1) {
        effectiveGapY = Math.min(gap, (availH - CARD_H) / (rowCount - 1) - CARD_H)
        // If still negative, cap at -CARD_H*0.5 (no more than 50% overlap)
        effectiveGapY = Math.max(effectiveGapY, -CARD_H * 0.5)
      }
    }
  }

  const rows = Math.ceil(n / cols)
  const totalW = cols * (CARD_W + effectiveGapX) - effectiveGapX
  const totalH = rows * (CARD_H + effectiveGapY) - effectiveGapY
  const startX = arena.x - totalW / 2 + CARD_W / 2
  const startY = arena.y - totalH / 2 + CARD_H / 2

  sorted.forEach((card, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const tx = startX + col * (CARD_W + effectiveGapX)
    const ty = startY + row * (CARD_H + effectiveGapY)
    dispatch('move', card.id, { x: tx, y: ty, duration: 600 + i * 30, easing: 'ease-in-out' })
    dispatch('rotate', card.id, { angle: 0, duration: 400 })
  })
}

// ─────────────────────────────────────
// Move card to arena center
// ─────────────────────────────────────

export function moveCardToArena(
  cardId: string,
  arenaId: string,
  dispatch: (name: string, cardId: string, params: Record<string, unknown>) => void,
): { success: boolean; error?: string } {
  const arena = _arenas.get(arenaId)
  if (!arena) return { success: false, error: `Arena "${arenaId}" not found` }

  const offset = {
    x: (Math.random() - 0.5) * arena.radius * 0.3,
    y: (Math.random() - 0.5) * arena.radius * 0.3,
  }
  dispatch('move', cardId, {
    x: arena.x + offset.x,
    y: arena.y + offset.y,
    duration: 500,
    easing: 'spring',
  })
  dispatch('highlight', cardId, { color: arena.color, duration: 800, pulse: false })

  if (!arena.cardIds.includes(cardId)) {
    arena.cardIds.push(cardId)
  }

  return { success: true }
}
