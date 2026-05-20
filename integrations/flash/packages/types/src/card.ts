// ═══════════════════════════════════════════════════════════════
// @shadowob/flash-types — Card Kinds & Structured Meta
// ═══════════════════════════════════════════════════════════════

import type { tags } from 'typia'

/** Card kind */
export type CardKind =
  | 'quote' // highlighted quote
  | 'summary' // summary
  | 'argument' // argument / claim
  | 'data' // data (numbers, statistics)
  | 'table' // table
  | 'image' // image
  | 'code' // code snippet
  | 'chart' // chart description
  | 'idea' // idea / concept
  | 'text' // general text
  | 'audio' // audio summary
  | 'video' // video summary
  | 'keypoint' // key point / highlight
  | 'definition' // definition / concept
  | 'example' // case study / example
  | 'reference' // citation / source
  | 'inspiration' // AI-generated inspiration
  | 'timeline' // timeline
  | 'comparison' // comparison
  | 'process' // process / flow
  | 'gif' // GIF / animated placeholder
  | 'qrcode' // QR code
  | 'person' // person profile card
  | 'terminal' // terminal emulator
  | 'lottie' // Lottie animation
  | 'webpage' // webpage preview
  | 'countdown' // countdown timer
  | 'threed' // Three.js 3D scene
  | 'live2d' // Live2D animation
  | 'link' // link card
  | 'file' // file card
  | 'math' // math formula (KaTeX)
  | 'todo' // to-do list
  | 'position' // geographic location
  | 'timestamp' // timestamp
  | 'color' // color card
  | 'event' // calendar event
  | 'voice' // voice / audio memo
  | 'comment' // discussion / annotation
  | 'story' // narrative / story
  | 'social' // social media post
  | 'poker' // playing card
  | 'tarot' // tarot card
  | 'flash' // flash card (full-effect glow)

export type CardPriority = 'high' | 'medium' | 'low'

// ── Structured Meta per CardKind ──

export interface DataCardMeta {
  metrics: {
    key: string
    value: string | number
    unit?: string
    change?: string
    changeDirection?: 'up' | 'down' | 'neutral'
  }[]
  period?: string
  benchmark?: string
  highlight?: string
  visualHint?: 'big-number' | 'kpi-grid' | 'comparison' | 'trend'
}

export interface ArgumentCardMeta {
  claim: string
  evidence: {
    type: 'statistic' | 'example' | 'expert' | 'trend' | 'analogy'
    text: string
    source?: string
  }[]
  counterpoint?: string
  strength?: 'strong' | 'moderate' | 'weak'
  logicType?: 'deductive' | 'inductive' | 'abductive'
}

export interface QuoteCardMeta {
  text: string
  author?: string
  role?: string
  source?: string
  language?: 'zh' | 'en'
  emphasis?: string[]
}

export interface DefinitionCardMeta {
  term: string
  abbreviation?: string
  fullName?: string
  definition: string
  category?: string
  relatedTerms?: string[]
  example?: string
  formula?: string
}

export interface ChartCardMeta {
  chartType:
    | 'barChart'
    | 'lineChart'
    | 'areaChart'
    | 'pieChart'
    | 'bar'
    | 'line'
    | 'pie'
    | 'donut'
    | 'area'
    | 'radar'
    | 'scatter'
  categories?: string[]
  series: { name: string; data: number[]; color?: string }[]
  labels?: string[]
  unit?: string
  xAxisLabel?: string
  yAxisLabel?: string
  dataSource?: string
  insight?: string
  chartTitle?: string
}

export interface TableCardMeta {
  columns: {
    key: string
    label: string
    type?: 'text' | 'number' | 'percent' | 'currency' | 'date'
    unit?: string
  }[]
  rows: Record<string, string | number>[]
  sortBy?: string
  sortDirection?: 'asc' | 'desc'
  highlightRow?: number
  caption?: string
  headers?: string[]
}

export interface CodeCardMeta {
  language: string
  code: string
  filename?: string
  highlight?: number[]
  description?: string
}

export interface KeypointCardMeta {
  points: { label: string; detail: string; icon?: string }[]
  context?: string
  layout?: 'horizontal' | 'vertical' | 'grid'
}

export interface ExampleCardMeta {
  subject: string
  scenario: string
  challenge?: string
  approach?: string
  results?: { metric: string; value: string; context?: string }[]
  takeaway?: string
  industry?: string
}

export interface SummaryCardMeta {
  body: string
}

export interface ReferenceCardMeta {
  refTitle: string
  authors?: string[]
  publishDate?: string
  url?: string & tags.Format<'uri'>
  refType?: 'report' | 'paper' | 'book' | 'article' | 'website'
  credibility?: 'high' | 'medium' | 'low'
  citedIn?: string[]
}

