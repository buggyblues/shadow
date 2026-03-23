import { compare, hash } from 'bcryptjs'
import type { AgentDao } from '../dao/agent.dao'
import type { InviteCodeDao } from '../dao/invite-code.dao'
import type { UserDao } from '../dao/user.dao'
import { randomFixedDigits } from '../lib/id'
import { signAccessToken, signRefreshToken, verifyToken } from '../lib/jwt'
import type { LoginInput, RegisterInput } from '../validators/auth.schema'
import type { TaskCenterService } from './task-center.service'

export class AuthService {
  constructor(
    private deps: {
      userDao: UserDao
      inviteCodeDao: InviteCodeDao
      agentDao: AgentDao
      taskCenterService: TaskCenterService
    },
  ) {}

  async register(input: RegisterInput) {
    const { userDao, inviteCodeDao, taskCenterService } = this.deps

    // Validate invite code
    const code = await inviteCodeDao.findAvailable(input.inviteCode)
    if (!code) {
      throw Object.assign(new Error('Invalid or already used invite code'), { status: 400 })
    }

    // Check existing email
    const existingEmail = await userDao.findByEmail(input.email)
    if (existingEmail) {
      throw Object.assign(new Error('Email already in use'), { status: 409 })
    }

    // Auto-generate username if not provided
    let username = input.username
    if (!username) {
      const emailLocalPart = input.email.split('@')[0] ?? 'user'
      const prefix = emailLocalPart.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 24)
      for (let attempt = 0; attempt < 10; attempt++) {
        const suffix = randomFixedDigits(6)
        const candidate = `${prefix}_${suffix}`
        const existing = await userDao.findByUsername(candidate)
        if (!existing) {
          username = candidate
          break
        }
      }
      if (!username) {
        throw Object.assign(new Error('Failed to generate unique username'), { status: 500 })
      }
    } else {
      // Check existing username only when explicitly provided
      const existingUsername = await userDao.findByUsername(username)
      if (existingUsername) {
        throw Object.assign(new Error('Username already taken'), { status: 409 })
      }
    }

    // Hash password
    const passwordHash = await hash(input.password, 12)

    // Create user
    const user = await userDao.create({
      email: input.email,
      username: username,
      passwordHash,
      displayName: input.displayName,
    })
    if (!user) {
      throw Object.assign(new Error('Failed to create user'), { status: 500 })
    }

    // Mark invite code as used
    await inviteCodeDao.markUsed(code.id, user.id)

    // Campaign reward: signup bonus
    await taskCenterService.grantWelcomeReward(user.id)

    // Generate tokens
    const payload = { userId: user.id, email: user.email, username: user.username }
    const accessToken = signAccessToken(payload)
    const refreshToken = signRefreshToken(payload)

    return {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
      },
      accessToken,
      refreshToken,
    }
  }

  async login(input: LoginInput) {
    const { userDao, inviteCodeDao, taskCenterService } = this.deps

    // Support login with email or username
    let user = await userDao.findByEmail(input.email)
    if (!user) {
      // Try to find by username
      user = await userDao.findByUsername(input.email)
    }
    if (!user) {
      throw Object.assign(new Error('Invalid credentials'), { status: 401 })
    }

    const valid = await compare(input.password, user.passwordHash)
    if (!valid) {
      throw Object.assign(new Error('Invalid credentials'), { status: 401 })
    }

    const payload = { userId: user.id, email: user.email, username: user.username }
    const accessToken = signAccessToken(payload)
    const refreshToken = signRefreshToken(payload)

    // Update user status to online
    await userDao.updateStatus(user.id, 'online')

    // Referral campaign reward trigger: on first successful login after registration.
    // grantInviteRewards is idempotent by (userId + rewardKey + inviteCodeId).
    const usedInvite = await inviteCodeDao.findByUsedBy(user.id)
    if (usedInvite?.createdBy && usedInvite.createdBy !== user.id) {
      await taskCenterService.grantInviteRewards(usedInvite.createdBy, user.id, usedInvite.id)
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
      },
      accessToken,
      refreshToken,
    }
  }

  async refresh(refreshToken: string) {
    const { userDao } = this.deps

    try {
      const payload = verifyToken(refreshToken)
      const user = await userDao.findById(payload.userId)
      if (!user) {
        throw Object.assign(new Error('User not found'), { status: 401 })
      }

      const newPayload = { userId: user.id, email: user.email, username: user.username }
      const accessToken = signAccessToken(newPayload)
      const newRefreshToken = signRefreshToken(newPayload)

      return { accessToken, refreshToken: newRefreshToken }
    } catch {
      throw Object.assign(new Error('Invalid refresh token'), { status: 401 })
    }
  }

  async getMe(userId: string) {
    const { userDao, agentDao } = this.deps

    const user = await userDao.findById(userId)
    if (!user) {
      throw Object.assign(new Error('User not found'), { status: 404 })
    }

    // For bot users, look up and include the agentId
    let agentId: string | undefined
    if (user.isBot) {
      const agent = await agentDao.findByUserId(userId)
      if (agent) {
        agentId = agent.id
      }
    }

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      status: user.status,
      isBot: user.isBot,
      ...(agentId ? { agentId } : {}),
    }
  }

  async updateProfile(userId: string, input: { displayName?: string; avatarUrl?: string | null }) {
    const { userDao } = this.deps

    const user = await userDao.findById(userId)
    if (!user) {
      throw Object.assign(new Error('User not found'), { status: 404 })
    }

    const updated = await userDao.update(userId, {
      ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
      ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
    })

    return {
      id: updated!.id,
      email: updated!.email,
      username: updated!.username,
      displayName: updated!.displayName,
      avatarUrl: updated!.avatarUrl,
    }
  }
}
