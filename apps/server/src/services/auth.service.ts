import { compare, hash } from 'bcryptjs'
import type { AgentDao } from '../dao/agent.dao'
import type { InviteCodeDao } from '../dao/invite-code.dao'
import type { UserDao } from '../dao/user.dao'
import { signAccessToken, signRefreshToken, verifyToken } from '../lib/jwt'
import type { LoginInput, RegisterInput } from '../validators/auth.schema'

export class AuthService {
  constructor(private deps: { userDao: UserDao; inviteCodeDao: InviteCodeDao; agentDao: AgentDao }) {}

  async register(input: RegisterInput) {
    const { userDao, inviteCodeDao } = this.deps

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

    // Check existing username
    const existingUsername = await userDao.findByUsername(input.username)
    if (existingUsername) {
      throw Object.assign(new Error('Username already taken'), { status: 409 })
    }

    // Hash password
    const passwordHash = await hash(input.password, 12)

    // Create user
    const user = await userDao.create({
      email: input.email,
      username: input.username,
      passwordHash,
      displayName: input.displayName,
    })

    // Mark invite code as used
    await inviteCodeDao.markUsed(code.id, user.id)

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
    const { userDao } = this.deps

    const user = await userDao.findByEmail(input.email)
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
