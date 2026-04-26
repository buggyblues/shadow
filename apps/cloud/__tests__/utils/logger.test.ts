import { describe, expect, it } from 'vitest'
import { resolveChalkFormatter } from '../../src/utils/logger'

describe('resolveChalkFormatter', () => {
  it('returns a direct chalk-like formatter', () => {
    const formatter = {
      blue: (text: string) => `blue:${text}`,
      green: (text: string) => `green:${text}`,
      yellow: (text: string) => `yellow:${text}`,
      red: (text: string) => `red:${text}`,
      cyan: (text: string) => `cyan:${text}`,
      dim: (text: string) => `dim:${text}`,
      bold: (text: string) => `bold:${text}`,
    }

    const resolved = resolveChalkFormatter(formatter)
    expect(resolved.cyan('hello')).toBe('cyan:hello')
    expect(resolved.bold('header')).toBe('bold:header')
  })

  it('unwraps nested default exports from CJS and ESM interop', () => {
    const formatter = {
      blue: (text: string) => `blue:${text}`,
      green: (text: string) => `green:${text}`,
      yellow: (text: string) => `yellow:${text}`,
      red: (text: string) => `red:${text}`,
      cyan: (text: string) => `cyan:${text}`,
      dim: (text: string) => `dim:${text}`,
      bold: (text: string) => `bold:${text}`,
    }

    const resolved = resolveChalkFormatter({ default: { default: formatter } })
    expect(resolved.cyan('worker')).toBe('cyan:worker')
    expect(resolved.green('ok')).toBe('green:ok')
  })

  it('falls back to plain text when no formatter is available', () => {
    const resolved = resolveChalkFormatter({ default: { nope: true } })
    expect(resolved.cyan('plain')).toBe('plain')
    expect(resolved.red('error')).toBe('error')
  })
})
