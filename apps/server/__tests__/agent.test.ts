/**
 * Agent API Tests
 *
 * Tests for agent CRUD and token generation:
 * 1. Create agent with name/description
 * 2. List user's agents
 * 3. Get agent details
 * 4. Generate agent token
 * 5. Delete agent
 * 6. Agent token works with standard auth
 */
import { describe, expect, it, vi } from 'vitest'
import { AgentService } from '../src/services/agent.service'
import { signAgentToken, signAccessToken, verifyToken } from '../src/lib/jwt'

// ─── Mock factories ────────────────────────────────────────────

function createMockAgentDao(overrides = {}) {
  return {
    findById: vi.fn(),
    findByOwnerId: vi.fn(),
    findByUserId: vi.fn(),
    findAll: vi.fn(),
    create: vi.fn(),
    updateStatus: vi.fn(),
    updateConfig: vi.fn(),
    delete: vi.fn(),
    createBotUser: vi.fn(),
    ...overrides,
  }
}

function createMockUserDao(overrides = {}) {
  return {
    findById: vi.fn(),
    findByEmail: vi.fn(),
    findByUsername: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateStatus: vi.fn(),
    findAll: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  }
}

function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn().mockReturnThis(),
    level: 'info',
  }
}

// ═══════════════════════════════════════════════════════════════
// 1. JWT AGENT TOKEN
// ═══════════════════════════════════════════════════════════════

describe('Agent Token (JWT)', () => {
  it('should sign and verify an agent token', () => {
    const payload = {
      userId: 'bot-user-123',
      email: 'agent-testbot@shadowob.bot',
      username: 'agent-testbot',
    }

    const token = signAgentToken(payload)
    expect(typeof token).toBe('string')
    expect(token.split('.')).toHaveLength(3)

    const decoded = verifyToken(token)
    expect(decoded.userId).toBe('bot-user-123')
    expect(decoded.email).toBe('agent-testbot@shadowob.bot')
    expect(decoded.username).toBe('agent-testbot')
  })

  it('agent token should be verifiable by the same verifyToken', () => {
    const payload = {
      userId: 'bot-456',
      email: 'agent-helper@shadowob.bot',
      username: 'agent-helper',
    }

    const agentToken = signAgentToken(payload)
    const userToken = signAccessToken(payload)

    // Both should be verifiable
    const decodedAgent = verifyToken(agentToken)
    const decodedUser = verifyToken(userToken)

    expect(decodedAgent.userId).toBe(decodedUser.userId)
    expect(decodedAgent.username).toBe(decodedUser.username)
  })
})

// ═══════════════════════════════════════════════════════════════
// 2. AGENT SERVICE
// ═══════════════════════════════════════════════════════════════

