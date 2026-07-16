// ═══════════════════════════════════════════════════════════════
// @shadowob/flash-types — Card semantic normalization & composition
//
// This module is intentionally dependency-free so it can run in both the
// Space App and the card renderer package.  It turns Buddy/user prose into
// kind-specific card metadata instead of letting every card degrade to one
// large generic text body.
// ═══════════════════════════════════════════════════════════════

import type { CardKind, CardMeta, CardPriority } from './card.js'

export const CARD_SEMANTIC_VERSION = 'flash.card-semantics/1.0.0'

export const CARD_COMPOSE_INTENT_VALUES = [
  'auto',
  'card-showcase',
  'study-deck',
  'research-map',
  'project-plan',
  'argument-map',
  'story-world',
  'presentation',
  'ruleset',
  'brainstorm',
] as const

export type CardComposeIntent = (typeof CARD_COMPOSE_INTENT_VALUES)[number]

export const SEMANTIC_CARD_KIND_VALUES = [
  'quote',
  'summary',
  'argument',
  'data',
  'table',
  'image',
  'code',
  'chart',
  'idea',
  'text',
  'audio',
  'video',
  'keypoint',
  'definition',
  'example',
  'reference',
  'inspiration',
  'timeline',
  'comparison',
  'process',
  'gif',
  'qrcode',
  'person',
  'terminal',
  'lottie',
  'webpage',
  'countdown',
  'threed',
  'live2d',
  'link',
  'file',
  'math',
  'todo',
  'position',
  'timestamp',
  'color',
  'event',
  'voice',
  'comment',
  'story',
  'social',
  'poker',
  'tarot',
  'flash',
  'rule',
] as const satisfies readonly CardKind[]

const KNOWN_KIND_SET = new Set<string>(SEMANTIC_CARD_KIND_VALUES)

export interface CardRenderProfile {
  kind: CardKind
  label: string
  visualRole: string
  semanticRole: string
  defaultPriority: CardPriority
  maxBodyChars: number
  requiredMeta: string[]
  promptHint: string
}

