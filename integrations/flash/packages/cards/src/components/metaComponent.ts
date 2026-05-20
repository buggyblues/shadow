// ══════════════════════════════════════════════════════════════
// @shadowob/flash-cards — Meta Component (registry-backed)
//
// Provides backward-compatible per-kind meta store arrays that
// are backed by the CardPluginRegistry's generic meta system.
//
// When a plugin reads `dataMetaStore[eid]`, it's reading from
// `registry.getMetaStoreArray('data')[eid]`.
//
// This eliminates the need to add a new store + clear logic
// for every new card kind.
// ══════════════════════════════════════════════════════════════

import type {
  ArgumentCardMeta,
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
} from '@shadowob/flash-types'
import { registry } from '../registry'

// Each meta store is a reference to the registry's generic store for that kind.
// This is a zero-cost bridge — no copying, just aliased arrays.

export const CDataMeta = {}
export const CChartMeta = {}
export const CQuoteMeta = {}
export const CArgumentMeta = {}
export const CTableMeta = {}
export const CCodeMeta = {}
export const CKeypointMeta = {}
export const CDefinitionMeta = {}
export const CExampleMeta = {}
export const CReferenceMeta = {}
export const CInspirationMeta = {}
export const CTimelineMeta = {}
export const CComparisonMeta = {}
export const CProcessMeta = {}
export const CSummaryMeta = {}
export const CGifMeta = {}
export const CQrcodeMeta = {}
export const CPersonMeta = {}
export const CTerminalMeta = {}
export const CLottieMeta = {}
export const CWebpageMeta = {}
export const CCountdownMeta = {}
export const CThreeDMeta = {}
export const CImageMeta = {}
export const CLive2DMeta = {}
export const CLinkMeta = {}
export const CFileMeta = {}
export const CMathMeta = {}
export const CTodoMeta = {}
export const CPositionMeta = {}
export const CTimestampMeta = {}
export const CColorMeta = {}
export const CEventMeta = {}
export const CVoiceMeta = {}
export const CCommentMeta = {}
export const CStoryMeta = {}
export const CSocialMeta = {}
export const CPokerMeta = {}
export const CTarotMeta = {}
export const CRawMeta = {}

// Registry-backed meta store accessors (lazy — created on first access)
export const dataMetaStore = registry.getMetaStoreArray<DataCardMeta>('data')
export const chartMetaStore = registry.getMetaStoreArray<ChartCardMeta>('chart')
export const quoteMetaStore = registry.getMetaStoreArray<QuoteCardMeta>('quote')
export const argumentMetaStore = registry.getMetaStoreArray<ArgumentCardMeta>('argument')
export const tableMetaStore = registry.getMetaStoreArray<TableCardMeta>('table')
export const codeMetaStore = registry.getMetaStoreArray<CodeCardMeta>('code')
export const keypointMetaStore = registry.getMetaStoreArray<KeypointCardMeta>('keypoint')
export const definitionMetaStore = registry.getMetaStoreArray<DefinitionCardMeta>('definition')
export const exampleMetaStore = registry.getMetaStoreArray<ExampleCardMeta>('example')
export const referenceMetaStore = registry.getMetaStoreArray<ReferenceCardMeta>('reference')
export const inspirationMetaStore = registry.getMetaStoreArray<InspirationCardMeta>('inspiration')
export const timelineMetaStore = registry.getMetaStoreArray<TimelineCardMeta>('timeline')
export const comparisonMetaStore = registry.getMetaStoreArray<ComparisonCardMeta>('comparison')
export const processMetaStore = registry.getMetaStoreArray<ProcessCardMeta>('process')
export const summaryMetaStore = registry.getMetaStoreArray<SummaryCardMeta>('summary')
export const gifMetaStore = registry.getMetaStoreArray<GifCardMeta>('gif')
export const qrcodeMetaStore = registry.getMetaStoreArray<QrcodeCardMeta>('qrcode')
export const personMetaStore = registry.getMetaStoreArray<PersonCardMeta>('person')
export const terminalMetaStore = registry.getMetaStoreArray<TerminalCardMeta>('terminal')
export const lottieMetaStore = registry.getMetaStoreArray<LottieCardMeta>('lottie')
export const webpageMetaStore = registry.getMetaStoreArray<WebpageCardMeta>('webpage')
export const countdownMetaStore = registry.getMetaStoreArray<CountdownCardMeta>('countdown')
export const threeDMetaStore = registry.getMetaStoreArray<ThreeDCardMeta>('threed')
export const imageMetaStore = registry.getMetaStoreArray<ImageCardMeta>('image')
export const live2dMetaStore = registry.getMetaStoreArray<Live2DCardMeta>('live2d')
export const linkMetaStore = registry.getMetaStoreArray<LinkCardMeta>('link')
export const fileMetaStore = registry.getMetaStoreArray<FileCardMeta>('file')
export const mathMetaStore = registry.getMetaStoreArray<MathCardMeta>('math')
export const todoMetaStore = registry.getMetaStoreArray<TodoCardMeta>('todo')
export const positionMetaStore = registry.getMetaStoreArray<PositionCardMeta>('position')
export const timestampMetaStore = registry.getMetaStoreArray<TimestampCardMeta>('timestamp')
export const colorMetaStore = registry.getMetaStoreArray<ColorCardMeta>('color')
export const eventMetaStore = registry.getMetaStoreArray<EventCardMeta>('event')
export const voiceMetaStore = registry.getMetaStoreArray<VoiceCardMeta>('voice')
export const commentMetaStore = registry.getMetaStoreArray<CommentCardMeta>('comment')
export const storyMetaStore = registry.getMetaStoreArray<StoryCardMeta>('story')
export const socialMetaStore = registry.getMetaStoreArray<SocialCardMeta>('social')
export const pokerMetaStore = registry.getMetaStoreArray<PokerCardMeta>('poker')
export const tarotMetaStore = registry.getMetaStoreArray<TarotCardMeta>('tarot')
export const rawMetaStore = registry.getRawMetaStoreArray()
