// ══════════════════════════════════════════════════════════════
// Component — ShaderStyle (AoS, bitECS tag + object store)
// ══════════════════════════════════════════════════════════════

import type { CardKind, CardPriority } from '../../types'

export interface ShaderStyleData {
  readonly kindIndex: number
  readonly tapeColor: readonly [number, number, number]
  readonly edgeColor: readonly [number, number, number]
}

/** bitECS tag object */
export const CShaderStyle = {}

/** AoS data store indexed by EID */
export const shaderStyleStore: Array<ShaderStyleData | undefined> = []

// ── Static lookup tables ──

export const KIND_INDEX: Record<CardKind, number> = {
  quote: 0,
  summary: 1,
  argument: 2,
  data: 3,
  table: 4,
  image: 5,
  code: 6,
  chart: 7,
  idea: 8,
  text: 9,
  audio: 10,
  video: 11,
  keypoint: 12,
  definition: 13,
  example: 14,
  reference: 15,
  inspiration: 16,
  timeline: 17,
  comparison: 18,
  process: 19,
}

export const TAPE_COLORS: Record<CardKind, [number, number, number]> = {
  quote: [0.957, 0.447, 0.714],
  summary: [0.376, 0.647, 0.98],
  argument: [0.984, 0.573, 0.235],
  data: [0.133, 0.827, 0.91],
  table: [0.176, 0.831, 0.749],
  image: [0.659, 0.333, 0.969],
  code: [0.639, 0.898, 0.145],
  chart: [0.984, 0.749, 0.165],
  idea: [0.98, 0.8, 0.082],
  text: [0.631, 0.631, 0.667],
  audio: [0.204, 0.827, 0.6],
  video: [0.984, 0.443, 0.525],
  keypoint: [0.506, 0.549, 0.973],
  definition: [0.545, 0.361, 0.965],
  example: [0.22, 0.741, 0.973],
  reference: [0.612, 0.639, 0.655],
  inspiration: [0.851, 0.275, 0.937],
  timeline: [0.976, 0.451, 0.086],
  comparison: [0.024, 0.714, 0.831],
  process: [0.063, 0.725, 0.506],
}

const EDGE_COLORS: Record<string, [number, number, number]> = {
  high: [0.98, 0.443, 0.443],
  medium: [0.984, 0.749, 0.141],
  low: [0.443, 0.443, 0.478],
}

export function resolveShaderStyle(kind: CardKind, priority: CardPriority): ShaderStyleData {
  const edgeColor =
    kind === 'inspiration'
      ? ([0.851, 0.275, 0.937] as const)
      : ((EDGE_COLORS[priority || 'low'] || EDGE_COLORS.low) as readonly [number, number, number])
  return {
    kindIndex: KIND_INDEX[kind] ?? 9,
    tapeColor: TAPE_COLORS[kind] || TAPE_COLORS.text,
    edgeColor,
  }
}

// ── Component data ──
