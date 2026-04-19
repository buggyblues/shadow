import { cardReducer } from './reducers/cards'
import { deckReducer } from './reducers/decks'
import { logsReducer } from './reducers/logs'
import { materiaReducer } from './reducers/materials'
import { pipelineReducer } from './reducers/pipelines'
import { projectReducer } from './reducers/project'
import { researchReducer } from './reducers/research'
import { settingsReducer } from './reducers/settings'
import { skillReducer } from './reducers/skills'
import { taskReducer } from './reducers/tasks'
import { todoReducer } from './reducers/todos'
import type { Action, AppState } from './types'

export function reducer(state: AppState, action: Action): AppState {
  return (
    projectReducer(state, action) ??
    materiaReducer(state, action) ??
    cardReducer(state, action) ??
    deckReducer(state, action) ??
    todoReducer(state, action) ??
    taskReducer(state, action) ??
    researchReducer(state, action) ??
    skillReducer(state, action) ??
    pipelineReducer(state, action) ??
    settingsReducer(state, action) ??
    logsReducer(state, action) ??
    state
  )
}
