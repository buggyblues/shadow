import {
  createShadowServerAppClient,
  SHADOW_SERVER_APP_COMMAND_COMPLETED_EVENT,
  SHADOW_SERVER_APP_COMMAND_FAILED_EVENT,
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

const shadowApp = createShadowServerAppClient()

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

export async function command<T>(commandName: string, input: unknown): Promise<T> {
  return shadowApp.command<T>(commandName, input)
}

async function ensureBuddyTaskGrant(input: { agentId?: string | null; reason: string }) {
  await shadowApp.ensureBuddyTaskGrant(input)
}

export async function listBuddyInboxes() {
  return shadowApp.listBuddyInboxes<BuddyInboxOption>({ emptyOnError: true })
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

export async function createSubmission(input: {
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
  await ensureBuddyTaskGrant({
    agentId: input.reviewer?.agentId,
    reason: 'Code Trainer sends review tasks to this Buddy Inbox.',
  })
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
