/**
 * Voice transcript post-processing utilities
 * Inspired by TypeLess AI - makes voice input more natural and readable
 *
 * Research sources:
 * - TypeLess official docs: https://www.typeless.com/help/installation-and-setup
 * - TypeLess manifesto: https://www.typeless.com/manifesto
 *
 * Key features based on TypeLess:
 * 1. Filler word removal (um, uh, 嗯, 啊)
 * 2. Self-correction detection ("actually", "不对", "我是说")
 * 3. List auto-formatting
 * 4. Punctuation normalization
 */

// === FILLER WORDS ===
// Based on TypeLess docs and common speech patterns

// Conservative approach - only remove obvious fillers
const CONSERVATIVE_FILLERS = [
  // Chinese
  '嗯',
  '啊',
  '呃',
  '哎',
  '唉',
  '哦',
  '喔',
  // English
  'um',
  'uh',
  'uhm',
]

// Extended fillers - may affect semantics, use with caution
const EXTENDED_FILLERS = [
  ...CONSERVATIVE_FILLERS,
  '呢',
  '吧',
  '嘛',
  '哈',
  '那个',
  '这个',
  '就是',
  '然后',
  '那么',
  '你知道',
  '你知道的',
  '怎么说呢',
  '这样说吧',
  '我的意思是',
  'like',
  'you know',
  'i mean',
  'actually',
  'basically',
  'literally',
]

// === SELF-CORRECTION PATTERNS ===
// Based on TypeLess "auto-edit when you change your mind" feature
// Example: "How about we meet at, um, 7 am? Oh, actually, let's do 3 pm."
// Result: "How about we meet at 3 PM?"

interface CorrectionPattern {
  pattern: RegExp
  description: string
}

const CHINESE_CORRECTION_PATTERNS: CorrectionPattern[] = [
  // "不对" / "错了" + 新内容
  { pattern: /(.+?)(?:不对|错了|不好意思)[，,.。]\s*/, description: 'correction-with-apology' },
  // "等等" / "等一下" + 新内容
  { pattern: /(.+?)(?:等等|等一下|等下)[，,.。]\s*/, description: 'pause-and-correct' },
  // "我是说" / "我的意思是" + 新内容（保留后面的）
  { pattern: /(?:我是说|我的意思是|我是指)[，,.。]?\s*/, description: 'clarification' },
  // "其实" + 新内容（当"其实"出现在句中作为改口）
  { pattern: /(.+?)(?:其实|事实上)[，,.。]\s*/, description: 'actually-correction' },
  // "让我想想" / "重新说" + 新内容
  { pattern: /(?:让我想想|重新说|重新讲|重来)[，,.。]?\s*/, description: 'restart' },
  // "算了" + 新内容
  { pattern: /(?:算了|算了算了)[，,.。]?\s*/, description: 'nevermind' },
  // "那个" / "那个那个" 作为犹豫词
  { pattern: /^(?:那个|那个那个)[，,.。]?\s*/, description: 'hesitation-start' },
]

