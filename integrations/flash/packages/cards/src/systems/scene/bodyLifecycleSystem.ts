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

function persistedLayout(card: Card): PersistedLayout | null {
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
  return Matter.Bodies.rectangle(x, y, CARD_W, CARD_H, {
    restitution: 0.3,
    friction: 0.15,
    frictionAir: 0.08,
    angle,
    isStatic: layout?.locked ?? false,
    chamfer: { radius: 14 },
    label: card.id,
    collisionFilter: { group: -1 },
  })
}

/** Seed all bodies for an initial card list (call once at engine init). */
export function seedBodies(world: PhysicsWorld, cards: Card[]): void {
  const { engine, bodiesMap } = world
  const cols = Math.max(1, Math.ceil(Math.sqrt(cards.length)))
  let idx = 0
  for (const card of cards) {
    if (bodiesMap.has(card.id)) continue
    const body = makeBody(card, cols, idx++)
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
  const currentIds = new Set(cards.map((c) => c.id))

  // Remove bodies for deleted cards
  bodiesMap.forEach((body, id) => {
    if (!currentIds.has(id)) {
      Matter.World.remove(engine.world, body)
      bodiesMap.delete(id)
    }
  })

  // Add bodies for new cards
  const cols = Math.max(1, Math.ceil(Math.sqrt(cards.length)))
  let newIdx = 0
  for (const card of cards) {
    const existing = bodiesMap.get(card.id)
    const layout = persistedLayout(card)
    if (existing) {
      const preserveLayout = options.preserveLayoutIds?.has(card.id) === true
      if (!preserveLayout && layout?.x !== undefined && layout?.y !== undefined) {
        Matter.Body.setPosition(existing, { x: layout.x, y: layout.y })
      }
      if (!preserveLayout && layout?.angle !== undefined)
        Matter.Body.setAngle(existing, layout.angle)
      if (layout?.locked !== undefined) Matter.Body.setStatic(existing, layout.locked)
      continue
    }
    const body = makeBody(card, cols, newIdx++)
    bodiesMap.set(card.id, body)
    Matter.World.add(engine.world, body)
  }
}

/** Advance physics simulation by delta ms. */
export function physicsStep(engine: Matter.Engine, delta: number): void {
  // Cap delta to 16.667ms (60fps) to prevent physics instability on slow frames
  Matter.Engine.update(engine, Math.min(delta, 16.667))
}
