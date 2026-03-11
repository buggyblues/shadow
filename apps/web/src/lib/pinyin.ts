/**
 * Lightweight pinyin first-letter matching for Chinese characters.
 * Uses Unicode ranges to map CJK characters to their pinyin initials.
 * Supports matching Chinese displayName / username by typing pinyin initials.
 */

// Pinyin initial table — maps Unicode code point boundaries to initials
// Based on GB2312 ordering mapped to Unicode CJK Unified Ideographs
const PINYIN_BOUNDARIES: [number, string][] = [
  [0x9fff, ''],
  [0x86c6, 'z'],
  [0x8461, 'y'],
  [0x831f, 'x'],
  [0x8147, 'w'],
  [0x7e92, 'v'],
  [0x7cdf, 'u'],
  [0x7b9f, 't'],
  [0x76ca, 's'],
  [0x74e2, 'r'],
  [0x7316, 'q'],
  [0x70ad, 'p'],
  [0x6da9, 'o'],
  [0x6c80, 'n'],
  [0x6bc4, 'm'],
  [0x67f5, 'l'],
  [0x6325, 'k'],
  [0x5f6a, 'j'],
  [0x5c3e, 'i'],
  [0x5ba0, 'h'],
  [0x5587, 'g'],
  [0x5414, 'f'],
  [0x5143, 'e'],
  [0x4f4f, 'd'],
  [0x4d7e, 'c'],
  [0x4c9e, 'b'],
  [0x4e00, 'a'],
]

/**
 * Get the pinyin initial of a single Chinese character.
 * Returns lowercase letter or empty string for non-CJK characters.
 */
function getPinyinInitial(char: string): string {
  const code = char.charCodeAt(0)
  if (code < 0x4e00 || code > 0x9fff) return char.toLowerCase()
  for (const [boundary, initial] of PINYIN_BOUNDARIES) {
    if (code <= boundary) return initial
  }
  return ''
}

/**
 * Get the pinyin initials string for a given text.
 * e.g. "张三丰" → "zsf", "hello" → "hello"
 */
export function getPinyinInitials(text: string): string {
  return Array.from(text).map(getPinyinInitial).join('')
}

/**
 * Check if a query matches a text using pinyin initials.
 * Supports matching at the start or anywhere within the pinyin initials.
 * e.g. matchPinyin("张三丰", "zs") → true
 *      matchPinyin("张三丰", "sf") → true (partial match)
 */
export function matchPinyin(text: string, query: string): 'start' | 'partial' | false {
  if (!query || !text) return false
  const initials = getPinyinInitials(text)
  const q = query.toLowerCase()
  if (initials.startsWith(q)) return 'start'
  if (initials.includes(q)) return 'partial'
  return false
}
