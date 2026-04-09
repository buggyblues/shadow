import { describe, expect, it } from 'vitest'
import { chunkText } from '../src/outbound.js'

describe('chunkText', () => {
  it('returns single chunk when text fits', () => {
    const result = chunkText('hello world', 4000)
    expect(result).toEqual(['hello world'])
  })

  it('splits at paragraph boundary', () => {
    const text = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.'
    const result = chunkText(text, 30)
    // Should split at \n\n boundaries
    expect(result.every((c) => c.length <= 30)).toBe(true)
    expect(result.join(' ')).toContain('First paragraph')
    expect(result.join(' ')).toContain('Second paragraph')
    expect(result.join(' ')).toContain('Third paragraph')
  })

  it('splits at line break when no paragraph break', () => {
    const text = 'Line one.\nLine two.\nLine three.\nLine four.'
    const result = chunkText(text, 25)
    expect(result.every((c) => c.length <= 25)).toBe(true)
  })

  it('splits at sentence punctuation as fallback', () => {
    const text = 'First sentence. Second sentence. Third sentence.'
    const result = chunkText(text, 25)
    expect(result.every((c) => c.length <= 25)).toBe(true)
  })

  it('splits at Chinese punctuation', () => {
    const text = '这是第一段很长的话。这是第二段很长的话。这是第三段很长的话。'
    const result = chunkText(text, 20)
    expect(result.every((c) => c.length <= 20)).toBe(true)
    expect(result.length).toBeGreaterThan(1)
  })

  it('hard-splits at maxLen when no natural break', () => {
    const text = 'A'.repeat(100)
    const result = chunkText(text, 20)
    expect(result.length).toBe(5)
    expect(result.every((c) => c.length <= 20)).toBe(true)
  })

  it('handles exact boundary', () => {
    const text = 'A'.repeat(4000)
    const result = chunkText(text, 4000)
    expect(result).toEqual(['A'.repeat(4000)])
  })

  it('handles empty string', () => {
    const result = chunkText('', 4000)
    expect(result).toEqual([''])
  })

  it('preserves content across multiple chunks', () => {
    const paragraphs = Array.from(
      { length: 10 },
      (_, i) => `Paragraph ${i + 1}: ${'x'.repeat(500)}`,
    )
    const text = paragraphs.join('\n\n')
    const result = chunkText(text, 4000)
    expect(result.every((c) => c.length <= 4000)).toBe(true)
    // All original content should be present
    const joined = result.join('')
    for (let i = 0; i < 10; i++) {
      expect(joined).toContain(`Paragraph ${i + 1}`)
    }
  })
})
