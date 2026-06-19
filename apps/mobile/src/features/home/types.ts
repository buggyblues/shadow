import type { Channel } from '@shadowob/shared'
import type { LucideIcon } from 'lucide-react-native'
import type { ServerAppMobileConfig } from '../../lib/server-app-mobile'

export interface ServerEntry {
  server: {
    id: string
    name: string
    slug: string | null
    iconUrl: string | null
    bannerUrl?: string | null
    description?: string | null
    isPublic?: boolean
    memberCount?: number
    channelCount?: number
  }
  member: {
    role: string
  }
}

export interface UnifiedChannel extends Channel {
  categoryId?: string | null
  isPrivate?: boolean
  isArchived?: boolean
  lastMessagePreview?: {
    id: string
    content: string
    createdAt: string
    attachmentCount?: number
    attachmentPreviews?: UnifiedChannelAttachmentPreview[]
    author?: {
      id: string
      username: string
      displayName: string | null
    } | null
  } | null
  memberPreviews?: UnifiedChannelMemberPreview[]
}

export interface UnifiedChannelAttachmentPreview {
  id: string
  filename: string
  contentType: string
  kind?: 'file' | 'image' | 'voice'
}

export interface UnifiedChannelMemberPreview {
  id: string
  username: string
  displayName?: string | null
  avatarUrl?: string | null
  status?: string | null
  lastSpokeAt?: string | null
}

export type ServerDetail = ServerEntry['server'] & {
  ownerId?: string
}

export interface ServerAppIntegration {
  id: string
  appKey: string
  name: string
  description?: string | null
  iconUrl?: string | null
  iframeEntry?: string | null
}

export interface LaunchContext {
  iframeEntry: string | null
  launchToken: string
  eventStreamPath: string
  mobile?: ServerAppMobileConfig | null
}

export interface BuddyInboxEntry {
  agent: {
    id: string
    ownerId: string
    status?: string | null
    lastHeartbeat?: string | null
    user: {
      id: string
      username: string
      displayName: string | null
      avatarUrl: string | null
      status?: string | null
    }
  }
  channel: UnifiedChannel | null
  canManage: boolean
}

export interface DirectChannelEntry {
  id: string
  lastMessageAt: string | null
  createdAt: string
  otherUser: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
    status: string
    isBot: boolean
  } | null
}

export interface UnifiedServerMember {
  userId?: string
  nickname?: string | null
  role: string
  totalOnlineSeconds?: number | null
  agent?: {
    ownerId?: string | null
    status?: string | null
    lastHeartbeat?: string | null
    totalOnlineSeconds?: number | null
    config?: Record<string, unknown> | null
  } | null
  creator?: {
    uid: string
    nickname?: string | null
    username?: string | null
    avatarUrl?: string | null
  } | null
  user: {
    id: string
    username: string
    displayName?: string | null
    avatarUrl?: string | null
    status?: string | null
    isBot?: boolean
  }
}

export interface UnifiedWorkspaceNode {
  id: string
  kind: 'dir' | 'file'
  name: string
  ext?: string | null
  mime?: string | null
  mimeType?: string | null
  sizeBytes?: number | null
  contentRef?: string | null
  previewUrl?: string | null
  url?: string | null
  path?: string | null
  type?: 'file' | 'folder'
  size?: number | null
  pos?: number | null
}

export type CommandCandidate =
  | {
      id: string
      kind: 'server'
      label: string
      meta: string
      server: ServerEntry
    }
  | {
      id: string
      kind: 'channel'
      label: string
      meta: string
      channel: Channel
      server: ServerEntry
    }
  | {
      id: string
      kind: 'app'
      label: string
      meta: string
      app: ServerAppIntegration
    }
  | {
      id: string
      kind: 'inbox'
      label: string
      meta: string
      inbox: BuddyInboxEntry
      server: ServerEntry
    }
  | {
      id: string
      kind: 'utility'
      label: string
      meta: string
      utility: 'workspace' | 'shop'
      icon: LucideIcon
    }
  | {
      id: string
      kind: 'workspaceNode'
      label: string
      meta: string
      node: UnifiedWorkspaceNode
    }

export interface ScopedUnread {
  channelUnread?: Record<string, number>
  serverUnread?: Record<string, number>
}

export interface GlobalSearchServerData {
  server: ServerEntry
  channels: UnifiedChannel[]
  inboxes: BuddyInboxEntry[]
}

export interface InboxOpenRequest {
  server: ServerEntry
  entry: BuddyInboxEntry
}

export type CreateMenuAnchor = {
  x: number
  y: number
  width: number
  height: number
}
