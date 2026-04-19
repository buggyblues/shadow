// ═══════════════════════════════════════════════════════════════
// DeckService — Deck CRUD (project-scoped)
//
// v8: All operations require projectId (pid)
// ═══════════════════════════════════════════════════════════════

import { randomUUID } from 'node:crypto'
import type { DeckRecord } from '@shadowob/flash-types'
import { deckDao } from '../dao/index.js'

export const deckService = {
  create(pid: string, data: Partial<DeckRecord>) {
    const id = data.id || randomUUID()
    const deck: DeckRecord = {
      id,
      title: data.title || 'Untitled Deck',
      description: data.description || '',
      outline: data.outline || [],
      theme: data.theme || null,
      autoCreatedReason: data.autoCreatedReason,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      projectId: pid,
    }
    deckDao.save(pid, id, deck)
    return deck
  },

  getById(pid: string, id: string) {
    return deckDao.getById(pid, id)
  },

  getAll(pid: string) {
    return deckDao.getAll(pid)
  },

  update(pid: string, id: string, patch: Partial<DeckRecord>) {
    const deck = deckDao.getById(pid, id)
    if (!deck) return null
    Object.assign(deck, patch, { updatedAt: Date.now() })
    deckDao.save(pid, id, deck)
    return deck
  },

  delete(pid: string, id: string) {
    return deckDao.delete(pid, id)
  },
}
