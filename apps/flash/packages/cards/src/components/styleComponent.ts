// ══════════════════════════════════════════════════════════════
// Component — Style (AoS, bitECS tag + object store)
//
// Style data is resolved from two sources (in priority order):
//   1. Plugin registry (plugin.components.style)
//   2. Hardcoded fallback tables below
// ══════════════════════════════════════════════════════════════

import { registry } from '../registry'

export interface StyleData {
  readonly accentColor: string
  readonly kindLabel: string
  readonly pip: string
  readonly rank: string
}

/** bitECS tag object */
export const CStyle = {}

/** AoS data store indexed by EID */
export const styleStore: Array<StyleData | undefined> = []

export const KIND_COLORS: Record<string, string> = {
  quote: '#f472b6',
  summary: '#60a5fa',
  argument: '#fb923c',
  data: '#22d3ee',
  table: '#2dd4bf',
  image: '#a855f7',
  code: '#a3e635',
  chart: '#fbbf24',
  idea: '#facc15',
  text: '#a1a1aa',
  audio: '#34d399',
  video: '#fb7185',
  keypoint: '#818cf8',
  definition: '#8b5cf6',
  example: '#38bdf8',
  reference: '#9ca3af',
  inspiration: '#d946ef',
  timeline: '#f97316',
  comparison: '#06b6d4',
  process: '#10b981',
  gif: '#f59e0b',
  qrcode: '#1d4ed8',
  person: '#ec4899',
  terminal: '#22c55e',
  lottie: '#8b5cf6',
  webpage: '#0ea5e9',
  countdown: '#ef4444',
  threed: '#06b6d4',
  live2d: '#e879f9',
  link: '#0ea5e9',
  file: '#94a3b8',
  math: '#a78bfa',
  todo: '#4ade80',
  position: '#f87171',
  timestamp: '#fbbf24',
  color: '#f472b6',
  event: '#60a5fa',
  voice: '#2dd4bf',
  comment: '#fb923c',
  story: '#818cf8',
  social: '#d946ef',
  poker: '#dc2626',
  tarot: '#7c3aed',
  flash: '#fbbf24',
}

export const KIND_LABELS: Record<string, string> = {
  quote: 'Quote',
  summary: 'Summary',
  argument: 'Argument',
  data: 'Data',
  table: 'Table',
  image: 'Image',
  code: 'Code',
  chart: 'Chart',
  idea: 'Idea',
  text: 'Text',
  audio: 'Audio',
  video: 'Video',
  keypoint: 'Keypoint',
  definition: 'Definition',
  example: 'Example',
  reference: 'Reference',
  inspiration: 'Inspiration',
  timeline: 'Timeline',
  comparison: 'Comparison',
  process: 'Process',
  gif: 'GIF',
  qrcode: 'QR Code',
  person: 'Person',
  terminal: 'Terminal',
  lottie: 'Lottie',
  webpage: 'Webpage',
  countdown: 'Countdown',
  threed: '3D',
  live2d: 'Live2D',
  link: 'Link',
  file: 'File',
  math: 'Formula',
  todo: 'Todo',
  position: 'Position',
  timestamp: 'Timestamp',
  color: 'Color',
  event: 'Event',
  voice: 'Voice',
  comment: 'Comment',
  story: 'Story',
  social: 'Social',
  poker: 'Poker',
  tarot: 'Tarot',
  flash: 'Flash',
}

export const KIND_PIPS: Record<string, string> = {
  quote: '♦',
  summary: '♣',
  argument: '♠',
  data: '◆',
  table: '▦',
  image: '✧',
  code: '<>',
  chart: '▲',
  idea: '★',
  text: '¶',
  audio: '♪',
  video: '▶',
  keypoint: '✦',
  definition: '♔',
  example: '✎',
  reference: '⊕',
  inspiration: '✺',
  timeline: '⏳',
  comparison: '⚖',
  process: '⟳',
  gif: '□■',
  qrcode: '⯀',
  person: '●',
  terminal: '$',
  lottie: '⬡',
  webpage: '⌘',
  countdown: '⧗',
  threed: '◈',
  live2d: '🎭',
  link: '↪',
  file: '📄',
  math: 'Σ',
  todo: '☑',
  position: '📍',
  timestamp: '🕐',
  color: '🎨',
  event: '📅',
  voice: '🎙',
  comment: '💬',
  story: '📖',
  social: '🔗',
  poker: '♠♥',
  tarot: '☽',
  flash: '⚡',
}

export const KIND_RANKS: Record<string, string> = {
  quote: 'Q',
  summary: 'K',
  argument: 'A',
  data: '10',
  table: '9',
  image: 'J',
  code: '7',
  chart: '8',
  idea: 'A',
  text: '6',
  audio: '5',
  video: 'J',
  keypoint: 'K',
  definition: 'Q',
  example: '4',
  reference: '3',
  inspiration: '★',
  timeline: 'T',
  comparison: 'V',
  process: 'P',
  gif: 'G',
  qrcode: 'QR',
  person: '♚',
  terminal: '>',
  lottie: 'L',
  webpage: 'W',
  countdown: '⌛',
  threed: '3',
  live2d: 'L2',
  link: '↪',
  file: 'F',
  math: 'Σ',
  todo: '☑',
  position: 'P',
  timestamp: 'T',
  color: 'C',
  event: 'E',
  voice: 'V',
  comment: 'N',
  story: 'S',
  social: '✦',
  poker: '♠',
  tarot: '☽',
  flash: '⚡',
}

/** Factory: resolve StyleData from a card kind string.
 *  Checks plugin registry first, falls back to hardcoded tables. */
export function resolveStyle(kind: string): StyleData {
  const pluginStyle = registry.getStyleDef(kind)
  if (pluginStyle) {
    return {
      accentColor: pluginStyle.accentColor,
      kindLabel: pluginStyle.kindLabel,
      pip: pluginStyle.pip,
      rank: pluginStyle.rank,
    }
  }
  return {
    accentColor: KIND_COLORS[kind] || '#a1a1aa',
    kindLabel: KIND_LABELS[kind] || 'T',
    pip: KIND_PIPS[kind] || '•',
    rank: KIND_RANKS[kind] || '?',
  }
}