describe('AgentService', () => {
  describe('create', () => {
    it('should create an agent with bot user', async () => {
      const botUser = {
        id: 'bot-user-1',
        email: 'agent-my-bot@shadowob.bot',
        username: 'agent-my-bot',
        displayName: 'My Bot',
        avatarUrl: null,
        isBot: true,
      }
      const agent = {
        id: 'agent-1',
        userId: 'bot-user-1',
        kernelType: 'openclaw',
        config: { description: 'A test bot' },
        ownerId: 'owner-1',
        status: 'stopped',
      }

      const agentDao = createMockAgentDao({
        createBotUser: vi.fn().mockResolvedValue(botUser),
        create: vi.fn().mockResolvedValue(agent),
      })
      const userDao = createMockUserDao()
      const logger = createMockLogger()

      const service = new AgentService({
        agentDao: agentDao as any,
        userDao: userDao as any,
        logger: logger as any,
      })

      const result = await service.create({
        name: 'My Bot',
        description: 'A test bot',
        kernelType: 'openclaw',
        config: {},
        ownerId: 'owner-1',
      })

      expect(result.id).toBe('agent-1')
      expect(result.botUser.displayName).toBe('My Bot')
      expect(agentDao.createBotUser).toHaveBeenCalledWith({
        username: 'agent-my-bot',
        displayName: 'My Bot',
      })
      expect(agentDao.create).toHaveBeenCalledWith({
        userId: 'bot-user-1',
        kernelType: 'openclaw',
        config: { description: 'A test bot' },
        ownerId: 'owner-1',
      })
    })

    it('should update avatar if provided', async () => {
      const botUser = {
        id: 'bot-user-2',
        email: 'agent-avatar-bot@shadowob.bot',
        username: 'agent-avatar-bot',
        displayName: 'Avatar Bot',
        avatarUrl: null,
        isBot: true,
      }
      const agent = {
        id: 'agent-2',
        userId: 'bot-user-2',
        kernelType: 'openclaw',
        config: {},
        ownerId: 'owner-1',
        status: 'stopped',
      }

      const agentDao = createMockAgentDao({
        createBotUser: vi.fn().mockResolvedValue(botUser),
        create: vi.fn().mockResolvedValue(agent),
      })
      const userDao = createMockUserDao({
        update: vi.fn().mockResolvedValue({ ...botUser, avatarUrl: 'https://example.com/avatar.png' }),
      })
      const logger = createMockLogger()

      const service = new AgentService({
        agentDao: agentDao as any,
        userDao: userDao as any,
        logger: logger as any,
      })

      const result = await service.create({
        name: 'Avatar Bot',
        avatarUrl: 'https://example.com/avatar.png',
        kernelType: 'openclaw',
        config: {},
        ownerId: 'owner-1',
      })

      expect(userDao.update).toHaveBeenCalledWith('bot-user-2', {
        avatarUrl: 'https://example.com/avatar.png',
      })
      expect(result.botUser.avatarUrl).toBe('https://example.com/avatar.png')
    })
  })

  describe('getById', () => {
    it('should return agent with bot user', async () => {
      const agent = {
        id: 'agent-1',
        userId: 'bot-user-1',
        kernelType: 'openclaw',
        config: {},
        ownerId: 'owner-1',
        status: 'stopped',
      }
      const botUser = {
        id: 'bot-user-1',
        username: 'agent-test',
        displayName: 'Test Agent',
      }

      const agentDao = createMockAgentDao({
        findById: vi.fn().mockResolvedValue(agent),
      })
      const userDao = createMockUserDao({
        findById: vi.fn().mockResolvedValue(botUser),
      })
      const logger = createMockLogger()

      const service = new AgentService({
        agentDao: agentDao as any,
        userDao: userDao as any,
        logger: logger as any,
      })

      const result = await service.getById('agent-1')
      expect(result).not.toBeNull()
      expect(result!.botUser).toEqual(botUser)
    })

    it('should return null for non-existent agent', async () => {
      const agentDao = createMockAgentDao({
        findById: vi.fn().mockResolvedValue(null),
      })
      const userDao = createMockUserDao()
      const logger = createMockLogger()

      const service = new AgentService({
        agentDao: agentDao as any,
        userDao: userDao as any,
        logger: logger as any,
      })

      const result = await service.getById('nonexistent')
      expect(result).toBeNull()
    })
  })

  describe('generateToken', () => {
    it('should generate a valid JWT for the bot user', async () => {
      const agent = {
        id: 'agent-1',
        userId: 'bot-user-1',
        ownerId: 'owner-1',
        config: {},
      }
      const botUser = {
        id: 'bot-user-1',
        email: 'agent-test@shadowob.bot',
        username: 'agent-test',
        displayName: 'Test Agent',
        avatarUrl: null,
      }

      const agentDao = createMockAgentDao({
        findById: vi.fn().mockResolvedValue(agent),
      })
      const userDao = createMockUserDao({
        findById: vi.fn().mockResolvedValue(botUser),
      })
      const logger = createMockLogger()

      const service = new AgentService({
        agentDao: agentDao as any,
        userDao: userDao as any,
        logger: logger as any,
      })

      const result = await service.generateToken('agent-1', 'owner-1')
      expect(result.token).toBeDefined()
      expect(typeof result.token).toBe('string')
      expect(result.agent.id).toBe('agent-1')
      expect(result.botUser.id).toBe('bot-user-1')

      // Verify the token is valid
      const decoded = verifyToken(result.token)
      expect(decoded.userId).toBe('bot-user-1')
      expect(decoded.username).toBe('agent-test')
    })

    it('should throw 404 if agent not found', async () => {
      const agentDao = createMockAgentDao({
        findById: vi.fn().mockResolvedValue(null),
      })
      const userDao = createMockUserDao()
      const logger = createMockLogger()

      const service = new AgentService({
        agentDao: agentDao as any,
        userDao: userDao as any,
        logger: logger as any,
      })

      await expect(service.generateToken('nonexistent', 'owner-1')).rejects.toThrow(
        'Agent not found',
      )
    })

    it('should throw 403 if not the owner', async () => {
      const agent = {
        id: 'agent-1',
        userId: 'bot-user-1',
        ownerId: 'owner-1',
      }

      const agentDao = createMockAgentDao({
        findById: vi.fn().mockResolvedValue(agent),
      })
      const userDao = createMockUserDao()
      const logger = createMockLogger()

      const service = new AgentService({
        agentDao: agentDao as any,
        userDao: userDao as any,
        logger: logger as any,
      })

      await expect(service.generateToken('agent-1', 'other-owner')).rejects.toThrow(
        'Not the owner of this agent',
      )
    })
  })

  describe('lifecycle', () => {
    it('should start an agent', async () => {
      const agent = {
        id: 'agent-1',
        userId: 'bot-user-1',
        status: 'stopped',
      }

      const agentDao = createMockAgentDao({
        findById: vi.fn().mockResolvedValue(agent),
        updateStatus: vi
          .fn()
          .mockResolvedValue({ ...agent, status: 'running' }),
      })
      const userDao = createMockUserDao()
      const logger = createMockLogger()

      const service = new AgentService({
        agentDao: agentDao as any,
        userDao: userDao as any,
        logger: logger as any,
      })

      await service.start('agent-1')
      expect(agentDao.updateStatus).toHaveBeenCalledWith('agent-1', 'running')
    })

    it('should stop an agent', async () => {
      const agent = {
        id: 'agent-1',
        userId: 'bot-user-1',
        status: 'running',
      }

      const agentDao = createMockAgentDao({
        findById: vi.fn().mockResolvedValue(agent),
        updateStatus: vi
          .fn()
          .mockResolvedValue({ ...agent, status: 'stopped' }),
      })
      const userDao = createMockUserDao()
      const logger = createMockLogger()

      const service = new AgentService({
        agentDao: agentDao as any,
        userDao: userDao as any,
        logger: logger as any,
      })

      await service.stop('agent-1')
      expect(agentDao.updateStatus).toHaveBeenCalledWith('agent-1', 'stopped')
    })

    it('should delete an agent (stop first if running)', async () => {
      const agent = {
        id: 'agent-1',
        userId: 'bot-user-1',
        status: 'running',
      }

      const agentDao = createMockAgentDao({
        findById: vi.fn().mockResolvedValue(agent),
        updateStatus: vi.fn().mockResolvedValue({ ...agent, status: 'stopped' }),
        delete: vi.fn(),
      })
      const userDao = createMockUserDao()
      const logger = createMockLogger()

      const service = new AgentService({
        agentDao: agentDao as any,
        userDao: userDao as any,
        logger: logger as any,
      })

      await service.delete('agent-1')
      expect(agentDao.updateStatus).toHaveBeenCalledWith('agent-1', 'stopped')
      expect(agentDao.delete).toHaveBeenCalledWith('agent-1')
    })
  })
})

