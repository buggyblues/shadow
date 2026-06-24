import { describe, expect, it } from 'vitest'
import {
  formatJson,
  isRecord,
  isValidJson,
  parseJson,
  stringifyJson,
} from '../../packages/ui/src/lib/json'

describe('cloud UI JSON helpers', () => {
  it('parses valid JSON and reports invalid JSON without throwing', () => {
    expect(parseJson<{ ok: boolean }>('{"ok":true}')).toEqual({
      ok: true,
      value: { ok: true },
    })

    const invalid = parseJson('{')
    expect(invalid.ok).toBe(false)
    if (!invalid.ok) expect(invalid.message).toContain('JSON')
  })

  it('formats JSON consistently', () => {
    expect(formatJson('{"b":2,"a":1}')).toEqual({
      ok: true,
      value: '{\n  "b": 2,\n  "a": 1\n}',
    })
  })

  it('handles JSON validity checks and non-serializable values', () => {
    expect(isValidJson('{"value":1}')).toBe(true)
    expect(isValidJson('nope')).toBe(false)
    expect(stringifyJson(undefined)).toBe('')
  })

  it('narrows plain records', () => {
    expect(isRecord({ value: true })).toBe(true)
    expect(isRecord(null)).toBe(false)
    expect(isRecord(['value'])).toBe(false)
  })
})
