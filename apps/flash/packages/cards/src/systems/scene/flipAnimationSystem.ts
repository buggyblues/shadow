// ══════════════════════════════════════════════════════════════
// System — Flip Animation (spring-physics, bitECS)
// ══════════════════════════════════════════════════════════════

import { Flip } from '../../components/flipComponent'

const STIFFNESS = 12.0
const DAMPING = 5.0
const EPSILON_ANGLE = 0.005
const EPSILON_VEL = 0.01

/** Update flip animation for a single entity EID. */
export function flipAnimationSystem(eid: number, dt: number): void {
  const diff = Flip.target[eid] - Flip.angle[eid]
  if (Math.abs(diff) > EPSILON_ANGLE || Math.abs(Flip.velocity[eid]) > EPSILON_VEL) {
    const force = STIFFNESS * diff - DAMPING * Flip.velocity[eid]
    Flip.velocity[eid] += force * dt
    Flip.angle[eid] += Flip.velocity[eid] * dt
    Flip.angle[eid] = Math.max(0, Math.min(Math.PI, Flip.angle[eid]))
  } else {
    Flip.angle[eid] = Flip.target[eid]
    Flip.velocity[eid] = 0
  }
  const normalized = Flip.angle[eid] / Math.PI
  Flip.progress[eid] = Math.sin(normalized * Math.PI)
}
