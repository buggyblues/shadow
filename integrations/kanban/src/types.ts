export interface BoardColumn {
  id: string
  title: string
}

export interface BoardPerson {
  kind: string
  id: string
  userId?: string | null
  buddyAgentId?: string | null
  ownerId?: string | null
  displayName: string
  avatarUrl?: string | null
}

export interface BoardCard {
  id: string
  columnId: string
  title: string
  description?: string
  labels: string[]
  assignees: BoardPerson[]
  buddyStatus?:
    | 'queued'
    | 'claimed'
    | 'running'
    | 'completed'
    | 'failed'
    | 'canceled'
    | 'transferred'
  lastDispatchedAt?: string
  comments: Array<{
    id: string
    body: string
    author: BoardPerson
    createdAt: string
  }>
  createdBy: BoardPerson
  createdAt: string
  updatedAt: string
}

export interface BoardState {
  id: string
  title: string
  columns: BoardColumn[]
  cards: BoardCard[]
  updatedAt: string
}
