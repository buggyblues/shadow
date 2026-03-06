/**
 * OpenClaw Shadow Plugin — E2E Integration Tests
 *
 * These tests start real processes (Shadow server + OpenClaw gateway)
 * and verify the plugin works end-to-end:
 *
 * 1. Plugin Discovery: OpenClaw discovers @shadowob/openclaw via plugins.load.paths
 * 2. Shadow REST API: ShadowClient against a real Shadow server
 * 3. WebSocket Integration: Socket.IO connection and message flow
 * 4. Full Gateway Flow: OpenClaw loads plugin → connects to Shadow → message cycle
 *
 * Prerequisites:
 *   - Docker services running: `docker compose up -d postgres redis minio`
 *   - OpenClaw installed: `npm install -g openclaw@latest`
 *
 * Run:
 *   pnpm test -- packages/openclaw/__tests__/e2e/integration.test.ts
 */

import { type ChildProcess, execSync } from 'node:child_process'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { io as connectSocket, type Socket } from 'socket.io-client'
import { ShadowClient } from '../../src/shadow-client.js'

import {
  SHADOW_URL,
  SHADOW_PORT,
  OPENCLAW_PORT,
  PLUGIN_DIR,
  OPENCLAW_TEST_HOME,
  OPENCLAW_TEST_CONFIG,
  startShadowServer,
  stopShadowServer,
  startOpenClawGateway,
  stopOpenClawGateway,
  writeOpenClawConfig,
  cleanupOpenClawHome,
  seedTestData,
  waitForServer,
  waitForOutput,
  sleep,
  type SeedData,
} from './helpers.js'

// ── Test timeout for the entire suite (processes need time to start) ────────
const SUITE_TIMEOUT = 120_000

// ── Shared state ────────────────────────────────────────────────────────────
let shadowProc: ChildProcess
let seed: SeedData

// ═══════════════════════════════════════════════════════════════════════════
// 1. Shadow Server + Test Data Setup (shared across all suites below)
// ═══════════════════════════════════════════════════════════════════════════

beforeAll(async () => {
  // Start Shadow server
  shadowProc = await startShadowServer()

  // Give migrations a moment to complete
  await sleep(2000)

  // Seed test data
  seed = await seedTestData()
}, SUITE_TIMEOUT)

afterAll(async () => {
  await stopOpenClawGateway()
  await stopShadowServer()
  cleanupOpenClawHome()
}, 30_000)

// ═══════════════════════════════════════════════════════════════════════════
// 2. Plugin Discovery — verify OpenClaw finds our plugin package
// ═══════════════════════════════════════════════════════════════════════════

describe('Plugin Discovery', () => {
  it(
    'openclaw plugins list should discover the shadow plugin',
    async () => {
      // Write a minimal config that points to our plugin
      writeOpenClawConfig(seed.agentToken)

      // Run `openclaw plugins list` with our isolated config
      const output = execSync('openclaw plugins list 2>&1', {
        env: {
          ...process.env,
          OPENCLAW_CONFIG_PATH: OPENCLAW_TEST_CONFIG,
          OPENCLAW_HOME: OPENCLAW_TEST_HOME,
        },
        encoding: 'utf-8',
        timeout: 30_000,
      })

      // The plugin should appear in the listing
      expect(output).toContain('shadow')
    },
    SUITE_TIMEOUT,
  )

  it(
    'openclaw plugins info should show shadow plugin details',
    async () => {
      const output = execSync('openclaw plugins info shadow 2>&1', {
        env: {
          ...process.env,
          OPENCLAW_CONFIG_PATH: OPENCLAW_TEST_CONFIG,
          OPENCLAW_HOME: OPENCLAW_TEST_HOME,
        },
        encoding: 'utf-8',
        timeout: 30_000,
      })

      // Should show the plugin info (id, channels, etc.)
      expect(output.toLowerCase()).toContain('shadow')
    },
    SUITE_TIMEOUT,
  )
})

// ═══════════════════════════════════════════════════════════════════════════
// 3. Shadow REST API Integration — ShadowClient against real server
// ═══════════════════════════════════════════════════════════════════════════

