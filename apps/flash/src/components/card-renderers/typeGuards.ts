import type {
  ArgumentCardMeta,
  ChartCardMeta,
  CodeCardMeta,
  ComparisonCardMeta,
  DataCardMeta,
  DefinitionCardMeta,
  ExampleCardMeta,
  FlowCardMeta,
  InspirationCardMeta,
  KeypointCardMeta,
  ProcessCardMeta,
  QuoteCardMeta,
  ReferenceCardMeta,
  SummaryCardMeta,
  TableCardMeta,
  TimelineCardMeta,
} from '../../types'

export function isDataMeta(meta: unknown): meta is DataCardMeta {
  return (
    !!meta &&
    typeof meta === 'object' &&
    'metrics' in meta &&
    Array.isArray((meta as DataCardMeta).metrics)
  )
}

export function isFlowMeta(meta: unknown): meta is FlowCardMeta {
  return (
    !!meta &&
    typeof meta === 'object' &&
    'mermaid' in meta &&
    typeof (meta as FlowCardMeta).mermaid === 'string'
  )
}

export function isArgumentMeta(meta: unknown): meta is ArgumentCardMeta {
  return !!meta && typeof meta === 'object' && 'claim' in meta && 'evidence' in meta
}

export function isQuoteMeta(meta: unknown): meta is QuoteCardMeta {
  return (
    !!meta &&
    typeof meta === 'object' &&
    'text' in meta &&
    typeof (meta as QuoteCardMeta).text === 'string'
  )
}

export function isDefinitionMeta(meta: unknown): meta is DefinitionCardMeta {
  return !!meta && typeof meta === 'object' && 'term' in meta && 'definition' in meta
}

export function isChartMeta(meta: unknown): meta is ChartCardMeta {
  return !!meta && typeof meta === 'object' && 'chartType' in meta && 'series' in meta
}

export function isTableMeta(meta: unknown): meta is TableCardMeta {
  return !!meta && typeof meta === 'object' && 'columns' in meta && 'rows' in meta
}

export function isCodeMeta(meta: unknown): meta is CodeCardMeta {
  return !!meta && typeof meta === 'object' && 'language' in meta && 'code' in meta
}

export function isKeypointMeta(meta: unknown): meta is KeypointCardMeta {
  return (
    !!meta &&
    typeof meta === 'object' &&
    'points' in meta &&
    Array.isArray((meta as KeypointCardMeta).points)
  )
}

export function isExampleMeta(meta: unknown): meta is ExampleCardMeta {
  return !!meta && typeof meta === 'object' && 'subject' in meta && 'scenario' in meta
}

export function isSummaryMeta(meta: unknown): meta is SummaryCardMeta {
  return (
    !!meta &&
    typeof meta === 'object' &&
    'body' in meta &&
    typeof (meta as SummaryCardMeta).body === 'string'
  )
}

export function isReferenceMeta(meta: unknown): meta is ReferenceCardMeta {
  return (
    !!meta && typeof meta === 'object' && ('refTitle' in meta || 'url' in meta || 'authors' in meta)
  )
}

export function isInspirationMeta(meta: unknown): meta is InspirationCardMeta {
  return (
    !!meta &&
    typeof meta === 'object' &&
    ('body' in meta || 'ideaType' in meta || 'impact' in meta || 'difficulty' in meta)
  )
}

export function isTimelineMeta(meta: unknown): meta is TimelineCardMeta {
  return (
    !!meta &&
    typeof meta === 'object' &&
    'events' in meta &&
    Array.isArray((meta as TimelineCardMeta).events)
  )
}

export function isComparisonMeta(meta: unknown): meta is ComparisonCardMeta {
  return !!meta && typeof meta === 'object' && 'subjects' in meta && 'dimensions' in meta
}

export function isProcessMeta(meta: unknown): meta is ProcessCardMeta {
  return (
    !!meta &&
    typeof meta === 'object' &&
    'steps' in meta &&
    Array.isArray((meta as ProcessCardMeta).steps)
  )
}
