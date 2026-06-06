import {
  SHADOW_SERVER_APP_COMMAND_COMPLETED_EVENT,
  SHADOW_SERVER_APP_COMMAND_FAILED_EVENT,
  ShadowBridge,
  type ShadowServerAppCommandEventType,
  type ShadowServerAppInboxDelivery,
  type ShadowServerAppInboxDeliveryError,
  type ShadowServerAppResultShadow,
} from '@shadowob/sdk/bridge'
import type {
  Challenge,
  CodeSubmission,
  SubmissionCoachingFocus,
  SubmissionOutcome,
  SubmissionReviewFocus,
  TrainerDifficultyMode,
  TrainerOverview,
  TrainerSettings,
} from '../types.js'

type CommandPayload<T> = { ok?: boolean; result?: T; error?: string } & T

export interface BuddyInboxOption {
  agent: {
    id: string
    ownerId?: string | null
    status?: string | null
    user?: {
      id?: string
      username?: string | null
      displayName?: string | null
      avatarUrl?: string | null
    } | null
  }
  channel?: { id?: string; name?: string | null } | null
  canManage?: boolean
}

export type InboxDelivery = ShadowServerAppInboxDelivery
export type InboxDeliveryError = ShadowServerAppInboxDeliveryError

export interface ProblemSource {
  provider: 'leetcode' | 'codeforces'
  id: string
  title: string
  difficulty?: Challenge['difficulty']
  description?: string
  url?: string
}

export interface ProblemSourcePageInfo {
  offset: number
  limit: number
  total: number
  hasMore: boolean
}

export interface TrainerRuntimeEvent {
  type: ShadowServerAppCommandEventType | string
  command?: string
}

const bridge = new ShadowBridge({ appKey: 'trainer' })

function toCommandInput(value: unknown): unknown {
  if (value === undefined) return {}
  if (Array.isArray(value)) return value.map(toCommandInput)
  if (!value || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [key, toCommandInput(entry)]),
  )
}

export async function command<T>(commandName: string, input: unknown): Promise<T> {
  const commandInput = toCommandInput(input)
  if (bridge.isAvailable()) return bridge.command(commandName, commandInput) as Promise<T>

  const res = await fetch(`/api/local/commands/${encodeURIComponent(commandName)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: commandInput }),
  })
  const payload = (await res.json()) as CommandPayload<T>
  if (!res.ok || payload.ok === false) throw new Error(payload.error || 'Command failed')
  return bridge.unwrapCommandPayload<T>(payload)
}

export async function listBuddyInboxes() {
  if (!bridge.isAvailable()) return { inboxes: [] as BuddyInboxOption[] }
  return bridge.inboxes() as Promise<{ inboxes: BuddyInboxOption[] }>
}

export function listChallenges(input: {
  query?: string
  difficulty?: Challenge['difficulty']
  tag?: string
}) {
  return command<{ challenges: Challenge[] }>('challenges.list', input)
}

export function getChallenge(challengeId: string) {
  return command<{ challenge: Challenge; submissions: CodeSubmission[] }>('challenges.get', {
    challengeId,
  })
}

export function upsertChallenge(input: {
  id?: string
  title: string
  difficulty: Challenge['difficulty']
  tags?: string[]
  prompt: string
  starterCode: string
  examples?: Challenge['examples']
  judgeInstructions: string
}) {
  return command<{ challenge: Challenge }>('challenges.upsert', input)
}

export function searchProblemSources(input: {
  provider?: ProblemSource['provider']
  query?: string
  limit?: number
  offset?: number
}) {
  return command<{ sources: ProblemSource[]; pageInfo: ProblemSourcePageInfo }>(
    'sources.search',
    input,
  )
}

export function importProblemSource(input: {
  provider?: ProblemSource['provider']
  sourceId: string
}) {
  return command<{ challenge: Challenge }>('sources.import', input)
}

export function createSubmission(input: {
  challengeId: string
  language: string
  code: string
  reviewer?: {
    agentId?: string
    assigneeLabel?: string
    displayName?: string
    reviewFocus?: SubmissionReviewFocus
    coachingFocuses?: SubmissionCoachingFocus[]
    locale?: string
  }
}) {
  return command<{
    submission: CodeSubmission
    shadow?: ShadowServerAppResultShadow
  }>('submissions.create', input)
}

export function subscribeTrainerEvents(onEvent: (event: TrainerRuntimeEvent) => void) {
  const eventStream = new URLSearchParams(location.search).get('shadow_event_stream')
  if (!eventStream || typeof EventSource === 'undefined') return () => {}
  const source = new EventSource(eventStream)
  const handler = (event: MessageEvent) => {
    try {
      onEvent(JSON.parse(event.data || '{}') as TrainerRuntimeEvent)
    } catch {
      /* ignore malformed runtime events */
    }
  }
  source.addEventListener(SHADOW_SERVER_APP_COMMAND_COMPLETED_EVENT, handler)
  source.addEventListener(SHADOW_SERVER_APP_COMMAND_FAILED_EVENT, handler)
  source.onerror = () => {
    /* EventSource reconnects automatically. */
  }
  return () => source.close()
}

export function listSubmissions(input: {
  challengeId?: string
  status?: CodeSubmission['status']
  limit?: number
}) {
  return command<{ submissions: CodeSubmission[] }>('submissions.list', input)
}

export function getSubmission(submissionId: string) {
  return command<{ submission: CodeSubmission; challenge?: Challenge }>('submissions.get', {
    submissionId,
  })
}

export function pendingSubmissions(input: { limit?: number }) {
  return command<{ submissions: Array<{ submission: CodeSubmission; challenge: Challenge }> }>(
    'submissions.pending',
    input,
  )
}

export function analyzeSubmission(input: {
  submissionId: string
  outcome: SubmissionOutcome
  score: number
  summary: string
  explanation: string
  suggestions?: string[]
  complexity?: string
}) {
  return command<{ submission: CodeSubmission }>('submissions.analyze', input)
}

export function getLearningOverview() {
  return command<{ overview: TrainerOverview }>('learning.overview', {})
}

export function updateTrainerSettings(input: {
  difficultyMode?: TrainerDifficultyMode
  targetProblems?: number
  deadlineAt?: string
}) {
  return command<{ settings: TrainerSettings }>('settings.upsert', input)
}