export interface InspirationCardMeta {
  body?: string
  ideaType?: 'concept' | 'improvement' | 'alternative' | 'expansion'
  impact?: string
  difficulty?: 'easy' | 'medium' | 'hard'
}

export interface TimelineCardMeta {
  events: {
    date: string
    title: string
    detail: string
    significance?: 'high' | 'medium' | 'low'
  }[]
  span?: string
  direction?: 'horizontal' | 'vertical'
}

export interface ComparisonCardMeta {
  subjects: string[]
  dimensions: { label: string; values: string[]; winner?: number }[]
  conclusion?: string
  visualHint?: 'versus' | 'matrix' | 'radar'
}

export interface ProcessCardMeta {
  steps: { order: number; label: string; detail: string; icon?: string }[]
  isLinear?: boolean
  visualHint?: 'arrow-flow' | 'numbered-list' | 'swimlane'
}

export interface ImageCardMeta {
  src?: string
  ktx2?: string
  basis?: string
  fallbackSrc?: string
  objectFit?: 'cover' | 'contain' | 'fill'
  compressed?: {
    ktx2?: string
    basis?: string
    fallback?: string
    width?: number
    height?: number
    colorSpace?: 'srgb' | 'linear'
  }
  alt?: string
  caption?: string
  width?: number
  height?: number
}

export interface GifCardMeta {
  src?: string
  alt?: string
  caption?: string
  tags?: string[]
  autoplay?: boolean
  preload?: boolean
}

export interface QrcodeCardMeta {
  url: string & tags.Format<'uri'>
  label?: string
  description?: string
  style?: 'light' | 'dark'
}

export interface PersonCardMeta {
  name: string
  title?: string
  company?: string
  avatar?: string
  bio?: string
  tags?: string[]
  contact?: { type: 'email' | 'twitter' | 'linkedin' | 'github' | 'phone'; value: string }[]
}

export interface TerminalCardMeta {
  shell?: string
  cwd?: string
  lines: { type: 'cmd' | 'out' | 'err' | 'info'; text: string }[]
  title?: string
}

export interface LottieCardMeta {
  animationName: string
  src?: string
  description?: string
  loop?: boolean
  palette?: string[]
  autoplay?: boolean
  preload?: boolean
}

export interface WebpageCardMeta {
  url: string & tags.Format<'uri'>
  title?: string
  description?: string
  favicon?: string
  screenshot?: string
}

export interface CountdownCardMeta {
  targetDate: string
  label?: string
  timezone?: string
  style?: 'classic' | 'minimal' | 'neon'
  precision?: 'days' | 'hours' | 'minutes' | 'seconds'
}

export interface Live2DCardMeta {
  modelUrl: string
  name?: string
  background?: string
  autoMotion?: boolean
  autoplay?: boolean
  preload?: boolean
}

export interface ThreeDCardMeta {
  scene: 'cube' | 'torus' | 'particles' | 'dna' | 'earth' | 'galaxy' | string
  color?: string
  color2?: string
  ktx2?: string
  basis?: string
  fallbackSrc?: string
  compressed?: {
    ktx2?: string
    basis?: string
    fallback?: string
    width?: number
    height?: number
    colorSpace?: 'srgb' | 'linear'
  }
  description?: string
  wireframe?: boolean
  autoplay?: boolean
  preload?: boolean
}

export interface LinkCardMeta {
  url: string & tags.Format<'uri'>
  title?: string
  description?: string
  favicon?: string
  source?: string
  image?: string
  tags?: string[]
}

export interface FileCardMeta {
  filename: string
  size?: string
  type?: string
  modified?: string
  path?: string
  description?: string
  url?: string
  tags?: string[]
}

export interface MathCardMeta {
  formula: string
  steps?: { label?: string; formula: string }[]
  description?: string
  category?: string
  name?: string
}

export interface TodoCardMeta {
  items: {
    id?: string
    text: string
    done?: boolean
    priority?: 'high' | 'medium' | 'low'
    tag?: string
  }[]
  title?: string
  progress?: string
}

export interface PositionCardMeta {
  lat: number
  lng: number
  address?: string
  name?: string
  zoom?: number
  provider?: 'amap' | 'google' | 'openstreetmap'
  note?: string
}

export interface TimestampCardMeta {
  datetime: string
  timezone?: string
  label?: string
  precision?: 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second'
  showLunar?: boolean
  note?: string
}

export interface ColorCardMeta {
  hex: string
  name?: string
  rgb?: { r: number; g: number; b: number }
  hsl?: { h: number; s: number; l: number }
  palette?: { hex: string; name?: string; role?: string }[]
  usage?: string
  system?: string
}