export const CARD_RENDER_PROFILES: Record<CardKind, CardRenderProfile> = {
  quote: {
    kind: 'quote',
    label: 'Quote',
    visualRole: 'large pull quote with attribution',
    semanticRole: 'memorable sentence or quote',
    defaultPriority: 'medium',
    maxBodyChars: 360,
    requiredMeta: ['text'],
    promptHint: 'Use for one quotable sentence, not a paragraph dump.',
  },
  summary: {
    kind: 'summary',
    label: 'Summary',
    visualRole: 'compact overview paragraph',
    semanticRole: 'one concise overview',
    defaultPriority: 'medium',
    maxBodyChars: 520,
    requiredMeta: ['body'],
    promptHint: 'Use only for global summaries; split details into typed cards.',
  },
  argument: {
    kind: 'argument',
    label: 'Argument',
    visualRole: 'claim/evidence/counterpoint layout',
    semanticRole: 'claim with supporting evidence',
    defaultPriority: 'high',
    maxBodyChars: 640,
    requiredMeta: ['claim', 'evidence'],
    promptHint: 'Use for one claim, not a full essay.',
  },
  data: {
    kind: 'data',
    label: 'Data',
    visualRole: 'KPI numbers and metrics',
    semanticRole: 'numeric facts',
    defaultPriority: 'medium',
    maxBodyChars: 360,
    requiredMeta: ['metrics'],
    promptHint: 'Extract numbers into metrics.',
  },
  table: {
    kind: 'table',
    label: 'Table',
    visualRole: 'structured rows and columns',
    semanticRole: 'tabular facts',
    defaultPriority: 'medium',
    maxBodyChars: 700,
    requiredMeta: ['columns', 'rows'],
    promptHint: 'Use for matrix-like data.',
  },
  image: {
    kind: 'image',
    label: 'Image',
    visualRole: 'image preview',
    semanticRole: 'visual asset',
    defaultPriority: 'medium',
    maxBodyChars: 240,
    requiredMeta: ['src'],
    promptHint: 'Use only with an asset URL or upload.',
  },
  code: {
    kind: 'code',
    label: 'Code',
    visualRole: 'monospace code block',
    semanticRole: 'source code or command snippet',
    defaultPriority: 'medium',
    maxBodyChars: 1200,
    requiredMeta: ['language', 'code'],
    promptHint: 'Put fenced code in meta.code.',
  },
  chart: {
    kind: 'chart',
    label: 'Chart',
    visualRole: 'mini chart visualization',
    semanticRole: 'trend or distribution',
    defaultPriority: 'medium',
    maxBodyChars: 420,
    requiredMeta: ['chartType', 'series'],
    promptHint: 'Extract labels and numeric series.',
  },
  idea: {
    kind: 'idea',
    label: 'Idea',
    visualRole: 'idea note',
    semanticRole: 'short concept',
    defaultPriority: 'medium',
    maxBodyChars: 420,
    requiredMeta: ['body'],
    promptHint: 'Use for one concise idea.',
  },
  text: {
    kind: 'text',
    label: 'Text',
    visualRole: 'plain text',
    semanticRole: 'fallback text',
    defaultPriority: 'low',
    maxBodyChars: 520,
    requiredMeta: ['body'],
    promptHint: 'Avoid when a more specific kind fits.',
  },
  audio: {
    kind: 'audio',
    label: 'Audio',
    visualRole: 'audio summary',
    semanticRole: 'audio media',
    defaultPriority: 'low',
    maxBodyChars: 420,
    requiredMeta: ['summary'],
    promptHint: 'Use for audio source summaries.',
  },
  video: {
    kind: 'video',
    label: 'Video',
    visualRole: 'video summary',
    semanticRole: 'video media',
    defaultPriority: 'low',
    maxBodyChars: 420,
    requiredMeta: ['summary'],
    promptHint: 'Use for video source summaries.',
  },
  keypoint: {
    kind: 'keypoint',
    label: 'Keypoint',
    visualRole: 'labeled bullet highlights',
    semanticRole: 'important points',
    defaultPriority: 'high',
    maxBodyChars: 520,
    requiredMeta: ['points'],
    promptHint: 'Split into 2-4 labeled points.',
  },
  definition: {
    kind: 'definition',
    label: 'Definition',
    visualRole: 'term and definition card',
    semanticRole: 'term explanation',
    defaultPriority: 'medium',
    maxBodyChars: 520,
    requiredMeta: ['term', 'definition'],
    promptHint: 'Use for one term or concept.',
  },
  example: {
    kind: 'example',
    label: 'Example',
    visualRole: 'case/scenario card',
    semanticRole: 'concrete example or case',
    defaultPriority: 'medium',
    maxBodyChars: 680,
    requiredMeta: ['subject', 'scenario'],
    promptHint: 'Use for one example with scenario and takeaway.',
  },
  reference: {
    kind: 'reference',
    label: 'Reference',
    visualRole: 'source/citation card',
    semanticRole: 'reference or guide',
    defaultPriority: 'low',
    maxBodyChars: 420,
    requiredMeta: ['refTitle'],
    promptHint: 'Use for one source or guide.',
  },
  inspiration: {
    kind: 'inspiration',
    label: 'Inspiration',
    visualRole: 'inspiration note',
    semanticRole: 'creative prompt or reflection',
    defaultPriority: 'medium',
    maxBodyChars: 520,
    requiredMeta: ['body'],
    promptHint: 'Use for one emotional or creative spark.',
  },
  timeline: {
    kind: 'timeline',
    label: 'Timeline',
    visualRole: 'dated event sequence',
    semanticRole: 'sequence of events',
    defaultPriority: 'medium',
    maxBodyChars: 720,
    requiredMeta: ['events'],
    promptHint: 'Extract dated or ordered milestones.',
  },
  comparison: {
    kind: 'comparison',
    label: 'Comparison',
    visualRole: 'versus/matrix layout',
    semanticRole: 'compare alternatives',
    defaultPriority: 'medium',
    maxBodyChars: 640,
    requiredMeta: ['subjects', 'dimensions'],
    promptHint: 'Use for two or more contrasting subjects.',
  },
  process: {
    kind: 'process',
    label: 'Process',
    visualRole: 'numbered flow',
    semanticRole: 'steps or workflow',
    defaultPriority: 'medium',
    maxBodyChars: 680,
    requiredMeta: ['steps'],
    promptHint: 'Extract ordered steps.',
  },
  gif: {
    kind: 'gif',
    label: 'GIF',
    visualRole: 'animated image placeholder',
    semanticRole: 'GIF asset',
    defaultPriority: 'low',
    maxBodyChars: 240,
    requiredMeta: ['src'],
    promptHint: 'Use only with a GIF asset.',
  },
  qrcode: {
    kind: 'qrcode',
    label: 'QR Code',
    visualRole: 'QR code block',
    semanticRole: 'scannable URL',
    defaultPriority: 'low',
    maxBodyChars: 240,
    requiredMeta: ['url'],
    promptHint: 'Use for one URL.',
  },
  person: {
    kind: 'person',
    label: 'Person',
    visualRole: 'profile card',
    semanticRole: 'person profile',
    defaultPriority: 'medium',
    maxBodyChars: 520,
    requiredMeta: ['name'],
    promptHint: 'Use for one person.',
  },
  terminal: {
    kind: 'terminal',
    label: 'Terminal',
    visualRole: 'terminal transcript',
    semanticRole: 'command output',
    defaultPriority: 'low',
    maxBodyChars: 1000,
    requiredMeta: ['lines'],
    promptHint: 'Use for command-line sessions.',
  },
  lottie: {
    kind: 'lottie',
    label: 'Lottie',
    visualRole: 'lottie animation placeholder',
    semanticRole: 'lottie animation',
    defaultPriority: 'low',
    maxBodyChars: 240,
    requiredMeta: ['animationName'],
    promptHint: 'Use only with a Lottie asset/name.',
  },
  webpage: {
    kind: 'webpage',
    label: 'Webpage',
    visualRole: 'webpage preview',
    semanticRole: 'web URL preview',
    defaultPriority: 'low',
    maxBodyChars: 420,
    requiredMeta: ['url'],
    promptHint: 'Use for one URL preview.',
  },
  countdown: {
    kind: 'countdown',
    label: 'Countdown',
    visualRole: 'countdown display',
    semanticRole: 'time target',
    defaultPriority: 'low',
    maxBodyChars: 240,
    requiredMeta: ['targetDate'],
    promptHint: 'Use for deadlines.',
  },
  threed: {
    kind: 'threed',
    label: '3D',
    visualRole: '3D runtime canvas',
    semanticRole: '3D scene',
    defaultPriority: 'low',
    maxBodyChars: 240,
    requiredMeta: ['scene'],
    promptHint: 'Use for 3D visual runtime cards.',
  },
  live2d: {
    kind: 'live2d',
    label: 'Live2D',
    visualRole: 'Live2D runtime canvas',
    semanticRole: 'Live2D model',
    defaultPriority: 'low',
    maxBodyChars: 240,
    requiredMeta: ['modelUrl'],
    promptHint: 'Use for Live2D model cards.',
  },
  link: {
    kind: 'link',
    label: 'Link',
    visualRole: 'link preview',
    semanticRole: 'URL bookmark',
    defaultPriority: 'low',
    maxBodyChars: 420,
    requiredMeta: ['url'],
    promptHint: 'Use for one link.',
  },
  file: {
    kind: 'file',
    label: 'File',
    visualRole: 'file descriptor',
    semanticRole: 'file attachment',
    defaultPriority: 'low',
    maxBodyChars: 420,
    requiredMeta: ['filename'],
    promptHint: 'Use for one file.',
  },
  math: {
    kind: 'math',
    label: 'Formula',
    visualRole: 'formula rendering',
    semanticRole: 'math formula',
    defaultPriority: 'medium',
    maxBodyChars: 420,
    requiredMeta: ['formula'],
    promptHint: 'Use for one equation or formula.',
  },
  todo: {
    kind: 'todo',
    label: 'Todo',
    visualRole: 'checklist with progress bar',
    semanticRole: 'action checklist',
    defaultPriority: 'medium',
    maxBodyChars: 520,
    requiredMeta: ['items'],
    promptHint: 'Extract concrete actionable items.',
  },
  position: {
    kind: 'position',
    label: 'Position',
    visualRole: 'location card',
    semanticRole: 'geographic location',
    defaultPriority: 'low',
    maxBodyChars: 240,
    requiredMeta: ['lat', 'lng'],
    promptHint: 'Use when latitude/longitude exists.',
  },
  timestamp: {
    kind: 'timestamp',
    label: 'Timestamp',
    visualRole: 'time stamp card',
    semanticRole: 'one time point',
    defaultPriority: 'low',
    maxBodyChars: 240,
    requiredMeta: ['datetime'],
    promptHint: 'Use for one date/time.',
  },
  color: {
    kind: 'color',
    label: 'Color',
    visualRole: 'color swatch',
    semanticRole: 'color value',
    defaultPriority: 'low',
    maxBodyChars: 240,
    requiredMeta: ['hex'],
    promptHint: 'Use for color values.',
  },
  event: {
    kind: 'event',
    label: 'Event',
    visualRole: 'calendar event',
    semanticRole: 'calendar item',
    defaultPriority: 'medium',
    maxBodyChars: 420,
    requiredMeta: ['title', 'startAt'],
    promptHint: 'Use for scheduled events.',
  },
  voice: {
    kind: 'voice',
    label: 'Voice',
    visualRole: 'voice memo card',
    semanticRole: 'audio memo',
    defaultPriority: 'low',
    maxBodyChars: 420,
    requiredMeta: ['summary'],
    promptHint: 'Use for voice memo transcript.',
  },
  comment: {
    kind: 'comment',
    label: 'Comment',
    visualRole: 'annotation thread',
    semanticRole: 'comment or note',
    defaultPriority: 'low',
    maxBodyChars: 420,
    requiredMeta: ['content'],
    promptHint: 'Use for annotations.',
  },
  story: {
    kind: 'story',
    label: 'Story',
    visualRole: 'narrative excerpt',
    semanticRole: 'narrative/story fragment',
    defaultPriority: 'medium',
    maxBodyChars: 820,
    requiredMeta: ['title', 'body'],
    promptHint: 'Use for one narrative point.',
  },
  social: {
    kind: 'social',
    label: 'Social',
    visualRole: 'social post',
    semanticRole: 'social media post',
    defaultPriority: 'low',
    maxBodyChars: 420,
    requiredMeta: ['platform', 'author', 'content'],
    promptHint: 'Use for one social post.',
  },
  poker: {
    kind: 'poker',
    label: 'Poker',
    visualRole: 'playing card face',
    semanticRole: 'playing card',
    defaultPriority: 'low',
    maxBodyChars: 120,
    requiredMeta: ['rank', 'suit'],
    promptHint: 'Use only for a playing-card object.',
  },
  tarot: {
    kind: 'tarot',
    label: 'Tarot',
    visualRole: 'tarot card face',
    semanticRole: 'tarot/archetype card',
    defaultPriority: 'low',
    maxBodyChars: 360,
    requiredMeta: ['name', 'arcana', 'number'],
    promptHint: 'Use for archetypes or tarot meanings.',
  },
  flash: {
    kind: 'flash',
    label: 'Flash',
    visualRole: 'flash highlight card',
    semanticRole: 'high-energy highlight',
    defaultPriority: 'high',
    maxBodyChars: 360,
    requiredMeta: ['body'],
    promptHint: 'Use sparingly for one high-impact point.',
  },
  rule: {
    kind: 'rule',
    label: 'Rule',
    visualRole: 'rule/principle card, optionally executable',
    semanticRole: 'rule, law, or executable board behavior',
    defaultPriority: 'high',
    maxBodyChars: 680,
    requiredMeta: ['trigger', 'scope'],
    promptHint: 'Use for one rule or law; include script only when executable behavior is needed.',
  },
}

