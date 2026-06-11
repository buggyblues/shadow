import { interactiveResponseEqual } from './interactive-equality'
import { attachmentsEqual, reactionsEqual } from './pure'
import type { MessageBubbleProps } from './types'

export function areMessageBubblePropsEqual(prev: MessageBubbleProps, next: MessageBubbleProps) {
  if (prev.message.id !== next.message.id) return false
  if (prev.message.content !== next.message.content) return false
  if (prev.message.isEdited !== next.message.isEdited) return false
  if (prev.message.sendStatus !== next.message.sendStatus) return false
  if (prev.message.updatedAt !== next.message.updatedAt) return false
  if (prev.currentUserId !== next.currentUserId) return false
  if (prev.serverId !== next.serverId) return false
  if (prev.highlight !== next.highlight) return false
  if (prev.hasThread !== next.hasThread) return false
  if (prev.thread?.id !== next.thread?.id) return false
  if (prev.thread?.name !== next.thread?.name) return false
  if (prev.isGrouped !== next.isGrouped) return false
  if (prev.selectionMode !== next.selectionMode) return false
  if (prev.isSelected !== next.isSelected) return false
  if (prev.selectionAnchorId !== next.selectionAnchorId) return false
  if (prev.enableSlashCommandActions !== next.enableSlashCommandActions) return false
  if (
    !interactiveResponseEqual(prev.submittedInteractiveResponse, next.submittedInteractiveResponse)
  ) {
    return false
  }

  if (!reactionsEqual(prev.message.reactions, next.message.reactions, true)) return false
  if (prev.replyToMessage?.id !== next.replyToMessage?.id) return false
  if (prev.replyToMessage?.content !== next.replyToMessage?.content) return false

  return attachmentsEqual(prev.message.attachments, next.message.attachments)
}
