import {
  createShadowSpaceAppClient,
  SHADOW_SPACE_APP_COMMAND_COMPLETED_EVENT,
  SHADOW_SPACE_APP_COMMAND_FAILED_EVENT,
  type ShadowSpaceAppCommandEventType,
  type ShadowSpaceAppInboxDelivery,
  type ShadowSpaceAppInboxDeliveryError,
  type ShadowSpaceAppResultShadow,
} from '@shadowob/sdk/bridge'
import { shadowSpaceAppManifest } from '../space-app.generated.js'
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

const shadowSpaceApp = createShadowSpaceAppClient({ appKey: shadowSpaceAppManifest.appKey })

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

export type InboxDelivery = ShadowSpaceAppInboxDelivery
export type InboxDeliveryError = ShadowSpaceAppInboxDeliveryError

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
  type: ShadowSpaceAppCommandEventType | string
  command?: string
}

export async function command<T>(commandName: string, input: unknown): Promise<T> {
  return shadowSpaceApp.command<T>(commandName, input)
}

async function ensureBuddyTaskGrant(input: { agentId?: string | null; reason: string }) {
  await shadowSpaceApp.ensureBuddyTaskGrant(input)
}

export async function listBuddyInboxes() {
  return shadowSpaceApp.listBuddyInboxes<BuddyInboxOption>({ emptyOnError: true })
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
    shadow?: ShadowSpaceAppResultShadow
  }>('submissions.create', input)
}

export function subscribeTrainerEvents(onEvent: (event: TrainerRuntimeEvent) => void) {
  let closed = false
  let source: EventSource | null = null
  if (typeof EventSource !== 'undefined') {
    void shadowSpaceApp.prepareEventStream().then((eventStream) => {
      if (closed || !eventStream) return
      source = new EventSource(eventStream)
      const handler = (event: MessageEvent) => {
        try {
          onEvent(JSON.parse(event.data || '{}') as TrainerRuntimeEvent)
        } catch {
          /* ignore malformed runtime events */
        }
      }
      source.addEventListener(SHADOW_SPACE_APP_COMMAND_COMPLETED_EVENT, handler)
      source.addEventListener(SHADOW_SPACE_APP_COMMAND_FAILED_EVENT, handler)
      source.onerror = () => {
        /* EventSource reconnects automatically. */
      }
    })
  }
  return () => {
    closed = true
    source?.close()
  }
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
