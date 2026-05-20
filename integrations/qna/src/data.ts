import { resolve } from 'node:path'
import { createShadowServerAppJsonStore } from '@shadowob/sdk/server-app/node'
import type { QnaAnswer, QnaComment, QnaPerson, QnaQuestion, QnaState } from './types.js'

const now = () => new Date().toISOString()
const id = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 9)}`

function systemPerson(displayName: string): QnaPerson {
  return { kind: 'system', id: `system:${displayName.toLowerCase()}`, displayName }
}

function defaultState(): QnaState {
  const timestamp = now()
  const guide = systemPerson('Guide Buddy')
  return {
    updatedAt: timestamp,
    questions: [
      {
        id: 'q_server_app_patterns',
        title: 'How should a Buddy use an installed Server App?',
        body: 'What is the safe path for a Buddy that needs to operate a server app from a channel?',
        topics: ['server-apps', 'buddies'],
        author: guide,
        comments: [],
        answers: [
          {
            id: 'a_cli_path',
            questionId: 'q_server_app_patterns',
            body: 'Use the Shadow CLI path:\n\n- Discover installed apps with `shadowob app discover`.\n- Inspect the command schema.\n- Call commands through `shadowob app call` so Shadow applies grants and approvals.',
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

function isState(value: unknown): value is QnaState {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Array.isArray((value as { questions?: unknown }).questions)
  )
}

const stateStore = createShadowServerAppJsonStore<QnaState>({
  filePath: dataFilePath(),
  defaultValue: defaultState,
  validate: isState,
})

let state: QnaState = stateStore.read()

function persist() {
  state = stateStore.write(state)
}

function touch(question?: QnaQuestion, answer?: QnaAnswer) {
  const timestamp = now()
  state.updatedAt = timestamp
  if (question) question.updatedAt = timestamp
  if (answer) answer.updatedAt = timestamp
  persist()
}

function cleanTopics(topics: string[] | undefined) {
  return Array.from(
    new Set((topics ?? []).map((topic) => topic.trim().toLowerCase()).filter(Boolean)),
  ).slice(0, 8)
}

export function listQuestions(input: { query?: string; topic?: string; limit?: number }) {
  const query = input.query?.trim().toLowerCase()
  const topic = input.topic?.trim().toLowerCase()
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100)
  return structuredClone(
    state.questions
      .filter((question) => {
        const matchesTopic = !topic || question.topics.includes(topic)
        const haystack = [question.title, question.body, question.topics.join(' ')]
          .join(' ')
          .toLowerCase()
        const matchesQuery = !query || haystack.includes(query)
        return matchesTopic && matchesQuery
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit),
  )
}

export function getQuestion(questionId: string) {
  const question = state.questions.find((item) => item.id === questionId)
  return question ? structuredClone(question) : null
}

export function askQuestion(input: {
  title: string
  body?: string
  topics?: string[]
  author: QnaPerson
}) {
  const timestamp = now()
  const question: QnaQuestion = {
    id: id('q'),
    title: input.title.trim(),
    body: input.body?.trim() || undefined,
    topics: cleanTopics(input.topics),
    author: input.author,
    comments: [],
    answers: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  state.questions.push(question)
  touch(question)
  return structuredClone(question)
}

export function createAnswer(input: { questionId: string; body: string; author: QnaPerson }) {
  const question = state.questions.find((item) => item.id === input.questionId)
  if (!question) return null
  const timestamp = now()
  const answer: QnaAnswer = {
    id: id('a'),
    questionId: question.id,
    body: input.body.trim(),
    author: input.author,
    comments: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  question.answers.push(answer)
  touch(question, answer)
  return structuredClone(answer)
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

export function listTopics() {
  const counts = new Map<string, number>()
  for (const question of state.questions) {
    for (const topic of question.topics) counts.set(topic, (counts.get(topic) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic))
}
