import { updateDeck } from '../helpers'
import type { Action, AppState } from '../types'

export function projectReducer(state: AppState, action: Action): AppState | undefined {
  const now = Date.now()
  switch (action.type) {
    case 'SET_PROJECT':
      return { ...state, project: action.project }
    case 'SET_STATUS':
      return { ...state, project: { ...state.project, status: action.status, updatedAt: now } }
    case 'SET_TITLE':
      return { ...state, project: { ...state.project, title: action.title, updatedAt: now } }
    case 'SET_SESSION_KEY':
      return {
        ...state,
        project: { ...state.project, sessionKey: action.sessionKey, updatedAt: now },
      }
    case 'SET_DECK_THEME':
      return {
        ...state,
        project: updateDeck(state.project, action.deckId, (d) => ({
          ...d,
          theme: action.theme,
          updatedAt: now,
        })),
      }
    default:
      return undefined
  }
}
