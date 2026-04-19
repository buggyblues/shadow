import type { Action, AppState } from '../types'

export function logsReducer(state: AppState, action: Action): AppState | undefined {
  switch (action.type) {
    case 'ADD_LOG':
      return {
        ...state,
        logs: [...state.logs, `[${new Date().toLocaleTimeString()}] ${action.message}`],
      }
    case 'CLEAR_LOGS':
      return { ...state, logs: [] }
    default:
      return undefined
  }
}
