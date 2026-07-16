import { createShadowSpaceAppClient } from '@shadowob/sdk/bridge'
import { shadowSpaceAppManifest } from '../space-app.generated.js'
import type { Quiz, QuizAnswerValue, QuizQuestion, QuizSubmission } from '../types.js'

const shadowSpaceApp = createShadowSpaceAppClient({ appKey: shadowSpaceAppManifest.appKey })

export async function command<T>(commandName: string, input: unknown): Promise<T> {
  return shadowSpaceApp.command<T>(commandName, input)
}

export function listQuizzes() {
  return command<{
    quizzes: Array<Quiz & { submissionCount?: number; pendingCount?: number }>
  }>('quizzes.list', {})
}

export function getQuiz(quizId: string) {
  return command<{ quiz: Quiz; submissions: QuizSubmission[] }>('quizzes.get', { quizId })
}

export function publishQuiz(input: {
  title: string
  description?: string
  questions: Array<Omit<QuizQuestion, 'id'> & { id?: string }>
}) {
  return command<{ quiz: Quiz }>('quizzes.publish', input)
}

export function submitQuiz(input: { quizId: string; answers: Record<string, QuizAnswerValue> }) {
  return command<{ submission: QuizSubmission }>('submissions.submit', input)
}

export function listSubmissions(input: { quizId?: string; status?: QuizSubmission['status'] }) {
  return command<{ submissions: QuizSubmission[] }>('submissions.list', input)
}

export function gradeSubmission(input: { submissionId: string; score: number; feedback?: string }) {
  return command<{ submission: QuizSubmission }>('submissions.grade', input)
}