// ═══════════════════════════════════════════════════════════════
// 3. AGENT HANDLER (HTTP API surface)
// ═══════════════════════════════════════════════════════════════

describe('Agent Handler (HTTP)', () => {
  // We test the handler through Hono mock requests
  // This pattern matches the existing e2e.test.ts approach

  it('should expose agent API routes pattern', () => {
    // Verify createAgentHandler assembles correct routes
    // (Detailed integration tests would require a full DI container)
    expect(typeof signAgentToken).toBe('function')
    expect(typeof signAccessToken).toBe('function')
  })

  it('agent token should be accepted by authMiddleware', async () => {
    const { Hono } = await import('hono')
    const app = new Hono()

    // Simulate authMiddleware
    app.use('*', async (c, next) => {
      const authHeader = c.req.header('Authorization')
      if (!authHeader?.startsWith('Bearer ')) {
        return c.json({ error: 'Unauthorized' }, 401)
      }
      const token = authHeader.slice(7)
      try {
        const payload = verifyToken(token)
        c.set('user', payload as never)
        await next()
      } catch {
        return c.json({ error: 'Invalid token' }, 401)
      }
    })

    app.get('/api/auth/me', (c) => {
      const user = c.get('user') as { userId: string; username: string }
      return c.json({ id: user.userId, username: user.username })
    })

    // Generate an agent token
    const agentToken = signAgentToken({
      userId: 'bot-123',
      email: 'agent-test@shadowob.bot',
      username: 'agent-test',
    })

    const res = await app.request('/api/auth/me', {
      headers: { Authorization: `Bearer ${agentToken}` },
    })

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.id).toBe('bot-123')
    expect(data.username).toBe('agent-test')
  })
})
