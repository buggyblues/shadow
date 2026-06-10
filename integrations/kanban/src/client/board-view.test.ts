import { describe, expect, it } from 'vitest'
import type { BoardCard } from '../types.js'
import { cardMatchesBoardFilter } from './components/board-view.js'
import type { BuddyDirectory } from './identity.js'

const directory: BuddyDirectory = {
  byAgentId: new Map(),
  byPersonId: new Map(),
  byUserId: new Map(),
}

const card: BoardCard = {
  id: 'card-1',
  columnId: 'doing',
  title: 'Produce launch checklist',
  description: 'Coordinate QA handoff.',
  labels: ['QA', 'Launch'],
  assignees: [
    {
      kind: 'manual',
      id: 'manual:coordinator',
      displayName: 'Coordinator',
    },
  ],
  comments: [],
  createdBy: {
    kind: 'manual',
    id: 'manual:coordinator',
    displayName: 'Coordinator',
  },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  status: 'running',
  progress: 48,
}

describe('cardMatchesBoardFilter', () => {
  it('searches card title, labels, and assignee names', () => {
    expect(cardMatchesBoardFilter(card, { directory, filter: 'active', query: 'launch' })).toBe(
      true,
    )
    expect(
      cardMatchesBoardFilter(card, { directory, filter: 'active', query: 'coordinator' }),
    ).toBe(true)
    expect(cardMatchesBoardFilter(card, { directory, filter: 'active', query: 'finance' })).toBe(
      false,
    )
  })

  it('keeps completed cards out of the active filter but visible in all and done filters', () => {
    const doneCard = { ...card, columnId: 'done', status: 'done' as const, progress: 100 }

    expect(cardMatchesBoardFilter(doneCard, { directory, filter: 'active', query: '' })).toBe(false)
    expect(cardMatchesBoardFilter(doneCard, { directory, filter: 'all', query: '' })).toBe(true)
    expect(cardMatchesBoardFilter(doneCard, { directory, filter: 'done', query: '' })).toBe(true)
  })
})
