/**
 * Pinyin matching for Chinese characters using pinyin-pro.
 * Supports matching Chinese displayName / username by typing pinyin initials.
 */

import { match, pinyin } from 'pinyin-pro'

/**
 * Check if a query matches a text using pinyin.
 * Supports full pinyin and initial matching.
 * e.g. matchPinyin("张三丰", "zs") → 'start'
 *      matchPinyin("张三丰", "sf") → 'partial'
 *      matchPinyin("张三丰", "zhang") → 'start'
 */
export function matchPinyin(text: string, query: string): 'start' | 'partial' | false {
  if (!query || !text) return false
  const indices = match(text, query)
  if (!indices || indices.length === 0) return false
  return indices[0] === 0 ? 'start' : 'partial'
}

export function toPinyinSlug(text: string, fallback = 'buddy') {
  const converted = text
    .trim()
    .replace(/[\u3400-\u9fff]+/g, (chunk) =>
      pinyin(chunk, { toneType: 'none', separator: '-', v: true }),
    )
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)

  return converted || fallback
}
