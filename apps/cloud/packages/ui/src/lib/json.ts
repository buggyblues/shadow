export type JsonParseResult<T = unknown> = { ok: true; value: T } | { ok: false; message: string }

export function parseJson<T = unknown>(source: string): JsonParseResult<T> {
  try {
    return { ok: true, value: JSON.parse(source) as T }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

export function formatJson(source: string, space = 2): JsonParseResult<string> {
  const parsed = parseJson(source)
  if (!parsed.ok) return parsed

  return { ok: true, value: stringifyJson(parsed.value, space) }
}

export function isValidJson(source: string): boolean {
  return parseJson(source).ok
}

export function stringifyJson(value: unknown, space = 2): string {
  const json = JSON.stringify(value, null, space)
  return typeof json === 'string' ? json : ''
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
