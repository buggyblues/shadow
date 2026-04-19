import type { Action, AppState } from '../types'

export function skillReducer(state: AppState, action: Action): AppState | undefined {
  const now = Date.now()
  switch (action.type) {
    case 'SET_SKILLS':
      return { ...state, project: { ...state.project, skills: action.skills, updatedAt: now } }
    case 'UPDATE_SKILL':
      return {
        ...state,
        project: {
          ...state.project,
          skills: state.project.skills.map((s) =>
            s.id === action.skillId ? { ...s, ...action.updates } : s,
          ),
          updatedAt: now,
        },
      }
    case 'INSTALL_SKILL':
      return {
        ...state,
        project: {
          ...state.project,
          skills: [...state.project.skills.filter((s) => s.id !== action.skill.id), action.skill],
          updatedAt: now,
        },
      }
    default:
      return undefined
  }
}
