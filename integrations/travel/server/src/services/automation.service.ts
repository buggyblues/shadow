import type { AutomationDao } from '../dao/automation.dao.js'
import type { ShadowGateway } from '../gateways/shadow.gateway.js'
import { badRequest } from '../lib/errors.js'
import { createId } from '../lib/id.js'
import { nowIso } from '../lib/time.js'
import type { AutomationTask, RequestContext } from '../types.js'
import type { CreateAutomationTaskInput } from '../validators/travel.schema.js'

export class AutomationService {
  constructor(
    private readonly automationDao: AutomationDao,
    private readonly shadowGateway: ShadowGateway,
  ) {}

  async listTasks(ctx: RequestContext, tripId: string) {
    const tasks = await this.automationDao.listTasks(tripId)
    const timeoutMs = Math.max(
      60_000,
      Number(process.env.TRAVEL_BUDDY_TASK_TIMEOUT_MS ?? 15 * 60_000) || 15 * 60_000,
    )
    const active = tasks.filter(
      (task) => task.source === 'buddy' && (task.status === 'queued' || task.status === 'running'),
    )
    await Promise.all(
      active.map(async (task) => {
        const delivery = task.shadowDelivery
        const remote = delivery
          ? await this.shadowGateway.getBuddyTaskStatus(ctx, delivery).catch(() => null)
          : null
        const timedOut = Date.now() - Date.parse(task.updatedAt) >= timeoutMs
        if (!remote && !timedOut) return
        if (remote?.status === 'queued' || remote?.status === 'claimed') {
          if (!timedOut) return
        } else if (remote?.status === 'running') {
          if (!timedOut) {
            if (task.status === 'running') return
            await this.automationDao.updateTask(task.id, (current) => ({
              ...current,
              status: 'running',
              updatedAt: nowIso(),
            }))
            return
          }
        }

        const error =
          remote?.status === 'completed'
            ? 'Buddy completed the task without submitting the required Travel plan draft.'
            : remote?.status === 'failed' || remote?.status === 'canceled'
              ? remote.note || `Buddy task ${remote.status}.`
              : remote?.status === 'transferred'
                ? 'Buddy transferred the task without submitting a Travel plan draft.'
                : 'Buddy did not submit the required Travel plan draft before the task timed out.'
        await this.automationDao.updateTask(task.id, (current) => ({
          ...current,
          error,
          status: 'failed',
          updatedAt: nowIso(),
        }))
      }),
    )
    return this.automationDao.listTasks(tripId)
  }

  async createTask(ctx: RequestContext, tripId: string, input: CreateAutomationTaskInput) {
    const timestamp = nowIso()
    const task: AutomationTask = {
      id: createId('task'),
      tripId,
      source: input.source,
      status: input.source === 'buddy' ? 'queued' : 'completed',
      title: input.title,
      input: input.input,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    const saved = await this.automationDao.createTask(task)

    if (input.source === 'buddy') {
      const agentId = typeof input.input.agentId === 'string' ? input.input.agentId.trim() : ''
      if (!agentId) throw badRequest('Buddy automation requires input.agentId')
      const dispatch = await this.shadowGateway.dispatchBuddyTask(ctx, {
        agentId,
        title: input.title,
        body: String(input.input.prompt ?? input.title),
        idempotencyKey: `travel:automation:${saved.id}:${agentId}`,
        resource: { kind: 'travel.trip', id: tripId, label: input.title },
        data: { tripId, automationTaskId: saved.id, ...input.input },
      })
      await this.automationDao.updateTask(saved.id, (current) => ({
        ...current,
        status: dispatch.delivery.pendingId ? 'queued' : 'running',
        shadowDelivery: dispatch.delivery,
        result: { delivery: dispatch.delivery },
        updatedAt: nowIso(),
      }))
    }

    return saved
  }
}
