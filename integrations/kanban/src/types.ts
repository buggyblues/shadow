export interface BoardColumn {
  id: string
  title: string
}

export type BoardLabelColor =
  | 'green'
  | 'yellow'
  | 'orange'
  | 'red'
  | 'purple'
  | 'blue'
  | 'sky'
  | 'lime'
  | 'pink'
  | 'black'

export interface BoardLabel {
  id: string
  title: string
  color: BoardLabelColor
}

export interface BoardScope {
  serverId: string
  projectId?: string | null
  boardId?: string | null
}

export type BuddyRuntimeStatus = 'online' | 'busy' | 'idle' | 'offline'
export type IssueStepStatus = 'queued' | 'running' | 'review' | 'done' | 'failed'

export interface BoardPerson {
  kind: string
  id: string
  userId?: string | null
  buddyAgentId?: string | null
  ownerId?: string | null
  displayName: string
  avatarUrl?: string | null
}

export interface BoardMember {
  id: string
  person: BoardPerson
  role: 'owner' | 'admin' | 'member' | 'buddy'
  joinedAt: string
}

export interface KanbanProject {
  id: string
  serverId: string
  title: string
  boardIds: string[]
  createdBy?: BoardPerson | null
  createdAt: string
  updatedAt: string
}

export interface BoardSummary {
  serverId: string
  projectId: string
  boardId: string
  title: string
  cardCount: number
  updatedAt: string
}

export interface IssueAgentRole {
  id: string
  label: string
  specialty: string
  status: BuddyRuntimeStatus
  color: string
  binding?: IssueRoleBinding | null
}

export interface IssueRoleBinding {
  agentId: string
  agentUserId?: string | null
  channelId?: string | null
  displayName: string
  avatarUrl?: string | null
  status?: BuddyRuntimeStatus | null
  source: 'bridge' | 'manual' | 'local'
  boundAt: string
}

export interface IssueStepArtifact {
  id: string
  issueId: string
  stepId: string
  cardId: string
  kind: string
  title: string
  url?: string
  uri?: string
  path?: string
  mimeType?: string
  sizeBytes?: number
  summary?: string
  metadata?: Record<string, unknown>
  createdAt: string
}

export interface BoardCardArtifact {
  id: string
  cardId: string
  issueId?: string
  stepId?: string
  kind: string
  title: string
  url?: string
  uri?: string
  path?: string
  mimeType?: string
  sizeBytes?: number
  summary?: string
  metadata?: Record<string, unknown>
  createdAt: string
}

export interface BoardCardLink {
  id: string
  sourceCardId: string
  targetCardId: string
  kind: string
  label?: string
  metadata?: Record<string, unknown>
  createdBy: BoardPerson
  createdAt: string
}

export interface BoardCardDates {
  start?: string | null
  due?: string | null
  dueComplete?: boolean
}

export interface BoardCardChecklistItem {
  id: string
  text: string
  done: boolean
  createdAt: string
  completedAt?: string | null
}

export interface BoardCardChecklist {
  id: string
  title: string
  items: BoardCardChecklistItem[]
  createdAt: string
}

export interface BoardCardActivity {
  id: string
  type:
    | 'card.created'
    | 'card.updated'
    | 'card.moved'
    | 'card.commented'
    | 'card.checklist'
    | 'card.dates'
    | 'card.labels'
    | 'card.members'
  actor: BoardPerson
  body: string
  createdAt: string
  metadata?: Record<string, unknown>
}

export interface IssueCreateStepInput {
  id?: string
  title: string
  description?: string
  taskType?: string
  assigneeLabel?: string
  agentId?: string
  agentUserId?: string | null
  assigneeDisplayName?: string
  assigneeAvatarUrl?: string | null
  artifactKind?: string
  prompt?: string
  dependsOn?: string[]
  priority?: 'low' | 'normal' | 'medium' | 'high'
  labels?: string[]
}

export interface BoardIssueStepCard {
  issueId: string
  stepId: string
  definitionStepId: string
  taskType: string
  agentRoleId?: string
  assigneeLabel?: string
  agentId?: string
  agentUserId?: string | null
  prompt: string
  artifactKind: string
  status: IssueStepStatus
  progress?: number
  attempt: number
  dependsOn?: string[]
  outputSummary?: string
  artifactIds?: string[]
  submittedBy?: BoardPerson | null
  completedAt?: string | null
}

