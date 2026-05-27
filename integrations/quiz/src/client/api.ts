import { ShadowBridge } from '@shadowob/sdk/bridge'
import type { Quiz, QuizAnswerValue, QuizQuestion, QuizSubmission } from '../types.js'

type CommandPayload<T> = { ok?: boolean; result?: T; error?: string } & T
const bridge = new ShadowBridge({ appKey: 'shadow-quiz' })

function canUseBridge() {
  return bridge.isAvailable()
}

export async function command<T>(commandName: string, input: unknown): Promise<T> {
  if (canUseBridge()) {
    return bridge.command(commandName, input) as Promise<T>
  }

  const res = await fetch(`/api/local/commands/${encodeURIComponent(commandName)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input }),
  })
  const payload = (await res.json()) as CommandPayload<T>
  if (!res.ok || payload.ok === false) throw new Error(payload.error || 'Command failed')
  return bridge.unwrapCommandPayload<T>(payload)
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
