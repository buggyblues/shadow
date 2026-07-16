import {
  createShadowSpaceAppClient,
  type ShadowBridgeLaunchContext,
  type ShadowBridgeRouteNavigateHandler,
  type ShadowSpaceAppInboxDelivery,
  type ShadowSpaceAppResultShadow,
} from '@shadowob/sdk/bridge'
import { shadowSpaceAppManifest } from '../space-app.generated.js'
import type {
  BoardCard,
  BoardCardArtifact,
  BoardCardChecklist,
  BoardCardDates,
  BoardCardLink,
  BoardState,
  BoardSummary,
} from '../types.js'
import { t } from './i18n.js'

const shadowSpaceApp = createShadowSpaceAppClient({ appKey: shadowSpaceAppManifest.appKey })

const workspaceTaskTools = [
  { kind: 'shadow-cli', name: 'shadowob workspace tree', required: true },
  { kind: 'shadow-cli', name: 'shadowob workspace files search', required: true },
  { kind: 'shadow-cli', name: 'shadowob workspace files download', required: true },
  { kind: 'shadow-cli', name: 'shadowob workspace files upload', required: true },
  { kind: 'space-app-command', name: 'cards.update', required: true },
  { kind: 'space-app-command', name: 'cards.comment', required: true },
  { kind: 'space-app-command', name: 'cards.artifacts.add', required: true },
  { kind: 'space-app-command', name: 'cards.complete', required: true },
]

const workspaceOutputContract = {
  expectedArtifacts: [
    {
      kind: 'workspace.file',
      required: true,
      fields: ['workspaceFileId', 'workspaceNodeId', 'title', 'mimeType', 'summary'],
    },
  ],
  submitCommand: { appKey: 'kanban', command: 'cards.artifacts.add' },
}

const workspaceCoordinatorInstructions = {
  artifactRule:
    'Buddies must upload reusable deliverables to the server Workspace before submitting Kanban artifact references. Use cards.artifacts.add only with workspaceFileId/workspaceNodeId references, not runtime-local paths.',
  completionRule:
    'When the assigned Inbox task reaches completed status, synchronize the source Kanban card with cards.complete and a concise summary.',
  workspaceCli: {
    info: 'shadowob workspace get <server-id-or-slug> --json',
    tree: 'shadowob workspace tree <server-id-or-slug> --json',
    search: 'shadowob workspace files search <server-id-or-slug> --search-text <text> --json',
    download:
      'shadowob workspace files download <server-id-or-slug> <workspaceFileId> --output <local-path> --json',
    upload:
      'shadowob workspace files upload <server-id-or-slug> --file <local-path> --name <name> --json',
  },
}

export interface BoardScopeInput {
  projectId?: string
  boardId?: string
}

export interface KanbanOAuthSession {
  configured: boolean
  required: boolean
  authenticated: boolean
  launchAuthenticated: boolean
  oauthAuthenticated: boolean
  reason:
    | 'launch_required'
    | 'oauth_identity_mismatch'
    | 'oauth_not_configured'
    | 'oauth_required'
    | null
  subject?: string | null
  profile: {
    id: string
    username?: string | null
    displayName?: string | null
    avatarUrl?: string | null
  } | null
  authorizeUrl: string | null
  launch: {
    active: boolean
    serverId: string
    appKey: string
    actor: {
      kind: string
      userId?: string | null
      buddyAgentId?: string | null
      ownerId?: string | null
      displayName?: string | null
      avatarUrl?: string | null
    }
  } | null
}

function urlScopeParams() {
  if (typeof window === 'undefined') return {}
  const params = new URLSearchParams(window.location.search)
  const hashQuery = window.location.hash.includes('?')
    ? new URLSearchParams(window.location.hash.slice(window.location.hash.indexOf('?') + 1))
    : null
  return {
    projectId: params.get('projectId') ?? hashQuery?.get('projectId') ?? undefined,
    boardId: params.get('boardId') ?? hashQuery?.get('boardId') ?? undefined,
  }
}

export function currentBoardScope(): BoardScopeInput {
  const scope = urlScopeParams()
  return {
    ...(scope.projectId ? { projectId: scope.projectId } : {}),
    ...(scope.boardId ? { boardId: scope.boardId } : {}),
  }
}

export function replaceBoardScope(scope: Required<BoardScopeInput>) {
  if (typeof window === 'undefined') return
  const hash = window.location.hash || '#/'
  const [hashPath = '#/', rawHashQuery = ''] = hash.split('?')
  const params = new URLSearchParams(rawHashQuery)
  params.set('projectId', scope.projectId)
  params.set('boardId', scope.boardId)
  const nextHash = `${hashPath || '#/'}?${params.toString()}`
  window.history.pushState(
    null,
    '',
    `${window.location.pathname}${window.location.search}${nextHash}`,
  )
  shadowSpaceApp.routeChanged(currentSpaceAppPath())
}

