import type { AccessPolicy } from '../security/access-policy.js'
import type { TodoService } from '../services/todo.service.js'
import type { RequestContext } from '../types.js'
import type {
  CreateTodoInput,
  ReorderTodosInput,
  SetCategoryAssigneesInput,
  UpdateTodoInput,
} from '../validators/travel.schema.js'
import type { TravelEventBus } from '../ws/travel-events.js'

export class TodoUseCase {
  constructor(
    private readonly todoService: TodoService,
    private readonly accessPolicy: AccessPolicy,
    private readonly eventBus: TravelEventBus,
  ) {}

  async listTodos(ctx: RequestContext, tripId: string) {
    await this.accessPolicy.requireTripRead(ctx, tripId)
    return this.todoService.listTodos(tripId)
  }

  async createTodo(ctx: RequestContext, tripId: string, input: CreateTodoInput) {
    const access = await this.accessPolicy.requireTripCapability(ctx, tripId, 'todo.write')
    const todo = await this.todoService.createTodo(tripId, input, access.member?.id ?? undefined)
    this.eventBus.emit({ type: 'todo.created', tripId, payload: { todo } })
    return todo
  }

  async updateTodo(ctx: RequestContext, tripId: string, todoId: string, input: UpdateTodoInput) {
    await this.accessPolicy.requireTripCapability(ctx, tripId, 'todo.write')
    const todo = await this.todoService.updateTodo(tripId, todoId, input)
    this.eventBus.emit({ type: 'todo.updated', tripId, payload: { todo } })
    return todo
  }

  async toggleTodo(ctx: RequestContext, tripId: string, todoId: string, done?: boolean) {
    await this.accessPolicy.requireTripCapability(ctx, tripId, 'todo.write')
    const todo = await this.todoService.toggleTodo(tripId, todoId, done)
    this.eventBus.emit({ type: 'todo.toggled', tripId, payload: { todo } })
    return todo
  }

  async deleteTodo(ctx: RequestContext, tripId: string, todoId: string) {
    await this.accessPolicy.requireTripCapability(ctx, tripId, 'todo.write')
    const todo = await this.todoService.deleteTodo(tripId, todoId)
    this.eventBus.emit({ type: 'todo.deleted', tripId, payload: { todo } })
    return todo
  }

  async reorderTodos(ctx: RequestContext, tripId: string, input: ReorderTodosInput) {
    await this.accessPolicy.requireTripCapability(ctx, tripId, 'todo.write')
    const todos = await this.todoService.reorderTodos(tripId, input)
    this.eventBus.emit({ type: 'todo.reordered', tripId, payload: { todos } })
    return todos
  }

  async listCategoryAssignees(ctx: RequestContext, tripId: string) {
    await this.accessPolicy.requireTripRead(ctx, tripId)
    return this.todoService.listCategoryAssignees(tripId)
  }

  async setCategoryAssignees(
    ctx: RequestContext,
    tripId: string,
    input: SetCategoryAssigneesInput,
  ) {
    await this.accessPolicy.requireTripCapability(ctx, tripId, 'todo.write')
    const assignee = await this.todoService.setCategoryAssignees(tripId, input)
    this.eventBus.emit({ type: 'todo.category_assignees.updated', tripId, payload: { assignee } })
    return assignee
  }
}
