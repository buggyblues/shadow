import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { BoardCard, BoardState } from './types.js'

const now = () => new Date().toISOString()
const id = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 9)}`

function defaultBoard(): BoardState {
  const timestamp = now()
  return {
    id: 'default',
    title: 'Launch Board',
    updatedAt: timestamp,
    columns: [
      { id: 'todo', title: 'To do' },
      { id: 'doing', title: 'Doing' },
      { id: 'review', title: 'Review' },
      { id: 'done', title: 'Done' },
    ],
    cards: [
      {
        id: 'card_plan',
        columnId: 'todo',
        title: 'Map onboarding checklist',
        description: 'Write the first-run steps that a human and Buddy can split.',
        labels: ['Planning'],
        assignees: ['Mia'],
        comments: [],
        createdBy: 'system',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: 'card_bot',
        columnId: 'doing',
        title: 'Ask Strategy Buddy for launch risks',
        description: 'Use the Shadow command surface so the board stays in sync.',
        labels: ['Buddy'],
        assignees: ['Strategy Buddy'],
        comments: [],
        createdBy: 'system',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: 'card_assets',
        columnId: 'review',
        title: 'Review cover assets',
        description: 'Confirm imagery and labels before publishing.',
        labels: ['Design'],
        assignees: ['Kai'],
        comments: [],
        createdBy: 'system',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
  }
}

function dataFilePath() {
  return resolve(process.env.KANBAN_DATA_FILE ?? './data/kanban-board.json')
}

function isBoardState(value: unknown): value is BoardState {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Array.isArray((value as { columns?: unknown }).columns) &&
    Array.isArray((value as { cards?: unknown }).cards)
  )
}

function loadBoard() {
  const file = dataFilePath()
  if (!existsSync(file)) return defaultBoard()
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as unknown
    return isBoardState(parsed) ? parsed : defaultBoard()
  } catch {
    return defaultBoard()
  }
}

let board: BoardState = loadBoard()

function persistBoard() {
  const file = dataFilePath()
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(board, null, 2)}\n`)
}

export function resetBoardForTests(next: BoardState = defaultBoard()) {
  board = structuredClone(next)
  persistBoard()
}

function touch(card?: BoardCard) {
  const timestamp = now()
  board.updatedAt = timestamp
  if (card) card.updatedAt = timestamp
  persistBoard()
}

export function getBoard() {
  return structuredClone(board)
}

export function createCard(input: {
  title: string
  columnId?: string
  description?: string
  label?: string
  createdBy: string
}) {
  const columnId = board.columns.some((column) => column.id === input.columnId)
    ? input.columnId!
    : 'todo'
  const card: BoardCard = {
    id: id('card'),
    columnId,
    title: input.title,
    description: input.description,
    labels: input.label ? [input.label] : [],
    assignees: [],
    comments: [],
    createdBy: input.createdBy,
    createdAt: now(),
    updatedAt: now(),
  }
  board.cards.push(card)
  touch(card)
  return structuredClone(card)
}

export function moveCard(cardId: string, columnId: string) {
  const card = board.cards.find((item) => item.id === cardId)
  if (!card) return null
  if (!board.columns.some((column) => column.id === columnId)) return null
  card.columnId = columnId
  touch(card)
  return structuredClone(card)
}

export function assignCard(cardId: string, assignee: string) {
  const card = board.cards.find((item) => item.id === cardId)
  if (!card) return null
  const clean = assignee.trim()
  if (clean && !card.assignees.includes(clean)) card.assignees.push(clean)
  touch(card)
  return structuredClone(card)
}

export function commentCard(cardId: string, body: string, author: string) {
  const card = board.cards.find((item) => item.id === cardId)
  if (!card) return null
  card.comments.push({ id: id('comment'), body, author, createdAt: now() })
  touch(card)
  return structuredClone(card)
}
