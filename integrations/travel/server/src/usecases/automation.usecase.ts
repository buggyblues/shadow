import type { AccessPolicy } from '../security/access-policy.js'
import type { AutomationService } from '../services/automation.service.js'
import type { RequestContext } from '../types.js'
import type { CreateAutomationTaskInput } from '../validators/travel.schema.js'
import type { TravelEventBus } from '../ws/travel-events.js'

export class AutomationUseCase {
  constructor(
    private readonly automationService: AutomationService,
    private readonly accessPolicy: AccessPolicy,
    private readonly eventBus: TravelEventBus,
  ) {}

  async listTasks(ctx: RequestContext, tripId: string) {
    await this.accessPolicy.requireTripRead(ctx, tripId)
    return this.automationService.listTasks(ctx, tripId)
  }

  async createTask(ctx: RequestContext, tripId: string, input: CreateAutomationTaskInput) {
    await this.accessPolicy.requireTripWrite(ctx, tripId)
    const task = await this.automationService.createTask(ctx, tripId, input)
    this.eventBus.emit({ type: 'automation.task.created', tripId, payload: { task } })
    return task
  }
}
