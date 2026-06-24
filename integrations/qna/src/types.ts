import type { ShadowServerAppIdentitySubjectKind } from '@shadowob/sdk'

export interface QnaPerson {
  kind: string
  subjectKind?: ShadowServerAppIdentitySubjectKind
  stableKey?: string
  id: string
  userId?: string | null
  buddyAgentId?: string | null
  ownerId?: string | null
  displayName: string
  avatarUrl?: string | null
}

export interface QnaComment {
  id: string
  targetType: 'question' | 'answer'
  targetId: string
  body: string
  author: QnaPerson
  createdAt: string
}

export interface QnaImageAsset {
  id: string
  filename: string
  contentType: string
  size: number
  url: string
  uploadedBy: QnaPerson
  createdAt: string
}

export interface QnaUploadFile {
  field?: string
  filename: string
  contentType: string
  size: number
  dataBase64: string
}

export interface QnaAnswer {
  id: string
  questionId: string
  body: string
  author: QnaPerson
  comments: QnaComment[]
  createdAt: string
  updatedAt: string
}

export interface QnaQuestion {
  id: string
  title: string
  body?: string
  tags: string[]
  author: QnaPerson
  comments: QnaComment[]
  answers: QnaAnswer[]
  imageIds?: string[]
  createdAt: string
  updatedAt: string
}

export interface QnaArticle {
  id: string
  title: string
  body: string
  tags: string[]
  author: QnaPerson
  comments: QnaComment[]
  imageIds?: string[]
  createdAt: string
  updatedAt: string
}

export interface QnaList {
  id: string
  title: string
  description?: string
  owner: QnaPerson
  questionIds: string[]
  createdAt: string
  updatedAt: string
}

export type QnaReadableKind = 'question' | 'article'

export interface QnaReadRecord {
  actorKey: string
  kind: QnaReadableKind
  itemId: string
  readAt: string
}

export interface QnaReadingEntry {
  kind: QnaReadableKind
  id: string
  readAt?: string | null
  question?: QnaQuestion
  article?: QnaArticle
}

export interface QnaReadingBatch {
  index: number
  title: string
  items: QnaReadingEntry[]
  readCount: number
  unreadCount: number
  completed: boolean
}

export interface QnaState {
  updatedAt: string
  questions: QnaQuestion[]
  articles: QnaArticle[]
  lists: QnaList[]
  images: QnaImageAsset[]
  readRecords: QnaReadRecord[]
}
