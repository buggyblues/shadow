// ═══════════════════════════════════════════════════════════════
// Flash UI — Type Definitions
//
// Core types re-exported from @shadowob/flash-types.
// UI-specific extensions live here.
// ═══════════════════════════════════════════════════════════════

export type {
  AppSettings,
  ArgumentCardMeta,
  Card,
  CardKind,
  CardKindMetaMap,
  CardMeta,
  CardPriority,
  ChartCardMeta,
  CodeCardMeta,
  ColorCardMeta,
  CommentCardMeta,
  ComparisonCardMeta,
  CountdownCardMeta,
  DataCardMeta,
  Deck,
  DefinitionCardMeta,
  EventCardMeta,
  ExampleCardMeta,
  FileCardMeta,
  GifCardMeta,
  ImageCardMeta,
  InspirationCardMeta,
  KeypointCardMeta,
  LinkCardMeta,
  Live2DCardMeta,
  LottieCardMeta,
  Material,
  MathCardMeta,
  OutlineItem,
  PersonCardMeta,
  PokerCardMeta,
  PositionCardMeta,
  ProcessCardMeta,
  Project,
  ProjectStatus,
  QrcodeCardMeta,
  QuoteCardMeta,
  ReferenceCardMeta,
  ResearchAngle,
  ResearchGoal,
  ResearchSession,
  ResearchStatus,
  SkillDef,
  SkillStatus,
  SocialCardMeta,
  StoryCardMeta,
  StreamEvent,
  SummaryCardMeta,
  TableCardMeta,
  TarotCardMeta,
  TaskArtifact,
  TaskRecord,
  TaskStatus,
  TerminalCardMeta,
  ThemePreset,
  ThreeDCardMeta,
  TimelineCardMeta,
  TimestampCardMeta,
  TodoCardMeta,
  TodoItem,
  UserSettings,
  VoiceCardMeta,
  WebpageCardMeta,
} from '@shadowob/flash-types'

import type { CardKind } from '@shadowob/flash-types'

/** API response */
export interface ApiResponse<T = unknown> {
  ok: boolean
  data?: T
  error?: string
}

/** Card filter */
export type CardFilter = 'all' | CardKind

/** Drag and drop data */
export interface DragCardData {
  cardId: string
  sourceType: 'cardGrid' | 'outline'
}

// ── Pipeline ──

export type PipelineStatus = 'idle' | 'running' | 'completed' | 'error' | 'paused'

export interface Pipeline {
  id: string
  name: string
  status: PipelineStatus
  taskIds: string[]
  currentStep: number
  deckId: string
  createdAt: number
  completedAt?: number
  error?: string
}

// ── View Mode ──

export type ViewMode = 'knowledge' | 'storyboard'

// ── Pipeline Items ──

export type PipelineItemStatus =
  | 'queued'
  | 'reading'
  | 'executing'
  | 'approval'
  | 'completed'
  | 'error'

export interface PipelineItem {
  id: string
  title: string
  status: PipelineItemStatus
  progress: string
  percent?: number
  taskId: string
  actionType?: string
  deckId?: string | null
  result?: {
    summary: string
    cardCount?: number
  }
  createdAt: number
}

/** SDK theme list item */
export interface SdkThemeItem {
  id: string
  name: string
  componentCount: number
  promptCount: number
  keywords: string
  description: string
  category: 'cover' | 'report' | 'official'
  thumbnailUrl?: string | null
}

/** SDK theme detail */
export interface SdkThemeDetail extends SdkThemeItem {
  components: { id: string; name: string; notes: string; jsxCode: string }[]
  promptContent: string
}

/** Global default settings */
export const DEFAULT_USER_SETTINGS: UserSettings = {
  displayName: '',
  language: 'zh-CN',
  aiLanguage: 'zh',
  defaultResearchGoals: [],
  autoCurate: true,
  autoPipeline: false,
  notifications: true,
  autoInspire: true,
  autoResearch: true,
  heartbeatInterval: 120,
  autoConsumeTodos: true,
}

/** Card-to-requirement request */
export interface CardToRequirementRequest {
  cardId: string
  strategy: 'auto' | 'expand' | 'refine' | 'decompose'
  context?: string
}
