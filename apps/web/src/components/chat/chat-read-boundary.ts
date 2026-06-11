export interface ReadBoundaryMessage {
  authorId: string
}

export type ReadBoundaryTimelineItem<TMessage extends ReadBoundaryMessage> =
  | { kind: 'message'; data: TMessage }
  | { kind: 'system'; data: unknown }

export function shouldAdvanceReadBoundaryForTimelineAppend<TMessage extends ReadBoundaryMessage>({
  appendedItems,
  currentItemCount,
  currentUserId,
  previousItemCount,
  previousReadCount,
  shouldStickToBottom,
}: {
  appendedItems: ReadBoundaryTimelineItem<TMessage>[]
  currentItemCount: number
  currentUserId?: string | null
  previousItemCount: number
  previousReadCount: number
  shouldStickToBottom: boolean
}) {
  if (currentItemCount <= previousItemCount) return false
  if (shouldStickToBottom) return true
  if (!currentUserId) return false
  if (previousReadCount < previousItemCount) return false

  const appendedMessages = appendedItems.filter((item) => item.kind === 'message')
  return (
    appendedMessages.length > 0 &&
    appendedMessages.every((item) => item.data.authorId === currentUserId)
  )
}
