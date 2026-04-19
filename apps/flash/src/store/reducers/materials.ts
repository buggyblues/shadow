import type { Action, AppState } from '../types'

export function materiaReducer(state: AppState, action: Action): AppState | undefined {
  const now = Date.now()
  switch (action.type) {
    case 'ADD_MATERIALS':
      return {
        ...state,
        project: {
          ...state.project,
          materials: [...state.project.materials, ...action.materials],
          updatedAt: now,
        },
      }
    case 'UPDATE_MATERIAL':
      return {
        ...state,
        project: {
          ...state.project,
          materials: state.project.materials.map((m) =>
            m.id === action.id ? { ...m, ...action.updates } : m,
          ),
          updatedAt: now,
        },
      }
    case 'REMOVE_MATERIAL': {
      const mat = state.project.materials.find((m) => m.id === action.id)
      const cardIdsToRemove = new Set(mat?.cardIds || [])
      return {
        ...state,
        project: {
          ...state.project,
          materials: state.project.materials.filter((m) => m.id !== action.id),
          cards: state.project.cards.filter((c) => !cardIdsToRemove.has(c.id)),
          updatedAt: now,
        },
      }
    }
    default:
      return undefined
  }
}
