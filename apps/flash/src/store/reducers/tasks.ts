import type { Action, AppState } from '../types'

export function taskReducer(state: AppState, action: Action): AppState | undefined {
  const now = Date.now()
  switch (action.type) {
    case 'ADD_TASK':
      return {
        ...state,
        project: { ...state.project, tasks: [...state.project.tasks, action.task], updatedAt: now },
      }
    case 'UPDATE_TASK':
      return {
        ...state,
        project: {
          ...state.project,
          tasks: state.project.tasks.map((t) =>
            t.id === action.id ? { ...t, ...action.updates } : t,
          ),
          updatedAt: now,
        },
      }
    case 'ADD_TASK_LOG':
      return {
        ...state,
        project: {
          ...state.project,
          tasks: state.project.tasks.map((t) =>
            t.id === action.taskId
              ? {
                  ...t,
                  logs: [...t.logs, `[${new Date().toLocaleTimeString()}] ${action.message}`],
                }
              : t,
          ),
          updatedAt: now,
        },
      }
    case 'ADD_TASK_ARTIFACT':
      return {
        ...state,
        project: {
          ...state.project,
          tasks: state.project.tasks.map((t) =>
            t.id === action.taskId ? { ...t, artifacts: [...t.artifacts, action.artifact] } : t,
          ),
          updatedAt: now,
        },
      }
    case 'COMPLETE_TASK':
      return {
        ...state,
        project: {
          ...state.project,
          tasks: state.project.tasks.map((t) =>
            t.id === action.taskId
              ? {
                  ...t,
                  status: 'completed' as const,
                  completedAt: now,
                  artifacts: action.artifacts ? [...t.artifacts, ...action.artifacts] : t.artifacts,
                }
              : t,
          ),
          updatedAt: now,
        },
      }
    case 'FAIL_TASK':
      return {
        ...state,
        project: {
          ...state.project,
          tasks: state.project.tasks.map((t) =>
            t.id === action.taskId
              ? { ...t, status: 'error' as const, completedAt: now, error: action.error }
              : t,
          ),
          updatedAt: now,
        },
      }
    default:
      return undefined
  }
}
