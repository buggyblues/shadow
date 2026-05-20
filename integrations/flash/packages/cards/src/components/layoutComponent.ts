// ══════════════════════════════════════════════════════════════
// Component — Layout (AoS, bitECS tag + object store)
// ══════════════════════════════════════════════════════════════

import { BLEED, CARD_PAD } from '../utils/canvasUtils'

export interface LayoutData {
  readonly padX: number
  readonly contentW: number
  readonly cardW: number
  readonly cardH: number
  readonly contentBottom: number
  readonly bleed: number
  contentStartY: number
  cursorY: number
}

/** bitECS tag object */
export const CLayout = {}

/** AoS data store indexed by EID */
export const layoutStore: Array<LayoutData | undefined> = []

// ── Layout helpers (operate on LayoutData) ──

export function remainingH(l: LayoutData): number {
  return l.contentBottom - l.cursorY
}

export function hasSpace(l: LayoutData, px: number): boolean {
  return l.cursorY + px <= l.contentBottom
}

export function advance(l: LayoutData, px: number): void {
  l.cursorY += px
}

export function createLayout(width: number, height: number): LayoutData {
  const pad = CARD_PAD
  return {
    padX: pad,
    contentW: width - pad * 2,
    cardW: width,
    cardH: height,
    contentBottom: height - pad,
    bleed: BLEED,
    contentStartY: pad,
    cursorY: pad,
  }
}
