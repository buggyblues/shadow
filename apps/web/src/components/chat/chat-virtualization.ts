export interface ChatVirtualAttachmentLike {
  contentType?: string | null
}

export interface ChatVirtualMessageLike {
  id: string
  content: string
  replyToId?: string | null
  attachments?: ChatVirtualAttachmentLike[] | null
  reactions?: unknown[] | null
  metadata?: {
    interactive?: unknown
  } | null
}

export type ChatVirtualTimelineItem<
  TMessage extends ChatVirtualMessageLike = ChatVirtualMessageLike,
> =
  | { kind: 'message'; data: TMessage; isGrouped?: boolean }
  | { kind: 'system'; data: { id: string } }

const AVERAGE_CHAT_LINE_CHARS = 76
// Long Markdown histories can delay first paint when rendered in normal flow.
export const CHAT_VIRTUALIZE_THRESHOLD = 40
export const CHAT_VIRTUAL_OVERSCAN = 16
export const CHAT_SCROLLING_RESET_DELAY = 96

export function shouldAdjustChatScrollPositionOnItemSizeChange(): boolean {
  return false
}

function estimateMarkdownLineCount(content: string): number {
  const normalized = content.replace(/\r\n?/g, '\n').trim()
  if (!normalized) return 0

  let estimatedLines = 0
  let fencedCode = false

  for (const line of normalized.split('\n')) {
    if (line.trimStart().startsWith('```')) {
      fencedCode = !fencedCode
      estimatedLines += 1
      continue
    }

    const wrapWidth = fencedCode ? 72 : AVERAGE_CHAT_LINE_CHARS
    estimatedLines += Math.max(1, Math.ceil(line.length / wrapWidth))

    if (/^#{1,3}\s/u.test(line)) estimatedLines += 0.5
    if (/^\s*\|.*\|\s*$/u.test(line)) estimatedLines += 1
  }

  return estimatedLines
}

export function estimateChatMessageSize(
  message: ChatVirtualMessageLike,
  isGrouped = false,
): number {
  let size = isGrouped ? 36 : 68

  if (message.replyToId) size += 34

  if (message.content && message.content !== '\u200B') {
    const estimatedLines = estimateMarkdownLineCount(message.content)
    if (estimatedLines > 0) {
      size += 14 + estimatedLines * 26
    }
  }

  for (const attachment of message.attachments ?? []) {
    size += attachment.contentType?.startsWith('image/') ? 260 : 92
  }

  if (message.metadata?.interactive) size += 128
  if ((message.reactions?.length ?? 0) > 0) size += 34

  return Math.max(44, Math.min(Math.ceil(size), 6000))
}

export function estimateChatTimelineItemSize(item: ChatVirtualTimelineItem | undefined): number {
  if (!item) return 80
  if (item.kind === 'system') return 40
  return estimateChatMessageSize(item.data, item.isGrouped)
}

export function getChatTimelineItemKey(
  item: ChatVirtualTimelineItem | undefined,
  index: number,
): string {
  if (!item) return `missing:${index}`
  return `${item.kind}:${item.data.id}`
}

export function getChatMessageItemKey(
  message: ChatVirtualMessageLike | undefined,
  index: number,
): string {
  return message?.id ? `message:${message.id}` : `missing:${index}`
}

export function getScrollDistanceFromBottom(scrollEl: HTMLElement): number {
  return Math.max(0, scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight)
}

export function isScrollNearBottom(scrollEl: HTMLElement, threshold = 120): boolean {
  return getScrollDistanceFromBottom(scrollEl) <= threshold
}
