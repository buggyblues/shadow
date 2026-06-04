// ══════════════════════════════════════════════════════════════
// bodyLifecycleSystem — ECS system
//
// Syncs Matter.js bodies to the current card list.
// Adds bodies for new cards, removes bodies for deleted cards.
// ══════════════════════════════════════════════════════════════

import type { Card } from '@shadowob/flash-types'
import Matter from 'matter-js'
import { CARD_H, CARD_SPACING_X, CARD_SPACING_Y, CARD_W } from '../../constants'
import type { PhysicsWorld } from '../../resources/physicsWorld'

interface PersistedLayout {
  x?: number
  y?: number
  angle?: number
  locked?: boolean
}

interface BodyLayoutPlugin {
  flashLayoutKey?: string
}

const RECONCILE_POS_EPS = 0.25
const RECONCILE_ANGLE_EPS = 0.0004

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function persistedLayout(card: Card): PersistedLayout | null {
  const direct = (card as Card & { layout?: PersistedLayout }).layout
  if (direct && typeof direct === 'object') return direct
  const meta = card.meta as { layout?: PersistedLayout } | null
  const layout = meta?.layout
  if (!layout || typeof layout !== 'object') return null
  return layout
}

function makeBody(card: Card, cols: number, index: number): Matter.Body {
  const col = index % cols
  const row = Math.floor(index / cols)
  const layout = persistedLayout(card)
  const x = layout?.x ?? 200 + col * CARD_SPACING_X + (Math.random() - 0.5) * 30
  const y = layout?.y ?? 200 + row * CARD_SPACING_Y + (Math.random() - 0.5) * 30
  const angle = layout?.angle ?? (Math.random() - 0.5) * 0.15
  const body = Matter.Bodies.rectangle(x, y, CARD_W, CARD_H, {
    restitution: 0.3,
    friction: 0.15,
    frictionAir: 0.08,
    angle,
    isStatic: layout?.locked ?? false,
    chamfer: { radius: 14 },
    label: card.id,
    collisionFilter: { group: -1 },
  })
  setLayoutKey(body, layout)
  return body
}

function layoutKey(layout: PersistedLayout | null): string {
  return JSON.stringify({
    x: finite(layout?.x),
    y: finite(layout?.y),
    angle: finite(layout?.angle),
    locked: layout?.locked,
  })
}

function layoutPlugin(body: Matter.Body): BodyLayoutPlugin {
  const target = body as Matter.Body & { plugin?: BodyLayoutPlugin }
  target.plugin = target.plugin ?? {}
  return target.plugin
}

function setLayoutKey(body: Matter.Body, layout: PersistedLayout | null): void {
  layoutPlugin(body).flashLayoutKey = layoutKey(layout)
}

function reconcileBodyToLayout(
  body: Matter.Body,
  layout: PersistedLayout | null,
  preserveLayout: boolean,
): void {
  if (!layout) return
  const nextKey = layoutKey(layout)
  const plugin = layoutPlugin(body)
  if (plugin.flashLayoutKey === nextKey) return

  if (!preserveLayout) {
    const x = finite(layout.x)
    const y = finite(layout.y)
    if (x !== undefined && y !== undefined) {
      const dx = Math.abs(body.position.x - x)
      const dy = Math.abs(body.position.y - y)
      if (dx > RECONCILE_POS_EPS || dy > RECONCILE_POS_EPS) {
        Matter.Body.setPosition(body, { x, y })
        Matter.Body.setVelocity(body, { x: 0, y: 0 })
      }
    }

    const angle = finite(layout.angle)
    if (angle !== undefined && Math.abs(body.angle - angle) > RECONCILE_ANGLE_EPS) {
      Matter.Body.setAngle(body, angle)
      Matter.Body.setAngularVelocity(body, 0)
    }

    if (layout.locked !== undefined && body.isStatic !== layout.locked) {
      Matter.Body.setStatic(body, layout.locked)
    }
    plugin.flashLayoutKey = nextKey
    return
  }

  if (layout.locked !== undefined && body.isStatic !== layout.locked) {
    Matter.Body.setStatic(body, layout.locked)
  }
}

/** Seed all bodies for an initial card list (call once at engine init). */
export function seedBodies(world: PhysicsWorld, cards: Card[]): void {
  const { engine, bodiesMap } = world
  const safeCards = Array.isArray(cards)
    ? cards.filter((card): card is Card => Boolean(card?.id))
    : []
  const cols = Math.max(1, Math.ceil(Math.sqrt(safeCards.length)))
  for (let index = 0; index < safeCards.length; index++) {
    const card = safeCards[index]!
    if (bodiesMap.has(card.id)) continue
    const body = makeBody(card, cols, index)
    bodiesMap.set(card.id, body)
    Matter.World.add(engine.world, body)
  }
}

/** Sync bodies to the current card list: add missing, remove stale. */
export interface SyncBodiesOptions {
  preserveLayoutIds?: Set<string>
}

export function syncBodies(
  world: PhysicsWorld,
  cards: Card[],
  options: SyncBodiesOptions = {},
): void {
  const { engine, bodiesMap } = world
  const safeCards = Array.isArray(cards)
    ? cards.filter((card): card is Card => Boolean(card?.id))
    : []
  const currentIds = new Set(safeCards.map((c) => c.id))

  // Remove bodies for deleted cards
  bodiesMap.forEach((body, id) => {
    if (!currentIds.has(id)) {
      Matter.World.remove(engine.world, body)
      bodiesMap.delete(id)
    }
  })

  // Add bodies for new cards
  const cols = Math.max(1, Math.ceil(Math.sqrt(safeCards.length)))
  for (let index = 0; index < safeCards.length; index++) {
    const card = safeCards[index]!
    const existing = bodiesMap.get(card.id)
    const layout = persistedLayout(card)
    if (existing) {
      const preserveLayout = options.preserveLayoutIds?.has(card.id) === true
      reconcileBodyToLayout(existing, layout, preserveLayout)
      continue
    }
    const body = makeBody(card, cols, index)
    bodiesMap.set(card.id, body)
    Matter.World.add(engine.world, body)
  }
}

/** Advance physics simulation by delta ms. */
export function physicsStep(engine: Matter.Engine, delta: number): void {
  // Cap delta to 16.667ms (60fps) to prevent physics instability on slow frames
  Matter.Engine.update(engine, Math.min(delta, 16.667))
}
