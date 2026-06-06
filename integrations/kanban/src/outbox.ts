import {
  type ShadowServerAppCommandContext,
  type ShadowServerAppInboxTaskOutbox,
} from '@shadowob/sdk'
import { shadowServerAppManifest } from './shadow-app.generated.js'
import type { BoardCard, BoardPerson, CardDispatchInput } from './types.js'

const buddyPrefix = 'buddy:'

function inboxTaskPriority(value: string | undefined) {
  if (value === 'urgent' || value === 'high' || value === 'low') return value
  return 'normal'
}

function normalizeBuddyAgentId(value: unknown) {
  if (typeof value !== 'string') return null
  let agentId = value.trim()
  if (!agentId) return null
  while (agentId.startsWith(buddyPrefix)) agentId = agentId.slice(buddyPrefix.length)
  return agentId || null
}

function inboxTaskPrivacy(value: unknown): ShadowServerAppInboxTaskOutbox['privacy'] {
  if (value && typeof value === 'object' && !Array.isArray(value) && 'dataClass' in value) {
    return value as ShadowServerAppInboxTaskOutbox['privacy']
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
  'The Coordinator should close verified work with cards.complete after dependencies and artifact contracts are satisfied; do not rely on comments alone as completion state.',
].join('\n')

const defaultDispatchRequirements = {
  capabilities: ['workspace.read', 'workspace.write'],
  tools: [
    { kind: 'shadow-cli', name: 'shadowob workspace tree', required: true },
    { kind: 'shadow-cli', name: 'shadowob workspace files search', required: true },
    { kind: 'shadow-cli', name: 'shadowob workspace files download', required: true },
    { kind: 'shadow-cli', name: 'shadowob workspace files upload', required: true },
    { kind: 'shadow-app-command', name: 'cards.update', required: true },
    { kind: 'shadow-app-command', name: 'cards.comment', required: true },
    { kind: 'shadow-app-command', name: 'cards.artifacts.add', required: true },
    { kind: 'shadow-app-command', name: 'cards.complete', required: false },
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
  submitCommand: { appKey: shadowServerAppManifest.appKey, command: 'cards.artifacts.add' },
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
  context: ShadowServerAppCommandContext,
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

export function buildCardDispatchInboxTask(input: {
  dispatch: CardDispatchInput
  card: BoardCard
  assignee: BoardPerson
  now?: number
}): ShadowServerAppInboxTaskOutbox {
  const { dispatch, card, assignee } = input
  const buddyInstructions = targetBuddyInstructions(dispatch)
  const requiresWorkspaceArtifact = dispatchRequiresWorkspaceArtifact(dispatch)
  const body =
    dispatch.body ??
    [
      card.prompt ?? card.issueStep?.prompt ?? card.description ?? card.title,
      '',
      buddyInstructions,
      '',
      `Kanban card: ${card.title} (${card.id})`,
      requiresWorkspaceArtifact
        ? workspaceArtifactInstructions
        : 'Maintain this Kanban card through cards.update/cards.comment. Create or link downstream cards when the work needs decomposition.',
    ].join('\n')

  return {
    agentId: dispatch.agentId,
    ...(dispatch.agentUserId ? { agentUserId: dispatch.agentUserId } : {}),
    ...(dispatch.assigneeLabel ? { assigneeLabel: dispatch.assigneeLabel } : {}),
    title: dispatch.title?.trim() || card.title,
    body,
    priority: dispatch.priority ?? inboxTaskPriority(card.priority),
    ...(dispatch.tags ? { tags: dispatch.tags as ShadowServerAppInboxTaskOutbox['tags'] } : {}),
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
      appKey: shadowServerAppManifest.appKey,
      cardId: card.id,
      assigneeLabel: assignee.displayName,
      updateCardCommand: 'cards.update',
      commentCommand: 'cards.comment',
      submitOutputCommand: 'cards.artifacts.add',
      completeCardCommand: 'cards.complete',
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
