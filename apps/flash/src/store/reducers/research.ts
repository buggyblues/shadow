import type { Action, AppState } from '../types'

export function researchReducer(state: AppState, action: Action): AppState | undefined {
  const now = Date.now()
  switch (action.type) {
    case 'ADD_RESEARCH_SESSION':
      return {
        ...state,
        project: {
          ...state.project,
          researchSessions: [...state.project.researchSessions, action.session],
          updatedAt: now,
        },
      }
    case 'UPDATE_RESEARCH_ANGLE':
      return {
        ...state,
        project: {
          ...state.project,
          researchSessions: state.project.researchSessions.map((s) =>
            s.id === action.sessionId
              ? {
                  ...s,
                  angles: s.angles.map((a) =>
                    a.id === action.angleId ? { ...a, ...action.updates } : a,
                  ),
                }
              : s,
          ),
          updatedAt: now,
        },
      }
    case 'ADD_RESEARCH_ANGLE_LOG':
      return {
        ...state,
        project: {
          ...state.project,
          researchSessions: state.project.researchSessions.map((s) =>
            s.id === action.sessionId
              ? {
                  ...s,
                  angles: s.angles.map((a) =>
                    a.id === action.angleId
                      ? {
                          ...a,
                          logs: [
                            ...a.logs,
                            `[${new Date().toLocaleTimeString()}] ${action.message}`,
                          ],
                        }
                      : a,
                  ),
                }
              : s,
          ),
          updatedAt: now,
        },
      }
    case 'COMPLETE_RESEARCH':
      return {
        ...state,
        project: {
          ...state.project,
          researchSessions: state.project.researchSessions.map((s) =>
            s.id === action.sessionId
              ? {
                  ...s,
                  status: 'completed' as const,
                  completedAt: now,
                  totalCards: s.angles.reduce((sum, a) => sum + a.cardIds.length, 0),
                }
              : s,
          ),
          updatedAt: now,
        },
      }
    case 'FAIL_RESEARCH':
      return {
        ...state,
        project: {
          ...state.project,
          researchSessions: state.project.researchSessions.map((s) =>
            s.id === action.sessionId ? { ...s, status: 'error' as const, completedAt: now } : s,
          ),
          updatedAt: now,
        },
      }
    default:
      return undefined
  }
}
