const SHADOW_INTERACTIVE_KINDS = ['buttons', 'select', 'form', 'approval'] as const
type ShadowInteractiveKind = (typeof SHADOW_INTERACTIVE_KINDS)[number]

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readStringLike(value: unknown, trim = true): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'string') return trim ? value.trim() : value
  if (typeof value === 'number' || typeof value === 'boolean') {
    const stringValue = String(value)
    return trim ? stringValue.trim() : stringValue
  }
  return undefined
}

export function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    const stringValue = readStringLike(value)
    if (stringValue) return stringValue
  }
  return undefined
}

export function readMessageTarget(params: Record<string, unknown>): string {
  return firstString(params.to, params.target, params.recipient, params.channelId) ?? ''
}

function normalizeInteractiveKind(value: unknown): ShadowInteractiveKind | undefined {
  const raw = readStringLike(value)?.toLowerCase()
  if (!raw) return undefined
  return SHADOW_INTERACTIVE_KINDS.includes(raw as ShadowInteractiveKind)
    ? (raw as ShadowInteractiveKind)
    : undefined
}

function normalizeButtonStyle(value: unknown): 'primary' | 'secondary' | 'destructive' | undefined {
  const raw = readStringLike(value)?.toLowerCase()
  if (raw === 'primary' || raw === 'secondary' || raw === 'destructive') return raw
  if (raw === 'danger') return 'destructive'
  return undefined
}

function normalizeButtonItems(value: unknown): Record<string, unknown>[] | undefined {
  if (!Array.isArray(value)) return undefined
  const items = value
    .filter(isRecord)
    .map((button, index) => {
      const label = firstString(
        button.label,
        button.text,
        button.title,
        button.value,
        `Option ${index + 1}`,
      )
      const id = firstString(button.id, button.actionId, button.value, label, `button_${index + 1}`)
      const normalized: Record<string, unknown> = { id, label }
      const value = readStringLike(button.value, false)
      const style = normalizeButtonStyle(button.style)
      if (value !== undefined) normalized.value = value
      if (style) normalized.style = style
      return normalized
    })
    .filter((button) => button.id && button.label)
  return items.length > 0 ? items : undefined
}

function normalizeSelectItems(value: unknown): Record<string, unknown>[] | undefined {
  if (!Array.isArray(value)) return undefined
  const items = value
    .filter(isRecord)
    .map((option, index) => {
      const label = firstString(
        option.label,
        option.text,
        option.title,
        option.value,
        `Option ${index + 1}`,
      )
      const value = firstString(option.value, option.id, label, `option_${index + 1}`)
      const id = firstString(option.id, value, `option_${index + 1}`)
      return { id, label, value }
    })
    .filter((option) => option.id && option.label && option.value)
  return items.length > 0 ? items : undefined
}

function normalizeFormFieldKind(value: unknown): string | undefined {
  const raw = readStringLike(value)?.toLowerCase()
  if (['text', 'textarea', 'number', 'checkbox', 'select'].includes(raw ?? '')) return raw
  return undefined
}

function normalizeFormFields(value: unknown): Record<string, unknown>[] | undefined {
  if (!Array.isArray(value)) return undefined
  const fields = value
    .filter(isRecord)
    .map((field, index) => {
      const label = firstString(field.label, field.name, field.id, `Field ${index + 1}`)
      const id = firstString(field.id, field.name, label, `field_${index + 1}`)
      const kind =
        normalizeFormFieldKind(field.kind) ?? normalizeFormFieldKind(field.type) ?? 'text'
      const normalized: Record<string, unknown> = { id, kind, label }

      for (const key of ['placeholder', 'defaultValue']) {
        const value = readStringLike(field[key], false)
        if (value !== undefined) normalized[key] = value
      }
      if (typeof field.required === 'boolean') normalized.required = field.required
      if (typeof field.maxLength === 'number') normalized.maxLength = field.maxLength
      if (typeof field.min === 'number') normalized.min = field.min
      if (typeof field.max === 'number') normalized.max = field.max
      const options = normalizeSelectItems(field.options)
      if (options) normalized.options = options
      return normalized
    })
    .filter((field) => field.id && field.kind && field.label)
  return fields.length > 0 ? fields : undefined
}

export function resolveShadowInteractiveBlock(
  params: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const rawInteractive = isRecord(params.interactive) ? params.interactive : undefined
  const source =
    rawInteractive && normalizeInteractiveKind(rawInteractive.kind) ? rawInteractive : params

  let kind = normalizeInteractiveKind(source.kind)
  const buttons = normalizeButtonItems(source.buttons)
  const options = normalizeSelectItems(source.options)
  const fields = normalizeFormFields(source.fields)

  if (!kind) {
    if (fields) kind = 'form'
    else if (options) kind = 'select'
    else if (buttons) kind = 'buttons'
  }
  if (!kind) return undefined

  const prompt = firstString(source.prompt, source.message, source.content, source.text)
  const block: Record<string, unknown> = {
    id: firstString(source.blockId, source.id) ?? `ia_${Date.now().toString(36)}`,
    kind,
    ...(prompt ? { prompt } : {}),
  }

  if (buttons) block.buttons = buttons
  if (options) block.options = options
  if (fields) block.fields = fields

  const submitLabel = readStringLike(source.submitLabel)
  const responsePrompt = readStringLike(source.responsePrompt)
  const approvalCommentLabel = readStringLike(source.approvalCommentLabel)
  if (submitLabel) block.submitLabel = submitLabel
  if (responsePrompt) block.responsePrompt = responsePrompt
  if (approvalCommentLabel) block.approvalCommentLabel = approvalCommentLabel
  if (typeof source.oneShot === 'boolean') block.oneShot = source.oneShot

  return block
}

export function validateApprovalMessageContent(
  content: string,
  interactiveBlock?: Record<string, unknown>,
): string | null {
  if (interactiveBlock?.kind !== 'approval') return null
  const trimmed = content.trim()
  const prompt = readStringLike(interactiveBlock.prompt)
  const normalized = trimmed.replace(/\s+/g, ' ')
  const normalizedPrompt = prompt?.replace(/\s+/g, ' ')
  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length >= 4 || trimmed.length >= 240) return null
  if (trimmed.length >= 180 && normalized !== normalizedPrompt) return null

  return [
    'approval dialogs must be attached to a visible proposal in the same message',
    'include the concrete roadmap, MVP scope, plan, or decision before asking for approval',
  ].join('; ')
}
