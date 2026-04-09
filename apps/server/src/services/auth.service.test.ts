import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mocked } from 'vitest'
import type { UserDao } from '../dao/user.dao'
import type { InviteCodeDao } from '../dao/invite-code.dao'
import type { AgentDao } from '../dao/agent.dao'
import type { PasswordChangeLogDao } from '../dao/password-change-log.dao'
import type { TaskCenterService } from '../services/task-center.service'
import { AuthService } from './auth.service'

// Mock bcryptjs
vi.mock('bcryptjs', () => ({
  hash: vi.fn().mockResolvedValue('$2a$12$mockhash'),
  compare: vi.fn().mockResolvedValue(true),
}))

// Mock jwt
vi.mock('../lib/jwt', () => ({
  signAccessToken: vi.fn().mockReturnValue('mock-access-token'),
  signRefreshToken: vi.fn().mockReturnValue('mock-refresh-token'),
  verifyToken: vi.fn().mockReturnValue({ userId: 'user-1', email: 'test@test.com', username: 'testuser' }),
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
    passwordHash: '$2a$12$mockhash',
    isAdmin: false,
    isBot: false,
    status: 'online' as const,
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
  } as unknown as Mocked<UserDao>

  const mockInviteCodeDao: Mocked<InviteCodeDao> = {
    findAvailable: vi.fn(),
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

  let service: AuthService

  beforeEach(() => {
    vi.clearAllMocks()
    mockUserDao.findByEmail.mockResolvedValue(null)
    mockUserDao.findByUsername.mockResolvedValue(null)
    mockUserDao.create.mockResolvedValue(mockUser)
    mockInviteCodeDao.findAvailable.mockResolvedValue(mockInviteCode)
    mockTaskCenterService.grantWelcomeReward.mockResolvedValue(undefined)

    service = new AuthService({
      userDao: mockUserDao,
      inviteCodeDao: mockInviteCodeDao,
      agentDao: mockAgentDao,
      taskCenterService: mockTaskCenterService,
      passwordChangeLogDao: mockPasswordChangeLogDao,
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
      expect(result).toHaveProperty('token')
      expect(result).toHaveProperty('user')
    })
  })

  describe('login', () => {
    it('rejects non-existent user', async () => {
      mockUserDao.findByEmail.mockResolvedValue(null)

      await expect(
        service.login({ email: 'nope@test.com', password: 'password123' }),
      ).rejects.toThrow('Invalid email or password')
    })

    it('returns tokens for valid credentials', async () => {
      mockUserDao.findByEmail.mockResolvedValue(mockUser)

      const result = await service.login({ email: 'test@test.com', password: 'password123' })

      expect(result).toHaveProperty('token', 'mock-access-token')
      expect(result).toHaveProperty('refreshToken', 'mock-refresh-token')
      expect(result).toHaveProperty('user')
    })
  })

  describe('refresh', () => {
    it('returns new access token for valid refresh token', async () => {
      const result = await service.refresh('mock-refresh-token')

      expect(result).toHaveProperty('token', 'mock-access-token')
    })
  })
})