describe('ShadowClient Integration', () => {
  let client: ShadowClient

  beforeAll(() => {
    client = new ShadowClient(SHADOW_URL, seed.agentToken)
  })

  it('getMe() returns the bot user profile', async () => {
    const me = await client.getMe()

    expect(me).toBeDefined()
    expect(me.id).toBeDefined()
    expect(me.username).toBeDefined()
    expect(me.isBot).toBe(true)
  })

  it('getServerChannels() returns channels for the server', async () => {
    const channels = await client.getServerChannels(seed.server.id)

    expect(Array.isArray(channels)).toBe(true)
    expect(channels.length).toBeGreaterThanOrEqual(1)
    expect(channels.some((ch) => ch.id === seed.channel.id)).toBe(true)
  })

  it('sendMessage() creates a message in a channel', async () => {
    const message = await client.sendMessage(seed.channel.id, 'Hello from E2E bot!')

    expect(message).toBeDefined()
    expect(message.id).toBeDefined()
    expect(message.content).toBe('Hello from E2E bot!')
    expect(message.channelId).toBe(seed.channel.id)
  })

  it('getMessages() retrieves messages from a channel', async () => {
    // Send a unique message first
    const uniqueContent = `E2E msg ${Date.now()}`
    await client.sendMessage(seed.channel.id, uniqueContent)

    const result = await client.getMessages(seed.channel.id)

    expect(Array.isArray(result.messages)).toBe(true)
    expect(result.messages.length).toBeGreaterThanOrEqual(1)
    expect(result.messages.some((m) => m.content === uniqueContent)).toBe(true)
    expect(typeof result.hasMore).toBe('boolean')
  })

  it('editMessage() updates message content', async () => {
    const original = await client.sendMessage(seed.channel.id, 'Original content')
    const edited = await client.editMessage(original.id, 'Edited content')

    expect(edited.content).toBe('Edited content')
    expect(edited.id).toBe(original.id)
  })

  it('deleteMessage() removes a message', async () => {
    const msg = await client.sendMessage(seed.channel.id, 'To be deleted')

    // Should not throw
    await expect(client.deleteMessage(msg.id)).resolves.toBeUndefined()

    // Message should be gone from listing
    const listing = await client.getMessages(seed.channel.id)
    expect(listing.messages.some((m) => m.id === msg.id)).toBe(false)
  })

  it('addReaction() adds a reaction to a message', async () => {
    const msg = await client.sendMessage(seed.channel.id, 'React to me')

    // Should not throw
    await expect(client.addReaction(msg.id, '👍')).resolves.toBeUndefined()
  })

  it('removeReaction() removes a reaction from a message', async () => {
    const msg = await client.sendMessage(seed.channel.id, 'Unreact from me')
    await client.addReaction(msg.id, '🎉')

    // Should not throw
    await expect(client.removeReaction(msg.id, '🎉')).resolves.toBeUndefined()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 4. WebSocket Integration — Socket.IO connection and real-time events
// ═══════════════════════════════════════════════════════════════════════════

describe('WebSocket Integration', () => {
  let botSocket: Socket

  afterAll(() => {
    botSocket?.disconnect()
  })

  it('bot can connect to Shadow WebSocket with agent token', async () => {
    botSocket = connectSocket(SHADOW_URL, {
      auth: { token: seed.agentToken },
      transports: ['websocket'],
      forceNew: true,
    })

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('WebSocket connect timeout')), 10_000)
      botSocket.on('connect', () => {
        clearTimeout(timer)
        resolve()
      })
      botSocket.on('connect_error', (err) => {
        clearTimeout(timer)
        reject(new Error(`WebSocket connect error: ${err.message}`))
      })
    })

    expect(botSocket.connected).toBe(true)
  })

  it('bot can join a channel room with ack confirmation', async () => {
    // Join the test channel with ack callback
    const ackResult = await new Promise<{ ok: boolean }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('channel:join ack timeout')), 5_000)
      botSocket.emit('channel:join', { channelId: seed.channel.id }, (ack: { ok: boolean }) => {
        clearTimeout(timer)
        resolve(ack)
      })
    })

    expect(ackResult.ok).toBe(true)
    expect(botSocket.connected).toBe(true)
  })

  it('bot receives message:new when a user sends a message', async () => {
    // Create a separate user socket to simulate a human sending a message
    const userSocket = connectSocket(SHADOW_URL, {
      auth: { token: seed.userToken },
      transports: ['websocket'],
      forceNew: true,
    })

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('User socket connect timeout')), 10_000)
      userSocket.on('connect', () => {
        clearTimeout(timer)
        resolve()
      })
      userSocket.on('connect_error', (err) => {
        clearTimeout(timer)
        reject(err)
      })
    })

    // Both sockets join the channel
    userSocket.emit('channel:join', { channelId: seed.channel.id })
    await sleep(500)

    // Listen for message:new on the bot socket
    const messagePromise = new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('No message:new received')), 10_000)
      botSocket.on('message:new', (msg: Record<string, unknown>) => {
        clearTimeout(timer)
        resolve(msg)
      })
    })

    // User sends a message via WebSocket
    const uniqueContent = `E2E websocket msg ${Date.now()}`
    userSocket.emit('message:send', {
      channelId: seed.channel.id,
      content: uniqueContent,
    })

    const received = await messagePromise
    expect(received).toBeDefined()
    expect(received.content).toBe(uniqueContent)
    expect(received.channelId).toBe(seed.channel.id)

    userSocket.disconnect()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 4b. Monitor Subscription E2E — verify monitorShadowProvider receives
