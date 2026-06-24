import { resolve } from 'node:path'
import { createShadowServerAppJsonStore } from '@shadowob/sdk/server-app/node'
import type {
  QnaAnswer,
  QnaArticle,
  QnaComment,
  QnaImageAsset,
  QnaList,
  QnaPerson,
  QnaQuestion,
  QnaReadableKind,
  QnaReadingBatch,
  QnaState,
} from './types.js'

const now = () => new Date().toISOString()
const id = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 9)}`

function systemPerson(displayName: string): QnaPerson {
  return { kind: 'system', id: `system:${displayName.toLowerCase()}`, displayName }
}

function defaultState(): QnaState {
  const timestamp = now()
  const guide = systemPerson('Guide Buddy')
  const questionId = 'q_server_app_patterns'
  const articleId = 'article_markdown_notes'
  return {
    updatedAt: timestamp,
    images: [],
    readRecords: [],
    lists: [
      {
        id: 'list_server_app_handoff',
        title: 'Server app handoff',
        description: 'Questions and answers that help a Buddy operate installed apps.',
        owner: guide,
        questionIds: [questionId],
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    articles: [
      {
        id: articleId,
        title: 'Markdown articles for durable notes',
        body: [
          'Articles are a better home for long-form notes that are not asking for a direct answer.',
          '',
          'Use Markdown headings, lists, links, tables, code blocks, and uploaded images to keep reusable context close to the Q&A that references it.',
          '',
          'A Buddy can read articles alongside questions from the reading queue, then mark each item done as it moves through the batch.',
        ].join('\n'),
        tags: ['server-apps', 'notes'],
        author: guide,
        comments: [],
        imageIds: [],
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    questions: [
      {
        id: questionId,
        title: 'How should a Buddy use an installed App?',
        body: 'What is the safe path for a Buddy that needs to operate a app from a channel?',
        tags: ['server-apps', 'buddies'],
        author: guide,
        comments: [],
        imageIds: [],
        answers: [
          {
            id: 'a_cli_path',
            questionId,
            body: [
              'Use the Shadow CLI path:',
              '',
              '- Discover installed apps with `shadowob app discover`.',
              '- Inspect the command schema before writing data.',
              '- Call commands through `shadowob app call` so Shadow applies grants and approvals.',
              '',
              '> Treat the App command manifest as the contract, then keep screenshots or uploaded diagrams directly in the answer when context matters.',
            ].join('\n'),
            author: guide,
            comments: [],
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
  }
}

function dataFilePath() {
  return resolve(process.env.QNA_DATA_FILE ?? './data/qna.json')
}

function shadowWebBaseUrl() {
  return (
    process.env.SHADOW_WEB_BASE_URL ??
    process.env.OAUTH_BASE_URL ??
    process.env.SHADOW_SERVER_URL ??
    'http://localhost:3000'
  ).replace(/\/+$/u, '')
}

function normalizeAvatarUrl(value: unknown) {
  if (typeof value !== 'string') return null
  const avatarUrl = value.trim()
  if (!avatarUrl) return null
  if (!avatarUrl.startsWith('/')) return avatarUrl
  return `${shadowWebBaseUrl()}${avatarUrl}`
}

function isState(value: unknown): value is QnaState {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Array.isArray((value as { questions?: unknown }).questions)
  )
}

function cleanTags(tags: string[] | undefined) {
  return Array.from(
    new Set((tags ?? []).map((tag) => tag.trim().replace(/^#+/, '').toLowerCase()).filter(Boolean)),
  ).slice(0, 10)
}

function cleanQuestionTitle(title: string) {
  const value = title
    .trim()
    .replace(/[?？!！.。]+$/g, '')
    .trim()
  return value ? `${value}？` : value
}

function cleanArticleTitle(title: string) {
  return title.trim().replace(/\s+/g, ' ')
}

function cleanMarkdownBody(value: string | undefined) {
  return value?.trim().replace(/\r\n?/g, '\n').replace(/\\n/g, '\n') || undefined
}

function normalizePerson(value: unknown, fallback = 'Unknown'): QnaPerson {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return systemPerson(fallback)
  const candidate = value as Partial<QnaPerson>
  const displayName =
    typeof candidate.displayName === 'string' && candidate.displayName.trim()
      ? candidate.displayName.trim()
      : fallback
  return {
    kind: typeof candidate.kind === 'string' ? candidate.kind : 'manual',
    subjectKind: typeof candidate.subjectKind === 'string' ? candidate.subjectKind : undefined,
    stableKey: typeof candidate.stableKey === 'string' ? candidate.stableKey : undefined,
    id:
      typeof candidate.id === 'string' && candidate.id.trim()
        ? candidate.id
        : `manual:${displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    userId: typeof candidate.userId === 'string' ? candidate.userId : null,
    buddyAgentId: typeof candidate.buddyAgentId === 'string' ? candidate.buddyAgentId : null,
    ownerId: typeof candidate.ownerId === 'string' ? candidate.ownerId : null,
    displayName,
    avatarUrl: normalizeAvatarUrl(candidate.avatarUrl),
  }
}

