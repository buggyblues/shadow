import {
  type ShadowSpaceAppCommandContext,
  type ShadowSpaceAppInboxTaskOutbox,
} from '@shadowob/sdk'
import { shadowSpaceAppManifest } from './space-app.generated.js'
import type { BoardCard, BoardPerson, CardDispatchInput } from './types.js'

const buddyPrefix = 'buddy:'

function inboxTaskPriority(value: string | undefined) {
  if (value === 'low' || value === 'normal' || value === 'medium' || value === 'high') return value
  return 'normal'
}

function normalizeBuddyAgentId(value: unknown) {
  if (typeof value !== 'string') return null
  let agentId = value.trim()
  if (!agentId) return null
  while (agentId.startsWith(buddyPrefix)) agentId = agentId.slice(buddyPrefix.length)
  return agentId || null
}

function inboxTaskPrivacy(value: unknown): ShadowSpaceAppInboxTaskOutbox['privacy'] {
  if (value && typeof value === 'object' && !Array.isArray(value) && 'dataClass' in value) {
    return value as ShadowSpaceAppInboxTaskOutbox['privacy']
  }
  return { dataClass: 'server-private', redactionRequired: true }
}

function recordOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function optionalRecord(value: unknown): Record<string, unknown> | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  return recordOrNull(value)
}

const workspaceArtifactInstructions = [
  'Work in your Buddy Inbox. Use Kanban only for task state and artifact references.',
  'Use cards.update/cards.comment for progress and notes.',
  'For files that another Buddy or the human must use, upload the local file to the server Workspace before submitting it: `shadowob workspace files upload <server-id-or-slug> --file <local-path> --name <name> --json`.',
  'Use `shadowob workspace tree <server-id-or-slug> --json`, `shadowob workspace files search <server-id-or-slug> --search-text <text> --json`, and `shadowob workspace files download <server-id-or-slug> <workspaceFileId> --output <local-path> --json` to discover and reuse peer outputs.',
  'Then call cards.artifacts.add with kind `workspace.file`, the returned workspaceFileId/workspaceNodeId, name/title, mimeType, sizeBytes when known, and a short summary. Do not submit runtime-local paths like /home/shadow/... as the final artifact reference.',
  'Close verified work with cards.complete after dependencies and artifact contracts are satisfied; comments alone are not completion state.',
].join('\n')

const defaultDispatchRequirements = {
  capabilities: ['workspace.read', 'workspace.write'],
  tools: [
    { kind: 'shadow-cli', name: 'shadowob workspace tree', required: true },
    { kind: 'shadow-cli', name: 'shadowob workspace files search', required: true },
    { kind: 'shadow-cli', name: 'shadowob workspace files download', required: true },
    { kind: 'shadow-cli', name: 'shadowob workspace files upload', required: true },
    { kind: 'space-app-command', name: 'cards.update', required: true },
    { kind: 'space-app-command', name: 'cards.comment', required: true },
    { kind: 'space-app-command', name: 'cards.artifacts.add', required: true },
    { kind: 'space-app-command', name: 'cards.complete', required: true },
  ],
}

const defaultDispatchOutputContract = {
  expectedArtifacts: [
    {
      kind: 'workspace.file',
      required: true,
      fields: ['workspaceFileId', 'workspaceNodeId', 'title', 'mimeType', 'summary'],
    },
  ],
  submitCommand: { appKey: shadowSpaceAppManifest.appKey, command: 'cards.artifacts.add' },
}

function dispatchRequiresWorkspaceArtifact(dispatch: CardDispatchInput) {
  return dispatch.outputContract !== null
}

function taskRequirements(dispatch: CardDispatchInput) {
  return dispatch.requirements === null
    ? undefined
    : (dispatch.requirements ?? defaultDispatchRequirements)
}

function taskOutputContract(dispatch: CardDispatchInput) {
  return dispatch.outputContract === null
    ? undefined
    : (dispatch.outputContract ?? defaultDispatchOutputContract)
}

export function normalizeDispatchInput(input: {
  cardId: string
  agentId: string
  [key: string]: unknown
}): CardDispatchInput {
  return {
    ...input,
    requirements: optionalRecord(input.requirements),
    outputContract: optionalRecord(input.outputContract),
    privacy: optionalRecord(input.privacy),
    data: optionalRecord(input.data),
  } as CardDispatchInput
}

export function enrichDispatchInputFromContext(
  input: CardDispatchInput,
  context: ShadowSpaceAppCommandContext,
): CardDispatchInput {
  const agentId = normalizeBuddyAgentId(input.agentId)
  if (!agentId) return input
  const buddy = context.resources?.buddies?.find(
    (item) => normalizeBuddyAgentId(item.agentId) === agentId,
  )
  if (!buddy) return input
  const assigneeLabel =
    input.assigneeLabel?.trim() || buddy.displayName || buddy.username || agentId
  const targetBuddy = {
    agentId,
    userId: buddy.userId,
    displayName: assigneeLabel,
    ...(buddy.description ? { description: buddy.description } : {}),
  }
  return {
    ...input,
    agentUserId: input.agentUserId ?? buddy.userId,
    assigneeLabel,
    assigneeAvatarUrl: input.assigneeAvatarUrl ?? buddy.avatarUrl ?? null,
    data: {
      ...(input.data ?? {}),
      targetBuddy: input.data?.targetBuddy ?? targetBuddy,
    },
  }
}

