import type { TodoDao } from '../dao/todo.dao.js'
import { notFound } from '../lib/errors.js'
import { createId } from '../lib/id.js'
import { nowIso } from '../lib/time.js'
import type { CategoryAssignee, TodoItem } from '../types.js'
import type {
  CreateTodoInput,
  ReorderTodosInput,
  SetCategoryAssigneesInput,
  UpdateTodoInput,
} from '../validators/travel.schema.js'

export class TodoService {
  constructor(private readonly todoDao: TodoDao) {}

  listTodos(tripId: string) {
    return this.todoDao.listTodos(tripId)
  }

  async createTodo(tripId: string, input: CreateTodoInput, createdByMemberId?: string) {
    const timestamp = nowIso()
    const todo: TodoItem = {
      id: createId('todo'),
      tripId,
      title: input.title,
      category: input.category,
      description: input.description,
      dueDate: input.dueDate,
      assignedToMemberId: input.assignedToMemberId,
      priority: input.priority,
      status: input.status,
      sequence: input.sequence ?? ((await this.todoDao.listTodos(tripId)).length + 1) * 100,
      completedAt: input.status === 'done' ? timestamp : undefined,
      createdByMemberId,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    return this.todoDao.createTodo(todo)
  }

  async updateTodo(tripId: string, todoId: string, input: UpdateTodoInput) {
    const current = await this.todoDao.findTodo(todoId)
    if (!current || current.tripId !== tripId) throw notFound('Todo')
    const updated = await this.todoDao.updateTodo(todoId, (todo) => ({
      ...todo,
      ...input,
      completedAt:
        input.status === 'done'
          ? (todo.completedAt ?? nowIso())
          : input.status
            ? undefined
            : todo.completedAt,
      updatedAt: nowIso(),
    }))
    if (!updated) throw notFound('Todo')
    return updated
  }

  async toggleTodo(tripId: string, todoId: string, done?: boolean) {
    const current = await this.todoDao.findTodo(todoId)
    if (!current || current.tripId !== tripId) throw notFound('Todo')
    return this.updateTodo(tripId, todoId, {
      status: (done ?? current.status !== 'done') ? 'done' : 'open',
    })
  }

  async deleteTodo(tripId: string, todoId: string) {
    const current = await this.todoDao.findTodo(todoId)
    if (!current || current.tripId !== tripId) throw notFound('Todo')
    const deleted = await this.todoDao.deleteTodo(todoId)
    if (!deleted) throw notFound('Todo')
    return deleted
  }

  async reorderTodos(tripId: string, input: ReorderTodosInput) {
    const reordered = await this.todoDao.reorderTodos(tripId, input.orderedIds)
    if (!reordered) throw notFound('Todo')
    return this.todoDao.listTodos(tripId)
  }

  listCategoryAssignees(tripId: string) {
    return this.todoDao.listCategoryAssignees(tripId)
  }

  setCategoryAssignees(tripId: string, input: SetCategoryAssigneesInput) {
    const assignee: CategoryAssignee = {
      id: createId('catassignee'),
      tripId,
      domain: 'todo',
      category: input.category,
      memberIds: input.memberIds,
      updatedAt: nowIso(),
    }
    return this.todoDao.setCategoryAssignees(assignee)
  }
}
