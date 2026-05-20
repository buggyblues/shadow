import { randomBytes } from 'node:crypto'
import type { ChannelDao } from '../dao/channel.dao'
import type { InviteCodeDao } from '../dao/invite-code.dao'
import type { MessageDao } from '../dao/message.dao'
import type { PasswordChangeLogDao } from '../dao/password-change-log.dao'
import type { ServerDao } from '../dao/server.dao'
import type { UserDao } from '../dao/user.dao'
import type { AccessService } from '../security/access.service'
import type { AuditLogService } from '../services/audit-log.service'
import type { SecureUseCaseInput } from './_security-usecase'
import { auditUseCase } from './_security-usecase'

export class AdminUseCase {
  constructor(
    private deps: {
      accessService: AccessService
      auditLogService: AuditLogService
      userDao: UserDao
      serverDao: ServerDao
      inviteCodeDao: InviteCodeDao
      channelDao: ChannelDao
      messageDao: MessageDao
      passwordChangeLogDao: PasswordChangeLogDao
    },
  ) {}

  // ── Stats ────────────────────────────────────────────

  async getStats(input: SecureUseCaseInput & { days?: number }) {
    return auditUseCase(this.deps, input, {
      action: 'admin.stats',
      run: async () => {
        await this.deps.accessService.requirePlatformAdmin(input.ctx.actor)
        const { days = 14 } = input
        return { days }
      },
    })
  }

  async getUsers(input: SecureUseCaseInput & { limit?: number; offset?: number }) {
    await this.deps.accessService.requirePlatformAdmin(input.ctx.actor)
    return this.deps.userDao.findAll(input.limit ?? 50, input.offset ?? 0)
  }

  async updateUser(
    input: SecureUseCaseInput & {
      userId: string
      data: { displayName?: string; status?: 'online' | 'idle' | 'dnd' | 'offline' }
    },
  ) {
    return auditUseCase(this.deps, input, {
      action: 'admin.users.update',
      resource: { kind: 'user', id: input.userId },
      run: async () => {
        await this.deps.accessService.requirePlatformAdmin(input.ctx.actor)
        return this.deps.userDao.update(input.userId, input.data)
      },
    })
  }

  async deleteUser(input: SecureUseCaseInput & { userId: string }) {
    return auditUseCase(this.deps, input, {
      action: 'admin.users.delete',
      resource: { kind: 'user', id: input.userId },
      run: async () => {
        await this.deps.accessService.requirePlatformAdmin(input.ctx.actor)
        await this.deps.userDao.update(input.userId, { displayName: '[deleted]' })
        return { ok: true }
      },
    })
  }

  // ── Servers ──────────────────────────────────────────

  async getServers(input: SecureUseCaseInput & { limit?: number; offset?: number }) {
    await this.deps.accessService.requirePlatformAdmin(input.ctx.actor)
    return this.deps.serverDao.findAll(input.limit ?? 50, input.offset ?? 0)
  }

  async getServer(input: SecureUseCaseInput & { serverId: string }) {
    await this.deps.accessService.requirePlatformAdmin(input.ctx.actor)
    const server = await this.deps.serverDao.findById(input.serverId)
    if (!server) return { ok: false as const, error: 'Server not found' }
    return { ok: true as const, server }
  }

  async updateServer(
    input: SecureUseCaseInput & {
      serverId: string
      data: Parameters<ServerDao['update']>[1]
    },
  ) {
    return auditUseCase(this.deps, input, {
      action: 'admin.servers.update',
      resource: { kind: 'server', id: input.serverId },
      run: async () => {
        await this.deps.accessService.requirePlatformAdmin(input.ctx.actor)
        const server = await this.deps.serverDao.findById(input.serverId)
        if (!server) return { ok: false as const, error: 'Server not found' }
        const updated = await this.deps.serverDao.update(input.serverId, input.data)
        return { ok: true as const, server: updated }
      },
    })
  }

  async deleteServer(input: SecureUseCaseInput & { serverId: string }) {
    return auditUseCase(this.deps, input, {
      action: 'admin.servers.delete',
      resource: { kind: 'server', id: input.serverId },
      run: async () => {
        await this.deps.accessService.requirePlatformAdmin(input.ctx.actor)
        await this.deps.serverDao.delete(input.serverId)
        return { ok: true }
      },
    })
  }

  async getServerChannels(input: SecureUseCaseInput & { serverId: string }) {
    await this.deps.accessService.requirePlatformAdmin(input.ctx.actor)
    return this.deps.channelDao.findByServerId(input.serverId)
  }

  async getChannelMessages(
    input: SecureUseCaseInput & {
      channelId: string
      limit?: number
      cursor?: string
    },
  ) {
    await this.deps.accessService.requirePlatformAdmin(input.ctx.actor)
    return this.deps.messageDao.findByChannelId(input.channelId, input.limit ?? 50, input.cursor)
  }

