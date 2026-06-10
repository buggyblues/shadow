import { sql } from 'drizzle-orm'
import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { channels } from './channels'
import { threads } from './threads'
import { users } from './users'

export interface MessageCollaborationMetadata {
  /** Collaboration claim ID for bounded Buddy-to-Buddy reply chains. */
  id: string
  /** ID of the human/root message that started the chain. */
  rootMessageId: string
  /** ID of the Buddy that claimed this turn. */
  buddyId: string
  /** Monotonic turn number within the collaboration. */
  turn: number
  /** Platform-selected delivery target for this turn. */
  target?: 'main' | 'thread'
  /** Thread used when the platform routes this turn outside the main channel. */
  threadId?: string
  /** Soft text budget hint for IM-friendly collaboration replies. */
  suggestedTextLimit?: number
  /** Soft output density requested by the platform for this turn. */
  replyDensity?: 'reaction' | 'short' | 'normal' | 'long'
}

export interface MessageMentionMetadata {
  kind: 'user' | 'buddy' | 'app' | 'channel' | 'server' | 'here' | 'everyone'
  targetId: string
  token: string
  label: string
  range?: { start: number; end: number }
  serverId?: string
  serverSlug?: string | null
  serverName?: string | null
  channelId?: string
  channelName?: string | null
  appId?: string
  appKey?: string
  appName?: string | null
  iconUrl?: string | null
  userId?: string
  username?: string | null
  displayName?: string | null
  avatarUrl?: string | null
  isBot?: boolean
  isPrivate?: boolean
}

export type MessageCardStatus =
  | 'queued'
  | 'claimed'
  | 'running'
  | 'completed'
  | 'failed'
  | 'canceled'
  | 'transferred'

