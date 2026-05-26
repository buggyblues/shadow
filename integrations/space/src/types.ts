export interface SpacePerson {
  kind: string
  id: string
  userId?: string | null
  buddyAgentId?: string | null
  ownerId?: string | null
  displayName: string
  avatarUrl?: string | null
}

export interface SpaceProfile {
  displayName: string
  handle: string
  headline: string
  bio: string
  location?: string
  website?: string
  coverUrl?: string
  coverFile?: SpaceStoredFile
  tags: string[]
  customCss: string
}

export type SpaceVisibility = 'public' | 'private'
export type SpaceSourceKind = 'html' | 'zip'
export type SpaceCdnProvider = 'minio' | 'local'

export interface SpaceStoredFile {
  path: string
  key: string
  url: string
  contentType: string
  size: number
}

export interface SpaceArtworkVersion {
  id: string
  artworkId: string
  number: number
  title: string
  notes?: string
  sourceKind: SpaceSourceKind
  entryPath: string
  cdnProvider: SpaceCdnProvider
  cdnBaseUrl: string
  files: SpaceStoredFile[]
  createdAt: string
  createdBy: SpacePerson
  rolledBackFromVersionId?: string
}

export interface SpaceCommentRegion {
  id: number
  x: number
  y: number
  width: number
  height: number
  unit: 'px'
  normalized: {
    x: number
    y: number
    width: number
    height: number
  }
}

export interface SpaceCommentContext {
  kind: 'selection'
  selection?: SpaceCommentRegion
  selections: SpaceCommentRegion[]
  pageState: {
    artworkId: string
    versionId: string
    versionNumber: number
    versionTitle: string
    previewUrl: string
    frameMode: string
    frameSize: { width: number; height: number }
    viewportSize: { width: number; height: number }
    scroll: { x: number; y: number }
    devicePixelRatio: number
    capturedAt: string
  }
  screenshot?: {
    dataUrl?: string
    error?: string
    provider?: 'snapdom'
  }
}

export interface SpaceComment {
  id: string
  artworkId: string
  body: string
  author: SpacePerson
  context?: SpaceCommentContext
  createdAt: string
}

export interface SpaceArtwork {
  id: string
  owner: SpacePerson
  title: string
  description: string
  tags: string[]
  visibility: SpaceVisibility
  coverUrl?: string
  coverFile?: SpaceStoredFile
  currentVersionId: string
  versions: SpaceArtworkVersion[]
  comments: SpaceComment[]
  likedBy: string[]
  favoritedBy: string[]
  remixCount: number
  viewCount: number
  createdAt: string
  updatedAt: string
}

export interface SpaceFavorite {
  id: string
  artworkId: string
  createdAt: string
  owner: SpacePerson
}

export interface SpaceState {
  updatedAt: string
  profile: SpaceProfile
  artworks: SpaceArtwork[]
  favorites: SpaceFavorite[]
}

export interface SpaceUploadFile {
  field?: string
  filename: string
  contentType: string
  size: number
  dataBase64: string
}
