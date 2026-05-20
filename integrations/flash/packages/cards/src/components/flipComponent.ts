// ══════════════════════════════════════════════════════════════
// Component — Flip (SoA, bitECS)
// ══════════════════════════════════════════════════════════════

/** bitECS SoA component: spring-physics 3D card flip */
export const Flip = {
  angle: [] as number[],
  target: [] as number[],
  velocity: [] as number[],
  progress: [] as number[],
}

/** Legacy alias */
export const CFlip = Flip

export interface FlipData {
  angle: number
  target: number
  velocity: number
  progress: number
}

export function createFlip(): FlipData {
  return { angle: 0, target: 0, velocity: 0, progress: 0 }
}

/** Is the card flipped (showing back)? */
export function isFlipped(eid: number): boolean {
  return Flip.target[eid] > Math.PI / 2
}

/** Toggle between front and back */
export function toggleFlipTarget(eid: number): void {
  Flip.target[eid] = (Flip.target[eid] ?? 0) < Math.PI / 2 ? Math.PI : 0
  Flip.velocity[eid] = 0
}

/** Set a card flip state from authoritative persisted data. */
export function setFlipTarget(eid: number, flipped: boolean, immediate = false): void {
  const target = flipped ? Math.PI : 0
  Flip.target[eid] = target
  Flip.velocity[eid] = 0
  if (immediate) {
    Flip.angle[eid] = target
    Flip.progress[eid] = flipped ? 1 : 0
  }
}
