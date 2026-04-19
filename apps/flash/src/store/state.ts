import { genId } from '../api'
import { DEFAULT_THEME } from '../themes'
import type { Deck } from '../types'
import { DEFAULT_USER_SETTINGS } from '../types'
import type { AppState } from './types'

function createDefaultDeck(): Deck {
  return {
    id: genId(),
    title: 'Deck 1',
    description: '',
    outline: [],
    theme: DEFAULT_THEME,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

export function createInitialState(): AppState {
  const defaultDeck = createDefaultDeck()
  return {
    project: {
      id: genId(),
      title: '',
      materials: [],
      cards: [],
      decks: [defaultDeck],
      activeDeckId: defaultDeck.id,
      todos: [],
      tasks: [],
      skills: [],
      researchSessions: [],
      status: 'idle',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    logs: [],
    pipelines: [],
    userSettings: { ...DEFAULT_USER_SETTINGS },
    pipelineItems: [],
    viewMode: 'knowledge',
  }
}
