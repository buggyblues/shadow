import { createShadowServerAppClient } from '@shadowob/sdk/bridge'
import type {
  QnaArticle,
  QnaImageAsset,
  QnaList,
  QnaQuestion,
  QnaReadableKind,
  QnaReadingBatch,
} from '../types.js'

export interface TagSummary {
  tag: string
  count: number
}

const shadowApp = createShadowServerAppClient()

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

export function listArticles(input: { query?: string; tag?: string; limit?: number }) {
  return command<{ articles: QnaArticle[] }>('articles.list', input)
}

export function getArticle(articleId: string) {
  return command<{ article: QnaArticle }>('articles.get', { articleId })
}

export function publishArticle(input: { title: string; body: string; tags?: string[] }) {
  return command<{ article: QnaArticle }>('articles.publish', input)
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

export function listReadingBatches() {
  return command<{ batches: QnaReadingBatch[] }>('reading.batches', {})
}

export function markReadingItemRead(input: { kind: QnaReadableKind; itemId: string }) {
  return command<{ record: { kind: QnaReadableKind; itemId: string; readAt: string } }>(
    'reading.mark_read',
    input,
  )
}

export async function uploadImage(file: File) {
  const form = new FormData()
  form.set('file', file)
  return shadowApp.commandForm<{ image: QnaImageAsset }>('images.upload', form)
}
