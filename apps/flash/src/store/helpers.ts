import type { Deck, Project } from '../types'
import type { AppState } from './types'

/** Update a deck inside project immutably. */
export function updateDeck(project: Project, deckId: string, updater: (d: Deck) => Deck): Project {
  return {
    ...project,
    decks: project.decks.map((d) => (d.id === deckId ? updater(d) : d)),
    updatedAt: Date.now(),
  }
}

/** Get the active deck from project. */
export function getActiveDeck(project: Project): Deck | undefined {
  return project.decks.find((d) => d.id === project.activeDeckId)
}
