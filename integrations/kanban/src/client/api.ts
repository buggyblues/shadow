import {
  ShadowBridge,
  type ShadowServerAppInboxDelivery,
  type ShadowServerAppResultShadow,
} from '@shadowob/sdk/bridge'
import type { BoardCard, BoardCardArtifact, BoardCardLink, BoardState } from '../types.js'

type CommandPayload<T> = { ok?: boolean; result?: T; error?: string } & T
const bridge = new ShadowBridge({ appKey: 'kanban' })

const workspaceTaskTools = [
  { kind: 'shadow-cli', name: 'shadowob workspace tree', required: true },
  { kind: 'shadow-cli', name: 'shadowob workspace files search', required: true },
  { kind: 'shadow-cli', name: 'shadowob workspace files download', required: true },
  { kind: 'shadow-cli', name: 'shadowob workspace files upload', required: true },
  { kind: 'shadow-app-command', name: 'cards.update', required: true },
  { kind: 'shadow-app-command', name: 'cards.comment', required: true },
  { kind: 'shadow-app-command', name: 'cards.artifacts.add', required: true },
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

async function command<T>(commandName: string, input: unknown): Promise<T> {
  if (bridge.isAvailable()) return bridge.command(commandName, input) as Promise<T>

  const res = await fetch(`/api/local/commands/${encodeURIComponent(commandName)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input }),
  })
  const payload = (await res.json()) as CommandPayload<T>
  if (!res.ok || payload.ok === false) throw new Error(payload.error || 'Command failed')
  return bridge.unwrapCommandPayload<T>(payload)
}

export async function getBoard() {
  const payload = await command<{ board: BoardState }>('boards.get', {})
  return payload.board
}

export function bridgeAvailable() {
  return bridge.isAvailable()
}

export async function listBridgeInboxes() {
  if (!bridge.isAvailable()) return null
  return bridge.inboxes()
}

export async function openBridgeBuddyCreator() {
  if (!bridge.isAvailable()) throw new Error('Shadow bridge unavailable')
  return bridge.openBuddyCreator({
    landing: {
      title: 'Create a Buddy for this board',
      description:
        'Create a server Buddy, then return to this board and select it as a coordinator or card assignee.',
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
  if (!bridge.isAvailable()) throw new Error('Shadow bridge unavailable')
  const created = await createCard({
    title: input.title,
    description: input.body,
    prompt: input.body,
    labels: ['Request'],
    status: 'queued',
  })
  return dispatchCardToBuddy({
    card: created.card,
    agentId: input.agentId,
    channelId: input.channelId,
    assigneeLabel: input.assigneeLabel,
    assigneeAvatarUrl: input.assigneeAvatarUrl,
    title: input.title,
    body: [
      input.body,
      '',
      'Use this Kanban card as the tracked coordination request. Maintain status with cards.update/cards.comment, create generic downstream cards with cards.create, link dependencies with cards.link, and route actual work through Buddy Inbox.',
    ].join('\n'),
    requirements: {
      capabilities: ['kanban.cards:write', 'buddy_inbox:deliver', 'workspace.read'],
      tools: [
        { kind: 'shadow-bridge', name: 'inbox.list', required: true },
        { kind: 'shadow-app-command', name: 'cards.create', required: true },
        { kind: 'shadow-app-command', name: 'cards.link', required: true },
        { kind: 'shadow-app-command', name: 'cards.dispatch', required: true },
        { kind: 'shadow-app-command', name: 'cards.update', required: true },
        { kind: 'shadow-app-command', name: 'cards.comment', required: true },
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
        boardCommand: 'boards.get',
        boundary:
          'Kanban stores generic task cards, links, status, and workspace artifact references only. Buddies own planning, domain execution, runtime work, and downstream Inbox routing.',
      },
    },
  })
}

function cardDispatchPriority(priority: BoardCard['priority']) {
  if (priority === 'urgent') return 'urgent'
  if (priority === 'high') return 'high'
  if (priority === 'low') return 'low'
  return 'normal'
}

type CardDispatchResult = {
  card: BoardCard
  deferred?: unknown
  shadow?: ShadowServerAppResultShadow
  delivery?: ShadowServerAppInboxDelivery | null
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
  const { card } = input
  const body =
    input.body ??
    [
      card.prompt ?? card.issueStep?.prompt ?? card.description ?? card.title,
      '',
      'Use this Kanban card as task context. Work in your Inbox, then return progress or artifact references to Kanban through the available app commands.',
    ].join('\n')

  const result = await command<CardDispatchResult>('cards.dispatch', {
    cardId: card.id,
    agentId: input.agentId,
    assigneeLabel: input.assigneeLabel,
    assigneeAvatarUrl: input.assigneeAvatarUrl,
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
      ...workspaceCoordinatorInstructions,
    },
  })
  const delivery = bridge.inboxDeliveries(result)[0] ?? null
  if (delivery) await bridge.openCopilot(delivery).catch(() => undefined)
  return { ...result, delivery }
}

export function createCard(input: {
  title: string
  columnId?: string
  description?: string
  prompt?: string
  label?: string
  labels?: string[]
  priority?: BoardCard['priority']
  progress?: number
  status?: BoardCard['status']
  assignee?: string
}) {
  return command<{ card: BoardCard }>('cards.create', input)
}

export function updateCard(input: {
  cardId: string
  title?: string
  columnId?: string
  description?: string
  prompt?: string
  labels?: string[]
  priority?: BoardCard['priority']
  progress?: number
  status?: BoardCard['status']
}) {
  return command<{ card: BoardCard }>('cards.update', input)
}

export function moveCard(input: { cardId: string; columnId: string }) {
  return command<{ card: BoardCard }>('cards.move', input)
}

export function assignCard(input: { cardId: string; assignee?: string }) {
  return command<{ card: BoardCard }>('cards.assign', input)
}

export function commentCard(input: { cardId: string; body: string }) {
  return command<{ card: BoardCard; shadow?: ShadowServerAppResultShadow }>('cards.comment', input)
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
    input,
  )
}

export function rerunCard(input: { cardId: string; prompt?: string; reason?: string }) {
  return command<{ card: BoardCard }>('cards.rerun', input)
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
  }>('cards.artifacts.add', input)
}

export async function openWorkspaceArtifact(input: BoardCardArtifact) {
  if (!bridge.isAvailable()) return false
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
  await bridge.openWorkspaceResource({
    resource: {
      uri: workspaceUri ?? input.uri,
      workspaceFileId:
        typeof metadata.workspaceFileId === 'string' ? metadata.workspaceFileId : undefined,
      workspaceNodeId:
        typeof metadata.workspaceNodeId === 'string' ? metadata.workspaceNodeId : undefined,
      path: input.path?.startsWith('workspace://') ? undefined : input.path,
      title: input.title,
    },
  })
  return true
}
