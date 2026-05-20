import type { InviteCodeDao } from '../dao/invite-code.dao'
import type { AccessService } from '../security/access.service'
import type { AuditLogService } from '../services/audit-log.service'
import type { SecureUseCaseInput } from './_security-usecase'
import { auditUseCase } from './_security-usecase'

export class InviteUseCase {
  constructor(
    private deps: {
      accessService: AccessService
      auditLogService: AuditLogService
      inviteCodeDao: InviteCodeDao
    },
  ) {}

  async findMyCodes(input: SecureUseCaseInput & { limit?: number; offset?: number }) {
    const userId =
      input.ctx.actor.kind === 'user'
        ? input.ctx.actor.userId
        : '00000000-0000-0000-0000-000000000000'
    return this.deps.inviteCodeDao.findByCreator(userId, input.limit ?? 1000, input.offset ?? 0)
  }

  async createCode(
    input: SecureUseCaseInput & {
      code: string
      note?: string
    },
  ) {
    return auditUseCase(this.deps, input, {
      action: 'invite.code.create',
      run: async () => {
        const userId =
          input.ctx.actor.kind === 'user'
            ? input.ctx.actor.userId
            : '00000000-0000-0000-0000-000000000000'
        return this.deps.inviteCodeDao.create({
          code: input.code,
          createdBy: userId,
          note: input.note,
        })
      },
    })
  }

  async deactivateCode(input: SecureUseCaseInput & { id: string }) {
    return auditUseCase(this.deps, input, {
      action: 'invite.code.deactivate',
      resource: { kind: 'inviteCode', id: input.id },
      run: async () => {
        return this.deps.inviteCodeDao.deactivate(input.id)
      },
    })
  }

  async deleteCode(input: SecureUseCaseInput & { id: string }) {
    return auditUseCase(this.deps, input, {
      action: 'invite.code.delete',
      resource: { kind: 'inviteCode', id: input.id },
      run: async () => {
        await this.deps.inviteCodeDao.delete(input.id)
        return { ok: true }
      },
    })
  }
}
