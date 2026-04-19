import type { Action, AppState } from '../types'

export function pipelineReducer(state: AppState, action: Action): AppState | undefined {
  const now = Date.now()
  switch (action.type) {
    case 'ADD_PIPELINE':
      return { ...state, pipelines: [...state.pipelines, action.pipeline] }
    case 'UPDATE_PIPELINE':
      return {
        ...state,
        pipelines: state.pipelines.map((p) =>
          p.id === action.pipelineId ? { ...p, ...action.updates } : p,
        ),
      }
    case 'ADVANCE_PIPELINE':
      return {
        ...state,
        pipelines: state.pipelines.map((p) =>
          p.id === action.pipelineId ? { ...p, currentStep: p.currentStep + 1 } : p,
        ),
      }
    case 'COMPLETE_PIPELINE':
      return {
        ...state,
        pipelines: state.pipelines.map((p) =>
          p.id === action.pipelineId ? { ...p, status: 'completed', completedAt: now } : p,
        ),
      }
    case 'FAIL_PIPELINE':
      return {
        ...state,
        pipelines: state.pipelines.map((p) =>
          p.id === action.pipelineId
            ? { ...p, status: 'error', error: action.error, completedAt: now }
            : p,
        ),
      }
    case 'ADD_PIPELINE_ITEM':
      return { ...state, pipelineItems: [action.item, ...state.pipelineItems] }
    case 'UPDATE_PIPELINE_ITEM':
      return {
        ...state,
        pipelineItems: state.pipelineItems.map((p) =>
          p.id === action.id ? { ...p, ...action.updates } : p,
        ),
      }
    case 'REMOVE_PIPELINE_ITEM':
      return { ...state, pipelineItems: state.pipelineItems.filter((p) => p.id !== action.id) }
    default:
      return undefined
  }
}