export interface EventCardMeta {
  title: string
  startAt: string
  endAt?: string
  location?: string
  attendees?: { name: string; avatar?: string; status?: 'accepted' | 'declined' | 'pending' }[]
  recurrence?: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom'
  description?: string
  color?: string
  allDay?: boolean
}

export interface VoiceCardMeta {
  src?: string
  duration?: number
  transcript?: string
  summary?: string
  recordedAt?: string
  tags?: string[]
  waveform?: number[]
}

export interface CommentCardMeta {
  content: string
  author?: { name: string; avatar?: string }
  createdAt?: string
  targetCardId?: string
  replies?: { author: string; content: string; createdAt?: string }[]
  reactions?: { emoji: string; count: number }[]
  resolved?: boolean
}

export interface StoryCardMeta {
  title: string
  subtitle?: string
  body: string
  author?: string
  cover?: string
  readingTime?: number
  chapters?: { title: string; content: string }[]
  tags?: string[]
}

export interface SocialCardMeta {
  platform: 'twitter' | 'weibo' | 'linkedin' | 'instagram' | 'tiktok' | 'youtube' | 'other'
  author: { name: string; handle?: string; avatar?: string; verified?: boolean }
  content: string
  postedAt?: string
  media?: { type: 'image' | 'video'; url: string }[]
  stats?: { likes?: number; reposts?: number; comments?: number; views?: number }
  url?: string
  hashtags?: string[]
}

export interface PokerCardMeta {
  rank: 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K'
  suit: 'spades' | 'hearts' | 'diamonds' | 'clubs'
  faceDown?: boolean
  backStyle?: 'classic' | 'blue' | 'red' | 'custom'
  meaning?: string
}

export interface TarotCardMeta {
  name: string
  nameCn?: string
  number: number | string
  arcana: 'major' | 'minor'
  suit?: 'wands' | 'cups' | 'swords' | 'pentacles'
  reversed?: boolean
  keywords?: string[]
  upright?: string
  reversedMeaning?: string
}

/** Union type of all structured Meta types */
export type CardMeta =
  | DataCardMeta
  | ArgumentCardMeta
  | QuoteCardMeta
  | DefinitionCardMeta
  | ChartCardMeta
  | TableCardMeta
  | CodeCardMeta
  | KeypointCardMeta
  | ExampleCardMeta
  | SummaryCardMeta
  | ReferenceCardMeta
  | InspirationCardMeta
  | TimelineCardMeta
  | ComparisonCardMeta
  | ProcessCardMeta
  | GifCardMeta
  | QrcodeCardMeta
  | PersonCardMeta
  | TerminalCardMeta
  | LottieCardMeta
  | WebpageCardMeta
  | CountdownCardMeta
  | ThreeDCardMeta
  | ImageCardMeta
  | Live2DCardMeta
  | LinkCardMeta
  | FileCardMeta
  | MathCardMeta
  | TodoCardMeta
  | PositionCardMeta
  | TimestampCardMeta
  | ColorCardMeta
  | EventCardMeta
  | VoiceCardMeta
  | CommentCardMeta
  | StoryCardMeta
  | SocialCardMeta
  | PokerCardMeta
  | TarotCardMeta
  | Record<string, unknown>

/** CardKind → Meta type mapping */
export interface CardKindMetaMap {
  data: DataCardMeta
  chart: ChartCardMeta
  argument: ArgumentCardMeta
  quote: QuoteCardMeta
  definition: DefinitionCardMeta
  table: TableCardMeta
  code: CodeCardMeta
  keypoint: KeypointCardMeta
  example: ExampleCardMeta
  summary: SummaryCardMeta
  reference: ReferenceCardMeta
  inspiration: InspirationCardMeta
  timeline: TimelineCardMeta
  comparison: ComparisonCardMeta
  process: ProcessCardMeta
  gif: GifCardMeta
  qrcode: QrcodeCardMeta
  person: PersonCardMeta
  terminal: TerminalCardMeta
  lottie: LottieCardMeta
  webpage: WebpageCardMeta
  countdown: CountdownCardMeta
  threed: ThreeDCardMeta
  image: ImageCardMeta
  live2d: Live2DCardMeta
  link: LinkCardMeta
  file: FileCardMeta
  math: MathCardMeta
  todo: TodoCardMeta
  position: PositionCardMeta
  timestamp: TimestampCardMeta
  color: ColorCardMeta
  event: EventCardMeta
  voice: VoiceCardMeta
  comment: CommentCardMeta
  story: StoryCardMeta
  social: SocialCardMeta
  poker: PokerCardMeta
  tarot: TarotCardMeta
  text: Record<string, unknown>
  audio: Record<string, unknown>
  video: Record<string, unknown>
  idea: Record<string, unknown>
  flash: Record<string, unknown>
}
