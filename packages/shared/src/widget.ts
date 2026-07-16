export type ShadowWidgetSurface = 'desktop' | 'mobile'
export type ShadowWidgetCategory =
  | 'productivity'
  | 'communication'
  | 'media'
  | 'finance'
  | 'information'
  | 'lifestyle'
  | 'developer'
  | 'web'
  | 'other'

export interface ShadowWidgetSize {
  widthCells: number
  heightCells: number
}

export type ShadowWidgetValue = { literal: string } | { path: string } | { stringKey: string }

export type ShadowWidgetTextVariant = 'title' | 'body' | 'label' | 'caption' | 'value'
export type ShadowWidgetTone = 'default' | 'muted' | 'accent' | 'positive' | 'warning' | 'danger'

export type ShadowWidgetViewNode =
  | {
      type: 'stack' | 'row'
      gap?: 'none' | 'sm' | 'md' | 'lg'
      align?: 'start' | 'center' | 'end' | 'stretch'
      children: ShadowWidgetViewNode[]
    }
  | {
      type: 'grid'
      minColumnWidth?: number
      gap?: 'none' | 'sm' | 'md' | 'lg'
      children: ShadowWidgetViewNode[]
    }
  | {
      type: 'text'
      value: ShadowWidgetValue
      variant?: ShadowWidgetTextVariant
      tone?: ShadowWidgetTone
    }
  | {
      type: 'metric'
      label: ShadowWidgetValue
      value: ShadowWidgetValue
      detail?: ShadowWidgetValue
      tone?: ShadowWidgetTone
    }
  | {
      type: 'badge'
      value: ShadowWidgetValue
      tone?: ShadowWidgetTone
    }
  | { type: 'divider' }
  | { type: 'spacer' }

export interface ShadowWidgetSelectOptionChoice {
  value: string
  label: string
}

export interface ShadowWidgetSelectOption {
  key: string
  type: 'select'
  label: string
  defaultValue: string
  choices: ShadowWidgetSelectOptionChoice[]
}

export type ShadowWidgetOption = ShadowWidgetSelectOption

export interface ShadowWidgetDefinition {
  key: string
  title: string
  description?: string
  category?: ShadowWidgetCategory
  surfaces?: ShadowWidgetSurface[]
  strings?: Record<string, string>
  i18n?: Record<string, Record<string, string>>
  size: {
    default: ShadowWidgetSize
    min?: ShadowWidgetSize
    max?: ShadowWidgetSize
  }
  options?: ShadowWidgetOption[]
  data: {
    command: string
    refreshIntervalSeconds?: number
  }
  view: ShadowWidgetViewNode
}

export interface ShadowWidgetCatalogEntry {
  sourceId: string
  provider: {
    id: string
    name: string
    iconUrl?: string | null
  }
  definition: ShadowWidgetDefinition
}

export interface ShadowWidgetDataRequest {
  options?: Record<string, string>
}

export interface ShadowWidgetDataResponse {
  sourceId: string
  data: Record<string, unknown>
  updatedAt: string
}

export function defaultShadowWidgetOptions(definition: ShadowWidgetDefinition) {
  return Object.fromEntries(
    (definition.options ?? []).map((option) => [option.key, option.defaultValue]),
  )
}

function widgetLocaleCandidates(locale?: string | null) {
  const normalized = locale?.trim().replace('_', '-')
  const language = normalized?.split('-')[0]
  return [normalized, normalized?.toLowerCase(), language, language?.toLowerCase(), 'en'].filter(
    (value, index, values): value is string => Boolean(value) && values.indexOf(value) === index,
  )
}

export function localizeShadowWidgetDefinition(
  definition: ShadowWidgetDefinition,
  locale?: string | null,
): ShadowWidgetDefinition {
  const localized = widgetLocaleCandidates(locale)
    .map((candidate) => definition.i18n?.[candidate])
    .find(Boolean)
  if (!localized) return definition
  const strings = Object.fromEntries(
    Object.entries(localized).filter(([key]) => !key.startsWith('$')),
  )
  return {
    ...definition,
    title: localized.$title ?? definition.title,
    description: localized.$description ?? definition.description,
    strings: { ...(definition.strings ?? {}), ...strings },
    options: definition.options?.map((option) => ({
      ...option,
      label: localized[`$option.${option.key}`] ?? option.label,
      choices: option.choices.map((choice) => ({
        ...choice,
        label: localized[`$choice.${option.key}.${choice.value}`] ?? choice.label,
      })),
    })),
  }
}

export function resolveShadowWidgetValue(
  value: ShadowWidgetValue,
  data: Record<string, unknown>,
  strings: Record<string, string> = {},
): string {
  if ('literal' in value) return value.literal
  if ('stringKey' in value) return strings[value.stringKey] ?? value.stringKey
  const segments = value.path
    .replace(/^\$\.?/, '')
    .split('.')
    .map((segment) => segment.trim())
    .filter(Boolean)
  let current: unknown = data
  for (const segment of segments) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return ''
    current = (current as Record<string, unknown>)[segment]
  }
  if (current === null || current === undefined) return ''
  return typeof current === 'string' ? current : String(current)
}
