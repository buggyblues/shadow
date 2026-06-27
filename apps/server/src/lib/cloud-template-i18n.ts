function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isI18nPlaceholder(value: string) {
  return /^\$\{i18n:[A-Za-z0-9_.-]+}$/.test(value.trim())
}

function placeholderKey(value: string) {
  const match = /^\$\{i18n:([A-Za-z0-9_.-]+)}$/.exec(value.trim())
  return match?.[1] ?? null
}

function localeCandidates(locale?: string | null) {
  const raw = locale?.split(',')[0]?.trim()
  const normalized = raw?.replace('_', '-')
  const base = normalized?.split('-')[0]
  return [
    normalized,
    normalized?.toLowerCase(),
    base,
    base?.toLowerCase(),
    'zh-CN',
    'en',
    'en-US',
  ].filter((item, index, list): item is string => Boolean(item) && list.indexOf(item) === index)
}

function readPath(value: Record<string, unknown> | null, path: string) {
  let current: unknown = value
  for (const segment of path.split('.')) {
    if (!isRecord(current)) return null
    current = current[segment]
  }
  return current
}

function localizedValueFromI18n(
  snapshot: Record<string, unknown>,
  key: string,
  locale?: string | null,
): string | null {
  const i18n = isRecord(snapshot.i18n) ? snapshot.i18n : null
  if (!i18n) return null
  for (const candidate of localeCandidates(locale)) {
    const localized = isRecord(i18n[candidate]) ? i18n[candidate] : null
    const value = readPath(localized, key) ?? localized?.[key]
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (trimmed && !isI18nPlaceholder(trimmed)) return trimmed
  }
  return null
}

function materializeI18nPlaceholders(
  value: unknown,
  root: Record<string, unknown>,
  locale?: string | null,
): unknown {
  if (typeof value === 'string') {
    if (!isI18nPlaceholder(value)) return value
    return localizedValueFromI18n(root, placeholderKey(value) ?? '', locale) ?? value
  }
  if (Array.isArray(value)) {
    return value.map((item) => materializeI18nPlaceholders(item, root, locale))
  }
  if (!isRecord(value)) return value
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      materializeI18nPlaceholders(item, root, locale),
    ]),
  )
}

function firstI18nPlaceholderPath(value: unknown, path = '$'): string | null {
  if (typeof value === 'string') return isI18nPlaceholder(value) ? path : null
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = firstI18nPlaceholderPath(value[index], `${path}[${index}]`)
      if (found) return found
    }
    return null
  }
  if (!isRecord(value)) return null
  for (const [key, item] of Object.entries(value)) {
    const found = firstI18nPlaceholderPath(item, `${path}.${key}`)
    if (found) return found
  }
  return null
}

export function materializeTemplateI18nPlaceholders(
  snapshot: Record<string, unknown>,
  locale?: string | null,
  label = 'Cloud template',
) {
  const root = JSON.parse(JSON.stringify(snapshot)) as Record<string, unknown>
  const materialized = materializeI18nPlaceholders(root, root, locale)
  if (!isRecord(materialized)) throw new Error(`${label} is not deployable`)
  const unresolvedPath = firstI18nPlaceholderPath(materialized)
  if (unresolvedPath) {
    throw new Error(`${label} contains unresolved i18n placeholder at ${unresolvedPath}`)
  }
  return materialized
}
