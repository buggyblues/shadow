import { resolve } from 'node:path'
import { createShadowServerAppJsonStore } from '@shadowob/sdk/server-app/node'
import type {
  BoardCard,
  BoardCardArtifact,
  BoardCardLink,
  BoardIssue,
  BoardIssueStepCard,
  BoardPerson,
  BoardState,
  CardArtifactInput,
  CardCompleteInput,
  CardCreateInput,
  CardDispatchInput,
  CardLinkInput,
  CardUpdateInput,
  IssueAgentRole,
  IssueCreateInput,
  IssueCreateStepInput,
  IssueStepArtifact,
  IssueStepStatus,
} from './types.js'

const now = () => new Date().toISOString()
const id = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 9)}`
const buddyPrefix = 'buddy:'

const boardColumns = [
  { id: 'backlog', title: 'Backlog' },
  { id: 'todo', title: 'Todo' },
  { id: 'doing', title: 'In Progress' },
  { id: 'review', title: 'In Review' },
  { id: 'done', title: 'Done' },
]

const dependencyLinkKinds = new Set(['dependency', 'depends_on'])

function normalizeRuntimeStatus(value: unknown): IssueAgentRole['status'] {
  return value === 'busy' || value === 'idle' || value === 'offline' || value === 'online'
    ? value
    : 'online'
}

function normalizeBuddyAgentId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  let agentId = value.trim()
  if (!agentId) return null
  while (agentId.startsWith(buddyPrefix)) agentId = agentId.slice(buddyPrefix.length)
  return agentId || null
}

function buddyPersonId(agentId: string) {
  return `${buddyPrefix}${agentId}`
}

function roleBindingPerson(role: IssueAgentRole): BoardPerson {
  if (!role.binding) return rolePerson(role)
  const agentId = normalizeBuddyAgentId(role.binding.agentId) ?? role.binding.agentId
  return {
    kind: 'buddy',
    id: buddyPersonId(agentId),
    buddyAgentId: agentId,
    userId: role.binding.agentUserId ?? null,
    displayName: role.binding.displayName,
    avatarUrl: role.binding.avatarUrl ?? null,
  }
}

function findRoleBindingByAgentId(agentId: string) {
  return board.issues.roles.find((role) => {
    const bindingAgentId = normalizeBuddyAgentId(role.binding?.agentId)
    return bindingAgentId === agentId
  })?.binding
}

function systemPerson(displayName: string): BoardPerson {
  return {
    kind: 'system',
    id: `system:${displayName.toLowerCase().replace(/\s+/g, '-')}`,
    displayName,
  }
}

function manualPerson(displayName: string, avatarUrl?: string | null): BoardPerson {
  const clean = displayName.trim() || 'Unassigned'
  return {
    kind: 'manual',
    id: `manual:${clean
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')}`,
    displayName: clean,
    avatarUrl: avatarUrl ?? null,
  }
}

function rolePerson(role: IssueAgentRole): BoardPerson {
  const agentId = normalizeBuddyAgentId(role.id) ?? role.id
  return {
    kind: 'buddy',
    id: buddyPersonId(agentId),
    buddyAgentId: agentId,
    displayName: role.label,
  }
}

function defaultBoard(): BoardState {
  const timestamp = now()
  return {
    id: 'kanban',
    title: 'Kanban',
    updatedAt: timestamp,
    columns: boardColumns,
    links: [],
    artifacts: [],
    issues: {
      roles: [],
      items: [],
      artifacts: [],
    },
    cards: [],
  }
}

function dataFilePath() {
  return resolve(process.env.KANBAN_DATA_FILE ?? './data/kanban-board.json')
}

function isBoardState(value: unknown): value is BoardState {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Array.isArray((value as { columns?: unknown }).columns) &&
    Array.isArray((value as { cards?: unknown }).cards)
  )
}