function targetBuddyInstructions(dispatch: CardDispatchInput) {
  const targetBuddy = dispatch.data?.targetBuddy
  if (!targetBuddy || typeof targetBuddy !== 'object' || Array.isArray(targetBuddy)) return null
  const description =
    'description' in targetBuddy && typeof targetBuddy.description === 'string'
      ? targetBuddy.description.trim()
      : ''
  if (!description) return null
  const displayName =
    'displayName' in targetBuddy && typeof targetBuddy.displayName === 'string'
      ? targetBuddy.displayName.trim()
      : dispatch.assigneeLabel?.trim()
  return [
    `Target Buddy capability hints${displayName ? ` (${displayName})` : ''}:`,
    description,
    'Follow these target Buddy runtime hints before choosing heavier fallback tools.',
  ].join('\n')
}

function cardTaskBody(input: {
  dispatch: CardDispatchInput
  card: BoardCard
  buddyInstructions: string | null
  requiresWorkspaceArtifact: boolean
}) {
  const { dispatch, card, buddyInstructions, requiresWorkspaceArtifact } = input
  if (dispatch.body) return dispatch.body
  return [
    card.prompt ?? card.issueStep?.prompt ?? card.description ?? card.title,
    '',
    buddyInstructions,
    '',
    `Kanban card: ${card.title} (${card.id})`,
    [
      'Kanban synchronization contract:',
      '- Keep progress visible with cards.update or cards.comment when useful.',
      '- When the work is ready to close, call cards.complete with this card id and a concise summary.',
      '- The Inbox task also carries a status hook for completed; when shadowob inbox update reports that hook, run its CLI command to synchronize Kanban.',
    ].join('\n'),
    requiresWorkspaceArtifact
      ? workspaceArtifactInstructions
      : 'Create or link downstream cards when the work needs decomposition.',
  ].join('\n')
}

function sourceCardSnapshot(card: BoardCard) {
  return {
    id: card.id,
    title: card.title,
    ...(card.description ? { description: card.description } : {}),
    ...(card.prompt ? { prompt: card.prompt } : {}),
    ...(card.priority ? { priority: card.priority } : {}),
    ...(card.labels?.length ? { labels: card.labels } : {}),
    ...(card.columnId ? { columnId: card.columnId } : {}),
    ...(card.issueStep ? { issueStep: card.issueStep } : {}),
  }
}

export function buildCardDispatchInboxTask(input: {
  dispatch: CardDispatchInput
  card: BoardCard
  assignee: BoardPerson
  now?: number
}): ShadowSpaceAppInboxTaskOutbox {
  const { dispatch, card, assignee } = input
  const buddyInstructions = targetBuddyInstructions(dispatch)
  const requiresWorkspaceArtifact = dispatchRequiresWorkspaceArtifact(dispatch)
  const body = cardTaskBody({ dispatch, card, buddyInstructions, requiresWorkspaceArtifact })

  return {
    agentId: dispatch.agentId,
    ...(dispatch.agentUserId ? { agentUserId: dispatch.agentUserId } : {}),
    ...(dispatch.assigneeLabel ? { assigneeLabel: dispatch.assigneeLabel } : {}),
    title: dispatch.title?.trim() || card.title,
    body,
    priority: dispatch.priority ?? inboxTaskPriority(card.priority),
    ...(dispatch.tags ? { tags: dispatch.tags as ShadowSpaceAppInboxTaskOutbox['tags'] } : {}),
    idempotencyKey:
      dispatch.idempotencyKey ??
      `kanban:card:${card.id}:dispatch:${dispatch.agentId}:${input.now ?? Date.now()}`,
    resource: {
      kind: 'kanban.card',
      id: card.id,
      label: card.title,
      url: `/shadow/server#/cards/${card.id}`,
    },
    requirements: taskRequirements(dispatch),
    outputContract: taskOutputContract(dispatch),
    privacy: inboxTaskPrivacy(dispatch.privacy),
    data: {
      ...(dispatch.data ?? {}),
      boardId: 'kanban',
      appKey: shadowSpaceAppManifest.appKey,
      cardId: card.id,
      assigneeLabel: assignee.displayName,
      updateCardCommand: 'cards.update',
      commentCommand: 'cards.comment',
      submitOutputCommand: 'cards.artifacts.add',
      completeCardCommand: 'cards.complete',
      sourceCard: sourceCardSnapshot(card),
      statusHooks: [
        {
          id: `kanban:${card.id}:completed`,
          kind: 'space_app_command',
          trigger: { event: 'task.status', status: 'completed', phase: 'after' },
          required: true,
          appKey: shadowSpaceAppManifest.appKey,
          command: 'cards.complete',
          input: { boardId: 'kanban', cardId: card.id, summary: '<short result>' },
          instruction: 'Sync the Kanban source card after the Inbox task reaches completed status.',
        },
      ],
      workspaceArtifactRequired: requiresWorkspaceArtifact,
      workspaceReferenceFields: ['workspaceFileId', 'workspaceNodeId'],
      workspaceCli: {
        info: 'shadowob workspace get <server-id-or-slug> --json',
        tree: 'shadowob workspace tree <server-id-or-slug> --json',
        search: 'shadowob workspace files search <server-id-or-slug> --search-text <text> --json',
        download:
          'shadowob workspace files download <server-id-or-slug> <workspaceFileId> --output <local-path> --json',
        upload:
          'shadowob workspace files upload <server-id-or-slug> --file <local-path> --name <name> --json',
      },
    },
    required: true,
  }
}
