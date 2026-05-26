import type { QnaImageAsset, QnaList, QnaQuestion } from '../types.js'

type CommandPayload<T> = { ok?: boolean; result?: T; error?: string } & T

export interface TagSummary {
  tag: string
  count: number
}

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
      appKey: 'shadow-answers',
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

export function listQuestions(input: {
  query?: string
  tag?: string
  listId?: string
  limit?: number
}) {
  return command<{ questions: QnaQuestion[] }>('questions.list', input)
}

export function getQuestion(questionId: string) {
  return command<{ question: QnaQuestion }>('questions.get', { questionId })
}

export function askQuestion(input: {
  title: string
  body?: string
  tags?: string[]
  listId?: string
}) {
  return command<{ question: QnaQuestion }>('questions.ask', input)
}

export function createAnswer(input: { questionId: string; body: string }) {
  return command('answers.create', input)
}

export function deleteQuestion(questionId: string) {
  return command<{ question: QnaQuestion }>('questions.delete', { questionId })
}

export function deleteAnswer(answerId: string) {
  return command('answers.delete', { answerId })
}

export function createComment(input: {
  targetType: 'question' | 'answer'
  targetId: string
  body: string
}) {
  return command('comments.create', input)
}

export function listTags() {
  return command<{ tags: TagSummary[] }>('tags.list', {})
}

export function listLists() {
  return command<{ lists: QnaList[] }>('lists.list', {})
}

export function createList(input: { title: string; description?: string }) {
  return command<{ list: QnaList }>('lists.create', input)
}

export function addQuestionToList(input: { listId: string; questionId: string }) {
  return command<{ list: QnaList }>('lists.add_question', input)
}

export function removeQuestionFromList(input: { listId: string; questionId: string }) {
  return command<{ list: QnaList }>('lists.remove_question', input)
}

export async function uploadImage(file: File) {
  const form = new FormData()
  form.set('file', file)
  const res = await fetch('/api/local/images', { method: 'POST', body: form })
  const payload = (await res.json()) as { ok: boolean; image?: QnaImageAsset; error?: string }
  if (!res.ok || !payload.ok || !payload.image) throw new Error(payload.error || 'Upload failed')
  return { image: payload.image }
}

declare global {
  interface Window {
    ReactNativeWebView?: {
      postMessage: (message: string) => void
    }
  }
}