function normalizePerson(value: unknown, fallback = 'Unknown'): BoardPerson {
  if (typeof value === 'string') return manualPerson(value || fallback)
  if (!value || typeof value !== 'object' || Array.isArray(value)) return manualPerson(fallback)
  const candidate = value as Partial<BoardPerson>
  const displayName =
    typeof candidate.displayName === 'string' && candidate.displayName.trim()
      ? candidate.displayName.trim()
      : fallback
  const normalizedBuddyAgentId =
    normalizeBuddyAgentId(candidate.buddyAgentId) ??
    (typeof candidate.id === 'string' && candidate.id.startsWith(buddyPrefix)
      ? normalizeBuddyAgentId(candidate.id)
      : null)
  const personId = normalizedBuddyAgentId
    ? buddyPersonId(normalizedBuddyAgentId)
    : typeof candidate.id === 'string' && candidate.id.trim()
      ? candidate.id
      : `${candidate.kind ?? 'manual'}:${displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  return {
    kind: typeof candidate.kind === 'string' ? candidate.kind : 'manual',
    id: personId,
    userId: typeof candidate.userId === 'string' ? candidate.userId : null,
    buddyAgentId:
      normalizedBuddyAgentId ??
      (typeof candidate.buddyAgentId === 'string' ? candidate.buddyAgentId : null),
    ownerId: typeof candidate.ownerId === 'string' ? candidate.ownerId : null,
    displayName,
    avatarUrl: typeof candidate.avatarUrl === 'string' ? candidate.avatarUrl : null,
  }
}

function normalizeIssueStep(card: BoardCard): BoardIssueStepCard | undefined {
  const legacy = card as BoardCard & { workflow?: BoardIssueStepCard }
  const issueStep = card.issueStep ?? legacy.workflow
  if (!issueStep) return undefined
  const stepSuffix = issueStep.issueId
    ? issueStep.stepId.replace(`${issueStep.issueId}_`, '')
    : issueStep.stepId
  return {
    ...issueStep,
    definitionStepId: issueStep.definitionStepId ?? stepSuffix,
    attempt: Number.isFinite(issueStep.attempt) ? issueStep.attempt : 1,
    status: issueStep.status ?? 'queued',
    artifactIds: issueStep.artifactIds ?? [],
  }
}

function normalizeCard(
  card: BoardCard,
  artifacts: Array<BoardCardArtifact | IssueStepArtifact> = [],
): BoardCard {
  const issueStep = normalizeIssueStep(card)
  const status = card.status ?? issueStep?.status
  const buddyStatus =
    status && (card.buddyStatus || status === 'done' || status === 'failed')
      ? buddyStatusForStatus(status)
      : card.buddyStatus
  const normalized: BoardCard = {
    ...card,
    assignees: (card.assignees ?? []).map((person) => normalizePerson(person, 'Assignee')),
    comments: (card.comments ?? []).map((comment) => ({
      ...comment,
      author: normalizePerson(comment.author, 'Commenter'),
    })),
    createdBy: normalizePerson(card.createdBy, 'Creator'),
    status,
    buddyStatus,
    issueStep,
  }
  if (
    (normalized.status === 'running' || normalized.buddyStatus === 'running') &&
    cardHasAcceptedWorkspaceArtifactIn(normalized, artifacts)
  ) {
    normalized.status = 'review'
    normalized.columnId = columnForStatus('review')
    normalized.buddyStatus = buddyStatusForStatus('review')
    normalized.progress = Math.max(normalized.progress ?? 0, progressForStatus('review'))
    if (normalized.issueStep) normalized.issueStep.status = 'review'
  }
  if (
    normalized.status === 'review' &&
    cardRequiresAcceptedArtifact(normalized) &&
    !cardHasAcceptedWorkspaceArtifactIn(normalized, artifacts)
  ) {
    normalized.status = 'running'
    normalized.columnId = columnForStatus('running')
    normalized.buddyStatus = buddyStatusForStatus('running')
    normalized.progress = Math.min(normalized.progress ?? progressForStatus('running'), 99)
    if (normalized.issueStep) normalized.issueStep.status = 'running'
  }
  return normalized
}

function normalizeBoard(value: BoardState): BoardState {
  const legacy = value as BoardState & {
    workflow?: {
      roles?: IssueAgentRole[]
      issues?: BoardIssue[]
      artifacts?: IssueStepArtifact[]
    }
    links?: BoardCardLink[]
    artifacts?: BoardCardArtifact[]
  }
  const hasBoardColumns = boardColumns.every((column) =>
    value.columns?.some((item) => item.id === column.id),
  )
  const artifacts = legacy.artifacts ?? value.issues?.artifacts ?? legacy.workflow?.artifacts ?? []
  const issues = {
    roles: value.issues?.roles ?? legacy.workflow?.roles ?? [],
    items: value.issues?.items ?? legacy.workflow?.issues ?? [],
    artifacts: value.issues?.artifacts ?? legacy.workflow?.artifacts ?? [],
  }
  const normalized: BoardState = {
    ...value,
    title: value.id === 'default' || value.title === 'Launch Board' ? 'Kanban' : value.title,
    columns: hasBoardColumns ? value.columns : boardColumns,
    links: legacy.links ?? [],
    artifacts,
    issues,
    cards: value.cards.map((card) => normalizeCard(card, [...artifacts, ...issues.artifacts])),
  }
  for (const card of normalized.cards) {
    const status = currentCardStatus(card)
    if (
      statusRequiresResolvedDependencies(status) &&
      unresolvedDependencyCardsIn(card.id, normalized).length
    ) {
      resetCardForUnresolvedDependencies(card)
    }
  }
  return normalized
}

const boardStore = createShadowServerAppJsonStore<BoardState>({
  filePath: dataFilePath(),
  defaultValue: defaultBoard,
  validate: isBoardState,
  normalize: normalizeBoard,
})

let board: BoardState = boardStore.read()

function persistBoard() {
  board = boardStore.write(board)
}

export function resetBoardForTests(next: BoardState = defaultBoard()) {
  board = structuredClone(next)
  persistBoard()
}

function touch(card?: BoardCard) {
  const timestamp = now()
  board.updatedAt = timestamp
  if (card) card.updatedAt = timestamp
  persistBoard()
}

export function getBoard() {
  return structuredClone(board)
}

function slugify(value: string, fallback = 'item') {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return slug || fallback
}

function roleColor(seed: string) {
  const colors = ['#61bd4f', '#f2d600', '#ff9f1a', '#eb5a46', '#c377e0', '#0079bf', '#00c2e0']
  let hash = 0
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) % 9973
  return colors[hash % colors.length]!
}

function roleById(roleId?: string | null) {
  if (!roleId) return null
  return board.issues.roles.find((role) => role.id === roleId) ?? null
}

function ensureStepRole(step: IssueCreateStepInput) {
  const label = step.assigneeLabel?.trim() || step.assigneeDisplayName?.trim()
  if (!label && !step.agentId) return null
  const roleId = slugify(step.agentId ?? label ?? '', 'buddy')
  let role = board.issues.roles.find((item) => item.id === roleId)
  if (!role) {
    role = {
      id: roleId,
      label: label || roleId,
      specialty: step.taskType?.trim() || 'Issue task',
      status: 'online',
      color: roleColor(roleId),
    }
    board.issues.roles.push(role)
  }
  if (step.agentId) {
    role.binding = {
      agentId: step.agentId,
      agentUserId: step.agentUserId ?? null,
      displayName: step.assigneeDisplayName?.trim() || label || role.label,
      avatarUrl: step.assigneeAvatarUrl ?? null,
      status: role.status,
      source: 'manual',
      boundAt: now(),
    }
  }
  return role
}

function issueStepCardsForIssue(issueId: string) {
  return board.cards.filter((card) => card.issueStep?.issueId === issueId)
}

function issueDefinitionStepId(card: BoardCard) {
  return (
    card.issueStep?.definitionStepId ??
    card.issueStep?.stepId.replace(`${card.issueStep.issueId}_`, '')
  )
}

function issueStepDone(issueId: string, definitionStepId: string) {
  return issueStepCardsForIssue(issueId).some(
    (card) => issueDefinitionStepId(card) === definitionStepId && card.issueStep?.status === 'done',
  )
}

function issueStepCardReady(card: BoardCard) {
  if (!card.issueStep || card.issueStep.status !== 'queued') return false
  return (card.issueStep.dependsOn ?? []).every((dependency) =>
    issueStepDone(card.issueStep!.issueId, dependency),
  )
}

function readyIssueStepCards(issueId: string) {
  return issueStepCardsForIssue(issueId).filter(issueStepCardReady)
}

function columnForStatus(status: IssueStepStatus) {
  if (status === 'running') return 'doing'
  if (status === 'review') return 'review'
  if (status === 'done') return 'done'
  return 'todo'
}

function statusForColumn(columnId: string): IssueStepStatus {
  if (columnId === 'done') return 'done'
  if (columnId === 'review') return 'review'
  if (columnId === 'doing') return 'running'
  return 'queued'
}

function progressForStatus(status: IssueStepStatus) {
  if (status === 'done') return 100
  if (status === 'review') return 72
  if (status === 'running') return 48
  return 12
}

function statusRank(status: IssueStepStatus) {
  if (status === 'done') return 3
  if (status === 'review') return 2
  if (status === 'running' || status === 'failed') return 1
  return 0
}

function currentCardStatus(card: BoardCard): IssueStepStatus {
  return card.status ?? statusForColumn(card.columnId)
}

function normalizeProgressForStatus(status: IssueStepStatus, progress?: number) {
  if (status === 'done') return 100
  if (typeof progress !== 'number' || !Number.isFinite(progress)) return progressForStatus(status)
  const normalized = Math.max(0, Math.min(100, progress))
  return Math.min(normalized, 99)
}

function buddyStatusForStatus(status: IssueStepStatus): BoardCard['buddyStatus'] {
  if (status === 'done' || status === 'review') return 'completed'
  if (status === 'failed') return 'failed'
  if (status === 'running') return 'running'
  return 'queued'
}

function artifactHasWorkspaceReference(artifact: BoardCardArtifact | IssueStepArtifact) {
  if (artifact.kind === 'workspace.file' || artifact.kind === 'workspace.reference') return true
  if (typeof artifact.path === 'string' && artifact.path.startsWith('/workspace/')) return true
  if (typeof artifact.path === 'string' && isWorkspaceUri(artifact.path)) return true
  if (typeof artifact.url === 'string' && isWorkspaceUri(artifact.url)) return true
  if (typeof artifact.uri === 'string' && isWorkspaceUri(artifact.uri)) return true
  const metadata = artifact.metadata ?? {}
  return (
    typeof metadata.workspaceFileId === 'string' ||
    typeof metadata.workspaceNodeId === 'string' ||
    (typeof metadata.workspaceUri === 'string' && isWorkspaceUri(metadata.workspaceUri)) ||
    typeof metadata.externalArtifactId === 'string'
  )
}

function isWorkspaceUri(value: unknown): value is string {
  return typeof value === 'string' && value.trim().startsWith('workspace://')
}

function artifactUri(input: { uri?: string; url?: string; path?: string }) {
  for (const value of [input.uri, input.url, input.path]) {
    if (isWorkspaceUri(value)) return value.trim()
  }
  return input.uri?.trim()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function normalizeMimeType(value: unknown) {
  if (typeof value !== 'string') return null
  const mimeType = value.trim().toLowerCase()
  return /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(mimeType) ? mimeType : null
}

function mimeTypeMatches(expected: string, actual?: string) {
  const actualMimeType = normalizeMimeType(actual)
  if (!actualMimeType) return false
  if (expected.endsWith('/*')) return actualMimeType.startsWith(expected.slice(0, -1))
  return actualMimeType === expected
}

function inferMimeTypesFromText(...values: Array<string | undefined>) {
  const mimeTypes = new Set<string>()
  for (const value of values) {
    if (!value) continue
    for (const match of value.matchAll(/\b[a-z0-9.+-]+\/[a-z0-9.+-]+\b/gi)) {
      const mimeType = normalizeMimeType(match[0])
      if (mimeType) mimeTypes.add(mimeType)
    }
  }
  return [...mimeTypes]
}

function cardAcceptedMimeTypes(card: BoardCard) {
  const explicit = (card.artifactPolicy?.acceptedMimeTypes ?? [])
    .map((value) => normalizeMimeType(value))
    .filter((value): value is string => Boolean(value))
  if (explicit.length > 0) return [...new Set(explicit)]
  return inferMimeTypesFromText(card.title, card.description, card.prompt)
}

function artifactSatisfiesCardOutput(
  card: BoardCard,
  artifact: BoardCardArtifact | IssueStepArtifact,
) {
  if (
    card.artifactPolicy?.requireWorkspaceFileReference &&
    !artifactHasWorkspaceReference(artifact)
  ) {
    return false
  }
  const acceptedMimeTypes = cardAcceptedMimeTypes(card)
  if (acceptedMimeTypes.length === 0) return artifactHasWorkspaceReference(artifact)
  return acceptedMimeTypes.some((mimeType) => mimeTypeMatches(mimeType, artifact.mimeType))
}

function cardArtifactsIn(card: BoardCard, artifacts: Array<BoardCardArtifact | IssueStepArtifact>) {
  const issueArtifactIds = new Set(card.issueStep?.artifactIds ?? [])
  return artifacts
    .filter((artifact) => artifact.cardId === card.id || issueArtifactIds.has(artifact.id))
    .filter(
      (artifact, index, artifacts) =>
        artifacts.findIndex((candidate) => candidate.id === artifact.id) === index,
    )
}

function cardArtifacts(card: BoardCard) {
  return cardArtifactsIn(card, [...board.artifacts, ...board.issues.artifacts])
}

function cardHasWorkspaceArtifactIn(
  card: BoardCard,
  artifacts: Array<BoardCardArtifact | IssueStepArtifact>,
) {
  return cardArtifactsIn(card, artifacts).some(artifactHasWorkspaceReference)
}

function cardHasWorkspaceArtifact(card: BoardCard) {
  return cardHasWorkspaceArtifactIn(card, [...board.artifacts, ...board.issues.artifacts])
}

function cardHasAcceptedWorkspaceArtifactIn(
  card: BoardCard,
  artifacts: Array<BoardCardArtifact | IssueStepArtifact>,
) {
  return cardArtifactsIn(card, artifacts).some((artifact) =>
    artifactSatisfiesCardOutput(card, artifact),
  )
}

function cardHasAcceptedWorkspaceArtifact(card: BoardCard) {
  return cardHasAcceptedWorkspaceArtifactIn(card, [...board.artifacts, ...board.issues.artifacts])
}

function cardRequiresAcceptedArtifact(card: BoardCard) {
  return (
    card.artifactPolicy?.requireWorkspaceFileReference === true ||
    (card.artifactPolicy?.acceptedMimeTypes?.length ?? 0) > 0 ||
    cardAcceptedMimeTypes(card).length > 0
  )
}

function cardArtifactPolicySummary(card: BoardCard) {
  return {
    requireWorkspaceFileReference: card.artifactPolicy?.requireWorkspaceFileReference === true,
    acceptedMimeTypes: cardAcceptedMimeTypes(card),
  }
}

function shouldMarkReadyForReview(card: BoardCard, artifacts: BoardCardArtifact[]) {
  if (!artifacts.some((artifact) => artifactSatisfiesCardOutput(card, artifact))) return false
  const status = currentCardStatus(card)
  return (
    status === 'running' ||
    card.buddyStatus === 'running' ||
    card.artifactPolicy?.requireWorkspaceFileReference === true
  )
}

function statusRequiresResolvedDependencies(status: IssueStepStatus) {
  return status === 'review' || status === 'done'
}

function dependencyArtifactsIn(state: BoardState) {
  return [...state.artifacts, ...state.issues.artifacts]
}

function cardReadyForDependencyIn(card: BoardCard | undefined, state: BoardState) {
  if (!card) return false
  const status = currentCardStatus(card)
  return (
    status === 'done' ||
    (status === 'review' && cardHasAcceptedWorkspaceArtifactIn(card, dependencyArtifactsIn(state)))
  )
}

function cardReadyForDependency(card: BoardCard | undefined) {
  if (!card) return false
  return cardReadyForDependencyIn(card, board)
}

function unresolvedDependencyCardsIn(cardId: string, state: BoardState) {
  return state.links
    .flatMap((link) => {
      if (!dependencyLinkKinds.has(link.kind)) return []
      if (link.kind === 'depends_on' && link.sourceCardId === cardId) return [link.targetCardId]
      if (link.kind !== 'depends_on' && link.targetCardId === cardId) return [link.sourceCardId]
      return []
    })
    .map((upstreamCardId) => state.cards.find((item) => item.id === upstreamCardId))
    .filter((card): card is BoardCard => !cardReadyForDependencyIn(card, state))
}

function unresolvedDependencyCards(cardId: string) {
  return unresolvedDependencyCardsIn(cardId, board)
}

function resetCardForUnresolvedDependencies(card: BoardCard) {
  const status: IssueStepStatus = 'queued'
  card.status = status
  card.columnId = columnForStatus(status)
  card.buddyStatus = buddyStatusForStatus(status)
  card.progress = 0
  if (card.issueStep) {
    card.issueStep.status = status
    card.issueStep.completedAt = null
  }
}

function protectsDeliveredState(card: BoardCard) {
  const status = currentCardStatus(card)
  return (
    status === 'done' ||
    (status === 'review' &&
      (card.buddyStatus === 'completed' || cardHasAcceptedWorkspaceArtifact(card)))
  )
}

function canApplyCardStatus(card: BoardCard, status: IssueStepStatus) {
  if (statusRequiresResolvedDependencies(status) && unresolvedDependencyCards(card.id).length > 0) {
    return false
  }
  if (
    (status === 'review' || status === 'done') &&
    cardRequiresAcceptedArtifact(card) &&
    !cardHasAcceptedWorkspaceArtifact(card)
  ) {
    return false
  }
  if (!protectsDeliveredState(card)) return true
  return statusRank(status) >= statusRank(currentCardStatus(card))
}

function applyCardStatus(card: BoardCard, status: IssueStepStatus, progress?: number) {
  if (!canApplyCardStatus(card, status)) return false
  const previousRank = statusRank(currentCardStatus(card))
  card.status = status
  card.columnId = columnForStatus(status)
  if (card.issueStep) card.issueStep.status = status
  if (card.buddyStatus || status === 'done' || status === 'failed') {
    card.buddyStatus = buddyStatusForStatus(status)
  }
  const normalizedProgress = normalizeProgressForStatus(status, progress)
  card.progress =
    statusRank(status) >= previousRank
      ? Math.max(card.progress ?? 0, normalizedProgress)
      : normalizedProgress
  return true
}

function applyCardProgress(card: BoardCard, progress: number) {
  const normalizedProgress = Math.max(0, Math.min(100, progress))
  if (normalizedProgress >= 100) return applyCardStatus(card, 'done', normalizedProgress)
  if (protectsDeliveredState(card)) return false
  card.progress = Math.max(card.progress ?? 0, normalizedProgress)
  return true
}

function updateIssueStatus(issueId: string) {
  const issue = board.issues.items.find((item) => item.id === issueId)
  if (!issue) return null
  const cards = issueStepCardsForIssue(issueId)
  if (cards.some((card) => card.issueStep?.status === 'failed')) issue.status = 'failed'
  else if (cards.length > 0 && cards.every((card) => card.issueStep?.status === 'done')) {
    issue.status = 'done'
  } else if (cards.some((card) => card.issueStep?.status === 'running')) issue.status = 'running'
  else if (cards.some((card) => card.issueStep?.status === 'review')) issue.status = 'running'
  else issue.status = 'queued'
  issue.updatedAt = now()
  return issue
}

export function createCard(input: CardCreateInput & { createdBy: BoardPerson }) {
  const requestedColumnId = input.columnId ?? input.column
  const columnId = board.columns.some((column) => column.id === requestedColumnId)
    ? requestedColumnId!
    : input.status
      ? columnForStatus(input.status)
      : 'todo'
  const assignee =
    typeof input.assignee === 'string'
      ? manualPerson(input.assignee)
      : input.assignee
        ? normalizePerson(input.assignee, 'Assignee')
        : input.createdBy
  const labels = [...(input.label ? [input.label] : []), ...(input.labels ?? [])]
  const card: BoardCard = {
    id: id('card'),
    columnId,
    title: input.title,
    description: input.description,
    prompt: input.prompt,
    labels: [...new Set(labels.map((label) => label.trim()).filter(Boolean))].slice(0, 8),
    assignees: [assignee],
    comments: [],
    createdBy: input.createdBy,
    createdAt: now(),
    updatedAt: now(),
    priority: input.priority,
    progress: input.progress,
    status: input.status,
  }
  board.cards.push(card)
  touch(card)
  return structuredClone(card)
}

export function updateCard(input: CardUpdateInput) {
  const card = board.cards.find((item) => item.id === input.cardId)
  if (!card) return null
  if (input.title?.trim()) card.title = input.title.trim()
  if (typeof input.description === 'string') card.description = input.description
  if (typeof input.prompt === 'string') {
    card.prompt = input.prompt
    if (card.issueStep) card.issueStep.prompt = input.prompt
  }
  if (input.labels) {
    card.labels = [...new Set(input.labels.map((label) => label.trim()).filter(Boolean))].slice(
      0,
      8,
    )
  }
  if (input.priority) card.priority = input.priority
  if (input.status) {
    applyCardStatus(card, input.status, input.progress)
  } else if (typeof input.progress === 'number' && Number.isFinite(input.progress)) {
    applyCardProgress(card, input.progress)
  }
  const requestedColumnId = input.columnId ?? input.column
  if (requestedColumnId && board.columns.some((column) => column.id === requestedColumnId)) {
    const columnStatus = statusForColumn(requestedColumnId)
    applyCardStatus(card, columnStatus, input.progress)
  }
  touch(card)
  return structuredClone(card)
}

export function completeCard(input: CardCompleteInput, actor: BoardPerson) {
  const card = board.cards.find((item) => item.id === input.cardId)
  if (!card) return null
  const dependencies = unresolvedDependencyCards(card.id)
  if (dependencies.length > 0) {
    return {
      card: structuredClone(card),
      blocked: {
        reason: 'unresolved_dependencies',
        dependencies: dependencies.map((item) => ({
          cardId: item.id,
          title: item.title,
          status: item.status ?? statusForColumn(item.columnId),
        })),
      },
    }
  }
  if (cardRequiresAcceptedArtifact(card) && !cardHasAcceptedWorkspaceArtifact(card)) {
    return {
      card: structuredClone(card),
      blocked: {
        reason: 'missing_required_artifact',
        artifactPolicy: cardArtifactPolicySummary(card),
      },
    }
  }
  if (!applyCardStatus(card, 'done', 100)) {
    return {
      card: structuredClone(card),
      blocked: {
        reason: 'completion_blocked',
      },
    }
  }
  const summary = input.summary?.trim()
  card.comments.push({
    id: id('comment'),
    body: summary || 'Completed card.',
    author: actor,
    createdAt: now(),
  })
  if (card.issueStep?.issueId) updateIssueStatus(card.issueStep.issueId)
  touch(card)
  return { card: structuredClone(card) }
}

export function linkCards(input: CardLinkInput, actor: BoardPerson) {
  const sourceCard = board.cards.find((item) => item.id === input.sourceCardId)
  const targetCard = board.cards.find((item) => item.id === input.targetCardId)
  if (!sourceCard || !targetCard) return null
  const existing = board.links.find(
    (item) =>
      item.sourceCardId === input.sourceCardId &&
      item.targetCardId === input.targetCardId &&
      item.kind === (input.kind?.trim() || 'relates_to'),
  )
  if (existing) {
    return {
      link: structuredClone(existing),
      sourceCard: structuredClone(sourceCard),
      targetCard: structuredClone(targetCard),
    }
  }
  const link: BoardCardLink = {
    id: id('link'),
    sourceCardId: input.sourceCardId,
    targetCardId: input.targetCardId,
    kind: input.kind?.trim() || 'relates_to',
    ...(input.label?.trim() ? { label: input.label.trim() } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
    createdBy: actor,
    createdAt: now(),
  }
  board.links.push(link)
  touch()
  return {
    link: structuredClone(link),
    sourceCard: structuredClone(sourceCard),
    targetCard: structuredClone(targetCard),
  }
}

export function createIssue(input: IssueCreateInput, createdBy: BoardPerson) {
  const title = input.title.trim()
  if (!title) throw new Error('issue_title_required')
  if (!Array.isArray(input.steps) || input.steps.length === 0) {
    throw new Error('issue_steps_required')
  }
  const timestamp = now()
  const issueId = id('issue')
  const issue: BoardIssue = {
    id: issueId,
    title,
    summary: input.summary?.trim() || undefined,
    privateContextSummary: input.privateContextSummary?.trim() || undefined,
    coordinator: createdBy,
    status: 'queued',
    createdAt: timestamp,
    updatedAt: timestamp,
    stepCardIds: [],
  }

  const seenStepIds = new Set<string>()
  const cards: BoardCard[] = input.steps.map((step, index) => {
    const definitionStepId = slugify(step.id ?? step.title, `step-${index + 1}`)
    if (seenStepIds.has(definitionStepId)) {
      throw new Error(`duplicate_issue_step:${definitionStepId}`)
    }
    seenStepIds.add(definitionStepId)
    const role = ensureStepRole(step)
    const stepId = `${issueId}_${definitionStepId}`
    const dependsOn = (step.dependsOn ?? []).map((dependency) => slugify(dependency, dependency))
    const issueStep: BoardIssueStepCard = {
      issueId,
      stepId,
      definitionStepId,
      taskType: step.taskType?.trim() || 'issue.task',
      ...(role?.id ? { agentRoleId: role.id } : {}),
      ...(step.assigneeLabel?.trim() ? { assigneeLabel: step.assigneeLabel.trim() } : {}),
      ...(step.agentId?.trim() ? { agentId: step.agentId.trim() } : {}),
      ...(step.agentUserId ? { agentUserId: step.agentUserId } : {}),
      prompt: step.prompt?.trim() || step.description?.trim() || step.title.trim(),
      artifactKind: step.artifactKind?.trim() || 'issue_artifact',
      status: 'queued',
      attempt: 1,
      dependsOn,
    }
    const labels = ['Issue', ...(step.labels ?? [])]
    if (role?.label) labels.push(role.label)
    const card: BoardCard = {
      id: id('card'),
      columnId: dependsOn.length ? 'backlog' : 'todo',
      title: step.title,
      description: issueStepCardDescription(issue, issueStep),
      labels: [...new Set(labels)].slice(0, 5),
      assignees: [role ? roleBindingPerson(role) : createdBy],
      comments: [],
      createdBy,
      createdAt: timestamp,
      updatedAt: timestamp,
      priority: step.priority ?? 'medium',
      progress: 0,
      buddyStatus: 'queued',
      issueStep,
    }
    issue.stepCardIds.push(card.id)
    return card
  })

  board.issues.items.unshift(issue)
  board.cards.unshift(...cards)
  touch()

  return { issue: structuredClone(issue), cards: structuredClone(cards) }
}

function issueStepCardDescription(issue: BoardIssue, issueStep: BoardIssueStepCard) {
  return [
    issue.summary ? `Issue: ${issue.summary}` : null,
    issue.privateContextSummary ? `Private context: ${issue.privateContextSummary}` : null,
    issueStep.dependsOn?.length ? `Depends on: ${issueStep.dependsOn.join(', ')}` : null,
    '',
    issueStep.prompt,
  ]
    .filter(Boolean)
    .join('\n')
}

export function moveCard(cardId: string, columnId: string) {
  const card = board.cards.find((item) => item.id === cardId)
  if (!card) return null
  if (!board.columns.some((column) => column.id === columnId)) return null
  applyCardStatus(card, statusForColumn(columnId))
  touch(card)
  return structuredClone(card)
}

export function assignCard(cardId: string, assignee: string) {
  const card = board.cards.find((item) => item.id === cardId)
  if (!card) return null
  const person = manualPerson(assignee)
  if (!card.assignees.some((item) => item.id === person.id)) card.assignees.push(person)
  touch(card)
  return structuredClone(card)
}

export function assignCardToPerson(cardId: string, assignee: BoardPerson) {
  const card = board.cards.find((item) => item.id === cardId)
  if (!card) return null
  const person = normalizePerson(assignee, assignee.displayName)
  if (!card.assignees.some((item) => item.id === person.id)) card.assignees.push(person)
  touch(card)
  return structuredClone(card)
}

function dispatchAssignee(input: CardDispatchInput): BoardPerson {
  const agentId = normalizeBuddyAgentId(input.agentId) ?? input.agentId
  const roleBinding = findRoleBindingByAgentId(agentId)
  const label = input.assigneeLabel?.trim() || roleBinding?.displayName?.trim() || agentId
  return {
    kind: 'agent',
    id: buddyPersonId(agentId),
    buddyAgentId: agentId,
    userId: input.agentUserId ?? roleBinding?.agentUserId ?? null,
    displayName: label,
    avatarUrl: input.assigneeAvatarUrl ?? roleBinding?.avatarUrl ?? null,
  }
}

function artifactPolicyForDispatch(
  input: CardDispatchInput,
): NonNullable<BoardCard['artifactPolicy']> {
  const acceptedMimeTypes = new Set<string>()
  if (input.outputContract === null) {
    return { requireWorkspaceFileReference: false, acceptedMimeTypes: [] }
  }
  let requireWorkspaceFileReference = input.outputContract === undefined
  if (input.outputContract === undefined) {
    return { requireWorkspaceFileReference, acceptedMimeTypes: [] }
  }
  const outputContract = input.outputContract as Record<string, unknown>
  for (const field of ['kind', 'mimeType', 'contentType', 'type']) {
    const mimeType = normalizeMimeType(outputContract[field])
    if (mimeType) {
      acceptedMimeTypes.add(mimeType)
      requireWorkspaceFileReference = true
    }
  }
  const expectedArtifacts = input.outputContract.expectedArtifacts
  if (Array.isArray(expectedArtifacts)) {
    for (const artifact of expectedArtifacts) {
      if (!isRecord(artifact) || artifact.required === false) continue
      if (artifact.kind === 'workspace.file' || artifact.kind === 'workspace.reference') {
        requireWorkspaceFileReference = true
      }
      for (const field of ['kind', 'mimeType', 'contentType', 'type']) {
        const mimeType = normalizeMimeType(artifact[field])
        if (mimeType) {
          acceptedMimeTypes.add(mimeType)
          requireWorkspaceFileReference = true
        }
      }
    }
  }
  return {
    requireWorkspaceFileReference,
    acceptedMimeTypes: [...acceptedMimeTypes],
  }
}

export function dispatchCard(input: CardDispatchInput, actor: BoardPerson) {
  const card = board.cards.find((item) => item.id === input.cardId)
  if (!card) return null
  const assignee = dispatchAssignee(input)
  if (!card.assignees.some((item) => item.id === assignee.id)) card.assignees.push(assignee)
  const unresolvedDependencies = unresolvedDependencyCards(card.id)
  if (unresolvedDependencies.length > 0) {
    const status: IssueStepStatus = 'queued'
    card.buddyStatus = buddyStatusForStatus(status)
    card.status = status
    card.columnId = columnForStatus(status)
    card.progress = 0
    if (card.issueStep) card.issueStep.status = status
    card.comments.push({
      id: id('comment'),
      body: `Dispatch deferred for ${assignee.displayName}; waiting on ${unresolvedDependencies
        .map((item) => item.title)
        .join(', ')}.`,
      author: actor,
      createdAt: now(),
    })
    touch(card)
    return {
      card: structuredClone(card),
      assignee,
      deferred: {
        reason: 'unresolved_dependencies',
        dependencies: unresolvedDependencies.map((item) => ({
          cardId: item.id,
          title: item.title,
          status: item.status ?? statusForColumn(item.columnId),
        })),
      },
    }
  }
  card.buddyStatus = 'queued'
  card.status = 'running'
  card.columnId = columnForStatus('running')
  card.progress = Math.max(card.progress ?? 0, 12)
  card.artifactPolicy = {
    ...(card.artifactPolicy ?? {}),
    ...artifactPolicyForDispatch(input),
  }
  if (card.issueStep) card.issueStep.status = 'running'
  card.comments.push({
    id: id('comment'),
    body: `Dispatched to ${assignee.displayName} via Buddy Inbox.`,
    author: actor,
    createdAt: now(),
  })
  touch(card)
  return { card: structuredClone(card), assignee }
}

export function getCard(cardId: string) {
  const card = board.cards.find((item) => item.id === cardId)
  return card ? structuredClone(card) : null
}

export function commentCard(cardId: string, body: string, author: BoardPerson) {
  const card = board.cards.find((item) => item.id === cardId)
  if (!card) return null
  card.comments.push({ id: id('comment'), body, author, createdAt: now() })
  touch(card)
  return structuredClone(card)
}

export function rerunIssueStep(cardId: string, input: { prompt?: string; reason?: string } = {}) {
  const card = board.cards.find((item) => item.id === cardId)
  if (!card?.issueStep) return null
  if (input.prompt?.trim()) card.issueStep.prompt = input.prompt.trim()
  if (input.prompt?.trim()) card.prompt = input.prompt.trim()
  card.issueStep.attempt += 1
  card.issueStep.status = 'queued'
  card.status = 'queued'
  card.columnId = columnForStatus('queued')
  card.buddyStatus = 'queued'
  card.progress = 0
  const reason = input.reason?.trim()
  if (reason) {
    card.comments.push({
      id: id('comment'),
      body: `Rerun requested: ${reason}`,
      author: systemPerson('Issue Controller'),
      createdAt: now(),
    })
  }
  touch(card)
  return { card: structuredClone(card) }
}

export function rerunCard(cardId: string, input: { prompt?: string; reason?: string } = {}) {
  const issueResult = rerunIssueStep(cardId, input)
  if (issueResult) return issueResult
  const card = board.cards.find((item) => item.id === cardId)
  if (!card) return null
  if (input.prompt?.trim()) card.prompt = input.prompt.trim()
  card.status = 'queued'
  card.columnId = columnForStatus('queued')
  card.buddyStatus = 'queued'
  card.progress = 0
  const reason = input.reason?.trim()
  if (reason) {
    card.comments.push({
      id: id('comment'),
      body: `Rerun requested: ${reason}`,
      author: systemPerson('Card Controller'),
      createdAt: now(),
    })
  }
  touch(card)
  return { card: structuredClone(card) }
}

export function updateIssueStepPrompt(cardId: string, prompt: string) {
  const card = board.cards.find((item) => item.id === cardId)
  if (!card?.issueStep) return null
  card.issueStep.prompt = prompt.trim()
  card.prompt = prompt.trim()
  card.comments.push({
    id: id('comment'),
    body: 'Prompt updated from Kanban.',
    author: systemPerson('Issue Controller'),
    createdAt: now(),
  })
  touch(card)
  return structuredClone(card)
}

function artifactInputToArtifact(
  input: {
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
  },
  card: BoardCard,
  timestamp: string,
): IssueStepArtifact {
  const metadata = artifactMetadata(input)
  const uri = artifactUri(input)
  return {
    id: id('artifact'),
    issueId: card.issueStep!.issueId,
    stepId: card.issueStep!.stepId,
    cardId: card.id,
    kind: input.kind?.trim() || card.issueStep!.artifactKind,
    title: input.title?.trim() || input.name?.trim() || card.title,
    ...(input.url?.trim() ? { url: input.url.trim() } : {}),
    ...(uri ? { uri } : {}),
    ...(input.path?.trim() ? { path: input.path.trim() } : {}),
    ...(input.mimeType?.trim() ? { mimeType: input.mimeType.trim() } : {}),
    ...(input.sizeBytes ? { sizeBytes: input.sizeBytes } : {}),
    ...(input.summary?.trim() || input.description?.trim()
      ? { summary: input.summary?.trim() || input.description?.trim() }
      : {}),
    ...(metadata ? { metadata } : {}),
    createdAt: timestamp,
  }
}

function artifactInputToCardArtifact(
  input: {
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
  },
  card: BoardCard,
  timestamp: string,
): BoardCardArtifact {
  const metadata = artifactMetadata(input)
  const uri = artifactUri(input)
  return {
    id: id('artifact'),
    cardId: card.id,
    ...(card.issueStep?.issueId ? { issueId: card.issueStep.issueId } : {}),
    ...(card.issueStep?.stepId ? { stepId: card.issueStep.stepId } : {}),
    kind: input.kind?.trim() || card.issueStep?.artifactKind || 'workspace_artifact',
    title: input.title?.trim() || input.name?.trim() || card.title,
    ...(input.url?.trim() ? { url: input.url.trim() } : {}),
    ...(uri ? { uri } : {}),
    ...(input.path?.trim() ? { path: input.path.trim() } : {}),
    ...(input.mimeType?.trim() ? { mimeType: input.mimeType.trim() } : {}),
    ...(input.sizeBytes ? { sizeBytes: input.sizeBytes } : {}),
    ...(input.summary?.trim() || input.description?.trim()
      ? { summary: input.summary?.trim() || input.description?.trim() }
      : {}),
    ...(metadata ? { metadata } : {}),
    createdAt: timestamp,
  }
}

function artifactMetadata(input: {
  id?: string
  workspaceFileId?: string
  workspaceNodeId?: string
  uri?: string
  url?: string
  path?: string
  metadata?: Record<string, unknown>
}) {
  const uri = artifactUri(input)
  const metadata = {
    ...(input.metadata ?? {}),
    ...(input.id?.trim() ? { externalArtifactId: input.id.trim() } : {}),
    ...(input.workspaceFileId?.trim() ? { workspaceFileId: input.workspaceFileId.trim() } : {}),
    ...(input.workspaceNodeId?.trim() ? { workspaceNodeId: input.workspaceNodeId.trim() } : {}),
    ...(isWorkspaceUri(uri) ? { workspaceUri: uri } : {}),
  }
  return Object.keys(metadata).length > 0 ? metadata : undefined
}

function applyArtifactDefaults(
  input: CardArtifactInput,
  artifact: CardArtifactInput['artifacts'][number],
) {
  return {
    id: artifact.id,
    workspaceFileId: artifact.workspaceFileId,
    workspaceNodeId: artifact.workspaceNodeId,
    kind: artifact.kind ?? input.kind,
    title: artifact.title ?? input.title,
    name: artifact.name ?? input.name,
    url: artifact.url ?? input.url,
    uri: artifact.uri ?? input.uri,
    path: artifact.path ?? input.path,
    mimeType: artifact.mimeType ?? input.mimeType,
    sizeBytes: artifact.sizeBytes ?? input.sizeBytes,
    summary: artifact.summary ?? input.summary,
    description: artifact.description ?? input.description,
    metadata: {
      ...(input.metadata ?? {}),
      ...(artifact.metadata ?? {}),
    },
  }
}

function hasWorkspaceFileReference(input: {
  workspaceFileId?: string
  workspaceNodeId?: string
  uri?: string
  url?: string
  path?: string
  metadata?: Record<string, unknown>
}) {
  const metadata = input.metadata ?? {}
  return Boolean(
    input.workspaceFileId?.trim() ||
      input.workspaceNodeId?.trim() ||
      isWorkspaceUri(input.uri) ||
      isWorkspaceUri(input.url) ||
      isWorkspaceUri(input.path) ||
      (typeof metadata.workspaceFileId === 'string' && metadata.workspaceFileId.trim()) ||
      (typeof metadata.workspaceNodeId === 'string' && metadata.workspaceNodeId.trim()) ||
      (typeof metadata.workspaceUri === 'string' && isWorkspaceUri(metadata.workspaceUri)),
  )
}

function assertArtifactsAllowed(
  card: BoardCard,
  artifacts: Array<ReturnType<typeof applyArtifactDefaults>>,
) {
  if (!card.artifactPolicy?.requireWorkspaceFileReference) return
  const missingReference = artifacts.find((artifact) => !hasWorkspaceFileReference(artifact))
  if (missingReference) {
    throw new Error(
      `workspace_file_reference_required:${missingReference.title ?? missingReference.name ?? missingReference.path ?? 'artifact'}`,
    )
  }
}

function upsertArtifacts(artifacts: BoardCardArtifact[]) {
  for (const artifact of artifacts) {
    const existingIndex = board.artifacts.findIndex((item) => item.id === artifact.id)
    if (existingIndex >= 0) board.artifacts[existingIndex] = artifact
    else board.artifacts.push(artifact)
  }
}

function upsertIssueArtifacts(artifacts: IssueStepArtifact[]) {
  upsertArtifacts(artifacts)
  for (const artifact of artifacts) {
    const existingIndex = board.issues.artifacts.findIndex((item) => item.id === artifact.id)
    if (existingIndex >= 0) board.issues.artifacts[existingIndex] = artifact
    else board.issues.artifacts.push(artifact)
  }
}

function summarizeStep(card: BoardCard) {
  const role = card.issueStep ? roleById(card.issueStep.agentRoleId) : null
  return `${role?.label ?? card.issueStep?.assigneeLabel ?? 'Buddy'} completed ${card.title} and submitted structured output for downstream steps.`
}

export async function submitIssueStepOutput(
  input: {
    cardId: string
    status?: Extract<IssueStepStatus, 'done' | 'review' | 'failed'>
    summary?: string
    artifacts?: Array<{
      kind?: string
      title?: string
      url?: string
      uri?: string
      path?: string
      mimeType?: string
      sizeBytes?: number
      summary?: string
      metadata?: Record<string, unknown>
    }>
  },
  actor: BoardPerson,
) {
  const card = board.cards.find((item) => item.id === input.cardId)
  if (!card?.issueStep) return null
  const issue = board.issues.items.find((item) => item.id === card.issueStep?.issueId)
  if (!issue) return null

  const timestamp = now()
  const requestedStatus = input.status ?? 'done'
  const summary = input.summary?.trim() || summarizeStep(card)
  const role = roleById(card.issueStep.agentRoleId)
  card.issueStep.outputSummary = summary
  card.issueStep.submittedBy = actor
  card.comments.push({
    id: id('comment'),
    body: summary,
    author: actor,
    createdAt: timestamp,
  })

  const artifacts = (input.artifacts ?? []).map((artifact) =>
    artifactInputToArtifact(artifact, card, timestamp),
  )
  if (artifacts.length > 0) {
    upsertIssueArtifacts(artifacts)
    card.issueStep.artifactIds = [
      ...new Set([
        ...(card.issueStep.artifactIds ?? []),
        ...artifacts.map((artifact) => artifact.id),
      ]),
    ]
  }

  applyCardStatus(
    card,
    requestedStatus,
    requestedStatus === 'done' ? 100 : requestedStatus === 'review' ? 72 : 10,
  )
  const status = currentCardStatus(card)
  if (role) role.status = status === 'done' ? normalizeRuntimeStatus(role.binding?.status) : 'idle'
  card.issueStep.completedAt = status === 'done' ? timestamp : null

  updateIssueStatus(issue.id)
  touch(card)

  return {
    card: structuredClone(card),
    issue: structuredClone(issue),
    artifacts: structuredClone(artifacts),
    readyCards: structuredClone(status === 'done' ? readyIssueStepCards(issue.id) : []),
  }
}

export function addCardArtifacts(input: CardArtifactInput, actor: BoardPerson) {
  const card = board.cards.find((item) => item.id === input.cardId)
  if (!card) return null
  const timestamp = now()
  const normalizedArtifacts = input.artifacts.map((artifact) =>
    applyArtifactDefaults(input, artifact),
  )
  assertArtifactsAllowed(card, normalizedArtifacts)
  const artifacts = normalizedArtifacts.map((artifact) =>
    artifactInputToCardArtifact(artifact, card, timestamp),
  )
  if (artifacts.length) {
    upsertArtifacts(artifacts)
    if (card.issueStep) {
      card.issueStep.artifactIds = [
        ...new Set([
          ...(card.issueStep.artifactIds ?? []),
          ...artifacts.map((artifact) => artifact.id),
        ]),
      ]
    }
    if (shouldMarkReadyForReview(card, artifacts)) {
      applyCardStatus(card, 'review')
    }
  }
  const summary = artifacts.length
    ? `Added ${artifacts.length} workspace artifact reference${artifacts.length === 1 ? '' : 's'}.`
    : 'No artifact references provided.'
  card.comments.push({
    id: id('comment'),
    body: summary,
    author: actor,
    createdAt: timestamp,
  })
  touch(card)
  return {
    card: structuredClone(card),
    artifacts: structuredClone(artifacts),
  }
}
