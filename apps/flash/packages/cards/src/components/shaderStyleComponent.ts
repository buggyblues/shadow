// ══════════════════════════════════════════════════════════════
// Component — ShaderStyle (AoS, bitECS tag + object store)
//
// Shader data is resolved from two sources (in priority order):
//   1. Plugin registry (plugin.components.shader)
//   2. Hardcoded fallback tables below
// ══════════════════════════════════════════════════════════════

import type { CardPriority } from '@shadowob/flash-types'
import { registry } from '../registry'

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

export const KIND_INDEX: Record<string, number> = {
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
  gif: 20,
  qrcode: 21,
  person: 22,
  terminal: 23,
  lottie: 24,
  webpage: 25,
  countdown: 26,
  threed: 27,
  live2d: 28,
  link: 29,
  file: 30,
  math: 31,
  todo: 32,
  position: 33,
  timestamp: 34,
  color: 35,
  event: 36,
  voice: 37,
  comment: 38,
  story: 39,
  social: 40,
  poker: 41,
  tarot: 42,
  flash: 43,
}

export const TAPE_COLORS: Record<string, [number, number, number]> = {
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
  gif: [0.976, 0.62, 0.043],
  qrcode: [0.114, 0.306, 0.878],
  person: [0.925, 0.306, 0.6],
  terminal: [0.133, 0.773, 0.369],
  lottie: [0.545, 0.361, 0.965],
  webpage: [0.055, 0.647, 0.914],
  countdown: [0.937, 0.267, 0.267],
  threed: [0.024, 0.714, 0.831],
  live2d: [0.91, 0.475, 0.976],
  link: [0.055, 0.647, 0.914],
  file: [0.584, 0.639, 0.655],
  math: [0.655, 0.545, 0.98],
  todo: [0.29, 0.871, 0.502],
  position: [0.973, 0.443, 0.443],
  timestamp: [0.984, 0.749, 0.165],
  color: [0.957, 0.447, 0.714],
  event: [0.376, 0.647, 0.98],
  voice: [0.176, 0.831, 0.749],
  comment: [0.984, 0.573, 0.235],
  story: [0.506, 0.549, 0.973],
  social: [0.851, 0.275, 0.937],
  poker: [0.863, 0.149, 0.149],
  tarot: [0.486, 0.228, 0.929],
  flash: [0.984, 0.749, 0.165],
}

const EDGE_COLORS: Record<string, [number, number, number]> = {
  high: [0.98, 0.443, 0.443],
  medium: [0.984, 0.749, 0.141],
  low: [0.443, 0.443, 0.478],
}

export function resolveShaderStyle(kind: string, priority: CardPriority): ShaderStyleData {
  const edgeColor =
    kind === 'inspiration'
      ? ([0.851, 0.275, 0.937] as const)
      : ((EDGE_COLORS[priority || 'low'] || EDGE_COLORS.low) as readonly [number, number, number])

  // Check plugin registry for shader data
  const pluginShader = registry.getShaderDef(kind)
  if (pluginShader) {
    return {
      kindIndex: registry.getShaderKindIndex(kind),
      tapeColor: pluginShader.tapeColor,
      edgeColor,
    }
  }

  return {
    kindIndex: KIND_INDEX[kind] ?? 9,
    tapeColor: TAPE_COLORS[kind] || TAPE_COLORS.text,
    edgeColor,
  }
}

// ── Component data ──
