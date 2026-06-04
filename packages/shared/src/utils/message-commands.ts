export interface SlashCommandAction {
  id: string
  command: string
  name: string
  argument?: string
}

const COMMAND_TOKEN_RE =
  /(^|[\s([{"'`])\\?\/([A-Za-z][A-Za-z0-9_-]{0,31})(?:\s+([A-Za-z][A-Za-z0-9_-]{0,31}))?/gu

const COMMAND_CUE_RE =
  /\b(reply|respond|send|type|enter|choose|click|press|run|execute|open)\b|回复|回覆|輸入|输入|发送|傳送|执行|執行|送信|응답|입력|보내|실행/iu

const ARG_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'at',
  'by',
  'cancel',
  'execute',
  'for',
  'from',
  'in',
  'on',
  'or',
  'that',
  'the',
  'this',
  'to',
  'when',
  'with',
])

const PATH_ROOTS = new Set([
  'applications',
  'bin',
  'etc',
  'home',
  'library',
  'opt',
  'tmp',
  'usr',
  'var',
])

function removeFencedCode(content: string) {
  return content.replace(/```[\s\S]*?```/gu, ' ')
}

function normalizeArgument(argument: string | undefined) {
  if (!argument) return undefined
  const value = argument.trim()
  if (!value) return undefined
  if (ARG_STOP_WORDS.has(value.toLocaleLowerCase())) return undefined
  return value
}

export function extractSlashCommandActions(
  content: string,
  options: { limit?: number } = {},
): SlashCommandAction[] {
  const normalized = removeFencedCode(content)
  const matches = Array.from(normalized.matchAll(COMMAND_TOKEN_RE))
  if (matches.length === 0) return []
  if (matches.length < 2 && !COMMAND_CUE_RE.test(normalized)) return []

  const limit = Math.max(1, options.limit ?? 6)
  const seen = new Set<string>()
  const actions: SlashCommandAction[] = []

  for (const match of matches) {
    const name = match[2]
    if (!name) continue
    const lowerName = name.toLocaleLowerCase()
    if (PATH_ROOTS.has(lowerName)) continue

    const argument = normalizeArgument(match[3])
    const command = `/${name}${argument ? ` ${argument}` : ''}`
    const key = command.toLocaleLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    actions.push({
      id: key,
      command,
      name,
      ...(argument ? { argument } : {}),
    })
    if (actions.length >= limit) break
  }

  return actions
}
