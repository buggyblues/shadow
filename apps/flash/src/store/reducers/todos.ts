import { genId } from '../../api'
import type { TodoItem } from '../../types'
import type { Action, AppState } from '../types'

export function todoReducer(state: AppState, action: Action): AppState | undefined {
  const now = Date.now()
  switch (action.type) {
    case 'ADD_TODO':
      return {
        ...state,
        project: { ...state.project, todos: [...state.project.todos, action.todo], updatedAt: now },
      }
    case 'UPDATE_TODO':
      return {
        ...state,
        project: {
          ...state.project,
          todos: state.project.todos.map((t) =>
            t.id === action.id ? { ...t, ...action.updates } : t,
          ),
          updatedAt: now,
        },
      }
    case 'REMOVE_TODO':
      return {
        ...state,
        project: {
          ...state.project,
          todos: state.project.todos.filter((t) => t.id !== action.id),
          updatedAt: now,
        },
      }
    case 'TOGGLE_TODO':
      return {
        ...state,
        project: {
          ...state.project,
          todos: state.project.todos.map((t) => (t.id === action.id ? { ...t, done: !t.done } : t)),
          updatedAt: now,
        },
      }
    case 'COMPLETE_TODO':
      return {
        ...state,
        project: {
          ...state.project,
          todos: state.project.todos.map((t) =>
            t.id === action.id ? { ...t, done: true, completionNote: action.completionNote } : t,
          ),
          updatedAt: now,
        },
      }
    case 'MOVE_CARD_TO_TODO': {
      const card = state.project.cards.find((c) => c.id === action.cardId)
      if (!card) return state
      const newTodo: TodoItem = {
        id: genId(),
        text: `[${card.kind === 'inspiration' ? '💡' : '📌'}] ${card.title}：${card.content.slice(0, 200)}`,
        done: false,
        createdAt: now,
      }
      return {
        ...state,
        project: {
          ...state.project,
          todos: [...state.project.todos, newTodo],
          cards:
            card.kind === 'inspiration'
              ? state.project.cards.filter((c) => c.id !== action.cardId)
              : state.project.cards,
          updatedAt: now,
        },
      }
    }
    default:
      return undefined
  }
}
