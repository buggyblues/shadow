export type HermesToolCallDisplay = {
  id: string
  name: string
  value: string
  kind: 'browser' | 'file' | 'skill' | 'terminal' | 'todo' | 'tool'
  count: number
}

const HERMES_TOOL_CALL_RE =
  /(?:^|[\s\n])(?:[^\w\s:"]+\s*)?([A-Za-z][A-Za-z0-9_.-]*)\s*:\s*"((?:\\.|[^"\\])*)"/g
const KNOWN_HERMES_TOOL_PREFIX_RE =
  /^(apply_patch|delegate_task|execute_code|patch|terminal|shell|bash|python|node|skill|skill_view|todo|tool|mcp|shadowob|read|write|edit|file|browser|memory|session_search|cronjob|search_files)/i
const HERMES_TOOL_LINE_RE =
  /^(\s*(?:[-*]\s*)?(?:[^\w\s:"`]+\s*)?)([A-Za-z][A-Za-z0-9_.-]*)\s*:\s*(.*)$/u
const HERMES_BARE_TOOL_LINE_RE =
  /^\s*(?:[-*]\s*)?(?:[^\w\s:"`]+\s*)?([A-Za-z][A-Za-z0-9_.-]*)\s*(?:\.{3}|…)\s*$/u

function decodeHermesToolValue(value: string): string {
  let decoded = value.trim()
  if (decoded.startsWith('"')) decoded = decoded.slice(1)
  if (decoded.endsWith('"')) decoded = decoded.slice(0, -1)
  return decoded.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\').trim()
}

function classifyHermesToolCall(name: string): HermesToolCallDisplay['kind'] {
  if (/terminal|shell|bash|exec|execute_code|command|python|node/i.test(name)) return 'terminal'
  if (/todo|plan|task|cronjob/i.test(name)) return 'todo'
  if (/skill/i.test(name)) return 'skill'
  if (/browser|chrome|web/i.test(name)) return 'browser'
  if (/patch|read|write|edit|file|search_files/i.test(name)) return 'file'
  return 'tool'
}

function appendHermesToolCall(toolCalls: HermesToolCallDisplay[], call: HermesToolCallDisplay) {
  const duplicate = toolCalls.find((item) => item.name === call.name && item.value === call.value)
  if (duplicate) {
    duplicate.count += 1
    return
  }
  toolCalls.push(call)
}

function parseHermesToolLine(line: string, index: number): HermesToolCallDisplay | null {
  const match = line.match(HERMES_TOOL_LINE_RE)
  if (!match) {
    const bareMatch = line.match(HERMES_BARE_TOOL_LINE_RE)
    const bareName = bareMatch?.[1]
    if (!bareName || !KNOWN_HERMES_TOOL_PREFIX_RE.test(bareName)) return null

    return {
      id: `${bareName}-${index}`,
      name: bareName,
      value: bareName,
      kind: classifyHermesToolCall(bareName),
      count: 1,
    }
  }

  const name = match[2] ?? 'tool'
  if (!KNOWN_HERMES_TOOL_PREFIX_RE.test(name)) return null

  const value = decodeHermesToolValue(match[3] ?? '')
  if (!value) return null

  return {
    id: `${name}-${index}`,
    name,
    value,
    kind: classifyHermesToolCall(name),
    count: 1,
  }
}

function splitHermesToolCallsByLine(content: string): {
  content: string
  toolCalls: HermesToolCallDisplay[]
} {
  const lines = content.split(/\r?\n/u)
  const cleanedLines: string[] = []
  const toolCalls: HermesToolCallDisplay[] = []
  let foundToolCall = false

  lines.forEach((line, index) => {
    const call = parseHermesToolLine(line, index)
    if (!call) {
      cleanedLines.push(line)
      return
    }
    foundToolCall = true
    appendHermesToolCall(toolCalls, call)
  })

  if (!foundToolCall) return { content, toolCalls: [] }

  return {
    content: cleanedLines
      .join('\n')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
    toolCalls,
  }
}

export function splitHermesToolCalls(content: string): {
  content: string
  toolCalls: HermesToolCallDisplay[]
} {
  const byLine = splitHermesToolCallsByLine(content)
  if (byLine.toolCalls.length > 0) return byLine

  const matches = Array.from(content.matchAll(HERMES_TOOL_CALL_RE))
  if (matches.length === 0) return { content, toolCalls: [] }
  const recognized = matches.filter((match) => KNOWN_HERMES_TOOL_PREFIX_RE.test(match[1] ?? ''))
  if (recognized.length === 0) return { content, toolCalls: [] }

  const toolCalls: HermesToolCallDisplay[] = []
  let cleaned = ''
  let lastIndex = 0
  matches.forEach((match, index) => {
    const name = match[1] ?? 'tool'
    if (!KNOWN_HERMES_TOOL_PREFIX_RE.test(name)) return

    cleaned += content.slice(lastIndex, match.index)
    lastIndex = (match.index ?? 0) + match[0].length
    appendHermesToolCall(toolCalls, {
      id: `${name}-${index}-${match.index}`,
      name,
      value: decodeHermesToolValue(match[2] ?? ''),
      kind: classifyHermesToolCall(name),
      count: 1,
    })
  })
  cleaned += content.slice(lastIndex)

  return {
    content: cleaned
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
    toolCalls,
  }
}