export interface CardDraftInputLike {
  kind?: CardKind | string
  title?: string
  summary?: string
  content?: string
  thumbnail?: string
  sourceId?: string | null
  linkedCardIds?: string[]
  meta?: Record<string, unknown> | CardMeta | null
  tags?: string[]
  priority?: CardPriority
  autoGenerated?: boolean
  rating?: number
  filePath?: string
  fileMime?: string
  deckIds?: string[]
}

export interface NormalizedCardDraft {
  kind: CardKind
  title: string
  summary?: string
  content?: string
  thumbnail?: string
  sourceId?: string | null
  linkedCardIds: string[]
  meta: Record<string, unknown>
  tags: string[]
  priority: CardPriority
  autoGenerated: boolean
  rating: number
  filePath?: string
  fileMime?: string
  deckIds: string[]
}

export interface CardComposeDraftInput extends CardDraftInputLike {
  id?: string
}

export interface CardComposeRequest {
  intent?: CardComposeIntent | string
  title?: string
  material?: string
  instructions?: string
  preferredKinds?: Array<CardKind | string>
  maxCards?: number
  drafts?: CardComposeDraftInput[]
}

export interface CardCompositionPlanItem {
  index: number
  kind: CardKind
  title: string
  source: 'explicit-draft' | 'explicit-section' | 'showcase-profile' | 'heuristic-section'
  reason: string
  profile: Pick<CardRenderProfile, 'label' | 'visualRole' | 'semanticRole'>
}

export interface CardCompositionResult {
  drafts: NormalizedCardDraft[]
  plan: CardCompositionPlanItem[]
  intent: CardComposeIntent
  semanticVersion: string
}

type ExtractedSection = {
  kind?: CardKind
  title: string
  content: string
  source: CardCompositionPlanItem['source']
  reason: string
}

const KIND_ALIASES: Record<string, CardKind> = {
  q: 'quote',
  quote: 'quote',
  quotes: 'quote',
  金句: 'quote',
  引用: 'quote',
  摘录: 'quote',
  summary: 'summary',
  摘要: 'summary',
  总结: 'summary',
  argument: 'argument',
  claim: 'argument',
  论点: 'argument',
  论证: 'argument',
  观点: 'argument',
  data: 'data',
  数据: 'data',
  table: 'table',
  表格: 'table',
  image: 'image',
  图片: 'image',
  code: 'code',
  代码: 'code',
  chart: 'chart',
  图表: 'chart',
  idea: 'idea',
  想法: 'idea',
  text: 'text',
  文本: 'text',
  keypoint: 'keypoint',
  keypoints: 'keypoint',
  point: 'keypoint',
  要点: 'keypoint',
  重点: 'keypoint',
  definition: 'definition',
  def: 'definition',
  定义: 'definition',
  概念: 'definition',
  example: 'example',
  case: 'example',
  案例: 'example',
  例子: 'example',
  reference: 'reference',
  ref: 'reference',
  source: 'reference',
  参考: 'reference',
  来源: 'reference',
  指南: 'reference',
  inspiration: 'inspiration',
  灵感: 'inspiration',
  启发: 'inspiration',
  timeline: 'timeline',
  时间线: 'timeline',
  轨迹: 'timeline',
  comparison: 'comparison',
  compare: 'comparison',
  对比: 'comparison',
  比较: 'comparison',
  process: 'process',
  flow: 'process',
  流程: 'process',
  步骤: 'process',
  路径: 'process',
  todo: 'todo',
  task: 'todo',
  checklist: 'todo',
  待办: 'todo',
  清单: 'todo',
  检查: 'todo',
  story: 'story',
  narrative: 'story',
  故事: 'story',
  叙事: 'story',
  rule: 'rule',
  law: 'rule',
  principle: 'rule',
  规则: 'rule',
  定律: 'rule',
  法则: 'rule',
}

const EMOJI_KIND_ALIASES: Record<string, CardKind> = {
  '📖': 'story',
  '📚': 'story',
  '📋': 'todo',
  '✅': 'todo',
  '☑': 'todo',
  '🎯': 'definition',
  '📌': 'keypoint',
  '🔄': 'process',
  '⟳': 'process',
  '⚖': 'argument',
  '💬': 'quote',
  '📈': 'timeline',
  '⏳': 'timeline',
  '💡': 'example',
  '📐': 'rule',
  '⚙': 'rule',
  '☁': 'inspiration',
  '📄': 'reference',
  '🔗': 'reference',
}

const SHOWCASE_KINDS: CardKind[] = [
  'story',
  'todo',
  'definition',
  'process',
  'argument',
  'quote',
  'timeline',
  'example',
  'rule',
  'inspiration',
  'reference',
]

