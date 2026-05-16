import type { Mocked } from 'vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentDao } from '../dao/agent.dao'
import type { InviteCodeDao } from '../dao/invite-code.dao'
import type { PasswordChangeLogDao } from '../dao/password-change-log.dao'
import type { UserDao } from '../dao/user.dao'
import type { UserSessionDao } from '../dao/user-session.dao'
import type { SafeHttpClient } from '../gateways/safe-http-client'
import type { TaskCenterService } from '../services/task-center.service'
import { AuthService } from './auth.service'
import type { MembershipService } from './membership.service'

// Mock bcryptjs
vi.mock('bcryptjs', () => ({
  hash: vi.fn().mockResolvedValue('$2a$12$mockhash'),
  compare: vi.fn().mockResolvedValue(true),
}))

// Mock jwt
vi.mock('../lib/jwt', () => ({
  signAccessToken: vi.fn().mockReturnValue('mock-access-token'),
  signRefreshToken: vi.fn().mockReturnValue('mock-refresh-token'),
  verifyToken: vi
    .fn()
    .mockReturnValue({ userId: 'user-1', email: 'test@test.com', username: 'testuser' }),
}))

// Mock id generator
vi.mock('../lib/id', () => ({
  randomFixedDigits: vi.fn().mockReturnValue('123456'),
}))

