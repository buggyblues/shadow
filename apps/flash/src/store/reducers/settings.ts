import type { Action, AppState } from '../types'

export function settingsReducer(state: AppState, action: Action): AppState | undefined {
  switch (action.type) {
    case 'SET_USER_SETTINGS':
      return { ...state, userSettings: { ...state.userSettings, ...action.settings } }
    case 'SET_VIEW_MODE':
      return { ...state, viewMode: action.mode }
    default:
      return undefined
  }
}