function normalizeQuestion(value: QnaQuestion & { topics?: string[] }): QnaQuestion {
  const { topics, ...question } = value
  return {
    ...question,
    title: cleanQuestionTitle(question.title),
    body: cleanMarkdownBody(question.body),
    tags: cleanTags(question.tags ?? topics),
    author: normalizePerson(question.author, 'Question author'),
    comments: (question.comments ?? []).map((comment) => ({
      ...comment,
      author: normalizePerson(comment.author, 'Commenter'),
    })),
    answers: (question.answers ?? []).map((answer) => ({
      ...answer,
      body: cleanMarkdownBody(answer.body) ?? '',
      author: normalizePerson(answer.author, 'Answer author'),
      comments: (answer.comments ?? []).map((comment) => ({
        ...comment,
        author: normalizePerson(comment.author, 'Commenter'),
      })),
    })),
    imageIds: question.imageIds ?? [],
  }
}

function normalizeArticle(value: QnaArticle & { topics?: string[] }): QnaArticle {
  const { topics, ...article } = value
  return {
    ...article,
    title: cleanArticleTitle(article.title),
    body: cleanMarkdownBody(article.body) ?? '',
    tags: cleanTags(article.tags ?? topics),
    author: normalizePerson(article.author, 'Article author'),
    comments: (article.comments ?? []).map((comment) => ({
      ...comment,
      author: normalizePerson(comment.author, 'Commenter'),
    })),
    imageIds: article.imageIds ?? [],
  }
}

function normalizeState(value: QnaState & { topics?: unknown }): QnaState {
  const fallback = defaultState()
  return {
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : fallback.updatedAt,
    questions: (value.questions ?? []).map((question) =>
      normalizeQuestion(question as QnaQuestion & { topics?: string[] }),
    ),
    articles: Array.isArray(value.articles)
      ? value.articles.map((article) =>
          normalizeArticle(article as QnaArticle & { topics?: string[] }),
        )
      : fallback.articles,
    lists: Array.isArray(value.lists)
      ? value.lists.map((list) => ({
          ...list,
          owner: normalizePerson(list.owner, 'List owner'),
          questionIds: Array.isArray(list.questionIds) ? list.questionIds : [],
        }))
      : fallback.lists,
    images: Array.isArray(value.images) ? value.images : [],
    readRecords: Array.isArray(value.readRecords) ? value.readRecords : [],
  }
}

const stateStore = createShadowServerAppJsonStore<QnaState>({
  filePath: dataFilePath(),
  defaultValue: defaultState,
  validate: isState,
  normalize: normalizeState,
})

let state: QnaState = stateStore.read()

function persist() {
  state = stateStore.write(state)
}

function touch(question?: QnaQuestion, answer?: QnaAnswer, list?: QnaList) {
  const timestamp = now()
  state.updatedAt = timestamp
  if (question) question.updatedAt = timestamp
  if (answer) answer.updatedAt = timestamp
  if (list) list.updatedAt = timestamp
  persist()
}

function ownerKey(person: QnaPerson) {
  return (
    person.stableKey ??
    (person.buddyAgentId ? `buddy:${person.buddyAgentId}` : null) ??
    (person.userId ? `user:${person.userId}` : null) ??
    (person.ownerId ? `owner:${person.ownerId}` : null) ??
    person.id
  )
}

function readableKey(kind: QnaReadableKind, itemId: string) {
  return `${kind}:${itemId}`
}

function readRecordByItem(actor: QnaPerson) {
  const key = ownerKey(actor)
  return new Map(
    state.readRecords
      .filter((record) => record.actorKey === key)
      .map((record) => [readableKey(record.kind, record.itemId), record.readAt]),
  )
}

