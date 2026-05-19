export interface ShadowCommandContext {
  protocol: 'shadow.app/1'
  serverId: string
  serverAppId: string
  appKey: string
  command: string
  actor: {
    kind: string
    userId: string | null
    buddyAgentId?: string | null
    ownerId?: string | null
  }
  channelId?: string | null
  permission: string
  action: string
  dataClass: string
}

export interface ShadowCommandEnvelope<T = unknown> {
  input: T
  context: ShadowCommandContext
}

export interface BoardColumn {
  id: string
  title: string
}

export interface BoardCard {
  id: string
  columnId: string
  title: string
  description?: string
  labels: string[]
  assignees: string[]
  comments: Array<{
    id: string
    body: string
    author: string
    createdAt: string
  }>
  createdBy: string
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
