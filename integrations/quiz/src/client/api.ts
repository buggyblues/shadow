import type { Quiz, QuizAnswerValue, QuizQuestion, QuizSubmission } from '../types.js'

type CommandPayload<T> = { ok?: boolean; result?: T; error?: string } & T

const pending = new Map<
  string,
  {
    resolve: (value: unknown) => void
    reject: (error: Error) => void
  }
>()

function canUseBridge() {
  return (
    new URLSearchParams(location.search).has('shadow_launch') &&
    (window.parent !== window || window.ReactNativeWebView)
  )
}

function postBridge(message: unknown) {
  if (window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(JSON.stringify(message))
    return
  }
  window.parent.postMessage(message, '*')
}

window.addEventListener('message', (event) => {
  let data = event.data
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data || '{}')
    } catch {
      return
    }
  }
  if (!data || data.type !== 'shadow.app.command.response') return
  const entry = pending.get(data.requestId)
  if (!entry) return
  pending.delete(data.requestId)
  if (data.ok) entry.resolve(data.result)
  else entry.reject(new Error(data.error || 'Command failed'))
})

export async function command<T>(commandName: string, input: unknown): Promise<T> {
  if (canUseBridge()) {
    const requestId = `req_${Math.random().toString(36).slice(2)}`
    postBridge({
      type: 'shadow.app.command.request',
      requestId,
      appKey: 'shadow-quiz',
      commandName,
      input,
    })
    return new Promise((resolve, reject) => {
      pending.set(requestId, { resolve: resolve as (value: unknown) => void, reject })
      window.setTimeout(() => {
        if (!pending.has(requestId)) return
        pending.delete(requestId)
        reject(new Error('Command timed out'))
      }, 60000)
    }).then((payload) => unwrapCommandPayload<T>(payload))
  }

  const res = await fetch(`/api/local/commands/${encodeURIComponent(commandName)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input }),
  })
  const payload = (await res.json()) as CommandPayload<T>
  if (!res.ok || payload.ok === false) throw new Error(payload.error || 'Command failed')
  return unwrapCommandPayload<T>(payload)
}

function unwrapCommandPayload<T>(payload: unknown): T {
  if (
    payload &&
    typeof payload === 'object' &&
    !Array.isArray(payload) &&
    'ok' in payload &&
    (payload as { ok?: boolean }).ok === false
  ) {
    throw new Error((payload as { error?: string }).error || 'Command failed')
  }
  if (
    payload &&
    typeof payload === 'object' &&
    !Array.isArray(payload) &&
    'result' in payload &&
    (payload as { result?: unknown }).result !== undefined
  ) {
    return unwrapCommandPayload<T>((payload as { result: unknown }).result)
  }
  return payload as T
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

declare global {
  interface Window {
    ReactNativeWebView?: {
      postMessage: (message: string) => void
    }
  }
}
