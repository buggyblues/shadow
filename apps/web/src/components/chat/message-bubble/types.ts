import type {
  CommerceProductCard,
  MessageCard,
  MessageMention,
  OAuthLinkCard,
  PaidFileCard,
} from '@shadowob/shared'
import type { OAuthLinkPreview } from '../oauth-link-card'

export interface Author {
  id: string
  username: string
  displayName: string
  avatarUrl: string | null
  isBot: boolean
}

export interface ReactionGroup {
  emoji: string
  count: number
  userIds: string[]
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
  workspaceNodeId?: string | null
  kind?: 'file' | 'image' | 'voice'
  durationMs?: number | null
  audioCodec?: string | null
  audioContainer?: string | null
  waveformPeaks?: number[] | null
  waveformVersion?: number | null
  transcript?: {
    id: string
    status: 'pending' | 'processing' | 'ready' | 'failed'
    text: string | null
    language: string | null
    source: 'client' | 'server' | 'runtime'
    provider?: string | null
    confidence?: number | null
    errorCode?: string | null
    updatedAt?: string
  } | null
  playback?: {
    played: boolean
    completed: boolean
    lastPositionMs: number
    playedCount?: number
  } | null
  paidFileId?: string
}

export interface Message {
  id: string
  content: string
  channelId?: string
  authorId: string
  threadId?: string | null
  replyToId: string | null
  isEdited: boolean
  isPinned?: boolean
  createdAt: string
  updatedAt?: string
  author?: Author
  reactions?: ReactionGroup[]
  attachments?: Attachment[]
  /** Optional metadata blob — includes interactive blocks (Phase 2). */
  metadata?: {
    mentions?: MessageMention[]
    interactive?: InteractiveBlock
    interactiveResponse?: InteractiveResponseMetadata
    interactiveState?: InteractiveStateMetadata
    cards?: MessageCard[]
    commerceCards?: CommerceProductCard[]
    paidFileCards?: PaidFileCard[]
    oauthLinkCards?: OAuthLinkCard[]
    [key: string]: unknown
  }
  /** Optimistic send status — only set on client-side pending messages */
  sendStatus?: 'sending' | 'failed'
}

export interface ThreadPreview {
  id: string
  name: string
  parentMessageId: string
  createdAt?: string
}

/** Phase 2 interactive block shape — mirrors server schema. */
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

export interface MessageBubbleProps {
  message: Message
  currentUserId: string
  serverId?: string
  onReply?: (messageId: string) => void
  onReact?: (messageId: string, emoji: string) => void
  onMessageUpdate?: (msg: Message) => void
  onMessageDelete?: (msgId: string) => void
  onOpenThread?: (messageId: string) => void
  onPreviewFile?: (attachment: Attachment) => void
  onPreviewOAuthLink?: (preview: OAuthLinkPreview) => void
  onSaveToWorkspace?: (attachment: Attachment) => void
  /** Custom edit API — defaults to PATCH /api/messages/:id */
  editApi?: (messageId: string, content: string) => Promise<Message>
  /** Custom delete API — defaults to DELETE /api/messages/:id */
  deleteApi?: (messageId: string) => Promise<void>
  highlight?: boolean
  replyToMessage?: Message | null
  hasThread?: boolean
  thread?: ThreadPreview | null
  /** Multi-select mode */
  selectionMode?: boolean
  isSelected?: boolean
  selectionAnchorId?: string | null
  submittedInteractiveResponse?: InteractiveResponseMetadata | null
  onToggleSelect?: (messageId: string) => void
  onEnterSelectionMode?: (messageId: string) => void
  onSelectRangeTo?: (messageId: string) => void
  /** When true, this message is grouped with the previous message (same author, within 1 min) — hide avatar & name */
  isGrouped?: boolean
}

export interface MessagesPage {
  messages: Message[]
  hasMore: boolean
}

export interface MemberUser {
  id: string
  username: string
  displayName: string
  avatarUrl: string | null
  status: string
  isBot: boolean
}

export interface MemberEntry {
  id: string
  userId: string
  role: string
  user?: MemberUser
}

export interface BuddyAgentEntry {
  id: string
  ownerId: string
  config?: Record<string, unknown>
  owner?: {
    id: string
    username: string
    displayName: string | null
  } | null
  botUser?: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
  } | null
}

export interface LegacyChannelEntry {
  id: string
  name?: string | null
  isPrivate?: boolean
}

export interface LegacyServerEntry {
  id: string
  name?: string | null
  slug?: string | null
}
