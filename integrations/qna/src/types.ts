export interface QnaPerson {
  kind: string
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
  topics: string[]
  author: QnaPerson
  comments: QnaComment[]
  answers: QnaAnswer[]
  createdAt: string
  updatedAt: string
}

export interface QnaState {
  updatedAt: string
  questions: QnaQuestion[]
}