const INTENT_KIND_SEQUENCES: Partial<Record<CardComposeIntent, CardKind[]>> = {
  'card-showcase': SHOWCASE_KINDS,
  'study-deck': ['definition', 'keypoint', 'example', 'quote', 'timeline', 'todo', 'reference'],
  'research-map': [
    'summary',
    'keypoint',
    'data',
    'argument',
    'comparison',
    'timeline',
    'reference',
  ],
  'project-plan': ['process', 'todo', 'keypoint', 'timeline', 'argument', 'reference'],
  'argument-map': ['argument', 'quote', 'data', 'comparison', 'example', 'reference'],
  'story-world': ['story', 'person', 'timeline', 'quote', 'inspiration', 'rule'],
  presentation: ['summary', 'keypoint', 'data', 'chart', 'quote', 'process', 'reference'],
  ruleset: ['rule', 'definition', 'process', 'example', 'todo'],
  brainstorm: ['inspiration', 'idea', 'keypoint', 'comparison', 'todo'],
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function cleanText(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value
    .replace(/\r\n/g, '\n')
    .replace(/[\t\u00a0]+/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .trim()
}

function compactInline(value: unknown): string {
  return cleanText(value)
    .replace(/\s*\n\s*/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .trim()
}

function stripMarkdown(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[*_~#>\[\]]+/g, '')
    .replace(/\((https?:\/\/[^)]+)\)/g, '$1')
    .trim()
}

function truncate(value: string, max: number): string {
  const text = compactInline(stripMarkdown(value))
  if (text.length <= max) return text
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}

function safeTitle(value: unknown, fallback = 'Untitled card'): string {
  const text = truncate(String(value ?? ''), 160)
    .replace(/^[-•*\d.、\s]+/u, '')
    .trim()
  return text || fallback
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function stringArray(value: unknown, max = 80): string[] {
  if (!Array.isArray(value)) return []
  return value
    .flatMap((item) => {
      const text = compactInline(item)
      return text ? [text.slice(0, 120)] : []
    })
    .slice(0, max)
}

function normalizeTags(value: unknown, extra: string[] = []): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const tag of [...stringArray(value, 12), ...extra]) {
    const clean = tag.replace(/^#/, '').trim().slice(0, 40)
    if (!clean || seen.has(clean)) continue
    seen.add(clean)
    out.push(clean)
    if (out.length >= 12) break
  }
  return out
}

function normalizeIntent(value: unknown): CardComposeIntent {
  if (typeof value !== 'string') return 'auto'
  const lower = value.trim().toLowerCase()
  if ((CARD_COMPOSE_INTENT_VALUES as readonly string[]).includes(lower)) {
    return lower as CardComposeIntent
  }
  if (/展示|测试|showcase|sample|demo/u.test(lower)) return 'card-showcase'
  if (/学习|study|deck|知识卡/u.test(lower)) return 'study-deck'
  if (/研究|research|map/u.test(lower)) return 'research-map'
  if (/计划|project|todo|任务/u.test(lower)) return 'project-plan'
  if (/论证|argument|辩论/u.test(lower)) return 'argument-map'
  if (/故事|story|world/u.test(lower)) return 'story-world'
  if (/规则|rule|定律/u.test(lower)) return 'ruleset'
  return 'auto'
}

export function normalizeCardKind(value: unknown, fallback: CardKind = 'inspiration'): CardKind {
  if (typeof value !== 'string') return fallback
  const raw = value.trim()
  if (!raw) return fallback
  if (KNOWN_KIND_SET.has(raw)) return raw as CardKind
  const lower = raw.toLowerCase().replace(/[\s_-]+/g, '')
  if (KNOWN_KIND_SET.has(lower)) return lower as CardKind
  return KIND_ALIASES[lower] ?? KIND_ALIASES[raw] ?? fallback
}

function kindFromLabel(value: string): CardKind | undefined {
  const text = value.trim()
  if (!text) return undefined
  if (EMOJI_KIND_ALIASES[text[0]!]) return EMOJI_KIND_ALIASES[text[0]!]
  const lower = text
    .replace(/[📖📚📋✅☑🎯📌🔄⚖💬📈⏳💡📐⚙☁📄🔗]/gu, '')
    .trim()
    .toLowerCase()
  return KIND_ALIASES[lower] ?? (KNOWN_KIND_SET.has(lower) ? (lower as CardKind) : undefined)
}

function explicitPreferredKinds(values: unknown): CardKind[] {
  if (!Array.isArray(values)) return []
  const seen = new Set<CardKind>()
  const out: CardKind[] = []
  for (const value of values) {
    const kind = normalizeCardKind(value, 'text')
    if (seen.has(kind)) continue
    seen.add(kind)
    out.push(kind)
  }
  return out
}

function paragraphs(value: string): string[] {
  return cleanText(value)
    .split(/\n{2,}/u)
    .map((item) => item.trim())
    .filter(Boolean)
}

function lines(value: string): string[] {
  return cleanText(value)
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
}

function sentenceParts(value: string, max = 8): string[] {
  const compact = compactInline(value)
  if (!compact) return []
  const parts = compact
    .split(/(?<=[。！？!?；;])\s*|\s+[•·]\s+|\s+-\s+/u)
    .map((item) => item.trim())
    .filter(Boolean)
  if (parts.length <= 1) {
    return compact
      .split(/[。！？!?；;]\s*/u)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, max)
  }
  return parts.slice(0, max)
}

function bulletItems(value: string): string[] {
  return lines(value)
    .map((line) =>
      line
        .replace(/^[-*•]\s+/u, '')
        .replace(/^\d+[).、]\s*/u, '')
        .replace(/^\[[ xX]\]\s*/u, '')
        .trim(),
    )
    .filter((line) => line.length > 0 && line.length <= 260)
}

function deriveTitle(content: string, kind: CardKind, fallback?: string): string {
  const first = lines(content)[0] ?? compactInline(content)
  const cleaned = first
    .replace(/^#{1,6}\s*/u, '')
    .replace(/^[-*•]\s+/u, '')
    .replace(/^\d+[).、]\s*/u, '')
    .replace(/^\[[ xX]\]\s*/u, '')
    .trim()
  if (cleaned) return safeTitle(cleaned, fallback ?? `${CARD_RENDER_PROFILES[kind].label} card`)
  return fallback ?? `${CARD_RENDER_PROFILES[kind].label} card`
}

function sectionBodyWithoutHeading(title: string, content: string): string {
  const sourceLines = lines(content)
  if (sourceLines.length > 1 && compactInline(sourceLines[0]) === compactInline(title)) {
    return sourceLines.slice(1).join('\n').trim()
  }
  return content.trim()
}

function extractNumbers(value: string): number[] {
  return (value.match(/[-+]?\d+(?:\.\d+)?%?/g) ?? [])
    .map((raw) => Number(raw.replace('%', '')))
    .filter((n) => Number.isFinite(n))
    .slice(0, 12)
}

function extractUrl(value: string): string | undefined {
  return value.match(/https?:\/\/[^\s)\]}，。；;]+/u)?.[0]
}

function extractDateLike(value: string): string | undefined {
  return (
    value.match(/\b\d{4}[-/.年]\d{1,2}(?:[-/.月]\d{1,2}日?)?\b/u)?.[0] ??
    value.match(/\b\d{4}\b/u)?.[0]
  )
}

function splitClaimEvidence(value: string) {
  const parts = sentenceParts(value, 6)
  const claim = parts[0] || compactInline(value)
  return {
    claim: truncate(claim, 180),
    evidence: parts
      .slice(1, 4)
      .map((text) => ({ type: 'example' as const, text: truncate(text, 180) })),
  }
}

