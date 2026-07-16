import type { ShadowWidgetCatalogEntry } from '@shadowob/shared'
import type { PreviewAttachment } from '../../components/file-preview/universal-file-preview-panel'
import type { WorkspaceNode } from '../../stores/workspace.store'
import type { SettingsModalTab } from '../settings/settings-modal'

export interface ServerEntry {
  server: {
    id: string
    name: string
    description: string | null
    slug: string | null
    iconUrl: string | null
    bannerUrl: string | null
    wallpaperType?: 'image' | 'html' | null
    wallpaperUrl?: string | null
    wallpaperWorkspaceFileId?: string | null
    wallpaperInteractive?: boolean
    wallpaperUpdatedAt?: string | null
    desktopLayout?: OsDesktopLayout | null
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
  isPrivate?: boolean | null
  isArchived?: boolean | null
}

export interface SpaceAppInstallation {
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

export interface OsServerMember {
  id: string
  userId: string
  serverId: string
  role: 'owner' | 'admin' | 'member' | string
  nickname: string | null
  user?: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
    status?: string | null
    isBot?: boolean
  } | null
}

export type OsBuiltinAppKey =
  | 'workspace'
  | 'app-store'
  | 'shop'
  | 'settings'
  | 'profile'
  | 'server-settings'
  | 'cloud-computers'
  | 'shadow-cloud'
  | 'discover'
  | 'my-buddies'
  | 'contacts'
  | 'tasks'
  | 'wallet'

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
      appPath?: string | null
    }
  | {
      action: 'open-inbox'
      serverId: string
      serverSlug?: string | null
      agentId?: string
      channelId?: string
    }
  | {
      action: 'open-direct-message'
      serverId: string
      serverSlug?: string | null
      channelId: string
      peerUserId?: string
      title?: string
      iconUrl?: string | null
    }
  | {
      action: 'open-buddy-settings'
      serverId: string
      serverSlug?: string | null
      agentId: string
    }

export type OsWindowKind =
  | 'channel'
  | 'inbox'
  | 'app'
  | 'builtin'
  | 'workspace-file'
  | 'chat-file'
  | 'voice-screen'

export interface OsWindowState {
  id: string
  kind: OsWindowKind
  title: string
  subtitle: string
  channelId?: string
  appKey?: string
  builtinKey?: OsBuiltinAppKey
  buddySection?: 'messages' | 'buddies' | 'market'
  buddyDirectChannelId?: string | null
  buddyAgentId?: string | null
  workspaceNode?: WorkspaceNode
  attachment?: PreviewAttachment
  profileUserId?: string
  settingsTab?: SettingsModalTab
  cloudComputerId?: string
  iconUrl?: string | null
  appPath?: string | null
  x: number
  y: number
  width: number
  height: number
  z: number
  minimized: boolean
  maximized: boolean
}

export interface OsDesktopWorkspaceItem {
  id: string
  kind: 'workspace-node'
  node: WorkspaceNode
  x: number
  y: number
  source?: 'workspace-root' | 'pinned'
  hidden?: boolean
}

export interface OsDesktopBuiltinAppItem {
  id: string
  kind: 'builtin-app'
  builtinKey: OsBuiltinAppKey
  title: string
  x: number
  y: number
  hidden?: boolean
}

export interface OsDesktopSpaceAppItem {
  id: string
  kind: 'space-app'
  appKey: string
  appId?: string
  title: string
  iconUrl?: string | null
  x: number
  y: number
  hidden?: boolean
}

export interface OsDesktopChannelItem {
  id: string
  kind: 'channel'
  channel: ChannelMeta
  x: number
  y: number
  hidden?: boolean
}

export interface OsDesktopBuddyInboxItem {
  id: string
  kind: 'buddy-inbox'
  inbox: BuddyInboxEntry
  x: number
  y: number
  hidden?: boolean
}

export type OsDesktopItem =
  | OsDesktopWorkspaceItem
  | OsDesktopBuiltinAppItem
  | OsDesktopSpaceAppItem
  | OsDesktopChannelItem
  | OsDesktopBuddyInboxItem

export type OsDesktopFile = OsDesktopWorkspaceItem

export interface OsDesktopLayoutWorkspaceItem {
  id: string
  kind: 'workspace-node'
  workspaceNodeId: string
  x: number
  y: number
  source?: 'workspace-root' | 'pinned'
  hidden?: boolean
}

export interface OsDesktopLayoutBuiltinAppItem {
  id: string
  kind: 'builtin-app'
  builtinKey: OsBuiltinAppKey
  title: string
  x: number
  y: number
  hidden?: boolean
}

export interface OsDesktopLayoutSpaceAppItem {
  id: string
  kind: 'space-app'
  appKey: string
  appId?: string
  title: string
  iconUrl?: string | null
  x: number
  y: number
  hidden?: boolean
}

