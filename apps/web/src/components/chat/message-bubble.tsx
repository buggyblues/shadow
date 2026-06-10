/**
 * Public entry point for chat message bubbles.
 *
 * Keep this file intentionally thin: chat surfaces import the stable public
 * path here, while the implementation is split by responsibility under
 * ./message-bubble/.
 */
export { MessageBubble } from './message-bubble/message-bubble'

export type {
  Attachment,
  Author,
  InteractiveBlock,
  InteractiveButtonItem,
  InteractiveFormField,
  InteractiveResponseMetadata,
  InteractiveSelectItem,
  InteractiveStateMetadata,
  Message,
  MessageBubbleProps,
  ReactionGroup,
  ThreadPreview,
} from './message-bubble/types'
