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

export type SkillLevel = 'new' | 'learning' | 'stable' | 'strong'

export interface SkillState {
  id: string
  owner: TrainerOwnerScope
  label: string
  category: string
  level: SkillLevel
  mastery: number
  attempts: number
  accepted: number
  weakSignals: string[]
  lastPracticedAt?: string
  updatedAt: string
}

export type TrainingTaskType = 'problem' | 'review' | 'check' | 'tip'
export type TrainingTaskStatus = 'todo' | 'doing' | 'done'

export interface TrainingTask {
  id: string
  type: TrainingTaskType
  title: string
  status: TrainingTaskStatus
  challengeId?: string
  challengeTitle?: string
  reason: string
  dueAt?: string
}

export interface TrainingList {
  id: string
  owner: TrainerOwnerScope
  title: string
  horizon: 'daily' | 'weekly' | 'stage'
  goal: string
  tasks: TrainingTask[]
  updatedAt: string
}

export type RecommendationKind = 'next_problem' | 'wrong_variant' | 'review' | 'special_training'
export type RecommendationStrategy = 'reinforce' | 'diversify' | 'review' | 'popular'
export type TrainerDifficultyMode = 'easy' | 'medium' | 'hard' | 'hell'

export interface Recommendation {
  id: string
  owner: TrainerOwnerScope
  kind: RecommendationKind
  strategy?: RecommendationStrategy
  challengeId: string
  challengeTitle: string
  difficulty: ChallengeDifficulty
  tags: string[]
  reason: string
  priority: number
  predictedAckRate?: number
  appPath?: string
  source?: {
    provider: 'leetcode' | 'codeforces'
    query: string
    reason: string
  }
  createdAt: string
}

export interface Tip {
  id: string
  owner: TrainerOwnerScope
  title: string
  body: string
  tags: string[]
  createdAt: string
}

export interface UnderstandingCheck {
  id: string
  owner: TrainerOwnerScope
  challengeId?: string
  question: string
  choices: string[]
  answerIndex: number
  explanation: string
  tags: string[]
  createdAt: string
}

export interface WrongProblem {
  owner: TrainerOwnerScope
  challengeId: string
  challengeTitle: string
  tags: string[]
  lastSubmissionId: string
  reason: string
  reviewCount: number
  nextReviewAt: string
  updatedAt: string
}

export interface Report {
  id: string
  owner: TrainerOwnerScope
  period: 'daily' | 'weekly' | 'stage'
  title: string
  summary: string
  signals: string[]
  createdAt: string
}

export interface TrainerSettings {
  owner: TrainerOwnerScope
  difficultyMode: TrainerDifficultyMode
  targetProblems?: number
  deadlineAt?: string
  updatedAt: string
}

export interface TrainerOverview {
  updatedAt: string
  settings: TrainerSettings
  skills: SkillState[]
  trainingLists: TrainingList[]
  recommendations: Recommendation[]
  tips: Tip[]
  checks: UnderstandingCheck[]
  wrongProblems: WrongProblem[]
  reports: Report[]
  recentSubmissions: Array<{
    id: string
    challengeId: string
    challengeTitle: string
    language: string
    status: SubmissionStatus
    outcome?: SubmissionOutcome
    score?: number
    summary?: string
    tags: string[]
    createdAt: string
  }>
  stats: {
    totalProblems: number
    attemptedProblems: number
    acceptedProblems: number
    pendingReviews: number
    weakSkills: number
    activeTasks: number
    targetProblems?: number
    targetCompleted?: number
    deadlineAt?: string
    daysRemaining?: number
  }
}

export interface TrainerState {
  updatedAt: string
  challenges: Challenge[]
  submissions: CodeSubmission[]
  skills: SkillState[]
  trainingLists: TrainingList[]
  recommendations: Recommendation[]
  tips: Tip[]
  checks: UnderstandingCheck[]
  wrongProblems: WrongProblem[]
  reports: Report[]
  settings: TrainerSettings[]
}