export function listQuestions(input: {
  query?: string
  tag?: string
  listId?: string
  limit?: number
}) {
  const query = input.query?.trim().toLowerCase()
  const tag = input.tag?.trim().replace(/^#+/, '').toLowerCase()
  const list = input.listId ? state.lists.find((item) => item.id === input.listId) : null
  const listQuestionIds = list ? new Set(list.questionIds) : null
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100)
  return structuredClone(
    state.questions
      .filter((question) => {
        const matchesList = !listQuestionIds || listQuestionIds.has(question.id)
        const matchesTag = !tag || question.tags.includes(tag)
        const haystack = [question.title, question.body, question.tags.join(' ')]
          .join(' ')
          .toLowerCase()
        const matchesQuery = !query || haystack.includes(query)
        return matchesList && matchesTag && matchesQuery
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit),
  )
}

export function getQuestion(questionId: string) {
  const question = state.questions.find((item) => item.id === questionId)
  return question ? structuredClone(question) : null
}

export function listArticles(input: { query?: string; tag?: string; limit?: number }) {
  const query = input.query?.trim().toLowerCase()
  const tag = input.tag?.trim().replace(/^#+/, '').toLowerCase()
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100)
  return structuredClone(
    state.articles
      .filter((article) => {
        const matchesTag = !tag || article.tags.includes(tag)
        const haystack = [article.title, article.body, article.tags.join(' ')]
          .join(' ')
          .toLowerCase()
        const matchesQuery = !query || haystack.includes(query)
        return matchesTag && matchesQuery
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit),
  )
}

export function getArticle(articleId: string) {
  const article = state.articles.find((item) => item.id === articleId)
  return article ? structuredClone(article) : null
}

export function askQuestion(input: {
  title: string
  body?: string
  tags?: string[]
  listId?: string
  author: QnaPerson
}) {
  const timestamp = now()
  const question: QnaQuestion = {
    id: id('q'),
    title: cleanQuestionTitle(input.title),
    body: cleanMarkdownBody(input.body),
    tags: cleanTags(input.tags),
    author: input.author,
    comments: [],
    answers: [],
    imageIds: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  state.questions.push(question)
  const list = input.listId ? state.lists.find((item) => item.id === input.listId) : null
  if (list && !list.questionIds.includes(question.id)) list.questionIds.push(question.id)
  touch(question, undefined, list ?? undefined)
  return structuredClone(question)
}

export function publishArticle(input: {
  title: string
  body: string
  tags?: string[]
  author: QnaPerson
}) {
  const timestamp = now()
  const article: QnaArticle = {
    id: id('article'),
    title: cleanArticleTitle(input.title),
    body: cleanMarkdownBody(input.body) ?? '',
    tags: cleanTags(input.tags),
    author: input.author,
    comments: [],
    imageIds: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  state.articles.push(article)
  touch(undefined, undefined, undefined)
  return structuredClone(article)
}

export function createAnswer(input: { questionId: string; body: string; author: QnaPerson }) {
  const question = state.questions.find((item) => item.id === input.questionId)
  if (!question) return null
  const timestamp = now()
  const answer: QnaAnswer = {
    id: id('a'),
    questionId: question.id,
    body: cleanMarkdownBody(input.body) ?? '',
    author: input.author,
    comments: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  question.answers.push(answer)
  touch(question, answer)
  return structuredClone(answer)
}

export function deleteQuestion(input: { questionId: string }) {
  const questionIndex = state.questions.findIndex((item) => item.id === input.questionId)
  if (questionIndex < 0) return null
  const [question] = state.questions.splice(questionIndex, 1)
  for (const list of state.lists) {
    if (list.questionIds.includes(input.questionId)) {
      list.questionIds = list.questionIds.filter((questionId) => questionId !== input.questionId)
      list.updatedAt = now()
    }
  }
  state.readRecords = state.readRecords.filter(
    (record) => record.kind !== 'question' || record.itemId !== input.questionId,
  )
  touch()
  return question ? structuredClone(question) : null
}

export function deleteAnswer(input: { answerId: string }) {
  const question = state.questions.find((item) =>
    item.answers.some((answer) => answer.id === input.answerId),
  )
  if (!question) return null
  const answer = question.answers.find((item) => item.id === input.answerId)
  question.answers = question.answers.filter((item) => item.id !== input.answerId)
  touch(question)
  return answer ? structuredClone(answer) : null
}

export function createComment(input: {
  targetType: 'question' | 'answer'
  targetId: string
  body: string
  author: QnaPerson
}) {
  const question =
    input.targetType === 'question'
      ? state.questions.find((item) => item.id === input.targetId)
      : state.questions.find((item) => item.answers.some((answer) => answer.id === input.targetId))
  if (!question) return null
  const answer =
    input.targetType === 'answer'
      ? question.answers.find((item) => item.id === input.targetId)
      : null
  if (input.targetType === 'answer' && !answer) return null
  const comment: QnaComment = {
    id: id('c'),
    targetType: input.targetType,
    targetId: input.targetId,
    body: input.body.trim(),
    author: input.author,
    createdAt: now(),
  }
  if (answer) answer.comments.push(comment)
  else question.comments.push(comment)
  touch(question, answer ?? undefined)
  return structuredClone(comment)
}

export function listTags() {
  const counts = new Map<string, number>()
  for (const question of state.questions) {
    for (const tag of question.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}

export function listLists(actor: QnaPerson) {
  const key = ownerKey(actor)
  return structuredClone(
    state.lists
      .filter((list) => ownerKey(list.owner) === key || list.owner.kind === 'system')
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  )
}

export function listReadingBatches(actor: QnaPerson): QnaReadingBatch[] {
  const readAtByItem = readRecordByItem(actor)
  const entries = [
    ...state.questions.map((question) => ({
      kind: 'question' as const,
      id: question.id,
      question,
      updatedAt: question.updatedAt,
    })),
    ...state.articles.map((article) => ({
      kind: 'article' as const,
      id: article.id,
      article,
      updatedAt: article.updatedAt,
    })),
  ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const batchSize = 10
  const batches: QnaReadingBatch[] = []

  for (let offset = 0; offset < entries.length; offset += batchSize) {
    const batchEntries = entries.slice(offset, offset + batchSize).map((entry) => ({
      kind: entry.kind,
      id: entry.id,
      readAt: readAtByItem.get(readableKey(entry.kind, entry.id)) ?? null,
      question: entry.kind === 'question' ? structuredClone(entry.question) : undefined,
      article: entry.kind === 'article' ? structuredClone(entry.article) : undefined,
    }))
    const readCount = batchEntries.filter((entry) => entry.readAt).length
    batches.push({
      index: batches.length,
      title: `阅读清单 ${batches.length + 1}`,
      items: batchEntries,
      readCount,
      unreadCount: batchEntries.length - readCount,
      completed: batchEntries.length > 0 && readCount === batchEntries.length,
    })
  }

  return batches
}

export function markReadingItemRead(input: {
  kind: QnaReadableKind
  itemId: string
  actor: QnaPerson
}) {
  const exists =
    input.kind === 'question'
      ? state.questions.some((item) => item.id === input.itemId)
      : state.articles.some((item) => item.id === input.itemId)
  if (!exists) return null

  const actorKey = ownerKey(input.actor)
  const existing = state.readRecords.find(
    (record) =>
      record.actorKey === actorKey && record.kind === input.kind && record.itemId === input.itemId,
  )
  const readAt = now()
  if (existing) existing.readAt = readAt
  else state.readRecords.push({ actorKey, kind: input.kind, itemId: input.itemId, readAt })
  touch()
  return {
    kind: input.kind,
    itemId: input.itemId,
    readAt,
  }
}

export function createList(input: { title: string; description?: string; owner: QnaPerson }) {
  const timestamp = now()
  const list: QnaList = {
    id: id('list'),
    title: input.title.trim(),
    description: input.description?.trim() || undefined,
    owner: input.owner,
    questionIds: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  state.lists.push(list)
  touch(undefined, undefined, list)
  return structuredClone(list)
}

export function addQuestionToList(input: { listId: string; questionId: string; actor: QnaPerson }) {
  const list = state.lists.find((item) => item.id === input.listId)
  const question = state.questions.find((item) => item.id === input.questionId)
  if (!list || !question) return null
  const listOwner = ownerKey(list.owner)
  const actorOwner = ownerKey(input.actor)
  if (list.owner.kind !== 'system' && listOwner !== actorOwner) return null
  if (!list.questionIds.includes(question.id)) list.questionIds.push(question.id)
  touch(undefined, undefined, list)
  return structuredClone(list)
}

export function removeQuestionFromList(input: {
  listId: string
  questionId: string
  actor: QnaPerson
}) {
  const list = state.lists.find((item) => item.id === input.listId)
  if (!list) return null
  const listOwner = ownerKey(list.owner)
  const actorOwner = ownerKey(input.actor)
  if (list.owner.kind !== 'system' && listOwner !== actorOwner) return null
  list.questionIds = list.questionIds.filter((id) => id !== input.questionId)
  touch(undefined, undefined, list)
  return structuredClone(list)
}

export function recordImageAsset(input: {
  id: string
  filename: string
  contentType: string
  size: number
  url: string
  uploadedBy: QnaPerson
}) {
  const asset: QnaImageAsset = {
    ...input,
    createdAt: now(),
  }
  state.images.push(asset)
  persist()
  return structuredClone(asset)
}

export function getImageAsset(assetId: string) {
  return state.images.find((asset) => asset.id === assetId) ?? null
}
