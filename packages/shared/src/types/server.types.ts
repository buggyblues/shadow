export type ServerWallpaperType = 'image' | 'html'

export interface ServerDesktopLayoutWorkspaceItem {
  id: string
  kind: 'workspace-node'
  workspaceNodeId: string
  x: number
  y: number
  source?: 'workspace-root' | 'pinned'
  hidden?: boolean
}

export interface ServerDesktopLayoutBuiltinAppItem {
  id: string
  kind: 'builtin-app'
  builtinKey: string
  title: string
  x: number
  y: number
  hidden?: boolean
}

export interface ServerDesktopLayoutServerAppItem {
  id: string
  kind: 'server-app'
  appKey: string
  appId?: string
  title: string
  iconUrl?: string | null
  x: number
  y: number
  hidden?: boolean
}

export interface ServerDesktopLayoutBuddyInboxItem {
  id: string
  kind: 'buddy-inbox'
  agentId: string
  channelId?: string | null
  title?: string
  x: number
  y: number
  hidden?: boolean
}

export type ServerDesktopLayoutItem =
  | ServerDesktopLayoutWorkspaceItem
  | ServerDesktopLayoutBuiltinAppItem
  | ServerDesktopLayoutServerAppItem
  | ServerDesktopLayoutBuddyInboxItem

export interface ServerDesktopStickyNoteWidget {
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

export type ServerDesktopChatInputWidgetMode = 'chat' | 'tasks'

export interface ServerDesktopChatInputWidget {
  id: string
  kind: 'chat-input'
  x: number
  y: number
  zIndex?: number
  widthCells: number
  heightCells: number
  rotation?: number
  defaultAgentId?: string | null
  inboxViewMode: ServerDesktopChatInputWidgetMode
  placeholder?: string
  completionItems?: string[]
  updatedAt?: string
}

export type ServerDesktopTypewriterWidgetFontFamily = 'system' | 'serif' | 'mono' | 'handwriting'
export type ServerDesktopTypewriterWidgetTextShadow = 'none' | 'soft' | 'glow' | 'strong'

export interface ServerDesktopTypewriterWidget {
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
  fontFamily: ServerDesktopTypewriterWidgetFontFamily
  fontSize: number
  color: string
  textShadow: ServerDesktopTypewriterWidgetTextShadow
  textStrokeWidth: number
  textStrokeColor: string
  updatedAt?: string
}

export type ServerDesktopPhotoWidgetSourceType = 'url' | 'workspace-file'

export interface ServerDesktopPhotoWidget {
  id: string
  kind: 'photo'
  sourceType: ServerDesktopPhotoWidgetSourceType
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

export type ServerDesktopVideoWidgetProvider = 'bilibili' | 'youtube'

export interface ServerDesktopVideoWidget {
  id: string
  kind: 'video-player'
  provider: ServerDesktopVideoWidgetProvider
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

export type ServerDesktopWebEmbedWidgetSourceType = 'url' | 'workspace-file'

export interface ServerDesktopWebEmbedWidget {
  id: string
  kind: 'web-embed'
  sourceType: ServerDesktopWebEmbedWidgetSourceType
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

export type ServerDesktopWidget =
  | ServerDesktopStickyNoteWidget
  | ServerDesktopChatInputWidget
  | ServerDesktopTypewriterWidget
  | ServerDesktopPhotoWidget
  | ServerDesktopVideoWidget
  | ServerDesktopWebEmbedWidget

export interface ServerDesktopLayout {
  version: 1 | 2
  items: ServerDesktopLayoutItem[]
  widgets: ServerDesktopWidget[]
}

export interface Server {
  id: string
  name: string
  iconUrl: string | null
  bannerUrl?: string | null
  description?: string | null
  slug?: string | null
  isPublic?: boolean
  wallpaperType?: ServerWallpaperType | null
  wallpaperUrl?: string | null
  wallpaperWorkspaceFileId?: string | null
  wallpaperInteractive?: boolean
  wallpaperUpdatedAt?: string | null
  desktopLayout?: ServerDesktopLayout | null
  ownerId: string
  inviteCode: string
  createdAt: string
  updatedAt: string
}

export interface CreateServerRequest {
  name: string
  iconUrl?: string
}

export interface UpdateServerRequest {
  name?: string
  description?: string | null
  slug?: string | null
  iconUrl?: string | null
  bannerUrl?: string | null
  isPublic?: boolean
  wallpaperType?: ServerWallpaperType | null
  wallpaperUrl?: null
  wallpaperWorkspaceFileId?: string | null
  wallpaperInteractive?: boolean
}

export type MemberRole = 'owner' | 'admin' | 'member'

export interface Member {
  id: string
  userId: string
  serverId: string
  role: MemberRole
  nickname: string | null
  joinedAt: string
  user?: {
    id: string
    username: string
    displayName: string
    avatarUrl: string | null
    status: string
    isBot: boolean
  }
}
