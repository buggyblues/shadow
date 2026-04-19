// Re-exports all store symbols — backward compatible with 'from ./store' or './store/index'.

export { AppContext, useApp } from './context'
export { getActiveDeck } from './helpers'
export { reducer } from './reducer'
export { createInitialState } from './state'
export type { Action, AppState } from './types'