const ENGLISH_CORRECTION_PATTERNS: CorrectionPattern[] = [
  // "actually" / "wait" + new content
  { pattern: /(.+?)(?:actually|wait|no|hang on)[,;.]?\s+/i, description: 'correction' },
  // "I mean" clarification
  { pattern: /(?:i mean|what i mean is)[,;.]?\s+/i, description: 'clarification' },
  // "let me" restart
  { pattern: /(?:let me|let's|scratch that)[,;.]?\s+/i, description: 'restart' },
  // "on second thought"
  { pattern: /(?:on second thought)[,;.]?\s+/i, description: 'reconsider' },
]

// === LIST FORMATTING ===
// Based on TypeLess auto-format feature
// Example: "My shopping list, bananas, oat milk, dark chocolate."
// Result: "My shopping list:\n- Bananas\n- Oat milk\n- Dark chocolate"

const LIST_KEYWORDS = ['列表', '清单', '购物', '事项', '任务', 'list', 'shopping', 'todo', 'tasks']

interface ListDetectionResult {
  isList: boolean
  title?: string
  items: string[]
}

// === PROCESSING OPTIONS ===

export interface VoiceProcessorOptions {
  /**
   * Filler removal mode
   * - 'conservative': Only remove obvious fillers (嗯, 啊, um, uh)
   * - 'aggressive': Remove more fillers (可能误伤)
   * - 'none': Don't remove fillers
   * @default 'conservative'
   */
  fillerMode?: 'conservative' | 'aggressive' | 'none'

  /**
   * Enable self-correction detection
   * Detects patterns like "不对..." and keeps only final intent
   * @default true
   */
  enableSelfCorrection?: boolean

  /**
   * Enable list auto-formatting
   * Converts comma-separated items to formatted lists
   * @default true
   */
  enableListFormatting?: boolean

  /**
   * Enable punctuation normalization
   * @default true
   */
  enablePunctuationFix?: boolean

  /**
   * Enable duplicate word removal
   * @default true
   */
  enableDeduplication?: boolean
}

// === CORE FUNCTIONS ===

/**
 * Remove filler words from text
 */
function removeFillers(text: string, mode: 'conservative' | 'aggressive' | 'none'): string {
  if (mode === 'none') return text

  const fillers = mode === 'conservative' ? CONSERVATIVE_FILLERS : EXTENDED_FILLERS
  let result = text

  for (const filler of fillers) {
    // Match whole words/phrases, case insensitive for English
    const escaped = filler.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`(^|\\s)${escaped}(\\s|$|[,，.。!！?？])`, 'gi')
    result = result.replace(regex, '$1')
  }

  // Clean up extra spaces
  return result.replace(/\s+/g, ' ').trim()
}

/**
 * Detect and process self-corrections
 * Returns the final intended text after corrections
 *
 * Example:
 * Input: "我们明天见面，不对，后天见面"
 * Output: { text: "我们后天见面", wasCorrected: true }
 */
function processSelfCorrections(
  text: string,
  options: VoiceProcessorOptions,
): {
  text: string
  wasCorrected: boolean
} {
  if (!options.enableSelfCorrection) {
    return { text, wasCorrected: false }
  }

  let result = text
  let wasCorrected = false

  // Try Chinese patterns
  for (const { pattern, description } of CHINESE_CORRECTION_PATTERNS) {
    const match = result.match(pattern)
    if (match) {
      // For patterns that capture content before the correction signal,
      // we keep only what comes after the signal
      if (
        description === 'clarification' ||
        description === 'restart' ||
        description === 'nevermind' ||
        description === 'reconsider' ||
        description === 'hesitation-start'
      ) {
        // These patterns don't capture before-content, just remove the signal
        result = result.replace(pattern, '')
      } else {
        // For correction patterns, keep only what comes after
        const afterSignal = result.slice(match.index! + match[0].length)
        result = afterSignal.trim()
      }
      wasCorrected = true
    }
  }

  // Try English patterns
  for (const { pattern, description } of ENGLISH_CORRECTION_PATTERNS) {
    const match = result.match(pattern)
    if (match) {
      if (
        description === 'clarification' ||
        description === 'restart' ||
        description === 'reconsider'
      ) {
        result = result.replace(pattern, '')
      } else {
        const afterSignal = result.slice(match.index! + match[0].length)
        result = afterSignal.trim()
      }
      wasCorrected = true
    }
  }

  return { text: result, wasCorrected }
}

/**
 * Detect if text contains list intent
 */
function detectListIntent(text: string): boolean {
  const lower = text.toLowerCase()
  return LIST_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()))
}

/**
 * Extract list items from text
 * Supports comma, Chinese comma, and "和/以及" separators
 */
