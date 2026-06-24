import type { PreviewAttachment } from '../../components/file-preview/universal-file-preview-panel'
import type { WorkspaceNode } from '../../stores/workspace.store'

export interface ServerEntry {
  server: {
    id: string
    name: string
    description: string | null
    slug: string | null
    iconUrl: string | null
    bannerUrl: string | null
    inviteCode?: string
    ownerId?: string
    isPublic?: boolean
  }
  member: { role: string }
}

export interface ChannelMeta {
  id: string
  name: string
  type?: 'text' | 'voice' | 'announcement' | string
  topic?: string | null
  position?: number | null
  isArchived?: boolean | null
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
  iframeEntry?: string | null
  launchToken: string
  eventStreamPath?: string | null
  expiresIn?: number
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
  channel: ChannelMeta | null
  canManage: boolean
}

export type OsBuiltinAppKey =
  | 'workspace'
  | 'app-store'
  | 'shop'
  | 'settings'
  | 'profile'
  | 'server-settings'
  | 'shadow-cloud'
  | 'discover'
  | 'my-buddies'

export type OsCommandDetail =
  | { action: 'open-server'; serverId: string; serverSlug?: string | null }
  | {
      action: 'open-channel'
      serverId: string
      serverSlug?: string | null
      channelId: string
    }
  | {
      action: 'open-builtin'
      serverId: string
      serverSlug?: string | null
      builtinKey: OsBuiltinAppKey
    }
  | {
      action: 'open-app'
      serverId: string
      serverSlug?: string | null
      appKey: string
    }
  | {
      action: 'open-inbox'
      serverId: string
      serverSlug?: string | null
      agentId?: string
      channelId?: string
    }

export type OsWindowKind = 'channel' | 'inbox' | 'app' | 'builtin' | 'workspace-file' | 'chat-file'

export interface OsWindowState {
  id: string
  kind: OsWindowKind
  title: string
  subtitle: string
  channelId?: string
  appKey?: string
  builtinKey?: OsBuiltinAppKey
  workspaceNode?: WorkspaceNode
  attachment?: PreviewAttachment
  profileUserId?: string
  iconUrl?: string | null
  x: number
  y: number
  width: number
  height: number
  z: number
  minimized: boolean
  maximized: boolean
}

export interface OsDesktopFile {
  id: string
  node: WorkspaceNode
  x: number
  y: number
  source?: 'workspace-root' | 'pinned'
}

export interface OsChannelTab {
  id: string
  channelId: string
  title: string
  type?: ChannelMeta['type']
  topic?: string | null
  active: boolean
}

export interface ScopedUnread {
  channelUnread?: Record<string, number>
  serverUnread?: Record<string, number>
}