function withBoardScope<T extends Record<string, unknown>>(input: T): T & BoardScopeInput {
  return { ...currentBoardScope(), ...input }
}

async function command<T>(commandName: string, input: unknown): Promise<T> {
  return shadowSpaceApp.command<T>(commandName, input)
}

export async function getOAuthSession(
  options: { refreshLaunch?: boolean } = {},
): Promise<KanbanOAuthSession> {
  const params = new URLSearchParams({
    return_to: `${window.location.pathname}${window.location.search}${window.location.hash}`,
  })
  const response = await shadowSpaceApp.fetchWithSession(
    `/api/oauth/session?${params.toString()}`,
    {},
    options.refreshLaunch ? { refresh: { reason: 'oauth_session' } } : {},
  )
  if (!response.ok) throw new Error(await response.text().catch(() => 'OAuth session failed'))
  return response.json() as Promise<KanbanOAuthSession>
}

export async function refreshShadowLaunch(reason = 'manual_refresh') {
  return shadowSpaceApp.refreshLaunch({ reason })
}

export async function getBoard() {
  const payload = await command<{ board: BoardState }>('boards.get', currentBoardScope())
  return payload.board
}

export async function listBoards() {
  return command<{ boards: BoardSummary[] }>('boards.list', currentBoardScope())
}

export async function createBoard(input: { title: string }) {
  return command<{ board: BoardState }>('boards.create', withBoardScope(input))
}

export async function updateBoard(input: { title: string }) {
  return command<{ board: BoardState }>('boards.update', withBoardScope(input))
}

export async function deleteBoard(input: { boardId?: string } = {}) {
  return command<{ deleted: BoardSummary; nextBoard: BoardState }>(
    'boards.delete',
    withBoardScope(input),
  )
}

export async function createColumn(input: { title: string }) {
  return command<{ column: BoardState['columns'][number]; board: BoardState }>(
    'columns.create',
    withBoardScope(input),
  )
}

export async function deleteColumn(input: { columnId: string }) {
  return command<{ column: BoardState['columns'][number]; deletedCards: BoardCard[] }>(
    'columns.delete',
    withBoardScope(input),
  )
}

export function bridgeAvailable() {
  return shadowSpaceApp.bridgeAvailable()
}

export function authorizeShadowOAuth(authorizeUrl: string) {
  return shadowSpaceApp.authorizeOAuth({ authorizeUrl })
}

export function prepareLaunchEventStream() {
  return shadowSpaceApp.prepareEventStream()
}

export function onLaunchContextChange(
  handler: (context: ShadowBridgeLaunchContext) => void | Promise<void>,
) {
  return shadowSpaceApp.onLaunchContextChange(handler)
}

export function currentSpaceAppPath() {
  if (typeof window === 'undefined') return '/'
  const hash = window.location.hash || '#/'
  const rawPath = hash.startsWith('#') ? hash.slice(1) : hash
  if (!rawPath || rawPath === '/') return '/'
  return rawPath.startsWith('/') ? rawPath : `/${rawPath}`
}

export function reportSpaceAppRoute(path = currentSpaceAppPath()) {
  return shadowSpaceApp.routeChanged(path)
}

export function onSpaceAppRouteNavigate(handler: ShadowBridgeRouteNavigateHandler) {
  return shadowSpaceApp.onRouteNavigate(handler)
}

export function shareCurrentBoard(input: { title: string; description?: string }) {
  if (!shadowSpaceApp.bridgeAvailable()) throw new Error(t('bridge.unavailable'))
  return shadowSpaceApp.shareSpaceApp({
    path: currentSpaceAppPath(),
    title: input.title,
    description: input.description,
    label: t('board.openShared'),
  })
}

export interface BuddyInboxOption {
  agent: {
    id: string
    ownerId?: string | null
    status?: string | null
    user?: {
      id?: string | null
      username?: string | null
      displayName?: string | null
      avatarUrl?: string | null
    } | null
  }
  channel?: { id?: string | null; name?: string | null } | null
  canManage?: boolean
}

export async function listBuddyInboxes(input: { refresh?: boolean } = {}) {
  return shadowSpaceApp.listBuddyInboxes<BuddyInboxOption>(input)
}

export async function openBridgeBuddyCreator() {
  if (!shadowSpaceApp.bridgeAvailable()) throw new Error(t('bridge.unavailable'))
  return shadowSpaceApp.openBuddyCreator({
    landing: {
      title: t('bridge.createBuddyTitle'),
      description: t('bridge.createBuddyDescription'),
      source: 'kanban',
    },
  })
}

