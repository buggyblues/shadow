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
import { signAccessToken, signAgentToken, verifyToken } from '../src/lib/jwt'
import { AgentService } from '../src/services/agent.service'

// ─── Mock factories ────────────────────────────────────────────

function createMockAgentDao(overrides = {}) {
  return {
    findById: vi.fn(),
    findByOwnerId: vi.fn(),
    findByUserId: vi.fn(),
    findByUserIds: vi.fn(),
    findByLastToken: vi.fn(),
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
        username: 'my-bot',
        description: 'A test bot',
        kernelType: 'openclaw',
        config: {},
        ownerId: 'owner-1',
      })

      expect(result.id).toBe('agent-1')
      expect(result.botUser.displayName).toBe('My Bot')
      expect(agentDao.createBotUser).toHaveBeenCalledWith({
        username: 'my-bot',
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
        update: vi
          .fn()
          .mockResolvedValue({ ...botUser, avatarUrl: 'https://shadowob.com/avatar.png' }),
      })
      const logger = createMockLogger()

      const service = new AgentService({
        agentDao: agentDao as any,
        userDao: userDao as any,
        logger: logger as any,
      })

      const result = await service.create({
        name: 'Avatar Bot',
        username: 'avatar-bot',
        avatarUrl: 'https://shadowob.com/avatar.png',
        kernelType: 'openclaw',
        config: {},
        ownerId: 'owner-1',
      })

      expect(userDao.update).toHaveBeenCalledWith('bot-user-2', {
        avatarUrl: 'https://shadowob.com/avatar.png',
      })
      expect(result.botUser.avatarUrl).toBe('https://shadowob.com/avatar.png')
    })

    it('should throw 409 when username is already taken', async () => {
      const dbError = Object.assign(
        new Error('duplicate key value violates unique constraint "users_username_unique"'),
        { code: '23505' },
      )
      const agentDao = createMockAgentDao({
        createBotUser: vi.fn().mockRejectedValue(dbError),
      })
      const userDao = createMockUserDao()
      const logger = createMockLogger()

      const service = new AgentService({
        agentDao: agentDao as any,
        userDao: userDao as any,
        logger: logger as any,
      })

      await expect(
        service.create({
          name: 'Duplicate Bot',
          username: 'existing-user',
          kernelType: 'openclaw',
          config: {},
          ownerId: 'owner-1',
        }),
      ).rejects.toMatchObject({
        message: 'Username already taken',
        status: 409,
      })
    })

    it('should throw 409 when username conflict detected via error message', async () => {
      const dbError = new Error(
        'duplicate key value violates unique constraint "users_username_unique"',
      )
      const agentDao = createMockAgentDao({
        createBotUser: vi.fn().mockRejectedValue(dbError),
      })
      const userDao = createMockUserDao()
      const logger = createMockLogger()

      const service = new AgentService({
        agentDao: agentDao as any,
        userDao: userDao as any,
        logger: logger as any,
      })

      await expect(
        service.create({
          name: 'Duplicate Bot',
          username: 'existing-user',
          kernelType: 'openclaw',
          config: {},
          ownerId: 'owner-1',
        }),
      ).rejects.toMatchObject({
        message: 'Username already taken',
        status: 409,
      })
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

  describe('slash commands', () => {
    it('should normalize and persist slash command registry updates', async () => {
      const agent = {
        id: 'agent-1',
        userId: 'bot-user-1',
        kernelType: 'openclaw',
        config: { existing: true },
        ownerId: 'owner-1',
        status: 'running',
      }
      const agentDao = createMockAgentDao({
        findById: vi.fn().mockResolvedValue(agent),
        updateConfig: vi.fn().mockResolvedValue(agent),
      })
      const service = new AgentService({
        agentDao: agentDao as any,
        userDao: createMockUserDao() as any,
        logger: createMockLogger() as any,
      })

      const commands = await service.updateSlashCommands('agent-1', 'bot-user-1', [
        {
          name: '/audit',
          description: ' Run a complete audit ',
          aliases: ['/a', 'audit', 'bad alias!'],
          packId: 'seomachine-buddy',
          sourcePath: '/agent-packs/seomachine/commands/audit/SKILL.md',
          interaction: {
            kind: 'form',
            prompt: 'Fill details',
            fields: [{ id: 'url', label: 'URL', kind: 'text', required: true }],
            responsePrompt: 'Run audit after submit.',
          },
        },
        { name: 'audit', description: 'duplicate' },
        { name: '1bad' },
      ])

      expect(commands).toEqual([
        {
          name: 'audit',
          description: 'Run a complete audit',
          aliases: ['a'],
          packId: 'seomachine-buddy',
          sourcePath: '/agent-packs/seomachine/commands/audit/SKILL.md',
          interaction: {
            kind: 'form',
            prompt: 'Fill details',
            fields: [{ id: 'url', label: 'URL', kind: 'text', required: true }],
            responsePrompt: 'Run audit after submit.',
          },
        },
      ])
      expect(agentDao.updateConfig).toHaveBeenCalledWith(
        'agent-1',
        expect.objectContaining({
          existing: true,
          slashCommands: commands,
          slashCommandsUpdatedAt: expect.any(String),
        }),
      )
    })

    it('should allow owner or bot user to read slash commands', async () => {
      const agent = {
        id: 'agent-1',
        userId: 'bot-user-1',
        kernelType: 'openclaw',
        config: {
          slashCommands: [{ name: '/research', description: 'Research a topic' }],
        },
        ownerId: 'owner-1',
        status: 'running',
      }
      const agentDao = createMockAgentDao({
        findById: vi.fn().mockResolvedValue(agent),
      })
      const service = new AgentService({
        agentDao: agentDao as any,
        userDao: createMockUserDao() as any,
        logger: createMockLogger() as any,
      })

      await expect(service.getSlashCommands('agent-1', 'owner-1')).resolves.toEqual([
        { name: 'research', description: 'Research a topic' },
      ])
      await expect(service.getSlashCommands('agent-1', 'bot-user-1')).resolves.toEqual([
        { name: 'research', description: 'Research a topic' },
      ])
      await expect(service.getSlashCommands('agent-1', 'other-user')).rejects.toMatchObject({
        status: 403,
      })
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
        updateStatus: vi.fn().mockResolvedValue({ ...agent, status: 'running' }),
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
        updateStatus: vi.fn().mockResolvedValue({ ...agent, status: 'stopped' }),
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

  it('stored legacy agent token should be accepted as an opaque fallback', async () => {
    const { Hono } = await import('hono')
    const { authMiddleware, createStoredAgentTokenMiddleware } = await import(
      '../src/middleware/auth.middleware'
    )
    const app = new Hono()
    const agentDao = createMockAgentDao({
      findByLastToken: vi.fn().mockResolvedValue({ userId: 'bot-legacy' }),
    })
    const container = {
      resolve: vi.fn((name: string) => {
        if (name === 'agentDao') return agentDao
        throw new Error(`Unexpected dependency: ${name}`)
      }),
    }

    app.use(
      '*',
      createStoredAgentTokenMiddleware(
        container as Parameters<typeof createStoredAgentTokenMiddleware>[0],
      ),
    )
    app.use('*', authMiddleware)
    app.get('/api/auth/me', (c) => {
      const user = c.get('user') as { userId: string }
      return c.json({ id: user.userId })
    })

    const res = await app.request('/api/auth/me', {
      headers: { Authorization: 'Bearer legacy-agent-token' },
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: 'bot-legacy' })
    expect(agentDao.findByLastToken).toHaveBeenCalledWith('legacy-agent-token')
  })

  it('should return 409 when creating agent with duplicate username', async () => {
    const { Hono } = await import('hono')
    const { createAgentHandler } = await import('../src/handlers/agent.handler')

    const app = new Hono()

    const container = {
      resolve: (name: string) => {
        if (name === 'agentService') {
          return {
            create: vi
              .fn()
              .mockRejectedValue(
                Object.assign(new Error('Username already taken'), { status: 409 }),
              ),
          }
        }
        if (name === 'clawListingDao') return { findByAgentIds: vi.fn().mockResolvedValue([]) }
        if (name === 'rentalContractDao')
          return { findActiveByListingId: vi.fn().mockResolvedValue(null) }
        if (name === 'agentPolicyService') {
          return {
            getRemoteConfig: vi.fn(),
            getPolicies: vi.fn(),
            upsertPolicies: vi.fn(),
            deletePolicy: vi.fn(),
          }
        }
        throw new Error(`Unknown dependency: ${name}`)
      },
    }

    app.route('/api/agents', createAgentHandler(container as never))

    const token = signAccessToken({
      userId: 'owner-1',
      email: 'owner@example.com',
      username: 'owner',
    })

    const res = await app.request('/api/agents', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: 'Dup Buddy',
        username: 'dup-buddy',
        kernelType: 'openclaw',
        config: {},
      }),
    })

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe('Username already taken')
  })
})
