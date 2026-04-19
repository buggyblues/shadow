// ══════════════════════════════════════════════════════════════
// bodyLifecycleSystem — ECS system
//
// Syncs Matter.js bodies to the current card list.
// Adds bodies for new cards, removes bodies for deleted cards.
// ══════════════════════════════════════════════════════════════

import Matter from 'matter-js'
import { CARD_H, CARD_SPACING_X, CARD_SPACING_Y, CARD_W } from '../../constants/card'
import type { Card } from '../../types'
import type { PhysicsWorld } from '../resources/physicsWorld'

function makeBody(card: Card, cols: number, index: number): Matter.Body {
  const col = index % cols
  const row = Math.floor(index / cols)
  const x = 200 + col * CARD_SPACING_X + (Math.random() - 0.5) * 30
  const y = 200 + row * CARD_SPACING_Y + (Math.random() - 0.5) * 30
  const angle = (Math.random() - 0.5) * 0.15
  return Matter.Bodies.rectangle(x, y, CARD_W, CARD_H, {
    restitution: 0.3,
    friction: 0.15,
    frictionAir: 0.08,
    angle,
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
export function syncBodies(world: PhysicsWorld, cards: Card[]): void {
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
    if (bodiesMap.has(card.id)) continue
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
