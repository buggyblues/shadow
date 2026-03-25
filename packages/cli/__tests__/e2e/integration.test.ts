import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ShadowClient } from '@shadowob/sdk'
import { execa } from 'execa'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ensureCliBuilt } from '../helpers/test-utils.js'

const CLI_PATH = join(__dirname, '../../dist/index.js')
const SERVER_URL = process.env.SHADOW_SERVER_URL || 'http://localhost:3000'
const SHOULD_RUN_INTEGRATION = process.env.SHADOW_CLI_E2E === 'true'
const INVITE_CODE = process.env.SHADOW_TEST_INVITE_CODE || ''

describe.skipIf(!SHOULD_RUN_INTEGRATION)('CLI Integration Tests', () => {
  let tempDir: string
  let _configDir: string
  let testToken: string
  let testUser: { id: string; username: string }

  beforeAll(async () => {
    await ensureCliBuilt()
    tempDir = mkdtempSync(join(tmpdir(), 'shadowob-cli-integration-'))
    _configDir = join(tempDir, 'config')

    // Create test user and get token via SDK
    const client = new ShadowClient(SERVER_URL, '')
    const result = await client.register({
      email: `test-${Date.now()}@example.com`,
      password: 'testpassword123',
      username: `testuser${Date.now()}`,
      inviteCode: INVITE_CODE,
    })
    testToken = result.token
    testUser = result.user

    // Set up CLI config
    await execa(
      'node',
      [
        CLI_PATH,
        'auth',
        'login',
        '--server-url',
        SERVER_URL,
        '--token',
        testToken,
        '--profile',
        'test',
        '--json',
      ],
      {
        env: { ...process.env, HOME: tempDir },
      },
    )
  })

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  describe('auth flow', () => {
    it('should login successfully', async () => {
      const { stdout } = await execa(
        'node',
        [CLI_PATH, 'auth', 'whoami', '--profile', 'test', '--json'],
        {
          env: { ...process.env, HOME: tempDir },
        },
      )
      const result = JSON.parse(stdout)
      expect(result.user.username).toBe(testUser.username)
    })

    it('should list profiles', async () => {
      const { stdout } = await execa('node', [CLI_PATH, 'auth', 'list', '--json'], {
        env: { ...process.env, HOME: tempDir },
      })
      const result = JSON.parse(stdout)
      expect(result.profiles).toContain('test')
    })
  })

  describe('servers flow', () => {
    it('should create a server', async () => {
      const { stdout } = await execa(
        'node',
        [
          CLI_PATH,
          'servers',
          'create',
          '--name',
          'Test Server',
          '--slug',
          `test-server-${Date.now()}`,
          '--profile',
          'test',
          '--json',
        ],
        {
          env: { ...process.env, HOME: tempDir },
        },
      )
      const result = JSON.parse(stdout)
      expect(result.name).toBe('Test Server')
      expect(result.id).toBeDefined()
    })

    it('should list servers', async () => {
      const { stdout } = await execa(
        'node',
        [CLI_PATH, 'servers', 'list', '--profile', 'test', '--json'],
        {
          env: { ...process.env, HOME: tempDir },
        },
      )
      const result = JSON.parse(stdout)
      expect(Array.isArray(result)).toBe(true)
    })
  })

  describe('channels flow', () => {
    let serverId: string
    let channelId: string

    beforeAll(async () => {
      // Create a server for channel tests
      const { stdout } = await execa(
        'node',
        [
          CLI_PATH,
          'servers',
          'create',
          '--name',
          'Channel Test Server',
          '--profile',
          'test',
          '--json',
        ],
        {
          env: { ...process.env, HOME: tempDir },
        },
      )
      const server = JSON.parse(stdout)
      serverId = server.id
    })

    it('should list channels in a server', async () => {
      const { stdout } = await execa(
        'node',
        [CLI_PATH, 'channels', 'list', '--server-id', serverId, '--profile', 'test', '--json'],
        {
          env: { ...process.env, HOME: tempDir },
        },
      )
      const result = JSON.parse(stdout)
      expect(Array.isArray(result)).toBe(true)
    })

    it('should create a channel', async () => {
      const { stdout } = await execa(
        'node',
        [
          CLI_PATH,
          'channels',
          'create',
          '--server-id',
          serverId,
          '--name',
          'test-channel',
          '--profile',
          'test',
          '--json',
        ],
        {
          env: { ...process.env, HOME: tempDir },
        },
      )
      const result = JSON.parse(stdout)
      expect(result.name).toBe('test-channel')
      expect(result.serverId).toBe(serverId)
      channelId = result.id
    })

    it('should send a message', async () => {
      const { stdout } = await execa(
        'node',
        [
          CLI_PATH,
          'channels',
          'send',
          channelId,
          '--content',
          'Hello from CLI test',
          '--profile',
          'test',
          '--json',
        ],
        {
          env: { ...process.env, HOME: tempDir },
        },
      )
      const result = JSON.parse(stdout)
      expect(result.content).toBe('Hello from CLI test')
      expect(result.channelId).toBe(channelId)
    })

    it('should list messages', async () => {
      const { stdout } = await execa(
        'node',
        [
          CLI_PATH,
          'channels',
          'messages',
          channelId,
          '--limit',
          '10',
          '--profile',
          'test',
          '--json',
        ],
        {
          env: { ...process.env, HOME: tempDir },
        },
      )
      const result = JSON.parse(stdout)
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBeGreaterThan(0)
    })
  })

  describe('agents flow', () => {
    it('should list agents', async () => {
      const { stdout } = await execa(
        'node',
        [CLI_PATH, 'agents', 'list', '--profile', 'test', '--json'],
        {
          env: { ...process.env, HOME: tempDir },
        },
      )
      const result = JSON.parse(stdout)
      expect(Array.isArray(result)).toBe(true)
    })

    it('should create an agent', async () => {
      const { stdout } = await execa(
        'node',
        [
          CLI_PATH,
          'agents',
          'create',
          '--name',
          `test-agent-${Date.now()}`,
          '--profile',
          'test',
          '--json',
        ],
        {
          env: { ...process.env, HOME: tempDir },
        },
      )
      const result = JSON.parse(stdout)
      expect(result.name).toContain('test-agent')
      expect(result.token).toBeDefined()
    })
  })
})
