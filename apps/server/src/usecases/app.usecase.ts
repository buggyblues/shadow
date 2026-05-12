import type { AccessService } from '../security/access.service'
import type { AppService } from '../services/app.service'
import type { AuditLogService } from '../services/audit-log.service'
import type {
  CreateAppInput,
  PublishFromWorkspaceInput,
  UpdateAppInput,
} from '../validators/app.schema'
import type { SecureUseCaseInput } from './_security-usecase'
import { auditUseCase } from './_security-usecase'

function actorUserIdOrSystem(input: SecureUseCaseInput) {
  return input.ctx.actor.kind === 'system'
    ? '00000000-0000-0000-0000-000000000000'
    : input.ctx.actor.userId
}

export class AppUseCase {
  constructor(
    private deps: {
      accessService: AccessService
      appService: AppService
      auditLogService: AuditLogService
    },
  ) {}

  async createApp(
    input: SecureUseCaseInput & {
      serverId: string
      payload: CreateAppInput
    },
  ) {
    return auditUseCase(this.deps, input, {
      action: 'app.create',
      scope: { kind: 'server', id: input.serverId },
      run: async () => {
        await this.deps.accessService.requireServerAdmin(input.ctx.actor, input.serverId)
        return this.deps.appService.createApp(
          input.serverId,
          actorUserIdOrSystem(input),
          input.payload,
        )
      },
    })
  }

  async updateApp(
    input: SecureUseCaseInput & {
      serverId: string
      appId: string
      payload: UpdateAppInput
    },
  ) {
    return auditUseCase(this.deps, input, {
      action: 'app.update',
      scope: { kind: 'server', id: input.serverId },
      resource: { kind: 'app', id: input.appId },
      run: async () => {
        await this.deps.accessService.requireAppManage(input.ctx.actor, input.serverId, input.appId)
        return this.deps.appService.updateAppInServer(input.serverId, input.appId, input.payload)
      },
    })
  }

  async deleteApp(
    input: SecureUseCaseInput & {
      serverId: string
      appId: string
    },
  ) {
    return auditUseCase(this.deps, input, {
      action: 'app.delete',
      scope: { kind: 'server', id: input.serverId },
      resource: { kind: 'app', id: input.appId },
      run: async () => {
        await this.deps.accessService.requireAppManage(input.ctx.actor, input.serverId, input.appId)
        await this.deps.appService.deleteAppInServer(input.serverId, input.appId)
        return { ok: true }
      },
    })
  }

  async publishFromWorkspace(
    input: SecureUseCaseInput & {
      serverId: string
      payload: PublishFromWorkspaceInput
    },
  ) {
    return auditUseCase(this.deps, input, {
      action: 'app.publishFromWorkspace',
      scope: { kind: 'server', id: input.serverId },
      run: async () => {
        await this.deps.accessService.requireServerAdmin(input.ctx.actor, input.serverId)
        return this.deps.appService.publishFromWorkspace(
          input.serverId,
          actorUserIdOrSystem(input),
          input.payload,
        )
      },
    })
  }
}