  // ── Channels ─────────────────────────────────────────

  async getChannels(input: SecureUseCaseInput & { serverId?: string }) {
    await this.deps.accessService.requirePlatformAdmin(input.ctx.actor)
    if (input.serverId) {
      return this.deps.channelDao.findByServerId(input.serverId)
    }
    return []
  }

  async deleteChannel(input: SecureUseCaseInput & { channelId: string }) {
    return auditUseCase(this.deps, input, {
      action: 'admin.channels.delete',
      resource: { kind: 'channel', id: input.channelId },
      run: async () => {
        await this.deps.accessService.requirePlatformAdmin(input.ctx.actor)
        await this.deps.channelDao.delete(input.channelId)
        return { ok: true }
      },
    })
  }

  // ── Messages ─────────────────────────────────────────

  async deleteMessage(input: SecureUseCaseInput & { messageId: string }) {
    return auditUseCase(this.deps, input, {
      action: 'admin.messages.delete',
      resource: { kind: 'message', id: input.messageId },
      run: async () => {
        await this.deps.accessService.requirePlatformAdmin(input.ctx.actor)
        const message = await this.deps.messageDao.findById(input.messageId)
        if (!message) return { ok: false as const, error: 'Message not found' }
        await this.deps.messageDao.deleteById(input.messageId, message.authorId)
        return { ok: true }
      },
    })
  }

  // ── Invite Codes ─────────────────────────────────────

  async getInviteCodes(input: SecureUseCaseInput & { limit?: number; offset?: number }) {
    await this.deps.accessService.requirePlatformAdmin(input.ctx.actor)
    return this.deps.inviteCodeDao.findAll(input.limit ?? 50, input.offset ?? 0)
  }

  async createInviteCodes(
    input: SecureUseCaseInput & {
      count: number
      note?: string
    },
  ) {
    return auditUseCase(this.deps, input, {
      action: 'admin.inviteCodes.create',
      run: async () => {
        await this.deps.accessService.requirePlatformAdmin(input.ctx.actor)
        const userId =
          input.ctx.actor.kind === 'user'
            ? input.ctx.actor.userId
            : '00000000-0000-0000-0000-000000000000'
        const codes = []
        for (let i = 0; i < input.count; i++) {
          const code = await this.deps.inviteCodeDao.create({
            code: generateAdminCode(),
            createdBy: userId,
            note: input.note,
          })
          codes.push(code)
        }
        return codes
      },
    })
  }

  async deleteInviteCode(input: SecureUseCaseInput & { id: string }) {
    return auditUseCase(this.deps, input, {
      action: 'admin.inviteCodes.delete',
      resource: { kind: 'inviteCode', id: input.id },
      run: async () => {
        await this.deps.accessService.requirePlatformAdmin(input.ctx.actor)
        await this.deps.inviteCodeDao.delete(input.id)
        return { ok: true }
      },
    })
  }

  async deactivateInviteCode(input: SecureUseCaseInput & { id: string }) {
    return auditUseCase(this.deps, input, {
      action: 'admin.inviteCodes.deactivate',
      resource: { kind: 'inviteCode', id: input.id },
      run: async () => {
        await this.deps.accessService.requirePlatformAdmin(input.ctx.actor)
        return this.deps.inviteCodeDao.deactivate(input.id)
      },
    })
  }

  // ── Password Logs ────────────────────────────────────

  async getPasswordLogs(
    input: SecureUseCaseInput & {
      limit?: number
      offset?: number
      userId?: string
    },
  ) {
    await this.deps.accessService.requirePlatformAdmin(input.ctx.actor)
    if (input.userId) {
      return this.deps.passwordChangeLogDao.findByUserId(
        input.userId,
        input.limit ?? 50,
        input.offset ?? 0,
      )
    }
    return this.deps.passwordChangeLogDao.findAll(input.limit ?? 50, input.offset ?? 0)
  }

  async getPasswordLogCount(input: SecureUseCaseInput & { userId?: string }) {
    await this.deps.accessService.requirePlatformAdmin(input.ctx.actor)
    const count = input.userId
      ? await this.deps.passwordChangeLogDao.countByUserId(input.userId)
      : await this.deps.passwordChangeLogDao.count()
    return { count }
  }

  // ── Agents (admin enrichment) ────────────────────────

  async getUserById(input: SecureUseCaseInput & { userId: string }) {
    await this.deps.accessService.requirePlatformAdmin(input.ctx.actor)
    return this.deps.userDao.findById(input.userId)
  }
}

function generateAdminCode(length = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = randomBytes(length)
  let code = ''
  for (let i = 0; i < length; i++) {
    code += chars.charAt(bytes[i]! % chars.length)
  }
  return code
}
