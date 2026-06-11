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
}

describe('cardMatchesBoardFilter', () => {
  it('searches card title, labels, and assignee names', () => {
    expect(cardMatchesBoardFilter(card, { directory, query: 'launch' })).toBe(true)
    expect(cardMatchesBoardFilter(card, { directory, query: 'coordinator' })).toBe(true)
    expect(cardMatchesBoardFilter(card, { directory, query: 'finance' })).toBe(false)
  })

  it('searches dates and checklist item text', () => {
    const detailedCard: BoardCard = {
      ...card,
      dates: { due: '2026-02-03T23:59:00.000Z', dueComplete: false },
      checklists: [
        {
          id: 'checklist-1',
          title: 'Launch checklist',
          createdAt: '2026-01-01T00:00:00.000Z',
          items: [
            {
              id: 'check-1',
              text: 'Confirm staging deployment',
              done: false,
              createdAt: '2026-01-01T00:00:00.000Z',
            },
          ],
        },
      ],
    }

    expect(cardMatchesBoardFilter(detailedCard, { directory, query: 'staging' })).toBe(true)
    expect(cardMatchesBoardFilter(detailedCard, { directory, query: '2026-02-03' })).toBe(true)
  })
})
