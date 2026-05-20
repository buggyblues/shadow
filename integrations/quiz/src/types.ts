export interface QuizPerson {
  kind: string
  id: string
  userId?: string | null
  buddyAgentId?: string | null
  ownerId?: string | null
  displayName: string
  avatarUrl?: string | null
}

export type QuizQuestionType = 'single' | 'multiple' | 'fill' | 'short'
export type QuizAnswerValue = string | string[]

export interface QuizQuestion {
  id: string
  type: QuizQuestionType
  prompt: string
  options?: string[]
  answer: QuizAnswerValue
  points: number
  explanation?: string
}

export interface Quiz {
  id: string
  title: string
  description?: string
  questions: QuizQuestion[]
  author: QuizPerson
  createdAt: string
  updatedAt: string
}

export interface QuizSubmission {
  id: string
  quizId: string
  respondent: QuizPerson
  answers: Record<string, QuizAnswerValue>
  status: 'pending_review' | 'graded'
  autoScore: number
  maxScore: number
  score?: number
  feedback?: string
  grader?: QuizPerson
  createdAt: string
  gradedAt?: string
}

export interface QuizState {
  updatedAt: string
  quizzes: Quiz[]
  submissions: QuizSubmission[]
}