describe('AuthService', () => {
  const mockUser = {
    id: 'user-1',
    email: 'test@test.com',
    username: 'testuser',
    displayName: 'Test User',
    avatarUrl: null,
    passwordHash: '$2a$12$mockhash',
    isAdmin: false,
    isBot: false,
    status: 'online' as const,
    economyStatus: 'normal' as const,
    oauthAppId: null,
    parentUserId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const mockInviteCode = {
    id: 'invite-1',
    code: 'ABC123',
    createdBy: 'admin-1',
    usedBy: null,
    usedAt: null,
    isActive: true,
    note: 'Test invite',
    createdAt: new Date(),
  }

  const mockUserDao: Mocked<UserDao> = {
    findByEmail: vi.fn(),
    findByUsername: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    updateStatus: vi.fn(),
  } as unknown as Mocked<UserDao>

  const mockInviteCodeDao: Mocked<InviteCodeDao> = {
    findAvailable: vi.fn(),
    findByUsedBy: vi.fn(),
    markUsed: vi.fn(),
  } as unknown as Mocked<InviteCodeDao>

  const mockAgentDao: Mocked<AgentDao> = {
    findByUserId: vi.fn(),
  } as unknown as Mocked<AgentDao>

  const mockTaskCenterService: Mocked<TaskCenterService> = {
    grantWelcomeReward: vi.fn(),
  } as unknown as Mocked<TaskCenterService>

  const mockPasswordChangeLogDao: Mocked<PasswordChangeLogDao> = {
    create: vi.fn(),
  } as unknown as Mocked<PasswordChangeLogDao>

  const mockMembershipService: Mocked<MembershipService> = {
    getMembership: vi.fn(),
  } as unknown as Mocked<MembershipService>

  const mockUserSessionDao: Mocked<UserSessionDao> = {
    findById: vi.fn(),
    create: vi.fn(),
    updateRefreshTokenHash: vi.fn(),
  } as unknown as Mocked<UserSessionDao>

  let service: AuthService

  beforeEach(() => {
    vi.clearAllMocks()
    mockUserDao.findByEmail.mockResolvedValue(null)
    mockUserDao.findByUsername.mockResolvedValue(null)
    mockUserDao.findById.mockResolvedValue(mockUser)
    mockUserDao.create.mockResolvedValue(mockUser)
    mockUserDao.updateStatus.mockResolvedValue(mockUser)
    mockInviteCodeDao.findAvailable.mockResolvedValue(mockInviteCode)
    mockInviteCodeDao.findByUsedBy.mockResolvedValue(null)
    mockTaskCenterService.grantWelcomeReward.mockResolvedValue(false)
    mockUserSessionDao.findById.mockResolvedValue(null)
    mockUserSessionDao.create.mockResolvedValue({
      id: 'session-1',
      userId: mockUser.id,
      refreshTokenHash: 'hash',
      deviceName: null,
      userAgent: null,
      ipAddress: null,
      lastSeenAt: new Date(),
      revokedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    mockMembershipService.getMembership.mockResolvedValue({
      status: 'visitor',
      tier: {
        id: 'visitor',
        level: 0,
        label: 'Visitor',
        capabilities: [],
      },
      level: 0,
      isMember: false,
      memberSince: null,
      inviteCodeId: null,
      capabilities: [],
    })

    service = new AuthService({
      userDao: mockUserDao,
      inviteCodeDao: mockInviteCodeDao,
      agentDao: mockAgentDao,
      taskCenterService: mockTaskCenterService,
      passwordChangeLogDao: mockPasswordChangeLogDao,
      membershipService: mockMembershipService,
      safeHttpClient: {
        fetch: vi.fn().mockResolvedValue({ ok: true }),
      } as unknown as SafeHttpClient,
      userSessionDao: mockUserSessionDao,
    })
  })

  describe('register', () => {
    it('rejects invalid invite code', async () => {
      mockInviteCodeDao.findAvailable.mockResolvedValue(null)

      await expect(
        service.register({
          email: 'test@test.com',
          password: 'password123',
          username: 'testuser',
          inviteCode: 'INVALID',
        }),
      ).rejects.toThrow('Invalid or already used invite code')
    })

    it('rejects duplicate email', async () => {
      mockUserDao.findByEmail.mockResolvedValue(mockUser)

      await expect(
        service.register({
          email: 'test@test.com',
          password: 'password123',
          username: 'testuser',
          inviteCode: 'ABC123',
        }),
      ).rejects.toThrow('Email already in use')
    })

    it('rejects duplicate username', async () => {
      mockUserDao.findByUsername.mockResolvedValue(mockUser)

      await expect(
        service.register({
          email: 'new@test.com',
          password: 'password123',
          username: 'testuser',
          inviteCode: 'ABC123',
        }),
      ).rejects.toThrow('Username already taken')
    })

    it('creates user with valid invite code and grants welcome reward', async () => {
      const result = await service.register({
        email: 'new@test.com',
        password: 'password123',
        username: 'newuser',
        inviteCode: 'ABC123',
      })

      expect(mockUserDao.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'new@test.com',
          username: 'newuser',
        }),
      )
      expect(mockInviteCodeDao.markUsed).toHaveBeenCalledWith('invite-1', 'user-1')
      expect(mockTaskCenterService.grantWelcomeReward).toHaveBeenCalledWith('user-1')
      expect(result).toHaveProperty('accessToken')
      expect(result).toHaveProperty('user')
    })

    it('creates visitor user without invite code', async () => {
      const result = await service.register({
        email: 'visitor@test.com',
        password: 'password123',
      })

      expect(mockInviteCodeDao.findAvailable).not.toHaveBeenCalled()
      expect(mockInviteCodeDao.markUsed).not.toHaveBeenCalled()
      expect(result.user.membership.status).toBe('visitor')
    })
  })

  describe('login', () => {
    it('rejects non-existent user', async () => {
      mockUserDao.findByEmail.mockResolvedValue(null)

      await expect(
        service.login({ email: 'nope@test.com', password: 'password123' }),
      ).rejects.toThrow('Invalid credentials')
    })

    it('returns tokens for valid credentials', async () => {
      mockUserDao.findByEmail.mockResolvedValue(mockUser)

      const result = await service.login({ email: 'test@test.com', password: 'password123' })

      expect(result).toHaveProperty('accessToken', 'mock-access-token')
      expect(result).toHaveProperty('refreshToken', 'mock-refresh-token')
      expect(result).toHaveProperty('user')
    })
  })

  describe('refresh', () => {
    it('returns new access token for valid refresh token', async () => {
      const result = await service.refresh('mock-refresh-token')

      expect(result).toHaveProperty('accessToken', 'mock-access-token')
    })
  })
})
