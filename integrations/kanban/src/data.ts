import { resolve } from 'node:path'
import { createShadowServerAppJsonStore } from '@shadowob/sdk/server-app/node'
import type { BoardCard, BoardPerson, BoardState } from './types.js'

const now = () => new Date().toISOString()
const id = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 9)}`

function systemPerson(displayName: string): BoardPerson {
  return {
    kind: 'system',
    id: `system:${displayName.toLowerCase().replace(/\s+/g, '-')}`,
    displayName,
  }
}

function manualPerson(displayName: string, avatarUrl?: string | null): BoardPerson {
  const clean = displayName.trim() || 'Unassigned'
  return {
    kind: 'manual',
    id: `manual:${clean
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')}`,
    displayName: clean,
    avatarUrl: avatarUrl ?? null,
  }
}

function defaultBoard(): BoardState {
  const timestamp = now()
  const system = systemPerson('System')
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
        assignees: [manualPerson('Mia')],
        comments: [],
        createdBy: system,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: 'card_bot',
        columnId: 'doing',
        title: 'Ask Strategy Buddy for launch risks',
        description: 'Use the Shadow command surface so the board stays in sync.',
        labels: ['Buddy'],
        assignees: [manualPerson('Strategy Buddy')],
        comments: [],
        createdBy: system,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: 'card_assets',
        columnId: 'review',
        title: 'Review cover assets',
        description: 'Confirm imagery and labels before publishing.',
        labels: ['Design'],
        assignees: [manualPerson('Kai')],
        comments: [],
        createdBy: system,
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

function normalizePerson(value: unknown, fallback = 'Unknown'): BoardPerson {
  if (typeof value === 'string') return manualPerson(value || fallback)
  if (!value || typeof value !== 'object' || Array.isArray(value)) return manualPerson(fallback)
  const candidate = value as Partial<BoardPerson>
  const displayName =
    typeof candidate.displayName === 'string' && candidate.displayName.trim()
      ? candidate.displayName.trim()
      : fallback
  const id =
    typeof candidate.id === 'string' && candidate.id.trim()
      ? candidate.id
      : `${candidate.kind ?? 'manual'}:${displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  return {
    kind: typeof candidate.kind === 'string' ? candidate.kind : 'manual',
    id,
    userId: typeof candidate.userId === 'string' ? candidate.userId : null,
    buddyAgentId: typeof candidate.buddyAgentId === 'string' ? candidate.buddyAgentId : null,
    ownerId: typeof candidate.ownerId === 'string' ? candidate.ownerId : null,
    displayName,
    avatarUrl: typeof candidate.avatarUrl === 'string' ? candidate.avatarUrl : null,
  }
}

function normalizeCard(card: BoardCard): BoardCard {
  return {
    ...card,
    assignees: (card.assignees ?? []).map((person) => normalizePerson(person, 'Assignee')),
    comments: (card.comments ?? []).map((comment) => ({
      ...comment,
      author: normalizePerson(comment.author, 'Commenter'),
    })),
    createdBy: normalizePerson(card.createdBy, 'Creator'),
  }
}

function normalizeBoard(value: BoardState): BoardState {
  return {
    ...value,
    cards: value.cards.map((card) => normalizeCard(card)),
  }
}

const boardStore = createShadowServerAppJsonStore<BoardState>({
  filePath: dataFilePath(),
  defaultValue: defaultBoard,
  validate: isBoardState,
  normalize: normalizeBoard,
})

let board: BoardState = boardStore.read()

function persistBoard() {
  board = boardStore.write(board)
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
  createdBy: BoardPerson
  assignee?: BoardPerson | null
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
    assignees: input.assignee ? [input.assignee] : [input.createdBy],
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
  const person = manualPerson(assignee)
  if (!card.assignees.some((item) => item.id === person.id)) card.assignees.push(person)
  touch(card)
  return structuredClone(card)
}

export function assignCardToPerson(cardId: string, assignee: BoardPerson) {
  const card = board.cards.find((item) => item.id === cardId)
  if (!card) return null
  if (!card.assignees.some((item) => item.id === assignee.id)) card.assignees.push(assignee)
  touch(card)
  return structuredClone(card)
}

export function getCard(cardId: string) {
  const card = board.cards.find((item) => item.id === cardId)
  return card ? structuredClone(card) : null
}

export function commentCard(cardId: string, body: string, author: BoardPerson) {
  const card = board.cards.find((item) => item.id === cardId)
  if (!card) return null
  card.comments.push({ id: id('comment'), body, author, createdAt: now() })
  touch(card)
  return structuredClone(card)
}
