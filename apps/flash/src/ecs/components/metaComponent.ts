// ══════════════════════════════════════════════════════════════
// Component — Meta (AoS, bitECS tag + object stores per kind)
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
} from '../../types'

// Each meta component: a bitECS tag + a typed sparse-array store

export const CDataMeta = {}
export const dataMetaStore: Array<DataCardMeta | undefined> = []
export const CChartMeta = {}
export const chartMetaStore: Array<ChartCardMeta | undefined> = []
export const CQuoteMeta = {}
export const quoteMetaStore: Array<QuoteCardMeta | undefined> = []
export const CArgumentMeta = {}
export const argumentMetaStore: Array<ArgumentCardMeta | undefined> = []
export const CTableMeta = {}
export const tableMetaStore: Array<TableCardMeta | undefined> = []
export const CCodeMeta = {}
export const codeMetaStore: Array<CodeCardMeta | undefined> = []
export const CKeypointMeta = {}
export const keypointMetaStore: Array<KeypointCardMeta | undefined> = []
export const CDefinitionMeta = {}
export const definitionMetaStore: Array<DefinitionCardMeta | undefined> = []
export const CExampleMeta = {}
export const exampleMetaStore: Array<ExampleCardMeta | undefined> = []
export const CReferenceMeta = {}
export const referenceMetaStore: Array<ReferenceCardMeta | undefined> = []
export const CInspirationMeta = {}
export const inspirationMetaStore: Array<InspirationCardMeta | undefined> = []
export const CTimelineMeta = {}
export const timelineMetaStore: Array<TimelineCardMeta | undefined> = []
export const CComparisonMeta = {}
export const comparisonMetaStore: Array<ComparisonCardMeta | undefined> = []
export const CProcessMeta = {}
export const processMetaStore: Array<ProcessCardMeta | undefined> = []
export const CSummaryMeta = {}
export const summaryMetaStore: Array<SummaryCardMeta | undefined> = []
export const CGifMeta = {}
export const gifMetaStore: Array<GifCardMeta | undefined> = []
export const CQrcodeMeta = {}
export const qrcodeMetaStore: Array<QrcodeCardMeta | undefined> = []
export const CPersonMeta = {}
export const personMetaStore: Array<PersonCardMeta | undefined> = []
export const CTerminalMeta = {}
export const terminalMetaStore: Array<TerminalCardMeta | undefined> = []
export const CLottieMeta = {}
export const lottieMetaStore: Array<LottieCardMeta | undefined> = []
export const CWebpageMeta = {}
export const webpageMetaStore: Array<WebpageCardMeta | undefined> = []
export const CCountdownMeta = {}
export const countdownMetaStore: Array<CountdownCardMeta | undefined> = []
export const CThreeDMeta = {}
export const threeDMetaStore: Array<ThreeDCardMeta | undefined> = []
export const CImageMeta = {}
export const imageMetaStore: Array<ImageCardMeta | undefined> = []
export const CLive2DMeta = {}
export const live2dMetaStore: Array<Live2DCardMeta | undefined> = []
export const CLinkMeta = {}
export const linkMetaStore: Array<LinkCardMeta | undefined> = []
export const CFileMeta = {}
export const fileMetaStore: Array<FileCardMeta | undefined> = []
export const CMathMeta = {}
export const mathMetaStore: Array<MathCardMeta | undefined> = []
export const CTodoMeta = {}
export const todoMetaStore: Array<TodoCardMeta | undefined> = []
export const CPositionMeta = {}
export const positionMetaStore: Array<PositionCardMeta | undefined> = []
export const CTimestampMeta = {}
export const timestampMetaStore: Array<TimestampCardMeta | undefined> = []
export const CColorMeta = {}
export const colorMetaStore: Array<ColorCardMeta | undefined> = []
export const CEventMeta = {}
export const eventMetaStore: Array<EventCardMeta | undefined> = []
export const CVoiceMeta = {}
export const voiceMetaStore: Array<VoiceCardMeta | undefined> = []
export const CCommentMeta = {}
export const commentMetaStore: Array<CommentCardMeta | undefined> = []
export const CStoryMeta = {}
export const storyMetaStore: Array<StoryCardMeta | undefined> = []
export const CSocialMeta = {}
export const socialMetaStore: Array<SocialCardMeta | undefined> = []
export const CPokerMeta = {}
export const pokerMetaStore: Array<PokerCardMeta | undefined> = []
export const CTarotMeta = {}
export const tarotMetaStore: Array<TarotCardMeta | undefined> = []

export const CRawMeta = {}
export const rawMetaStore: Array<Readonly<Record<string, unknown>> | undefined> = []
