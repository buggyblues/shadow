export interface TrainerPerson {
  kind: string
  id: string
  userId?: string | null
  buddyAgentId?: string | null
  ownerId?: string | null
  displayName: string
  avatarUrl?: string | null
}

export interface ChallengeExample {
  input: string
  output: string
  explanation?: string
}

export interface ChallengeTestCase {
  id: string
  description?: string
  input: string
  expected: string
  visibility: 'visible' | 'hidden'
}

export interface ChallengeSource {
  provider: 'seed' | 'exercism' | 'leetcode' | 'codeforces' | 'manual'
  id: string
  url?: string
  importedAt?: string
}

export interface TrainerOwnerScope {
  ownerKey: string
  serverId: string
  userId: string
}

export type ChallengeDifficulty = 'easy' | 'medium' | 'hard'
export type TrainerLanguage = 'javascript' | 'typescript' | 'python'

export interface Challenge {
  id: string
  title: string
  difficulty: ChallengeDifficulty
  tags: string[]
  prompt: string
  starterCode: string
  examples: ChallengeExample[]
  testCases?: ChallengeTestCase[]
  judgeInstructions: string
  source?: ChallengeSource
  owner?: TrainerOwnerScope
  createdAt?: string
  updatedAt?: string
}

export type SubmissionStatus = 'submitted' | 'analyzed'
export type SubmissionOutcome = 'accepted' | 'needs_work' | 'runtime_error' | 'incomplete'
export type SubmissionReviewFocus = 'standard' | 'interview' | 'debug' | 'complexity'
export type SubmissionCoachingFocus =
  | 'reasoning'
  | 'edge_cases'
  | 'complexity'
  | 'communication'
  | 'follow_ups'
  | 'debugging'

export interface SubmissionAnalysis {
  outcome: SubmissionOutcome
  score: number
  summary: string
  explanation: string
  suggestions: string[]
  complexity?: string
  analyzer: TrainerPerson
  analyzedAt: string
}

export interface SubmissionReviewRequest {
  agentId?: string
  assigneeLabel?: string
  displayName?: string
  reviewFocus?: SubmissionReviewFocus
  coachingFocuses?: SubmissionCoachingFocus[]
  locale?: string
  requestedAt: string
}

export interface CodeSubmission {
  id: string
  challengeId: string
  owner: TrainerOwnerScope
  author: TrainerPerson
  language: TrainerLanguage | string
  code: string
  status: SubmissionStatus
  reviewRequest?: SubmissionReviewRequest
  analysis?: SubmissionAnalysis
  createdAt: string
}

export interface TrainerState {
  updatedAt: string
  challenges: Challenge[]
  submissions: CodeSubmission[]
}
