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
  author?: {
    id: string
    username: string
    displayName: string
    avatarUrl: string | null
    isBot: boolean
  }
  attachments?: Attachment[]
  reactions?: ReactionGroup[]
}

export interface Attachment {
  id: string
  messageId: string
  filename: string
  url: string
  contentType: string
  size: number
  width: number | null
  height: number | null
  createdAt: string
}

export interface ReactionGroup {
  emoji: string
  count: number
  userIds: string[]
}

export interface Thread {
  id: string
  name: string
  channelId: string
  parentMessageId: string
  creatorId: string
  isArchived: boolean
  createdAt: string
  updatedAt: string
}

export interface SendMessageRequest {
  content: string
  threadId?: string
  replyToId?: string
}

export interface UpdateMessageRequest {
  content: string
}

export type NotificationType = 'mention' | 'reply' | 'dm' | 'system'

export interface Notification {
  id: string
  userId: string
  type: NotificationType
  title: string
  body: string | null
  referenceId: string | null
  referenceType: string | null
  isRead: boolean
  createdAt: string
}

export interface DmChannel {
  id: string
  userAId: string
  userBId: string
  lastMessageAt: string | null
  createdAt: string
  otherUser?: {
    id: string
    username: string
    displayName: string
    avatarUrl: string | null
    status: string
  }
}

/** DM message — mirrors channel Message but scoped to DM channels */
export interface DmMessage {
  id: string
  content: string
  dmChannelId: string
  authorId: string
  replyToId: string | null
  isEdited: boolean
  metadata?: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
  author?: {
    id: string
    username: string
    displayName: string
    avatarUrl: string | null
    isBot: boolean
  }
  attachments?: DmAttachment[]
  reactions?: ReactionGroup[]
}

export interface DmAttachment {
  id: string
  dmMessageId: string
  filename: string
  url: string
  contentType: string
  size: number
  width: number | null
  height: number | null
  createdAt: string
}

export interface UpdateDmMessageRequest {
  content: string
}
