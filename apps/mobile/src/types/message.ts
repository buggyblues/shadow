/**
 * Message types aligned with @shadowob/shared and the web implementation.
 * Canonical shapes used throughout the mobile app.
 */

export interface Author {
  id: string
  username: string
  displayName: string
  avatarUrl: string | null
  isBot?: boolean
}

export interface Attachment {
  id: string
  messageId?: string
  filename: string
  url: string
  contentType: string
  size: number
  width?: number | null
  height?: number | null
  createdAt?: string
  /** Legacy field — prefer contentType */
  mimeType?: string
  /** Legacy field — prefer size */
  sizeBytes?: number
}

export interface ReactionGroup {
  emoji: string
  count: number
  userIds: string[]
}

/** Phase 2 interactive block — mirrors web/server schema. */
export interface InteractiveButtonItem {
  id: string
  label: string
  style?: 'primary' | 'secondary' | 'destructive'
  value?: string
}
export interface InteractiveSelectItem {
  id: string
  label: string
  value: string
}
export interface InteractiveFormField {
  id: string
  kind: 'text' | 'textarea' | 'number' | 'checkbox' | 'select'
  label: string
  placeholder?: string
  defaultValue?: string
  required?: boolean
  options?: InteractiveSelectItem[]
  maxLength?: number
  min?: number
  max?: number
}
export interface InteractiveBlock {
  id: string
  kind: 'buttons' | 'select' | 'form' | 'approval'
  prompt?: string
  buttons?: InteractiveButtonItem[]
  options?: InteractiveSelectItem[]
  fields?: InteractiveFormField[]
  submitLabel?: string
  responsePrompt?: string
  approvalCommentLabel?: string
  oneShot?: boolean
}
export interface InteractiveResponseMetadata {
  blockId: string
  sourceMessageId: string
  actionId: string
  value: string
  values?: Record<string, string>
  submissionId?: string
  responseMessageId?: string | null
  submittedAt?: string
}
export interface InteractiveStateMetadata {
  sourceMessageId: string
  blockId: string
  submitted: boolean
  response?: InteractiveResponseMetadata
}

export interface MessageMetadata {
  interactive?: InteractiveBlock
  interactiveResponse?: InteractiveResponseMetadata
  interactiveState?: InteractiveStateMetadata
  [key: string]: unknown
}

export interface Message {
  id: string
  content: string
  channelId: string
  authorId: string
  threadId: string | null
  replyToId: string | null
  isEdited: boolean
  isPinned: boolean
  createdAt: string
  updatedAt: string
  author?: Author
  attachments?: Attachment[]
  reactions?: ReactionGroup[]
  /** Optional metadata blob — includes interactive blocks (Phase 2). */
  metadata?: MessageMetadata
  /** Optimistic send status — only set on client-side pending messages */
  sendStatus?: 'sending' | 'failed'
}

export interface MessagesPage {
  messages: Message[]
  hasMore: boolean
}

export interface Channel {
  id: string
  name: string
  type: string
  topic?: string | null
  serverId: string
  position?: number
  isPrivate?: boolean
}

export interface MemberEvent {
  serverId: string
  channelId?: string
  userId: string
  username: string
  displayName: string
  avatarUrl: string | null
  isBot: boolean
}

export interface SystemEvent {
  id: string
  type: 'joined' | 'left'
  scope: 'server' | 'channel'
  displayName: string
  isBot: boolean
  timestamp: number
}

export type TimelineItem =
  | { kind: 'message'; data: Message }
  | { kind: 'system'; data: SystemEvent }
  | { kind: 'divider'; data: { id: string; timestamp: number } }
  | { kind: 'date'; data: { id: string; date: string } }

/** Normalize attachment field differences from API */
export function normalizeAttachment(raw: Record<string, unknown>): Attachment {
  return {
    id: (raw.id as string) ?? '',
    messageId: raw.messageId as string | undefined,
    filename: (raw.filename as string) ?? 'file',
    url: (raw.url as string) ?? '',
    contentType:
      (raw.contentType as string) ?? (raw.mimeType as string) ?? 'application/octet-stream',
    size: (raw.size as number) ?? (raw.sizeBytes as number) ?? 0,
    width: (raw.width as number | null) ?? null,
    height: (raw.height as number | null) ?? null,
    createdAt: raw.createdAt as string | undefined,
  }
}

/** Normalize a raw message from API to the canonical shape */
export function normalizeMessage(raw: Record<string, unknown>): Message {
  const attachments = Array.isArray(raw.attachments)
    ? (raw.attachments as Record<string, unknown>[]).map(normalizeAttachment)
    : undefined

  const rawReactions = raw.reactions as
    | Array<{ emoji: string; count: number; userIds?: string[]; reacted?: boolean }>
    | undefined

  const reactions = rawReactions?.map((r) => ({
    emoji: r.emoji,
    count: r.count,
    userIds: r.userIds ?? (r.reacted ? [raw.authorId as string] : []),
  }))

  return {
    id: raw.id as string,
    content: (raw.content as string) ?? '',
    channelId: raw.channelId as string,
    authorId: raw.authorId as string,
    threadId: (raw.threadId as string | null) ?? null,
    replyToId: (raw.replyToId as string | null) ?? (raw.parentId as string | null) ?? null,
    isEdited: (raw.isEdited as boolean) ?? raw.updatedAt !== raw.createdAt,
    isPinned: (raw.isPinned as boolean) ?? false,
    createdAt: raw.createdAt as string,
    updatedAt: (raw.updatedAt as string) ?? (raw.createdAt as string),
    author: raw.author as Author | undefined,
    attachments,
    reactions,
    metadata: (raw.metadata as MessageMetadata | undefined) ?? undefined,
  }
}
