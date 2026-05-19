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

export interface Challenge {
  id: string
  title: string
  difficulty: 'easy' | 'medium' | 'hard'
  tags: string[]
  prompt: string
  starterCode: string
  examples: ChallengeExample[]
  judgeInstructions: string
}

export type SubmissionStatus = 'submitted' | 'judged'
export type SubmissionVerdict = 'accepted' | 'wrong_answer' | 'runtime_error' | 'needs_review'

export interface CodeSubmission {
  id: string
  challengeId: string
  author: TrainerPerson
  language: string
  code: string
  status: SubmissionStatus
  verdict?: SubmissionVerdict
  score?: number
  feedback?: string
  suggestions?: string[]
  grader?: TrainerPerson
  createdAt: string
  judgedAt?: string
}

export interface TrainerState {
  updatedAt: string
  submissions: CodeSubmission[]
}
