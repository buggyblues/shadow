import { createShadowServerAppClient } from '@shadowob/sdk/bridge'
import { shadowServerAppManifest } from '../shadow-app.generated.js'
import type { QnaImageAsset, QnaList, QnaQuestion } from '../types.js'

export interface TagSummary {
  tag: string
  count: number
}

const shadowApp = createShadowServerAppClient({ appKey: shadowServerAppManifest.appKey })

export async function command<T>(commandName: string, input: unknown): Promise<T> {
  return shadowApp.command<T>(commandName, input)
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
  const res = await shadowApp.fetchWithLaunch('/api/local/images', {
    method: 'POST',
    body: form,
  })
  const payload = (await res.json()) as { ok: boolean; image?: QnaImageAsset; error?: string }
  if (!res.ok || !payload.ok || !payload.image) throw new Error(payload.error || 'Upload failed')
  return { image: payload.image }
}
