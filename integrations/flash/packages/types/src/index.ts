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
  RuleCardMeta,
  RuleTrigger,
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

// Card semantic normalization and Buddy composition helpers
export type {
  CardComposeDraftInput,
  CardComposeIntent,
  CardComposeRequest,
  CardCompositionPlanItem,
  CardCompositionResult,
  CardDraftInputLike,
  CardRenderProfile,
  NormalizedCardDraft,
} from './card-semantics.js'
export {
  CARD_COMPOSE_INTENT_VALUES,
  CARD_RENDER_PROFILES,
  CARD_SEMANTIC_VERSION,
  composeCardDraftsFromMaterial,
  normalizeCardDraft,
  normalizeCardForTransport,
  normalizeCardKind,
  SEMANTIC_CARD_KIND_VALUES,
} from './card-semantics.js'
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
export type { AppSettings, UserSettings } from './settings.js'
// App protocol models and validators
export * from './space-app.js'