function extractListItems(text: string): ListDetectionResult {
  // Check for list keywords
  const hasKeyword = detectListIntent(text)

  // Try to split by various separators
  const separators = /[,，;；、]|\s+and\s+|\s*和\s*|\s*以及\s*/
  const parts = text
    .split(separators)
    .map((s) => s.trim())
    .filter(Boolean)

  // If we have multiple parts, it's likely a list
  if (parts.length >= 2) {
    // Try to extract title (text before the first item or containing keywords)
    let title: string | undefined
    const listKeywordIndex = LIST_KEYWORDS.findIndex((kw) =>
      text.toLowerCase().includes(kw.toLowerCase()),
    )

    if (listKeywordIndex >= 0) {
      const keyword = LIST_KEYWORDS[listKeywordIndex]!
      const keywordPos = keyword ? text.toLowerCase().indexOf(keyword.toLowerCase()) : -1
      title =
        keyword && keywordPos >= 0 ? text.slice(0, keywordPos + keyword.length).trim() : undefined
      // Remove trailing punctuation
      title = title?.replace(/[:：,，;；]$/, '')
    }

    return {
      isList: hasKeyword || parts.length >= 3,
      title,
      items: parts,
    }
  }

  return { isList: false, items: [text] }
}

/**
 * Format text as a list if it appears to be a list
 */
function formatAsList(text: string, options: VoiceProcessorOptions): string {
  if (!options.enableListFormatting) {
    return text
  }

  const detection = extractListItems(text)

  if (!detection.isList || detection.items.length < 2) {
    return text
  }

  const lines: string[] = []

  if (detection.title) {
    lines.push(`${detection.title}:`)
  }

  for (const item of detection.items) {
    // Capitalize first letter
    const formatted = item ? item.charAt(0).toUpperCase() + item.slice(1) : item
    if (formatted) lines.push(`- ${formatted}`)
  }

  return lines.join('\n')
}

/**
 * Remove adjacent duplicate words
 * Example: "我要我要吃饭" -> "我要吃饭"
 */
function removeDuplicateWords(text: string): string {
  // Split by spaces but keep the delimiters
  const parts = text.split(/(\s+)/)
  const result: string[] = []

  for (let i = 0; i < parts.length; i++) {
    const current = parts[i]?.trim() ?? ''
    const prev = result[result.length - 1]?.trim()

    // Skip if same as previous (case insensitive, ignore punctuation)
    const currentClean = current.toLowerCase().replace(/[.,;:!?，。；：！？]$/, '')
    const prevClean = prev ? prev.toLowerCase().replace(/[.,;:!?，。；：！？]$/, '') : ''

    if (current && currentClean !== prevClean) {
      result.push(parts[i] ?? '')
    }
  }

  return result.join('')
}

// Punctuation normalization map
const PUNCTUATION_MAP: Record<string, string> = {
  '，': ', ',
  '。': '. ',
  '？': '? ',
  '！': '! ',
  '；': '; ',
  '：': ': ',
  '"': '"',
  "'": "'",
  '（': ' (',
  '）': ') ',
  '【': ' [',
  '】': '] ',
}

/**
 * Normalize punctuation
 */
function normalizePunctuation(text: string, options: VoiceProcessorOptions): string {
  if (!options.enablePunctuationFix) {
    return text
  }

  let result = text

  for (const [cn, en] of Object.entries(PUNCTUATION_MAP)) {
    result = result.replace(new RegExp(cn, 'g'), en)
  }

  // Fix multiple spaces
  result = result.replace(/\s+/g, ' ').trim()

  // Fix space before punctuation
  result = result.replace(/\s+([.,;:!?])\s*/g, '$1 ')

  // Capitalize first letter of sentences (for mixed content)
  result = result.replace(/(^|[.!?]\s+)([a-z])/g, (_, sep, char) => sep + char.toUpperCase())

  // Fix repeated punctuation
  result = result.replace(/([.!?])\s*\1+/g, '$1')

  return result.trim()
}

// === MAIN EXPORT ===