export async function sendCoordinatorRequest(input: {
  agentId: string
  channelId?: string | null
  assigneeLabel?: string
  assigneeAvatarUrl?: string | null
  title: string
  body: string
}) {
  const created = await createCard({
    title: input.title,
    description: input.body,
    prompt: input.body,
    labels: ['Request'],
  })
  const normalizedBody = input.body.trim()
  try {
    return await dispatchCardToBuddy({
      card: created.card,
      agentId: input.agentId,
      channelId: input.channelId,
      assigneeLabel: input.assigneeLabel,
      assigneeAvatarUrl: input.assigneeAvatarUrl,
      title: input.title,
      body: [
        normalizedBody && normalizedBody !== input.title.trim() ? normalizedBody : '',
        'Use this Kanban card as the tracked coordination request. Move cards between lists with cards.move or cards.update, add notes with cards.comment, create downstream cards with cards.create, link dependencies with cards.link, and close completed source work with cards.complete.',
      ]
        .filter(Boolean)
        .join('\n\n'),
      requirements: {
        capabilities: ['kanban.cards:write', 'buddy_inbox:deliver', 'workspace.read'],
        tools: [
          { kind: 'space-app-command', name: 'cards.create', required: true },
          { kind: 'space-app-command', name: 'cards.link', required: true },
          { kind: 'space-app-command', name: 'cards.dispatch', required: true },
          { kind: 'space-app-command', name: 'cards.update', required: true },
          { kind: 'space-app-command', name: 'cards.comment', required: true },
          { kind: 'space-app-command', name: 'cards.complete', required: true },
        ],
      },
      outputContract: null,
      privacy: { dataClass: 'server-private', redactionRequired: true },
      data: {
        requestKind: 'kanban.coordination',
        targetInboxChannelId: input.channelId ?? null,
        coordinatorInstructions: {
          createCardCommand: 'cards.create',
          linkCardsCommand: 'cards.link',
          dispatchCardCommand: 'cards.dispatch',
          updateCardCommand: 'cards.update',
          commentCommand: 'cards.comment',
          completeCardCommand: 'cards.complete',
          boardCommand: 'boards.get',
          boundary:
            'Kanban stores Trello-style task cards, list position, links, comments, and workspace artifact references only. Buddies own planning, domain execution, runtime work, and downstream Inbox routing.',
        },
      },
    })
  } catch (error) {
    await deleteCard({ cardId: created.card.id }).catch(() => undefined)
    throw error
  }
}

function cardDispatchPriority(priority: BoardCard['priority']) {
  if (priority === 'high') return 'high'
  if (priority === 'medium') return 'medium'
  if (priority === 'low') return 'low'
  return 'normal'
}

type CardDispatchResult = {
  card: BoardCard
  deferred?: unknown
  shadow?: ShadowSpaceAppResultShadow
  delivery?: ShadowSpaceAppInboxDelivery | null
}

export async function dispatchCardToBuddy(input: {
  card: BoardCard
  agentId: string
  channelId?: string | null
  assigneeLabel?: string
  assigneeAvatarUrl?: string | null
  title?: string
  body?: string
  requirements?: Record<string, unknown> | null
  outputContract?: Record<string, unknown> | null
  privacy?: Record<string, unknown> | null
  data?: Record<string, unknown> | null
}) {
  const grant = await shadowSpaceApp
    .ensureBuddyTaskGrant({
      agentId: input.agentId,
      reason: t('bridge.buddyGrantReason'),
      timeoutMs: 6_000,
    })
    .catch((error) => {
      const detail = error instanceof Error && error.message ? `: ${error.message}` : ''
      throw new Error(`${t('bridge.buddyGrantFailed')}${detail}`)
    })
  if (!('skipped' in grant && grant.skipped) && !grant.granted) {
    throw new Error(t('bridge.buddyGrantDenied'))
  }
  const { card } = input
  const body =
    input.body ??
    [
      card.prompt ?? card.issueStep?.prompt ?? card.description ?? card.title,
      '',
      'Use this Kanban card as task context. Work in your Inbox, keep progress visible with cards.update/cards.comment, submit artifact references when required, and close completed source work with cards.complete.',
    ].join('\n')

  const result = await command<CardDispatchResult>(
    'cards.dispatch',
    withBoardScope({
      cardId: card.id,
      agentId: input.agentId,
      assigneeLabel: input.assigneeLabel,
      ...(input.assigneeAvatarUrl ? { assigneeAvatarUrl: input.assigneeAvatarUrl } : {}),
      title: input.title ?? card.title,
      body,
      priority: cardDispatchPriority(card.priority),
      idempotencyKey: `kanban:card:${card.id}:manual:${input.agentId}:${Date.now()}`,
      requirements:
        input.requirements === undefined
          ? {
              capabilities: ['workspace.read', 'workspace.write'],
              tools: workspaceTaskTools,
            }
          : input.requirements,
      outputContract:
        input.outputContract === undefined ? workspaceOutputContract : input.outputContract,
      privacy: input.privacy ?? { dataClass: 'server-private', redactionRequired: true },
      data: {
        ...(input.data ?? {}),
        copilotMode: true,
        targetInboxChannelId: input.channelId ?? null,
        assigneeLabel: input.assigneeLabel,
        submitOutputCommand: 'cards.artifacts.add',
        updateCardCommand: 'cards.update',
        commentCommand: 'cards.comment',
        completeCardCommand: 'cards.complete',
        ...workspaceCoordinatorInstructions,
      },
    }),
  )
  const delivery = shadowSpaceApp.inboxDeliveries(result)[0] ?? null
  // Product contract: dispatch itself stays on the Space App backend -> Shadow path.
  // Bridge is used only after delivery to open the host Copilot context for the created task card.
  if (delivery && shadowSpaceApp.bridgeAvailable())
    await shadowSpaceApp.openCopilot(delivery).catch(() => undefined)
  return { ...result, delivery }
}

