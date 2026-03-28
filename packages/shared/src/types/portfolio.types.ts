/**
 * Portfolio Types - Shared between frontend and backend
 */

export type PortfolioVisibility = 'public' | 'private' | 'unlisted'
export type PortfolioStatus = 'draft' | 'published' | 'archived'

export interface Portfolio {
  id: string
  ownerId: string
  attachmentId: string | null
  title: string | null
  description: string | null
  fileUrl: string
  fileName: string
  fileType: string
  fileSize: number
  fileWidth: number | null
  fileHeight: number | null
  thumbnailUrl: string | null
  visibility: PortfolioVisibility
  status: PortfolioStatus
  likeCount: number
  favoriteCount: number
  commentCount: number
  viewCount: number
  tags: string[]
  createdAt: string
  updatedAt: string
}

export interface PortfolioWithOwner extends Portfolio {
  owner: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
    isBot: boolean
  }
  isLiked?: boolean
  isFavorited?: boolean
}

export interface PortfolioLike {
  id: string
  portfolioId: string
  userId: string
  createdAt: string
}

export interface PortfolioFavorite {
  id: string
  portfolioId: string
  userId: string
  createdAt: string
}

export interface PortfolioComment {
  id: string
  portfolioId: string
  userId: string
  parentId: string | null
  content: string
  createdAt: string
  updatedAt: string
  isEdited: boolean
  author?: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
  }
  replies?: PortfolioComment[]
}

// API DTOs
export interface CreatePortfolioDto {
  attachmentId: string
  title?: string
  description?: string
  visibility?: PortfolioVisibility
  tags?: string[]
}

export interface UpdatePortfolioDto {
  title?: string
  description?: string
  visibility?: PortfolioVisibility
  status?: PortfolioStatus
  tags?: string[]
}

export interface PortfolioFilters {
  ownerId?: string
  visibility?: PortfolioVisibility
  tags?: string[]
  status?: PortfolioStatus
  limit?: number
  cursor?: string
}

export interface PaginatedPortfolios {
  items: PortfolioWithOwner[]
  nextCursor: string | null
  total: number
}