export interface OsDesktopLayoutBuddyInboxItem {
  id: string
  kind: 'buddy-inbox'
  agentId: string
  channelId?: string | null
  title?: string
  x: number
  y: number
  hidden?: boolean
}

export interface OsDesktopLayoutChannelItem {
  id: string
  kind: 'channel'
  channelId: string
  title?: string
  channelType?: string | null
  x: number
  y: number
  hidden?: boolean
}

export type OsDesktopLayoutItem =
  | OsDesktopLayoutWorkspaceItem
  | OsDesktopLayoutBuiltinAppItem
  | OsDesktopLayoutSpaceAppItem
  | OsDesktopLayoutChannelItem
  | OsDesktopLayoutBuddyInboxItem

export interface OsDesktopStickyNoteWidget {
  id: string
  kind: 'sticky-note'
  x: number
  y: number
  zIndex?: number
  widthCells: number
  heightCells: number
  rotation?: number
  content: string
  updatedAt?: string
}

export type OsChatInputWidgetMode = 'chat' | 'tasks'

export interface OsDesktopChatInputWidget {
  id: string
  kind: 'chat-input'
  x: number
  y: number
  zIndex?: number
  widthCells: number
  heightCells: number
  rotation?: number
  defaultAgentId?: string | null
  inboxViewMode: OsChatInputWidgetMode
  placeholder?: string
  completionItems?: string[]
  updatedAt?: string
}

export type OsTypewriterWidgetFontFamily = 'system' | 'serif' | 'mono' | 'handwriting'
export type OsTypewriterWidgetTextShadow = 'none' | 'soft' | 'glow' | 'strong'

export interface OsDesktopTypewriterWidget {
  id: string
  kind: 'typewriter'
  x: number
  y: number
  zIndex?: number
  widthCells: number
  heightCells: number
  rotation?: number
  content: string
  speedMs: number
  pauseMs: number
  loop: boolean
  cursor: boolean
  fontFamily: OsTypewriterWidgetFontFamily
  fontSize: number
  color: string
  textShadow: OsTypewriterWidgetTextShadow
  textStrokeWidth: number
  textStrokeColor: string
  updatedAt?: string
}

export type OsPhotoWidgetSourceType = 'url' | 'workspace-file'

export interface OsDesktopPhotoWidget {
  id: string
  kind: 'photo'
  sourceType: OsPhotoWidgetSourceType
  source: string
  x: number
  y: number
  zIndex?: number
  widthCells: number
  aspectRatio: number
  rotation: number
  title?: string
  workspaceFileName?: string | null
  updatedAt?: string
}

export type OsVideoWidgetProvider = 'bilibili' | 'youtube'

export interface OsDesktopVideoWidget {
  id: string
  kind: 'video-player'
  provider: OsVideoWidgetProvider
  x: number
  y: number
  zIndex?: number
  widthCells: number
  heightCells: number
  rotation?: number
  source: string
  title?: string
  coverUrl?: string | null
  autoplay?: boolean
  muted?: boolean
  danmaku?: boolean
  showCover?: boolean
  updatedAt?: string
}

export type OsWebEmbedWidgetSourceType = 'url' | 'workspace-file'

export interface OsDesktopWebEmbedWidget {
  id: string
  kind: 'web-embed'
  sourceType: OsWebEmbedWidgetSourceType
  source: string
  x: number
  y: number
  zIndex?: number
  widthCells: number
  heightCells: number
  rotation?: number
  title?: string
  workspaceFileName?: string | null
  updatedAt?: string
}

export interface OsDesktopRemoteWidget {
  id: string
  kind: 'remote-widget'
  sourceId: string
  options?: Record<string, string>
  x: number
  y: number
  zIndex?: number
  widthCells: number
  heightCells: number
  rotation?: number
  updatedAt?: string
}

export type OsRemoteWidgetCatalogEntry = ShadowWidgetCatalogEntry

export type OsDesktopWidget =
  | OsDesktopStickyNoteWidget
  | OsDesktopChatInputWidget
  | OsDesktopTypewriterWidget
  | OsDesktopPhotoWidget
  | OsDesktopVideoWidget
  | OsDesktopWebEmbedWidget
  | OsDesktopRemoteWidget

export interface OsStickyNoteMentionContext {
  workspaceNodes: WorkspaceNode[]
  apps: SpaceAppInstallation[]
  channels: ChannelMeta[]
  members: OsServerMember[]
}

export type OsStickyNoteMentionTarget =
  | {
      kind: 'workspace-node'
      id: string
      label: string
      node: WorkspaceNode
    }
  | {
      kind: 'space-app'
      id: string
      label: string
      app: SpaceAppInstallation
    }
  | {
      kind: 'channel'
      id: string
      label: string
      channel: ChannelMeta
    }
  | {
      kind: 'member'
      id: string
      label: string
      member: OsServerMember
    }

export interface OsDesktopLayout {
  version: 1 | 2
  items: OsDesktopLayoutItem[]
  widgets: OsDesktopWidget[]
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
