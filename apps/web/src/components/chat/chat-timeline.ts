export interface ChatTimelineMessage {
  id: string
  authorId: string
  replyToId?: string | null
  createdAt: string
}

export interface ChatTimelineSystemEvent {
  id: string
  timestamp: number
}

export type ChatTimelineItem<
  TMessage extends ChatTimelineMessage,
  TSystemEvent extends ChatTimelineSystemEvent,
> = { kind: 'message'; data: TMessage; isGrouped: boolean } | { kind: 'system'; data: TSystemEvent }

const GROUPED_MESSAGE_WINDOW_MS = 60_000

function isGroupedWithPrevious<TMessage extends ChatTimelineMessage>(
  message: TMessage,
  previous: TMessage | undefined,
  messageTime: number,
  previousTime: number,
) {
  return (
    previous !== undefined &&
    previous.authorId === message.authorId &&
    !message.replyToId &&
    Math.abs(messageTime - previousTime) < GROUPED_MESSAGE_WINDOW_MS
  )
}

export function buildChatTimeline<
  TMessage extends ChatTimelineMessage,
  TSystemEvent extends ChatTimelineSystemEvent,
>(messages: TMessage[], systemEvents: TSystemEvent[]): ChatTimelineItem<TMessage, TSystemEvent>[] {
  if (messages.length === 0) {
    return systemEvents
      .map((event, index) => ({ event, index }))
      .sort((a, b) => a.event.timestamp - b.event.timestamp || a.index - b.index)
      .map(({ event }) => ({ kind: 'system' as const, data: event }))
  }

  const timeline: ChatTimelineItem<TMessage, TSystemEvent>[] = []
  const sortedEvents =
    systemEvents.length === 0
      ? []
      : systemEvents
          .map((event, index) => ({ event, index }))
          .sort((a, b) => a.event.timestamp - b.event.timestamp || a.index - b.index)

  let eventIndex = 0
  let previousTime = 0

  for (let messageIndex = 0; messageIndex < messages.length; messageIndex++) {
    const message = messages[messageIndex]!
    const messageTime = new Date(message.createdAt).getTime()

    while (
      eventIndex < sortedEvents.length &&
      sortedEvents[eventIndex]!.event.timestamp < messageTime
    ) {
      timeline.push({ kind: 'system', data: sortedEvents[eventIndex]!.event })
      eventIndex += 1
    }

    timeline.push({
      kind: 'message',
      data: message,
      isGrouped: isGroupedWithPrevious(
        message,
        messageIndex > 0 ? messages[messageIndex - 1] : undefined,
        messageTime,
        previousTime,
      ),
    })

    while (
      eventIndex < sortedEvents.length &&
      sortedEvents[eventIndex]!.event.timestamp <= messageTime
    ) {
      timeline.push({ kind: 'system', data: sortedEvents[eventIndex]!.event })
      eventIndex += 1
    }

    previousTime = messageTime
  }

  while (eventIndex < sortedEvents.length) {
    timeline.push({ kind: 'system', data: sortedEvents[eventIndex]!.event })
    eventIndex += 1
  }

  return timeline
}