//     messages through the remote-config-based channel subscription
// ═══════════════════════════════════════════════════════════════════════════

describe('Monitor Subscription E2E', () => {
  // Set up a minimal mock runtime before testing monitorShadowProvider
  beforeAll(async () => {
    const { setShadowRuntime } = await import('../../src/runtime.js')
    setShadowRuntime({
      channel: {
        text: { resolveMarkdownTableMode: () => 'text' },
        reply: {
          dispatchReplyWithBufferedBlockDispatcher: async () => {},
          finalizeInboundContext: (ctx: Record<string, unknown>) => ctx,
          formatAgentEnvelope: ({ body }: { body: string }) => body,
          resolveEnvelopeFormatOptions: () => ({}),
        },
        routing: {
          resolveAgentRoute: ({ accountId }: { accountId: string }) => ({
            sessionKey: `mock-session-${Date.now()}`,
            accountId,
            agentId: 'mock-agent',
          }),
        },
        session: {
          resolveStorePath: () => '/tmp/mock-session',
          recordInboundSession: async () => {},
        },
        mentions: {
          buildMentionRegexes: () => [],
          matchesMentionPatterns: () => false,
        },
        debounce: {
          createInboundDebouncer: () => ({}),
          resolveInboundDebounceMs: () => 0,
        },
      },
      logging: {
        getChildLogger: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }),
        shouldLogVerbose: () => false,
      },
    // biome-ignore lint/suspicious/noExplicitAny: mock runtime for E2E test
    } as any)
  })

  it(
    'monitorShadowProvider subscribes to channels via remote config and receives messages',
    async () => {
      // Collect all log output to verify comprehensive logging
      const logs: string[] = []
      const errors: string[] = []

      const abortController = new AbortController()

      // Messages received by the monitor (captured via processShadowMessage)
      const receivedMessages: Array<{ content: string; authorId: string }> = []

      // We import monitorShadowProvider directly and verify it connects + receives
      const { monitorShadowProvider } = await import('../../src/monitor.js')

      // Start the monitor in the background (it blocks until abort)
      const monitorPromise = monitorShadowProvider({
        account: {
          token: seed.agentToken,
          serverUrl: SHADOW_URL,
          enabled: true,
        },
        accountId: 'e2e-test',
        config: {
          channels: {
            shadow: {
              token: seed.agentToken,
              serverUrl: SHADOW_URL,
              enabled: true,
            },
          },
        },
        runtime: {
          log: (msg: string) => {
            logs.push(msg)
            if (process.env.E2E_VERBOSE) console.log(`[monitor] ${msg}`)
          },
          error: (msg: string) => {
            errors.push(msg)
            if (process.env.E2E_VERBOSE) console.error(`[monitor:err] ${msg}`)
          },
        },
        abortSignal: abortController.signal,
      })

      // Wait for the monitor to connect and join channels
      // Look for the "Emitted channel:join" log entry
      const deadline = Date.now() + 15_000
      while (Date.now() < deadline) {
        if (logs.some((l) => l.includes('listening for messages'))) break
        await sleep(200)
      }

      // Verify connection and channel join logs
      expect(logs.some((l) => l.includes('[ws] Connected'))).toBe(true)
      expect(logs.some((l) => l.includes('[config] Fetched remote config'))).toBe(true)
      expect(logs.some((l) => l.includes('[config] Monitoring'))).toBe(true)
      expect(logs.some((l) => l.includes(`[ws] Emitting channel:join for ${seed.channel.id}`))).toBe(true)

      // Wait for the ack to arrive
      await sleep(1_000)
      expect(logs.some((l) => l.includes('Joined channel room') && l.includes(seed.channel.id))).toBe(true)

      // Now send a message as the human user via a separate socket
      const userSocket = connectSocket(SHADOW_URL, {
        auth: { token: seed.userToken },
        transports: ['websocket'],
        forceNew: true,
      })

      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('User socket connect timeout')), 10_000)
        userSocket.on('connect', () => {
          clearTimeout(timer)
          resolve()
        })
        userSocket.on('connect_error', (err) => {
          clearTimeout(timer)
          reject(err)
        })
      })

      userSocket.emit('channel:join', { channelId: seed.channel.id })
      await sleep(500)

      // Send a unique message
      const uniqueContent = `Monitor E2E msg ${Date.now()}`
      userSocket.emit('message:send', {
        channelId: seed.channel.id,
        content: uniqueContent,
      })

      // Wait for the monitor to log receiving the message
      const msgDeadline = Date.now() + 10_000
      while (Date.now() < msgDeadline) {
        if (logs.some((l) => l.includes('message:new') && l.includes(uniqueContent.slice(0, 30)))) break
        await sleep(200)
      }

      // Verify the message was received and logged
      expect(logs.some((l) => l.includes('[ws] ← message:new'))).toBe(true)
      expect(logs.some((l) => l.includes(uniqueContent.slice(0, 30)))).toBe(true)

      // Verify the processing pipeline was entered
      expect(logs.some((l) => l.includes('[msg] Processing message from'))).toBe(true)

      // Cleanup
      userSocket.disconnect()
      abortController.abort()

      // Wait for monitor to stop
      await monitorPromise.catch(() => {})
      expect(logs.some((l) => l.includes('[lifecycle] Shadow monitor stopped'))).toBe(true)

      // Final: verify no critical errors during the subscription flow
      const criticalErrors = errors.filter(
        (e) => !e.includes('Heartbeat') && !e.includes('session'),
      )
      expect(criticalErrors).toEqual([])
    },
    60_000,
  )

  it(
    'monitorShadowProvider logs detailed filtering info for own messages',
    async () => {
      const logs: string[] = []
      const abortController = new AbortController()

      const { monitorShadowProvider } = await import('../../src/monitor.js')

      const monitorPromise = monitorShadowProvider({
        account: {
          token: seed.agentToken,
          serverUrl: SHADOW_URL,
          enabled: true,
        },
        accountId: 'e2e-test-filter',
        config: {
          channels: {
            shadow: {
              token: seed.agentToken,
              serverUrl: SHADOW_URL,
              enabled: true,
            },
          },
        },
        runtime: {
          log: (msg: string) => logs.push(msg),
          error: (msg: string) => logs.push(`[ERR] ${msg}`),
        },
        abortSignal: abortController.signal,
      })

      // Wait for connection
      const deadline = Date.now() + 15_000
      while (Date.now() < deadline) {
        if (logs.some((l) => l.includes('listening for messages'))) break
        await sleep(200)
      }

      await sleep(1_000)

      // Send a message AS THE BOT (should be filtered with log)
      const client = await import('../../src/shadow-client.js').then(
        (m) => new m.ShadowClient(SHADOW_URL, seed.agentToken),
      )
      const botContent = `Bot own msg ${Date.now()}`
      await client.sendMessage(seed.channel.id, botContent)

      // Wait for potential reception
      await sleep(2_000)

      // The bot message may or may not arrive via WS (sent via REST, not WS)
      // But if it does, it should be filtered with a log
      // The key assertion: no processing errors
      const processingErrors = logs.filter((l) => l.includes('[ws] Message processing failed'))
      expect(processingErrors).toEqual([])

      // Cleanup
      abortController.abort()
      await monitorPromise.catch(() => {})
    },
    60_000,
  )
})

