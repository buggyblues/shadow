import type { MessageMention, MessageMentionRange } from '../types'

export type MessageMentionTextSegment =
  | {
      type: 'text'
      text: string
    }
  | {
      type: 'mention'
      text: string
      range: MessageMentionRange
      mention: MessageMention
    }

type MentionCandidate = {
  start: number
  end: number
  order: number
  sourceText: string
  mention: MessageMention
}

function uniqueValues(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => !!value)))
}

export function canonicalMentionToken(
  mention: Pick<MessageMention, 'kind' | 'targetId'> & Partial<MessageMention>,
): string {
  if (mention.kind === 'channel') return `<#${mention.channelId ?? mention.targetId}>`
  if (mention.kind === 'server') return `<@server:${mention.serverId ?? mention.targetId}>`
  if (mention.kind === 'space_app') return `<@space-app:${mention.appId ?? mention.targetId}>`
  if (mention.kind === 'here' || mention.kind === 'everyone') {
    const scope = mention.serverId ?? mention.targetId
    return scope ? `<!${mention.kind}:${scope}>` : `<!${mention.kind}>`
  }
  return `<@${mention.userId ?? mention.targetId}>`
}

export function parseCanonicalMentionToken(
  token: string,
):
  | { kind: 'user'; targetId: string }
  | { kind: 'space_app'; targetId: string }
  | { kind: 'channel'; targetId: string }
  | { kind: 'server'; targetId: string }
  | { kind: 'here' | 'everyone'; targetId?: string }
  | null {
  const app = token.match(/^<@space-app:([^>]+)>$/u)
  if (app?.[1]) return { kind: 'space_app', targetId: app[1] }

  const user = token.match(/^<@([^>:]+)>$/u)
  if (user?.[1]) return { kind: 'user', targetId: user[1] }

  const server = token.match(/^<@server:([^>]+)>$/u)
  if (server?.[1]) return { kind: 'server', targetId: server[1] }

  const channel = token.match(/^<#([^>]+)>$/u)
  if (channel?.[1]) return { kind: 'channel', targetId: channel[1] }

  const broadcast = token.match(/^<!(here|everyone)(?::([^>]+))?>$/u)
  if (broadcast?.[1] === 'here' || broadcast?.[1] === 'everyone') {
    return {
      kind: broadcast[1],
      ...(broadcast[2] ? { targetId: broadcast[2] } : {}),
    }
  }

  return null
}

export function isCanonicalMentionToken(token: string): boolean {
  return parseCanonicalMentionToken(token) !== null
}

function matchTextsForMention(mention: MessageMention): string[] {
  return uniqueValues([mention.token, mention.sourceToken, canonicalMentionToken(mention)])
}

function isValidRange(
  content: string,
  mention: MessageMention,
  range: MessageMentionRange | undefined,
) {
  if (!range) return false
  if (!Number.isInteger(range.start) || !Number.isInteger(range.end)) return false
  if (range.start < 0 || range.end <= range.start || range.end > content.length) return false
  const sourceText = content.slice(range.start, range.end)
  return matchTextsForMention(mention).includes(sourceText)
}

function overlaps(a: MessageMentionRange, b: MessageMentionRange) {
  return a.start < b.end && b.start < a.end
}

function canUseRange(range: MessageMentionRange, used: MessageMentionRange[]) {
  return !used.some((candidate) => overlaps(candidate, range))
}

function findOccurrences(content: string, token: string, used: MessageMentionRange[]) {
  const occurrences: MessageMentionRange[] = []
  let index = content.indexOf(token)
  while (index >= 0) {
    const range = { start: index, end: index + token.length }
    if (canUseRange(range, used)) occurrences.push(range)
    index = content.indexOf(token, index + token.length)
  }
  return occurrences
}

function addCandidate(
  candidates: MentionCandidate[],
  used: MessageMentionRange[],
  mention: MessageMention,
  range: MessageMentionRange,
  order: number,
  sourceText?: string,
) {
  if (!canUseRange(range, used)) return
  const matchedText = sourceText ?? mention.sourceToken ?? mention.token
  used.push(range)
  candidates.push({
    start: range.start,
    end: range.end,
    order,
    sourceText: matchedText,
    mention: { ...mention, range },
  })
}

export function segmentTextByMentions(
  content: string,
  mentions: readonly MessageMention[] | null | undefined,
): MessageMentionTextSegment[] {
  if (!content) return []
  const usableMentions = (mentions ?? []).filter((mention) => mention.token)
  if (usableMentions.length === 0) return [{ type: 'text', text: content }]

  const candidates: MentionCandidate[] = []
  const usedRanges: MessageMentionRange[] = []
  const pendingByText = new Map<string, Array<{ mention: MessageMention; order: number }>>()

  usableMentions.forEach((mention, order) => {
    if (isValidRange(content, mention, mention.range)) {
      addCandidate(
        candidates,
        usedRanges,
        mention,
        mention.range!,
        order,
        content.slice(mention.range!.start, mention.range!.end),
      )
      return
    }

    for (const text of matchTextsForMention(mention)) {
      const pending = pendingByText.get(text) ?? []
      pending.push({ mention, order })
      pendingByText.set(text, pending)
    }
  })

  const pendingGroups = Array.from(pendingByText.entries()).sort((a, b) => {
    const lengthDelta = b[0].length - a[0].length
    if (lengthDelta !== 0) return lengthDelta
    return a[1][0]!.order - b[1][0]!.order
  })

  for (const [token, pending] of pendingGroups) {
    const occurrences = findOccurrences(content, token, usedRanges)
    if (occurrences.length === 0) continue

    if (pending.length === 1) {
      const { mention, order } = pending[0]!
      for (const range of occurrences) {
        addCandidate(candidates, usedRanges, mention, range, order, token)
      }
      continue
    }

    pending.forEach(({ mention, order }, index) => {
      const range = occurrences[index]
      if (range) addCandidate(candidates, usedRanges, mention, range, order, token)
    })
  }

  candidates.sort((a, b) => a.start - b.start || b.end - a.end || a.order - b.order)

  const segments: MessageMentionTextSegment[] = []
  let cursor = 0
  for (const candidate of candidates) {
    if (candidate.start < cursor) continue
    if (candidate.start > cursor) {
      segments.push({ type: 'text', text: content.slice(cursor, candidate.start) })
    }
    const text = content.slice(candidate.start, candidate.end)
    segments.push({
      type: 'mention',
      text,
      range: { start: candidate.start, end: candidate.end },
      mention: { ...candidate.mention, sourceToken: candidate.sourceText },
    })
    cursor = candidate.end
  }

  if (cursor < content.length) {
    segments.push({ type: 'text', text: content.slice(cursor) })
  }

  return segments.length > 0 ? segments : [{ type: 'text', text: content }]
}

export function assignMentionRanges(
  content: string,
  mentions: readonly MessageMention[] | null | undefined,
): MessageMention[] {
  return segmentTextByMentions(content, mentions)
    .filter((segment): segment is Extract<MessageMentionTextSegment, { type: 'mention' }> => {
      return segment.type === 'mention'
    })
    .map((segment) => ({
      ...segment.mention,
      token: segment.mention.token || segment.text,
      range: segment.range,
    }))
}

export function canonicalizeMentionContent(
  content: string,
  mentions: readonly MessageMention[] | null | undefined,
): { content: string; mentions: MessageMention[] } {
  const canonicalMentions: MessageMention[] = []
  let nextContent = ''

  for (const segment of segmentTextByMentions(content, mentions)) {
    if (segment.type === 'text') {
      nextContent += segment.text
      continue
    }

    const token = canonicalMentionToken(segment.mention)
    const start = nextContent.length
    nextContent += token
    canonicalMentions.push({
      ...segment.mention,
      token,
      sourceToken: segment.text === token ? segment.mention.sourceToken : segment.text,
      range: { start, end: start + token.length },
    })
  }

  return { content: nextContent, mentions: canonicalMentions }
}

export function mentionDisplayText(mention: Pick<MessageMention, 'label' | 'token'>): string {
  return mention.label || mention.token
}

export function escapeMarkdownLinkLabel(label: string): string {
  return label.replace(/\\/g, '\\\\').replace(/\[/g, '\\[').replace(/\]/g, '\\]')
}

export function buildMentionMarkdownLinks(
  content: string,
  mentions: readonly MessageMention[] | null | undefined,
  hrefForMention: (mention: MessageMention, index: number) => string | null | undefined,
): { markdown: string; mentions: MessageMention[] } {
  const linkedMentions: MessageMention[] = []
  const markdown = segmentTextByMentions(content, mentions)
    .map((segment) => {
      if (segment.type === 'text') return segment.text

      const href = hrefForMention(segment.mention, linkedMentions.length)
      if (!href) return segment.text

      linkedMentions.push(segment.mention)
      return `[${escapeMarkdownLinkLabel(mentionDisplayText(segment.mention))}](${href})`
    })
    .join('')

  return { markdown, mentions: linkedMentions }
}
