import { ShadowBridge } from '@shadowob/sdk/bridge'
import type { QnaImageAsset, QnaList, QnaQuestion } from '../types.js'

type CommandPayload<T> = { ok?: boolean; result?: T; error?: string } & T
const bridge = new ShadowBridge({ appKey: 'answers' })

export interface TagSummary {
  tag: string
  count: number
}

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
