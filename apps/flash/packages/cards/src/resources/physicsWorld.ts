// ══════════════════════════════════════════════════════════════
// PhysicsWorld — ECS resource
//
// Owns the Matter.js engine and the card-body registry.
// Pure data / lifecycle — no React, no render.
// ══════════════════════════════════════════════════════════════

import Matter from 'matter-js'

export interface PhysicsWorld {
  engine: Matter.Engine
  bodiesMap: Map<string, Matter.Body>
  mouseConstraint: Matter.MouseConstraint | null
}

export function createPhysicsWorld(): PhysicsWorld {
  const engine = Matter.Engine.create({ gravity: { x: 0, y: 0, scale: 0.001 } })
  return {
    engine,
    bodiesMap: new Map(),
    mouseConstraint: null,
  }
}

export function destroyPhysicsWorld(world: PhysicsWorld): void {
  Matter.World.clear(world.engine.world, false)
  Matter.Engine.clear(world.engine)
  world.bodiesMap.clear()
  world.mouseConstraint = null
}
