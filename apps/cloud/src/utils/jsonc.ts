/**
 * JSONC (JSON with Comments) parser utility.
 *
 * Wraps `jsonc-parser` to provide a drop-in replacement for JSON.parse()
 * that supports // and /* comments in JSON files.
 */

import { type ParseError, parse, printParseErrorCode } from 'jsonc-parser'

/**
 * Parse a JSONC string (JSON with comments).
 * Supports // line comments and /* block comments.
 * Falls back gracefully — plain JSON also works.
 */
export function parseJsonc<T = unknown>(text: string, source?: string): T {
  const errors: ParseError[] = []
  const result = parse(text, errors, { allowTrailingComma: true })

  if (errors.length > 0) {
    const msg = errors
      .map((e) => `  offset ${e.offset}: ${printParseErrorCode(e.error)}`)
      .join('\n')
    throw new Error(`Invalid JSONC${source ? ` in ${source}` : ''}:\n${msg}`)
  }

  return result as T
}
