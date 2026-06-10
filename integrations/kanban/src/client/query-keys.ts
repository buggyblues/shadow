import { currentBoardScope } from './api.js'

export const initialBoardScope = currentBoardScope()

export const boardQueryKey = [
  'kanban',
  'board',
  initialBoardScope.projectId ?? 'default',
  initialBoardScope.boardId ?? 'kanban',
] as const

export const boardsQueryKey = [
  'kanban',
  'boards',
  initialBoardScope.projectId ?? 'default',
] as const
export const inboxQueryKey = ['kanban', 'buddy-inboxes'] as const
export const oauthQueryKey = ['kanban', 'oauth-session'] as const
