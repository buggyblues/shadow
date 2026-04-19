// ═══════════════════════════════════════════════════════════════
// @shadowob/flash-types — Public API
// ═══════════════════════════════════════════════════════════════

// API response types + helpers
export type { ApiErr, ApiOk, ApiResult, StreamEvent } from './api.js'
export { err, ok } from './api.js'
// Card kinds & meta
export type {
  ArgumentCardMeta,
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
  MathCardMeta,
  PersonCardMeta,
  PokerCardMeta,
  PositionCardMeta,
  ProcessCardMeta,
  QrcodeCardMeta,
  QuoteCardMeta,
  ReferenceCardMeta,
  SocialCardMeta,
  StoryCardMeta,
  SummaryCardMeta,
  TableCardMeta,
  TarotCardMeta,
  TerminalCardMeta,
  ThreeDCardMeta,
  TimelineCardMeta,
  TimestampCardMeta,
  TodoCardMeta,
  VoiceCardMeta,
  WebpageCardMeta,
} from './card.js'
// Domain models
export type {
  Card,
  Deck,
  Material,
  OutlineItem,
  Project,
  ProjectStatus,
  ResearchAngle,
  ResearchGoal,
  ResearchSession,
  ResearchStatus,
  SkillDef,
  SkillStatus,
  TaskArtifact,
  TaskRecord,
  TaskStatus,
  ThemePreset,
  TodoItem,
} from './models.js'
// Server records (DAO layer)
export type {
  CardRecord,
  DeckRecord,
  MaterialRecord,
  OutlineItemRecord,
  SkillRecord,
  ThemeComponent,
  ThemeFolder,
  ThemeRefRecord,
} from './records.js'
// Settings
export type {
  AppSettings,
  UserSettings,
} from './settings.js'
