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

export type ServerDesktopLayoutItem =
  | ServerDesktopLayoutWorkspaceItem
  | ServerDesktopLayoutBuiltinAppItem
  | ServerDesktopLayoutServerAppItem

export interface ServerDesktopStickyNoteWidget {
  id: string
  kind: 'sticky-note'
  x: number
  y: number
  widthCells: number
  heightCells: number
  content: string
  updatedAt?: string
}

export type ServerDesktopVideoWidgetProvider = 'bilibili' | 'youtube'

export interface ServerDesktopVideoWidget {
  id: string
  kind: 'video-player'
  provider: ServerDesktopVideoWidgetProvider
  x: number
  y: number
  widthCells: number
  heightCells: number
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
  widthCells: number
  heightCells: number
  title?: string
  workspaceFileName?: string | null
  updatedAt?: string
}

export type ServerDesktopWidget =
  | ServerDesktopStickyNoteWidget
  | ServerDesktopVideoWidget
  | ServerDesktopWebEmbedWidget

export interface ServerDesktopLayout {
  version: 1
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