function parseMarkdownTable(
  value: string,
): { columns: Array<{ key: string; label: string }>; rows: Record<string, string>[] } | null {
  const tableLines = lines(value).filter((line) => line.includes('|'))
  if (tableLines.length < 2) return null
  const rows = tableLines.map((line) =>
    line
      .split('|')
      .map((cell) => cell.trim())
      .filter(Boolean),
  )
  const header = rows[0]
  if (!header || header.length < 2) return null
  const dataRows = rows
    .slice(1)
    .filter((row) => !row.every((cell) => /^:?-{2,}:?$/u.test(cell)))
    .filter((row) => row.length >= 2)
  if (dataRows.length === 0) return null
  const columns = header
    .slice(0, 8)
    .map((label, index) => ({ key: `c${index + 1}`, label: truncate(label, 32) }))
  return {
    columns,
    rows: dataRows.slice(0, 12).map((row) => {
      const out: Record<string, string> = {}
      columns.forEach((column, index) => {
        out[column.key] = truncate(row[index] ?? '', 80)
      })
      return out
    }),
  }
}

function parseTodoItems(
  value: string,
): Array<{ text: string; done?: boolean; priority?: 'high' | 'medium' | 'low'; tag?: string }> {
  const direct = lines(value)
    .filter((line) => /^[-*•]?\s*(?:\[[ xX]\]|TODO|todo|待办|检查|\d+[).、])/u.test(line))
    .map((line) => {
      const done = /\[[xX]\]/u.test(line) || /已完成|done/u.test(line)
      const priority = /紧急|重要|high|p0|p1/u.test(line)
        ? 'high'
        : /低|low/u.test(line)
          ? 'low'
          : undefined
      const tag = line.match(/#([\p{L}\p{N}_-]+)/u)?.[1]
      const text = truncate(
        line
          .replace(/^[-*•]?\s*/u, '')
          .replace(/^\[[ xX]\]\s*/u, '')
          .replace(/^\d+[).、]\s*/u, '')
          .replace(/^(TODO|todo|待办|检查)[:：]?\s*/u, '')
          .trim(),
        120,
      )
      return text ? { text, done, priority, tag } : null
    })
    .filter(Boolean) as Array<{
    text: string
    done?: boolean
    priority?: 'high' | 'medium' | 'low'
    tag?: string
  }>
  if (direct.length > 0) return direct.slice(0, 8)
  return sentenceParts(value, 5).map((text, index) => ({
    text: truncate(text, 110),
    done: false,
    priority: index === 0 ? 'high' : undefined,
  }))
}

function parseSteps(value: string): Array<{ order: number; label: string; detail: string }> {
  const candidates = bulletItems(value)
  const source = candidates.length >= 2 ? candidates : sentenceParts(value, 5)
  return source.slice(0, 6).map((item, index) => {
    const [label, ...rest] = item.split(/[:：-]/u)
    return {
      order: index + 1,
      label: truncate(label || `Step ${index + 1}`, 34),
      detail: truncate(rest.join(':').trim() || item, 140),
    }
  })
}

function parseTimelineEvents(value: string): Array<{
  date: string
  title: string
  detail: string
  significance?: 'high' | 'medium' | 'low'
}> {
  const out = lines(value)
    .map((line, index) => {
      const date = extractDateLike(line) ?? `${index + 1}`
      const rest = truncate(line.replace(date, '').replace(/^[-:：—\s]+/u, ''), 150)
      return rest
        ? {
            date,
            title: truncate(rest, 40),
            detail: rest,
            significance: index === 0 ? ('high' as const) : ('medium' as const),
          }
        : null
    })
    .filter(Boolean) as Array<{
    date: string
    title: string
    detail: string
    significance?: 'high' | 'medium' | 'low'
  }>
  if (out.length > 0) return out.slice(0, 6)
  return sentenceParts(value, 5).map((text, index) => ({
    date: `${index + 1}`,
    title: truncate(text, 40),
    detail: truncate(text, 140),
    significance: index === 0 ? 'high' : 'medium',
  }))
}

function parseRulePrinciples(value: string): Array<{ label: string; detail: string }> {
  const items = bulletItems(value)
  const source = items.length > 0 ? items : sentenceParts(value, 4)
  return source.slice(0, 4).map((item, index) => {
    const [label, ...rest] = item.split(/[:：-]/u)
    return {
      label: truncate(label || `Rule ${index + 1}`, 40),
      detail: truncate(rest.join(':').trim() || item, 150),
    }
  })
}

