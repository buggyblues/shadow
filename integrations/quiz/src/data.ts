import { resolve } from 'node:path'
import { createShadowSpaceAppJsonStore } from '@shadowob/sdk/space-app/node'
import type {
  Quiz,
  QuizAnswerValue,
  QuizPerson,
  QuizQuestion,
  QuizState,
  QuizSubmission,
} from './types.js'

const now = () => new Date().toISOString()
const id = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 9)}`

function systemPerson(displayName: string): QuizPerson {
  return { kind: 'system', id: `system:${displayName.toLowerCase()}`, displayName }
}

function defaultState(): QuizState {
  const timestamp = now()
  const author = systemPerson('Exam Buddy')
  return {
    updatedAt: timestamp,
    quizzes: [
      {
        id: 'quiz_space_apps',
        title: 'App Basics',
        description: 'A short demo quiz covering Space App command safety.',
        author,
        questions: [
          {
            id: 'q_cli',
            type: 'single',
            prompt: 'Which path should Buddies use to operate a App?',
            options: ['Raw HTTP routes', 'shadowob space-app call', 'Direct database writes'],
            answer: 'shadowob space-app call',
            points: 2,
          },
          {
            id: 'q_data',
            type: 'multiple',
            prompt: 'Which fields should a command declare?',
            options: ['permission', 'action', 'dataClass', 'favoriteColor'],
            answer: ['permission', 'action', 'dataClass'],
            points: 3,
          },
          {
            id: 'q_review',
            type: 'short',
            prompt: 'Explain why approvals are useful for write commands.',
            answer:
              'Approvals let Shadow confirm sensitive or non-default writes before execution.',
            points: 5,
          },
        ],
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    submissions: [],
  }
}

function dataFilePath() {
  return resolve(process.env.QUIZ_DATA_FILE ?? './data/quiz.json')
}

function isState(value: unknown): value is QuizState {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Array.isArray((value as { quizzes?: unknown }).quizzes) &&
    Array.isArray((value as { submissions?: unknown }).submissions)
  )
}

const stateStore = createShadowSpaceAppJsonStore<QuizState>({
  filePath: dataFilePath(),
  defaultValue: defaultState,
  validate: isState,
})

let state: QuizState = stateStore.read()

function persist() {
  state = stateStore.write(state)
}

function touch(quiz?: Quiz) {
  const timestamp = now()
  state.updatedAt = timestamp
  if (quiz) quiz.updatedAt = timestamp
  persist()
}

function normalizeAnswer(value: QuizAnswerValue) {
  return Array.isArray(value)
    ? value.map((item) => item.trim().toLowerCase()).sort()
    : value.trim().toLowerCase()
}

function isAutoCorrect(question: QuizQuestion, answer: QuizAnswerValue | undefined) {
  if (answer === undefined || question.type === 'short') return false
  if (question.type === 'multiple') {
    const expected = normalizeAnswer(question.answer)
    const actual = normalizeAnswer(Array.isArray(answer) ? answer : [answer])
    return JSON.stringify(expected) === JSON.stringify(actual)
  }
  return (
    normalizeAnswer(question.answer) ===
    normalizeAnswer(Array.isArray(answer) ? (answer[0] ?? '') : answer)
  )
}

function scoreSubmission(quiz: Quiz, answers: Record<string, QuizAnswerValue>) {
  let autoScore = 0
  let maxScore = 0
  for (const question of quiz.questions) {
    maxScore += question.points
    if (isAutoCorrect(question, answers[question.id])) autoScore += question.points
  }
  return { autoScore, maxScore }
}

export function listQuizzes() {
  return structuredClone(
    state.quizzes.map((quiz) => ({
      ...quiz,
      submissionCount: state.submissions.filter((submission) => submission.quizId === quiz.id)
        .length,
      pendingCount: state.submissions.filter(
        (submission) => submission.quizId === quiz.id && submission.status === 'pending_review',
      ).length,
    })),
  )
}

export function getQuiz(quizId: string) {
  const quiz = state.quizzes.find((item) => item.id === quizId)
  if (!quiz) return null
  return structuredClone({
    quiz,
    submissions: state.submissions.filter((submission) => submission.quizId === quizId),
  })
}

export function publishQuiz(input: {
  title: string
  description?: string
  questions: Array<Omit<QuizQuestion, 'id' | 'points'> & { id?: string; points?: number }>
  author: QuizPerson
}) {
  const timestamp = now()
  const quiz: Quiz = {
    id: id('quiz'),
    title: input.title.trim(),
    description: input.description?.trim() || undefined,
    author: input.author,
    questions: input.questions.map((question, index) => ({
      ...question,
      id: question.id?.trim() || `q_${index + 1}`,
      points: question.points ?? 1,
      options: question.options?.map((option) => option.trim()).filter(Boolean),
      prompt: question.prompt.trim(),
    })),
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  state.quizzes.push(quiz)
  touch(quiz)
  return structuredClone(quiz)
}

export function submitQuiz(input: {
  quizId: string
  answers: Record<string, QuizAnswerValue>
  respondent: QuizPerson
}) {
  const quiz = state.quizzes.find((item) => item.id === input.quizId)
  if (!quiz) return null
  const scores = scoreSubmission(quiz, input.answers)
  const submission: QuizSubmission = {
    id: id('sub'),
    quizId: quiz.id,
    respondent: input.respondent,
    answers: input.answers,
    status: 'pending_review',
    autoScore: scores.autoScore,
    maxScore: scores.maxScore,
    createdAt: now(),
  }
  state.submissions.push(submission)
  touch(quiz)
  return structuredClone(submission)
}

export function listSubmissions(input: { quizId?: string; status?: QuizSubmission['status'] }) {
  return structuredClone(
    state.submissions
      .filter((submission) => !input.quizId || submission.quizId === input.quizId)
      .filter((submission) => !input.status || submission.status === input.status)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  )
}

export function gradeSubmission(input: {
  submissionId: string
  score: number
  feedback?: string
  grader: QuizPerson
}) {
  const submission = state.submissions.find((item) => item.id === input.submissionId)
  if (!submission) return null
  submission.status = 'graded'
  submission.score = input.score
  submission.feedback = input.feedback?.trim() || undefined
  submission.grader = input.grader
  submission.gradedAt = now()
  touch(state.quizzes.find((quiz) => quiz.id === submission.quizId))
  return structuredClone(submission)
}