/**
 * Main voice transcript processor
 * Applies all transformations to make speech more readable
 *
 * Processing order:
 * 1. Self-correction detection (most important - changes content)
 * 2. Filler removal
 * 3. Duplicate removal
 * 4. List formatting
 * 5. Punctuation normalization
 */
export function processVoiceTranscript(text: string, options: VoiceProcessorOptions = {}): string {
  if (!text || typeof text !== 'string') {
    return ''
  }

  // Default options
  const opts: VoiceProcessorOptions = {
    fillerMode: 'conservative',
    enableSelfCorrection: true,
    enableListFormatting: true,
    enablePunctuationFix: true,
    enableDeduplication: true,
    ...options,
  }

  let result = text.trim()

  // Step 1: Self-correction detection (highest priority)
  const correction = processSelfCorrections(result, opts)
  result = correction.text

  // Step 2: Remove fillers
  result = removeFillers(result, opts.fillerMode!)

  // Step 3: Remove duplicates
  if (opts.enableDeduplication) {
    result = removeDuplicateWords(result)
  }

  // Step 4: Format as list if applicable
  result = formatAsList(result, opts)

  // Step 5: Normalize punctuation
  result = normalizePunctuation(result, opts as Required<VoiceProcessorOptions>)

  return result.trim()
}

/**
 * Process streaming transcript (lighter processing for real-time)
 * Only applies safe transformations that won't disrupt typing flow
 */
export function processStreamingTranscript(
  text: string,
  options: VoiceProcessorOptions = {},
): string {
  if (!text || typeof text !== 'string') {
    return ''
  }

  // For streaming, use conservative settings
  const opts: VoiceProcessorOptions = {
    fillerMode: 'conservative',
    enableSelfCorrection: false, // Don't correct mid-stream
    enableListFormatting: false, // Format at end
    enablePunctuationFix: true,
    enableDeduplication: true,
    ...options,
  }

  let result = text.trim()

  // Only safe transformations for streaming
  result = removeFillers(result, opts.fillerMode!)
  result = removeDuplicateWords(result)
  result = normalizePunctuation(result, opts as Required<VoiceProcessorOptions>)

  return result.trim()
}

/**
 * Check if text contains command keywords
 * Returns the command type if found, null otherwise
 */
export function detectVoiceCommand(text: string): {
  type: 'delete' | 'send' | 'newline' | 'clear' | 'undo' | null
  processedText: string
} {
  const lower = text.toLowerCase().trim()

  // Delete commands
  if (/^(删除|撤销|undo|delete|remove|去掉)\s*/.test(lower)) {
    return {
      type: 'delete',
      processedText: text.replace(/^(删除|撤销|undo|delete|remove|去掉)\s*/i, ''),
    }
  }

  // Send commands
  if (/^(发送|send|submit|go|发出去)\s*/.test(lower)) {
    return {
      type: 'send',
      processedText: text.replace(/^(发送|send|submit|go|发出去)\s*/i, ''),
    }
  }

  // Newline commands
  if (/^(换行|newline|new line|next line|下一行)\s*/.test(lower)) {
    return {
      type: 'newline',
      processedText: text.replace(/^(换行|newline|new line|next line|下一行)\s*/i, ''),
    }
  }

  // Clear commands
  if (/^(清空|清除|clear|empty|删掉)\s*/.test(lower)) {
    return {
      type: 'clear',
      processedText: text.replace(/^(清空|清除|clear|empty|删掉)\s*/i, ''),
    }
  }

  // Undo commands
  if (/^(撤回|撤销|undo|cancel|算了)\s*/.test(lower)) {
    return {
      type: 'undo',
      processedText: text.replace(/^(撤回|撤销|undo|cancel|算了)\s*/i, ''),
    }
  }

  return { type: null, processedText: text }
}

// Export for testing
export {
  CONSERVATIVE_FILLERS,
  EXTENDED_FILLERS,
  CHINESE_CORRECTION_PATTERNS,
  ENGLISH_CORRECTION_PATTERNS,
  LIST_KEYWORDS,
}