function inferKindFromText(input: {
  title: string
  content: string
  intent: CardComposeIntent
  preferredKinds?: CardKind[]
  index?: number
}): CardKind {
  const title = input.title.toLowerCase()
  const content = input.content.toLowerCase()
  const text = `${title}\n${content}`
  const explicit = kindFromLabel(input.title)
  if (explicit) return explicit
  if (input.preferredKinds?.length)
    return (
      input.preferredKinds[input.index ?? 0] ??
      input.preferredKinds[input.preferredKinds.length - 1]!
    )
  const intentKinds = INTENT_KIND_SEQUENCES[input.intent]
  if (input.intent !== 'auto' && intentKinds?.length) {
    const index = input.index ?? 0
    if (index < intentKinds.length) return intentKinds[index]!
  }
  if (/```|function\s+|const\s+|class\s+|SELECT\s+|npm\s+|pnpm\s+|curl\s+/iu.test(text))
    return 'code'
  if (/\|.+\|.+\|/u.test(text)) return 'table'
  if (/https?:\/\//u.test(text) || /参考|reference|source|guide|指南/u.test(text))
    return 'reference'
  if (/\[[ xX]\]|todo|待办|检查|任务|action item/u.test(text)) return 'todo'
  if (/步骤|流程|路径|step\s*\d|process|workflow|first|second/u.test(text)) return 'process'
  if (/时间线|轨迹|timeline|\b\d{4}\b|\b\d{1,2}:\d{2}\b/u.test(text)) return 'timeline'
  if (/定义|是指|意味着|definition|means|≠|=/u.test(text)) return 'definition'
  if (/规则|定律|法则|rule|law|principle|if.+then/u.test(text)) return 'rule'
  if (/案例|例子|example|case|效应/u.test(text)) return 'example'
  if (/对比|比较|versus| vs |两种|conflict|对决/u.test(text)) return 'comparison'
  if (/因为|所以|证据|反驳|claim|evidence|argument|观点|论点/u.test(text)) return 'argument'
  if (/^[“"].+[”"]$/u.test(compactInline(input.content)) || /金句|quote|said|says/u.test(text))
    return 'quote'
  if (/故事|叙事|逃跑|story|narrative|journey/u.test(text)) return 'story'
  if (/灵感|启发|inspiration|想象|声音|梦/u.test(text)) return 'inspiration'
  if (extractNumbers(text).length >= 3) return 'data'
  if (bulletItems(input.content).length >= 2) return 'keypoint'
  return 'inspiration'
}

function metaBody(rawMeta: Record<string, unknown> | null | undefined): string {
  if (!rawMeta) return ''
  for (const key of [
    'body',
    'text',
    'definition',
    'claim',
    'scenario',
    'description',
    'content',
    'summary',
  ]) {
    const value = compactInline(rawMeta[key])
    if (value) return value
  }
  return ''
}

function mergeGeneratedMeta(
  generated: Record<string, unknown>,
  rawMeta: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...generated,
    ...rawMeta,
    flash: {
      ...(isObject(generated.flash) ? generated.flash : {}),
      ...(isObject(rawMeta.flash) ? rawMeta.flash : {}),
    },
  }
}

function addSemanticEnvelope(
  meta: Record<string, unknown>,
  kind: CardKind,
  options: { intent?: CardComposeIntent; sourceKind?: string; reason?: string } = {},
): Record<string, unknown> {
  const profile = CARD_RENDER_PROFILES[kind]
  return {
    ...meta,
    flash: {
      ...(isObject(meta.flash) ? meta.flash : {}),
      semanticVersion: CARD_SEMANTIC_VERSION,
      intent: options.intent ?? 'auto',
      sourceKind: options.sourceKind ?? kind,
      reason: options.reason,
      renderProfile: {
        label: profile.label,
        visualRole: profile.visualRole,
        semanticRole: profile.semanticRole,
        requiredMeta: profile.requiredMeta,
      },
    },
  }
}

function buildKindMeta(
  kind: CardKind,
  title: string,
  content: string,
  rawMeta: Record<string, unknown>,
): Record<string, unknown> {
  const profile = CARD_RENDER_PROFILES[kind]
  const body = truncate(content || metaBody(rawMeta) || title, profile.maxBodyChars)
  const numbers = extractNumbers(content)
  const url = extractUrl(content) ?? compactInline(rawMeta.url)
  switch (kind) {
    case 'quote': {
      const quoteText =
        compactInline(rawMeta.text) ||
        content.match(/[“"]([^”"]{6,180})[”"]/u)?.[1] ||
        sentenceParts(content, 1)[0] ||
        body
      const authorMatch = content.match(/[—-]\s*([^—\n]{2,40})$/u)
      return {
        text: truncate(quoteText, 220),
        author: compactInline(rawMeta.author) || authorMatch?.[1],
        language: /[\u4e00-\u9fff]/u.test(quoteText) ? 'zh' : 'en',
      }
    }
    case 'summary':
    case 'text':
    case 'idea':
    case 'flash':
      return { body }
    case 'inspiration':
      return {
        body,
        ideaType: rawMeta.ideaType ?? 'concept',
        impact: compactInline(rawMeta.impact) || undefined,
      }
    case 'story': {
      const storyBody = sectionBodyWithoutHeading(title, content) || body
      return {
        title,
        body: truncate(storyBody, profile.maxBodyChars),
        readingTime: Math.max(1, Math.ceil(storyBody.length / 420)),
        chapters: bulletItems(storyBody)
          .slice(0, 3)
          .map((item, index) => ({ title: truncate(item, 36), content: item, order: index + 1 })),
      }
    }
    case 'todo': {
      const items = parseTodoItems(content)
      return {
        title,
        items,
        progress: `${items.filter((item) => item.done).length}/${Math.max(items.length, 1)}`,
      }
    }
    case 'definition': {
      const term = compactInline(rawMeta.term) || title.replace(/[:：].*$/u, '').trim() || title
      const definition = compactInline(rawMeta.definition) || body
      return {
        term: truncate(term, 60),
        definition: truncate(definition, 420),
        category: compactInline(rawMeta.category) || undefined,
        example: sentenceParts(content, 3)[1],
      }
    }
    case 'process':
      return { steps: parseSteps(content), isLinear: true, visualHint: 'numbered-list' }
    case 'argument': {
      const split = splitClaimEvidence(content || title)
      return {
        claim: compactInline(rawMeta.claim) || split.claim,
        evidence:
          Array.isArray(rawMeta.evidence) && rawMeta.evidence.length > 0
            ? rawMeta.evidence
            : split.evidence,
        counterpoint: compactInline(rawMeta.counterpoint) || undefined,
        strength: rawMeta.strength ?? 'moderate',
        logicType: rawMeta.logicType ?? 'abductive',
      }
    }
    case 'timeline':
      return {
        events: parseTimelineEvents(content),
        span: compactInline(rawMeta.span) || undefined,
        direction: rawMeta.direction ?? 'vertical',
      }
    case 'example': {
      const parts = sentenceParts(content, 4)
      return {
        subject: compactInline(rawMeta.subject) || title,
        scenario: compactInline(rawMeta.scenario) || parts[0] || body,
        challenge: compactInline(rawMeta.challenge) || parts[1],
        approach: compactInline(rawMeta.approach) || parts[2],
        takeaway: compactInline(rawMeta.takeaway) || parts[parts.length - 1],
      }
    }
    case 'rule':
      return {
        enabled: rawMeta.enabled ?? false,
        trigger: rawMeta.trigger ?? 'manual',
        priority: typeof rawMeta.priority === 'number' ? rawMeta.priority : 100,
        scope: rawMeta.scope ?? 'arena',
        capabilities: Array.isArray(rawMeta.capabilities)
          ? rawMeta.capabilities
          : ['cards.layout', 'arena.membership'],
        description: compactInline(rawMeta.description) || body,
        principles: Array.isArray(rawMeta.principles)
          ? rawMeta.principles
          : parseRulePrinciples(content),
        script: typeof rawMeta.script === 'string' ? rawMeta.script : undefined,
      }
    case 'reference':
      return {
        refTitle: compactInline(rawMeta.refTitle) || title,
        url,
        refType: rawMeta.refType ?? (url ? 'website' : 'article'),
        credibility: rawMeta.credibility ?? 'medium',
        authors: Array.isArray(rawMeta.authors) ? rawMeta.authors : undefined,
      }
    case 'keypoint': {
      const items = bulletItems(content)
      const source = items.length ? items : sentenceParts(content, 4)
      return {
        points: source.slice(0, 4).map((item, index) => ({
          label: truncate(item.split(/[:：-]/u)[0] || `Point ${index + 1}`, 32),
          detail: truncate(item, 130),
        })),
        context: title,
        layout: 'vertical',
      }
    }
    case 'comparison': {
      const subjects = stringArray(rawMeta.subjects, 4)
      const inferredSubjects =
        subjects.length >= 2
          ? subjects
          : title
              .split(/\s*(?:vs\.?|VS|对比|和|与|,|，|、)\s*/u)
              .filter(Boolean)
              .slice(0, 3)
      const normalizedSubjects =
        inferredSubjects.length >= 2 ? inferredSubjects : ['Option A', 'Option B']
      const dimensions = bulletItems(content)
        .slice(0, 4)
        .map((item) => ({
          label: truncate(item.split(/[:：-]/u)[0] || 'Dimension', 32),
          values: normalizedSubjects.map(() => truncate(item, 70)),
        }))
      return {
        subjects: normalizedSubjects,
        dimensions: dimensions.length
          ? dimensions
          : [
              {
                label: 'Difference',
                values: normalizedSubjects.map((subject) => `${subject}: ${body}`),
              },
            ],
        conclusion: sentenceParts(content, 1)[0],
        visualHint: 'versus',
      }
    }
    case 'data': {
      const metrics = numbers.length
        ? numbers.slice(0, 6).map((value, index) => ({ key: `Metric ${index + 1}`, value }))
        : [{ key: title, value: body }]
      return {
        metrics,
        visualHint: numbers.length > 1 ? 'kpi-grid' : 'big-number',
        highlight: sentenceParts(content, 1)[0],
      }
    }
    case 'chart': {
      const data = numbers.length ? numbers.slice(0, 8) : [1, 2, 3]
      return {
        chartType: 'bar',
        labels: data.map((_, index) => `${index + 1}`),
        series: [{ name: title, data }],
        insight: sentenceParts(content, 1)[0],
        chartTitle: title,
      }
    }
    case 'table': {
      const parsed = parseMarkdownTable(content)
      if (parsed) return parsed
      return {
        columns: [
          { key: 'item', label: 'Item' },
          { key: 'note', label: 'Note' },
        ],
        rows: bulletItems(content)
          .slice(0, 8)
          .map((item, index) => ({ item: `${index + 1}`, note: item })),
        caption: title,
      }
    }
    case 'code': {
      const fenced = content.match(/```([\w+-]*)\n([\s\S]*?)```/u)
      return {
        language: compactInline(rawMeta.language) || fenced?.[1] || 'text',
        code: fenced?.[2]?.trim() || content,
        description: title,
      }
    }
    case 'link':
    case 'webpage':
      return { url: url || 'https://example.com', title, description: body }
    case 'file':
      return { filename: compactInline(rawMeta.filename) || title, description: body, url }
    case 'math':
      return {
        formula: compactInline(rawMeta.formula) || content.match(/\$([^$]+)\$/u)?.[1] || body,
        description: title,
      }
    case 'comment':
      return { content: body }
    case 'voice':
    case 'audio':
    case 'video':
      return { summary: body, transcript: kind === 'voice' ? content : undefined }
    case 'person':
      return { name: title, bio: body }
    case 'terminal':
      return {
        title,
        lines: lines(content)
          .slice(0, 12)
          .map((line) => ({
            type: line.startsWith('$') ? 'cmd' : 'out',
            text: line.replace(/^\$\s*/u, ''),
          })),
      }
    case 'color':
      return { hex: content.match(/#[0-9a-f]{6}\b/iu)?.[0] || '#94a3b8', name: title, usage: body }
    case 'event':
      return {
        title,
        startAt: extractDateLike(content) || new Date(0).toISOString(),
        description: body,
      }
    case 'timestamp':
      return {
        datetime: extractDateLike(content) || new Date(0).toISOString(),
        label: title,
        note: body,
      }
    case 'poker':
      return { rank: rawMeta.rank ?? 'A', suit: rawMeta.suit ?? 'spades', meaning: body }
    case 'tarot':
      return {
        name: title,
        number: rawMeta.number ?? 0,
        arcana: rawMeta.arcana ?? 'major',
        upright: body,
        keywords: bulletItems(content).slice(0, 4),
      }
    case 'qrcode':
      return { url: url || 'https://example.com', label: title, description: body }
    case 'gif':
    case 'image':
      return {
        src: compactInline(rawMeta.src) || compactInline(rawMeta.url) || undefined,
        alt: title,
        caption: body,
      }
    case 'lottie':
      return { animationName: title, description: body, loop: true }
    case 'threed':
      return { scene: compactInline(rawMeta.scene) || 'particles', description: body }
    case 'live2d':
      return { modelUrl: compactInline(rawMeta.modelUrl) || '', name: title, autoMotion: true }
    case 'position':
      return {
        lat: Number(rawMeta.lat) || 0,
        lng: Number(rawMeta.lng) || 0,
        name: title,
        note: body,
      }
    case 'countdown':
      return {
        targetDate: extractDateLike(content) || new Date(0).toISOString(),
        label: title,
        style: 'minimal',
      }
    case 'social':
      return {
        platform: rawMeta.platform ?? 'other',
        author: isObject(rawMeta.author) ? rawMeta.author : { name: 'Unknown' },
        content: body,
      }
    default:
      return { body }
  }
}

export function normalizeCardDraft(
  input: CardDraftInputLike,
  options: {
    intent?: CardComposeIntent | string
    inferKind?: boolean
    preferredKinds?: CardKind[]
    index?: number
    reason?: string
  } = {},
): NormalizedCardDraft {
  const rawMeta = isObject(input.meta) ? { ...(input.meta as Record<string, unknown>) } : {}
  const intent = normalizeIntent(options.intent)
  const content = cleanText(input.content) || metaBody(rawMeta) || cleanText(input.summary)
  const provisionalKind = normalizeCardKind(input.kind, 'inspiration')
  const kind =
    options.inferKind === false
      ? provisionalKind
      : inferKindFromText({
          title: cleanText(input.title) || metaBody(rawMeta) || content,
          content,
          intent,
          preferredKinds: options.preferredKinds,
          index: options.index,
        }) || provisionalKind
  const title = safeTitle(
    input.title || deriveTitle(content || metaBody(rawMeta), kind),
    `${CARD_RENDER_PROFILES[kind].label} card`,
  )
  const generated = buildKindMeta(kind, title, content || title, rawMeta)
  const meta = addSemanticEnvelope(mergeGeneratedMeta(generated, rawMeta), kind, {
    intent,
    sourceKind: typeof input.kind === 'string' ? input.kind : kind,
    reason: options.reason,
  })
  const summary = input.summary
    ? truncate(input.summary, 1000)
    : truncate(content || metaBody(meta) || title, 180)
  return {
    kind,
    title,
    summary,
    content: content || input.content,
    thumbnail: input.thumbnail,
    sourceId: input.sourceId ?? null,
    linkedCardIds: stringArray(input.linkedCardIds),
    meta,
    tags: normalizeTags(
      input.tags,
      [kind, intent].filter((item) => item !== 'auto'),
    ),
    priority: input.priority ?? CARD_RENDER_PROFILES[kind].defaultPriority,
    autoGenerated: input.autoGenerated ?? true,
    rating:
      typeof input.rating === 'number' && Number.isFinite(input.rating)
        ? clamp(Math.round(input.rating), 0, 5)
        : 0,
    filePath: input.filePath,
    fileMime: input.fileMime,
    deckIds: stringArray(input.deckIds),
  }
}

function parseExplicitSections(material: string): ExtractedSection[] {
  const sourceLines = lines(material)
  const sections: ExtractedSection[] = []
  let current: ExtractedSection | null = null
  const flush = () => {
    if (!current) return
    current.content = current.content.trim()
    if (current.title || current.content) sections.push(current)
    current = null
  }
  const headingRe =
    /^(?:#{1,6}\s*)?(?:(\d+)[).、]\s*)?([\p{Emoji_Presentation}\p{Extended_Pictographic}]|[A-Za-z][A-Za-z\s-]{1,28}|[\u4e00-\u9fff]{2,8})\s*(?:[:：|｜-]\s+|\s{2,})(.+)$/u
  for (const line of sourceLines) {
    const match = line.match(headingRe)
    const maybeKind = match ? kindFromLabel(match[2] ?? '') : undefined
    if (match && maybeKind) {
      flush()
      current = {
        kind: maybeKind,
        title: safeTitle(match[3] ?? `${CARD_RENDER_PROFILES[maybeKind].label} card`),
        content: '',
        source: 'explicit-section',
        reason: `explicit ${CARD_RENDER_PROFILES[maybeKind].label} heading`,
      }
      continue
    }
    const markdownHeading = line.match(/^#{1,6}\s+(.+)$/u)
    if (markdownHeading) {
      flush()
      const title = safeTitle(markdownHeading[1])
      current = {
        kind: kindFromLabel(title),
        title,
        content: '',
        source: 'heuristic-section',
        reason: 'markdown heading',
      }
      continue
    }
    if (!current) {
      current = {
        title: deriveTitle(line, 'inspiration'),
        content: line,
        source: 'heuristic-section',
        reason: 'opening paragraph',
      }
    } else {
      current.content += current.content ? `\n${line}` : line
    }
  }
  flush()
  return sections.filter((section) => section.title || section.content)
}

function parseMarkdownCardTable(material: string): ExtractedSection[] {
  const table = parseMarkdownTable(material)
  if (!table) return []
  const kindColumn = table.columns.find((column) =>
    /type|kind|类型/u.test(column.label.toLowerCase()),
  )?.key
  const titleColumn = table.columns.find((column) =>
    /title|name|标题|名称/u.test(column.label.toLowerCase()),
  )?.key
  const contentColumn = table.columns.find((column) =>
    /content|body|note|说明|内容/u.test(column.label.toLowerCase()),
  )?.key
  if (!kindColumn && !titleColumn) return []
  return table.rows.map((row) => {
    const kind = kindColumn ? kindFromLabel(row[kindColumn] ?? '') : undefined
    const title = safeTitle(
      (titleColumn ? row[titleColumn] : '') || row[Object.keys(row)[0]!] || 'Card',
    )
    const content = contentColumn
      ? (row[contentColumn] ?? '')
      : Object.entries(row)
          .filter(([key]) => key !== titleColumn && key !== kindColumn)
          .map(([, value]) => value)
          .join('\n')
    return {
      kind,
      title,
      content,
      source: 'explicit-section' as const,
      reason: 'markdown card table',
    }
  })
}

function fallbackSections(
  material: string,
  intent: CardComposeIntent,
  maxCards: number,
): ExtractedSection[] {
  const blocks = paragraphs(material)
  if (blocks.length >= 2) {
    return blocks.slice(0, maxCards).map((block) => ({
      title: deriveTitle(block, 'inspiration'),
      content: block,
      source: 'heuristic-section' as const,
      reason: 'paragraph split',
    }))
  }
  const bullets = bulletItems(material)
  if (bullets.length >= 2) {
    return bullets.slice(0, maxCards).map((item) => ({
      title: deriveTitle(item, 'keypoint'),
      content: item,
      source: 'heuristic-section' as const,
      reason: 'bullet split',
    }))
  }
  if (intent === 'card-showcase') {
    return SHOWCASE_KINDS.slice(0, maxCards).map((kind) => ({
      kind,
      title: `${CARD_RENDER_PROFILES[kind].label}: ${deriveTitle(material, kind, 'Card showcase')}`,
      content: material,
      source: 'showcase-profile' as const,
      reason: 'showcase profile sequence',
    }))
  }
  const sentences = sentenceParts(material, maxCards)
  return (sentences.length ? sentences : [material]).slice(0, maxCards).map((item) => ({
    title: deriveTitle(item, 'inspiration'),
    content: item,
    source: 'heuristic-section' as const,
    reason: 'sentence split',
  }))
}

function showcaseSections(request: CardComposeRequest, maxCards: number): ExtractedSection[] {
  const preferred = explicitPreferredKinds(request.preferredKinds)
  const kinds = (preferred.length > 0 ? preferred : SHOWCASE_KINDS).slice(0, maxCards)
  const topic = safeTitle(
    request.title ||
      deriveTitle(request.material || request.instructions || 'Card showcase', 'inspiration'),
    'Card showcase',
  )
  const material = cleanText(request.material) || cleanText(request.instructions) || topic
  return kinds.map((kind) => ({
    kind,
    title: `${CARD_RENDER_PROFILES[kind].label}: ${topic}`,
    content: material,
    source: 'showcase-profile' as const,
    reason: `showcase ${CARD_RENDER_PROFILES[kind].visualRole}`,
  }))
}

export function composeCardDraftsFromMaterial(request: CardComposeRequest): CardCompositionResult {
  const intent = normalizeIntent(request.intent)
  const maxCards = clamp(
    Math.round(request.maxCards ?? (intent === 'card-showcase' ? 11 : 12)),
    1,
    40,
  )
  const preferredKinds = explicitPreferredKinds(request.preferredKinds)
  const plan: CardCompositionPlanItem[] = []

  let sections: ExtractedSection[] = []
  if (Array.isArray(request.drafts) && request.drafts.length > 0) {
    const drafts = request.drafts.slice(0, maxCards).map((draft, index) =>
      normalizeCardDraft(draft, {
        intent,
        inferKind: draft.kind === undefined,
        preferredKinds,
        index,
        reason: 'explicit Buddy draft normalized by server',
      }),
    )
    drafts.forEach((draft, index) => {
      const profile = CARD_RENDER_PROFILES[draft.kind]
      plan.push({
        index,
        kind: draft.kind,
        title: draft.title,
        source: 'explicit-draft',
        reason: 'explicit draft normalized into kind-specific metadata',
        profile: {
          label: profile.label,
          visualRole: profile.visualRole,
          semanticRole: profile.semanticRole,
        },
      })
    })
    return { drafts, plan, intent, semanticVersion: CARD_SEMANTIC_VERSION }
  }

  const material = cleanText(
    [request.title, request.instructions, request.material].filter(Boolean).join('\n\n'),
  )
  if (intent === 'card-showcase') {
    sections = showcaseSections(request, maxCards)
  } else {
    sections = [...parseMarkdownCardTable(material), ...parseExplicitSections(material)]
    if (sections.length === 0 || (sections.length === 1 && sections[0]!.content.length > 900)) {
      sections = fallbackSections(material, intent, maxCards)
    }
  }

  const intentKinds =
    preferredKinds.length > 0 ? preferredKinds : (INTENT_KIND_SEQUENCES[intent] ?? [])
  const drafts = sections.slice(0, maxCards).map((section, index) => {
    const forcedKind = section.kind ?? intentKinds[index]
    const draft = normalizeCardDraft(
      {
        kind: forcedKind,
        title: section.title,
        content: sectionBodyWithoutHeading(section.title, section.content || material),
        tags: [intent],
      },
      {
        intent,
        inferKind: !forcedKind,
        preferredKinds: forcedKind ? undefined : preferredKinds,
        index,
        reason: section.reason,
      },
    )
    const profile = CARD_RENDER_PROFILES[draft.kind]
    plan.push({
      index,
      kind: draft.kind,
      title: draft.title,
      source: section.source,
      reason: section.reason,
      profile: {
        label: profile.label,
        visualRole: profile.visualRole,
        semanticRole: profile.semanticRole,
      },
    })
    return draft
  })

  return { drafts, plan, intent, semanticVersion: CARD_SEMANTIC_VERSION }
}

export function normalizeCardForTransport<T extends CardDraftInputLike>(
  card: T,
): T & { kind: CardKind; meta: CardMeta } {
  const normalized = normalizeCardDraft(card, { inferKind: false })
  return {
    ...card,
    kind: normalized.kind,
    summary: card.summary ?? normalized.summary,
    content: card.content ?? normalized.content,
    meta: normalized.meta as CardMeta,
    tags: card.tags ?? normalized.tags,
    priority: card.priority ?? normalized.priority,
  } as T & { kind: CardKind; meta: CardMeta }
}