export interface BoardCard {
  id: string
  columnId: string
  title: string
  description?: string
  prompt?: string
  labels: string[]
  labelIds?: string[]
  dates?: BoardCardDates
  checklists?: BoardCardChecklist[]
  activity?: BoardCardActivity[]
  assignees: BoardPerson[]
  priority?: 'low' | 'normal' | 'medium' | 'high'
  issueStep?: BoardIssueStepCard
  buddyStatus?:
    | 'queued'
    | 'claimed'
    | 'running'
    | 'completed'
    | 'failed'
    | 'canceled'
    | 'transferred'
  artifactPolicy?: {
    requireWorkspaceFileReference?: boolean
    acceptedMimeTypes?: string[]
  }
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

export interface CardCreateInput {
  title: string
  columnId?: string
  column?: string
  description?: string
  prompt?: string
  label?: string
  labels?: string[]
  labelIds?: string[]
  dates?: BoardCardDates
  dueDate?: string | null
  startDate?: string | null
  dueComplete?: boolean
  checklists?: BoardCardChecklist[]
  priority?: 'low' | 'normal' | 'medium' | 'high'
  assignee?: BoardPerson | string | null
}

export interface BoardCreateInput {
  title: string
  projectId?: string | null
  boardId?: string | null
}

export interface BoardUpdateInput {
  title: string
  projectId?: string | null
  boardId?: string | null
}

export interface BoardDeleteInput {
  boardId?: string | null
  projectId?: string | null
}

export interface ColumnCreateInput {
  title: string
  columnId?: string | null
}

export interface ColumnDeleteInput {
  columnId: string
}

export interface CardDeleteInput {
  cardId: string
}

export interface CardCommentDeleteInput {
  cardId: string
  commentId: string
}

export interface CardUpdateInput {
  cardId: string
  title?: string
  columnId?: string
  column?: string
  description?: string
  prompt?: string
  labels?: string[]
  labelIds?: string[]
  dates?: BoardCardDates
  dueDate?: string | null
  startDate?: string | null
  dueComplete?: boolean
  checklists?: BoardCardChecklist[]
  priority?: 'low' | 'normal' | 'medium' | 'high'
}

export interface CardCompleteInput {
  cardId: string
  summary?: string
}

export interface CardLinkInput {
  sourceCardId: string
  targetCardId: string
  kind?: string
  label?: string
  metadata?: Record<string, unknown>
}

export interface CardArtifactInput {
  cardId: string
  kind?: string
  title?: string
  name?: string
  url?: string
  uri?: string
  path?: string
  mimeType?: string
  sizeBytes?: number
  summary?: string
  description?: string
  metadata?: Record<string, unknown>
  artifacts: Array<{
    id?: string
    workspaceFileId?: string
    workspaceNodeId?: string
    kind?: string
    title?: string
    name?: string
    url?: string
    uri?: string
    path?: string
    mimeType?: string
    sizeBytes?: number
    summary?: string
    description?: string
    metadata?: Record<string, unknown>
  }>
}

export interface CardDispatchInput {
  cardId: string
  agentId: string
  agentUserId?: string | null
  assigneeLabel?: string
  assigneeAvatarUrl?: string | null
  title?: string
  body?: string
  priority?: 'low' | 'normal' | 'medium' | 'high'
  tags?: Array<string | { id?: string; label: string; color?: string }>
  idempotencyKey?: string
  requirements?: Record<string, unknown> | null
  outputContract?: Record<string, unknown> | null
  privacy?: Record<string, unknown> | null
  data?: Record<string, unknown> | null
  kanbanCardRef?: unknown
}

export interface BoardIssue {
  id: string
  title: string
  summary?: string
  privateContextSummary?: string
  coordinator?: BoardPerson | null
  status: IssueStepStatus
  createdAt: string
  updatedAt: string
  stepCardIds: string[]
}

export interface IssueCreateInput {
  title: string
  summary?: string
  privateContextSummary?: string
  steps: IssueCreateStepInput[]
}

export interface BoardState {
  id: string
  serverId: string
  projectId: string
  boardId: string
  title: string
  columns: BoardColumn[]
  labels: BoardLabel[]
  cards: BoardCard[]
  links: BoardCardLink[]
  artifacts: BoardCardArtifact[]
  members: BoardMember[]
  issues: {
    roles: IssueAgentRole[]
    items: BoardIssue[]
    artifacts: IssueStepArtifact[]
  }
  updatedAt: string
}

export interface KanbanStoreState {
  schemaVersion: 'kanban.store/2'
  projects: KanbanProject[]
  boards: BoardState[]
  updatedAt: string
}
