import type { TravelDataStore } from '../db/database.js'
import type { CategoryAssignee, TodoItem } from '../types.js'

export class TodoDao {
  constructor(private readonly db: TravelDataStore) {}

  listTodos(tripId: string) {
    return this.db.read((state) =>
      state.todos
        .filter((todo) => todo.tripId === tripId)
        .sort((a, b) => a.sequence - b.sequence || a.createdAt.localeCompare(b.createdAt)),
    )
  }

  findTodo(todoId: string) {
    return this.db.read((state) => state.todos.find((todo) => todo.id === todoId) ?? null)
  }

  createTodo(todo: TodoItem) {
    return this.db.write((state) => {
      state.todos.push(todo)
      return todo
    })
  }

  updateTodo(todoId: string, updater: (todo: TodoItem) => TodoItem) {
    return this.db.write((state) => {
      const index = state.todos.findIndex((todo) => todo.id === todoId)
      if (index < 0) return null
      const current = state.todos[index]
      if (!current) return null
      const next = updater(current)
      state.todos[index] = next
      return next
    })
  }

  deleteTodo(todoId: string) {
    return this.db.write((state) => {
      const todo = state.todos.find((item) => item.id === todoId) ?? null
      state.todos = state.todos.filter((item) => item.id !== todoId)
      return todo
    })
  }

  reorderTodos(tripId: string, orderedIds: string[]) {
    return this.db.write((state) => {
      const idSet = new Set(orderedIds)
      const existing = state.todos.filter((todo) => todo.tripId === tripId && idSet.has(todo.id))
      if (existing.length !== orderedIds.length) return null
      const byId = new Map(existing.map((todo) => [todo.id, todo]))
      for (const [index, todoId] of orderedIds.entries()) {
        const todo = byId.get(todoId)
        if (!todo) return null
        todo.sequence = (index + 1) * 100
        todo.updatedAt = new Date().toISOString()
      }
      return existing
    })
  }

  listCategoryAssignees(tripId: string) {
    return this.db.read((state) =>
      state.categoryAssignees
        .filter((item) => item.tripId === tripId && item.domain === 'todo')
        .sort((a, b) => a.category.localeCompare(b.category)),
    )
  }

  setCategoryAssignees(assignee: CategoryAssignee) {
    return this.db.write((state) => {
      state.categoryAssignees = state.categoryAssignees.filter(
        (item) =>
          !(
            item.tripId === assignee.tripId &&
            item.domain === 'todo' &&
            item.category === assignee.category
          ),
      )
      state.categoryAssignees.push(assignee)
      return assignee
    })
  }
}