export interface MessageCardSourceMetadata {
  kind: 'user' | 'pat' | 'oauth' | 'agent' | 'system' | 'server_app' | 'buddy'
  id?: string
  label?: string
  userId?: string
  agentId?: string
  appId?: string
  appKey?: string
  appName?: string | null
  iconUrl?: string | null
  serverId?: string
  channelId?: string
  command?: string
  resource?: {
    kind: string
    id: string
    label?: string
    url?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export type TaskMessageCardTagMetadata =
  | string
  | {
      id?: string
      label: string
      color?: string
      [key: string]: unknown
    }

export interface MessageCardAppMetadata {
  id?: string
  appId?: string
  appKey?: string
  name?: string | null
  label?: string | null
  iconUrl?: string | null
  logoUrl?: string | null
  avatarUrl?: string | null
  imageUrl?: string | null
  url?: string | null
  [key: string]: unknown
}

export interface TaskMessageCardReplyMetadata {
  id?: string
  messageId?: string
  cardId?: string
  authorId?: string
  authorLabel?: string
  authorAvatarUrl?: string | null
  content: string
  createdAt: string
  source?: MessageCardSourceMetadata
  [key: string]: unknown
}

export interface MessageCardClaimMetadata {
  id: string
  actor: MessageCardSourceMetadata
  claimedAt: string
  expiresAt: string
}

export interface MessageCardCapabilityMetadata {
  kind: 'task'
  scope: string[]
  issuedAt: string
  expiresAt: string
  claimId?: string
  binding?: {
    messageId?: string
    cardId: string
    workspaceId?: string
  }
}

export interface TaskMessageRequirementSkillMetadata {
  kind: 'runtime-skill'
  package: string
  version?: string
  required?: boolean
  [key: string]: unknown
}

export interface TaskMessageRequirementToolMetadata {
  kind: string
  name: string
  required?: boolean
  [key: string]: unknown
}

export interface TaskMessageRequirementsMetadata {
  capabilities?: string[]
  skills?: TaskMessageRequirementSkillMetadata[]
  tools?: TaskMessageRequirementToolMetadata[]
  [key: string]: unknown
}

export interface TaskMessageExpectedArtifactMetadata {
  kind: string
  mimeTypes?: string[]
  maxBytes?: number
  required?: boolean
  [key: string]: unknown
}

export interface TaskMessageOutputContractMetadata {
  expectedArtifacts?: TaskMessageExpectedArtifactMetadata[]
  submitCommand?: {
    appKey: string
    command: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export type TaskMessagePrivacyDataClassMetadata =
  | 'public'
  | 'server-private'
  | 'channel-private'
  | 'financial'
  | 'secret'
  | 'cloud-secret'

export interface TaskMessagePrivacyMetadata {
  dataClass: TaskMessagePrivacyDataClassMetadata
  redactionRequired?: boolean
  [key: string]: unknown
}

export interface TaskMessageCardMetadata {
  id: string
  kind: 'task'
  version: number
  title: string
  body?: string
  status: MessageCardStatus
  priority?: 'low' | 'normal' | 'medium' | 'high'
  tags?: TaskMessageCardTagMetadata[]
  app?: MessageCardAppMetadata
  assignee?: {
    agentId?: string
    userId?: string
    label?: string
  }
  source?: MessageCardSourceMetadata
  requirements?: TaskMessageRequirementsMetadata
  outputContract?: TaskMessageOutputContractMetadata
  privacy?: TaskMessagePrivacyMetadata
  claim?: MessageCardClaimMetadata
  capability?: MessageCardCapabilityMetadata
  progress?: Array<{
    at: string
    status: MessageCardStatus
    note?: string
    actor?: MessageCardSourceMetadata
  }>
  replies?: TaskMessageCardReplyMetadata[]
  createdAt: string
  updatedAt?: string
  data?: Record<string, unknown> & {
    task?: {
      workspaceId?: string
      [key: string]: unknown
    }
  }
}

export type MessageCardMetadata =
  | TaskMessageCardMetadata
  | ({
      id?: string
      kind: string
      version?: number
      title?: string
      data?: Record<string, unknown>
    } & Record<string, unknown>)

/**
 * Message metadata structure.
 * Can contain various metadata like agent chain info, custom data, etc.
 */
export interface MessageMetadata {
  /** Bounded collaboration metadata for Buddy-to-Buddy conversations. */
  collaboration?: MessageCollaborationMetadata
  /** Structured user/channel/server mentions resolved and permission-checked at send time. */
  mentions?: MessageMentionMetadata[]
  /** Unified extensible message cards. New card-like surfaces should use this field. */
  cards?: MessageCardMetadata[]
  /**
   * @deprecated Compatibility-only commerce card array.
   * New card-like protocols must use `cards`; do not use this field for new product decisions.
   */
  commerceCards?: Array<Record<string, unknown>>
  /** Custom metadata extensions */
  [key: string]: unknown
}

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    content: text('content').notNull(),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    threadId: uuid('thread_id').references(() => threads.id, { onDelete: 'set null' }),
    replyToId: uuid('reply_to_id'),
    isEdited: boolean('is_edited').default(false).notNull(),
    isPinned: boolean('is_pinned').default(false).notNull(),
    /** Metadata for agent chains, custom data, etc. */
    metadata: jsonb('metadata').$type<MessageMetadata>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    messagesChannelIdIdx: index('messages_channel_id_idx').on(t.channelId),
    messagesThreadIdIdx: index('messages_thread_id_idx').on(t.threadId),
    messagesCreatedAtIdx: index('messages_created_at_idx').on(t.createdAt),
    messagesChannelRootCreatedAtDescIdx: index('messages_channel_root_created_at_desc_idx')
      .on(t.channelId, t.createdAt.desc())
      .where(sql`${t.threadId} IS NULL`),
    messagesThreadCreatedAtDescIdx: index('messages_thread_created_at_desc_idx')
      .on(t.threadId, t.createdAt.desc())
      .where(sql`${t.threadId} IS NOT NULL`),
  }),
)