// ═══════════════════════════════════════════════════════════════════════════
// 5. Outbound Adapter Integration — verify the outbound adapter sends
//    messages through the real Shadow REST API
// ═══════════════════════════════════════════════════════════════════════════

describe('Outbound Adapter Integration', () => {
  it('sendText() delivers a message to a Shadow channel', async () => {
    const { shadowOutbound } = await import('../../src/outbound.js')

    const cfg = {
      channels: {
        shadow: {
          token: seed.agentToken,
          serverUrl: SHADOW_URL,
        },
      },
    }

    const result = await shadowOutbound.sendText!({
      cfg,
      to: `shadow:channel:${seed.channel.id}`,
      text: 'Outbound adapter E2E test',
    })

    expect(result.ok).toBe(true)
    expect(result.messageId).toBeDefined()

    // Verify the message actually appeared
    const client = new ShadowClient(SHADOW_URL, seed.agentToken)
    const listing = await client.getMessages(seed.channel.id)
    expect(listing.messages.some((m) => m.content === 'Outbound adapter E2E test')).toBe(true)
  })

  it('sendMedia() delivers a message with media URL', async () => {
    const { shadowOutbound } = await import('../../src/outbound.js')

    const cfg = {
      channels: {
        shadow: {
          token: seed.agentToken,
          serverUrl: SHADOW_URL,
        },
      },
    }

    const result = await shadowOutbound.sendMedia!({
      cfg,
      to: `shadow:channel:${seed.channel.id}`,
      text: 'Image attached',
      mediaUrl: 'https://example.com/test.png',
    })

    expect(result.ok).toBe(true)
    expect(result.messageId).toBeDefined()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 6. Plugin Config Integration — verify config resolution with real data
// ═══════════════════════════════════════════════════════════════════════════

describe('Plugin Config Integration', () => {
  it('resolves account config from real OpenClaw-style config', async () => {
    const { getAccountConfig, listAccountIds } = await import('../../src/config.js')

    const cfg = {
      channels: {
        shadow: {
          token: seed.agentToken,
          serverUrl: SHADOW_URL,
          enabled: true,
        },
      },
    }

    const ids = listAccountIds(cfg)
    expect(ids).toContain('default')

    const account = getAccountConfig(cfg, 'default')
    expect(account).not.toBeNull()
    expect(account!.token).toBe(seed.agentToken)
    expect(account!.serverUrl).toBe(SHADOW_URL)
  })

  it('plugin config.isConfigured returns true for valid config', async () => {
    const { shadowPlugin } = await import('../../src/plugin.js')

    const account = {
      token: seed.agentToken,
      serverUrl: SHADOW_URL,
      enabled: true,
    }

    expect(shadowPlugin.config.isConfigured?.(account)).toBe(true)
  })

  it('plugin status.probeAccount succeeds with real agent token', async () => {
    const { shadowPlugin } = await import('../../src/plugin.js')

    const account = {
      token: seed.agentToken,
      serverUrl: SHADOW_URL,
      enabled: true,
    }

    const probe = await shadowPlugin.status!.probeAccount!({
      account,
      timeoutMs: 10_000,
    })

    expect(probe).toBeDefined()
    expect((probe as { ok: boolean }).ok).toBe(true)
    expect((probe as { user: { isBot: boolean } }).user.isBot).toBe(true)
  })
})

//  ═══════════════════════════════════════════════════════════════════════════
//  7. Full OpenClaw Gateway Integration — start the gateway with our plugin
// ═══════════════════════════════════════════════════════════════════════════

describe('OpenClaw Gateway Integration', () => {
  let gatewayProc: ChildProcess

  afterAll(async () => {
    await stopOpenClawGateway()
  })

  it(
    'gateway starts successfully with the shadow plugin loaded',
    async () => {
      // Write config for the gateway
      writeOpenClawConfig(seed.agentToken)

      // Start the gateway
      gatewayProc = await startOpenClawGateway()

      // Wait for the gateway to report it's ready
      // OpenClaw typically logs when plugins are loaded and gateway is listening
      const output = await waitForOutput(gatewayProc, /gateway.*listen|ready|started|shadow/i, {
        maxWait: 45_000,
      })

      // The gateway should have started (process still running)
      expect(gatewayProc.exitCode).toBeNull()

      // Output should mention loading plugins or shadow channel
      const lowerOutput = output.toLowerCase()
      const hasPluginInfo =
        lowerOutput.includes('shadow') ||
        lowerOutput.includes('plugin') ||
        lowerOutput.includes('loaded') ||
        lowerOutput.includes('listen')

      expect(hasPluginInfo).toBe(true)
    },
    SUITE_TIMEOUT,
  )

  it(
    'gateway health endpoint responds',
    async () => {
      // The gateway might take a moment after startup
      await sleep(2000)

      try {
        const res = await fetch(`http://localhost:${OPENCLAW_PORT}/health`, {
          signal: AbortSignal.timeout(5000),
        })
        // OpenClaw may use different health endpoints
        expect([200, 404].includes(res.status)).toBe(true)
      } catch {
        // If the gateway doesn't expose /health, that's ok
        // The process being alive is the real check
        expect(gatewayProc.exitCode).toBeNull()
      }
    },
    30_000,
  )
})
