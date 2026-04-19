import type {
  Card,
  ColorCardMeta,
  CommentCardMeta,
  EventCardMeta,
  FileCardMeta,
  LinkCardMeta,
  MathCardMeta,
  PositionCardMeta,
  SocialCardMeta,
  StoryCardMeta,
  TimestampCardMeta,
  TodoCardMeta,
  VoiceCardMeta,
} from '../../types'
import { ArgumentList, ComparisonCard, ProcessCard } from './AnalysisCards'
import { ChartCard, DataDashboard } from './DataCards'
import { ExampleCard, InspirationCard, MermaidFlow, ReferenceCard, TimelineCard } from './InfoCards'
import { SimpleMarkdown } from './MarkdownRenderer'
import {
  ColorCard,
  CommentCard,
  EventCard,
  FileCard,
  LinkCard,
  MathCard,
  PositionCard,
  SocialCard,
  StoryCard,
  TimestampCard,
  TodoCard,
  VoiceCard,
} from './NewTypeCards'
import { CodeCard, TableCard } from './TableCodeCards'
import { DefinitionCard, KeypointCard, QuoteBlock, SummaryCard } from './TextCards'
import {
  isArgumentMeta,
  isChartMeta,
  isCodeMeta,
  isComparisonMeta,
  isDataMeta,
  isDefinitionMeta,
  isExampleMeta,
  isFlowMeta,
  isInspirationMeta,
  isKeypointMeta,
  isProcessMeta,
  isQuoteMeta,
  isReferenceMeta,
  isSummaryMeta,
  isTableMeta,
  isTimelineMeta,
} from './typeGuards'

export function StructuredCardContent({
  card,
  compact = false,
}: {
  card: Card
  compact?: boolean
}) {
  const { kind, meta, content, title } = card

  switch (kind) {
    case 'data':
      if (isDataMeta(meta)) return <DataDashboard meta={meta} title={title} />
      break
    case 'chart':
      if (isChartMeta(meta)) return <ChartCard meta={meta} />
      break
    case 'argument':
      if (isArgumentMeta(meta)) return <ArgumentList meta={meta} />
      break
    case 'quote':
      if (isQuoteMeta(meta)) return <QuoteBlock meta={meta} />
      break
    case 'definition':
      if (isDefinitionMeta(meta)) return <DefinitionCard meta={meta} />
      break
    case 'table':
      if (isTableMeta(meta)) return <TableCard meta={meta} />
      break
    case 'code':
      if (isCodeMeta(meta)) return <CodeCard meta={meta} />
      break
    case 'keypoint':
      if (isKeypointMeta(meta)) return <KeypointCard meta={meta} />
      break
    case 'example':
      if (isExampleMeta(meta)) return <ExampleCard meta={meta} />
      break
    case 'summary':
      if (isSummaryMeta(meta)) return <SummaryCard meta={meta} />
      break
    case 'reference':
      if (isReferenceMeta(meta)) return <ReferenceCard meta={meta} />
      break
    case 'inspiration':
    case 'idea':
      if (isInspirationMeta(meta)) return <InspirationCard meta={meta} />
      break
    case 'timeline':
      if (isTimelineMeta(meta)) return <TimelineCard meta={meta} />
      break
    case 'comparison':
      if (isComparisonMeta(meta)) return <ComparisonCard meta={meta} />
      break
    case 'process':
      if (isProcessMeta(meta)) return <ProcessCard meta={meta} />
      break
    case 'link':
      if (meta && typeof (meta as LinkCardMeta).url === 'string')
        return <LinkCard meta={meta as LinkCardMeta} />
      break
    case 'file':
      if (meta && typeof (meta as FileCardMeta).filename === 'string')
        return <FileCard meta={meta as FileCardMeta} />
      break
    case 'math':
      if (meta && typeof (meta as MathCardMeta).formula === 'string')
        return <MathCard meta={meta as MathCardMeta} />
      break
    case 'todo':
      if (meta && Array.isArray((meta as TodoCardMeta).items))
        return <TodoCard meta={meta as TodoCardMeta} />
      break
    case 'position':
      if (meta && typeof (meta as PositionCardMeta).lat === 'number')
        return <PositionCard meta={meta as PositionCardMeta} />
      break
    case 'timestamp':
      if (meta && typeof (meta as TimestampCardMeta).datetime === 'string')
        return <TimestampCard meta={meta as TimestampCardMeta} />
      break
    case 'color':
      if (meta && typeof (meta as ColorCardMeta).hex === 'string')
        return <ColorCard meta={meta as ColorCardMeta} />
      break
    case 'event':
      if (meta && typeof (meta as EventCardMeta).title === 'string')
        return <EventCard meta={meta as EventCardMeta} />
      break
    case 'voice':
      return <VoiceCard meta={(meta || {}) as VoiceCardMeta} />
    case 'comment':
      if (meta && typeof (meta as CommentCardMeta).content === 'string')
        return <CommentCard meta={meta as CommentCardMeta} />
      break
    case 'story':
      if (meta && typeof (meta as StoryCardMeta).title === 'string')
        return <StoryCard meta={meta as StoryCardMeta} />
      break
    case 'social':
      if (meta && typeof (meta as SocialCardMeta).content === 'string')
        return <SocialCard meta={meta as SocialCardMeta} />
      break
  }

  if (!content) return null
  return <SimpleMarkdown content={content} compact={compact} />
}

export function StructuredCardDetail({ card }: { card: Card }) {
  return <StructuredCardContent card={card} compact={false} />
}

export {
  isArgumentMeta,
  isChartMeta,
  isCodeMeta,
  isComparisonMeta,
  isDataMeta,
  isDefinitionMeta,
  isExampleMeta,
  isFlowMeta,
  isInspirationMeta,
  isKeypointMeta,
  isProcessMeta,
  isQuoteMeta,
  isReferenceMeta,
  isSummaryMeta,
  isTableMeta,
  isTimelineMeta,
} from './typeGuards'