export function createCard(input: {
  title: string
  columnId?: string
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
  priority?: BoardCard['priority']
  assignee?: string
}) {
  return command<{ card: BoardCard }>('cards.create', withBoardScope(input))
}

export function updateCard(input: {
  cardId: string
  title?: string
  columnId?: string
  description?: string
  prompt?: string
  labels?: string[]
  labelIds?: string[]
  dates?: BoardCardDates
  dueDate?: string | null
  startDate?: string | null
  dueComplete?: boolean
  checklists?: BoardCardChecklist[]
  priority?: BoardCard['priority']
}) {
  return command<{ card: BoardCard }>('cards.update', withBoardScope(input))
}

export function moveCard(input: { cardId: string; columnId: string }) {
  return command<{ card: BoardCard }>('cards.move', withBoardScope(input))
}

export function deleteCard(input: { cardId: string }) {
  return command<{ card: BoardCard }>('cards.delete', withBoardScope(input))
}

export function assignCard(input: { cardId: string; assignee?: string }) {
  return command<{ card: BoardCard }>('cards.assign', withBoardScope(input))
}

export function commentCard(input: { cardId: string; body: string }) {
  return command<{ card: BoardCard; shadow?: ShadowSpaceAppResultShadow }>(
    'cards.comment',
    withBoardScope(input),
  )
}

export function deleteComment(input: { cardId: string; commentId: string }) {
  return command<{ card: BoardCard }>('cards.comments.delete', withBoardScope(input))
}

export function linkCards(input: {
  sourceCardId: string
  targetCardId: string
  kind?: string
  label?: string
  metadata?: Record<string, unknown>
}) {
  return command<{ link: BoardCardLink; sourceCard: BoardCard; targetCard: BoardCard }>(
    'cards.link',
    withBoardScope(input),
  )
}

export function rerunCard(input: { cardId: string; prompt?: string; reason?: string }) {
  return command<{ card: BoardCard }>('cards.rerun', withBoardScope(input))
}

export function addCardArtifacts(input: {
  cardId: string
  artifacts: Array<{
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
}) {
  return command<{
    card: BoardCard
    artifacts: BoardCardArtifact[]
  }>('cards.artifacts.add', withBoardScope(input))
}

export async function openWorkspaceArtifact(input: BoardCardArtifact) {
  if (!shadowSpaceApp.bridgeAvailable()) return false
  const metadata = input.metadata ?? {}
  const workspaceUri = input.uri?.startsWith('workspace://')
    ? input.uri
    : typeof metadata.workspaceUri === 'string' && metadata.workspaceUri.startsWith('workspace://')
      ? metadata.workspaceUri
      : input.path?.startsWith('workspace://')
        ? input.path
        : input.url?.startsWith('workspace://')
          ? input.url
          : undefined
  await shadowSpaceApp.openWorkspaceResource({
    resource: {
      uri: workspaceUri ?? input.uri,
      workspaceFileId:
        typeof metadata.workspaceFileId === 'string' ? metadata.workspaceFileId : undefined,
      workspaceNodeId:
        typeof metadata.workspaceNodeId === 'string' ? metadata.workspaceNodeId : undefined,
      path: input.path?.startsWith('workspace://') ? undefined : input.path,
      title: input.title,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
    },
  })
  return true
}
