/**
 * DM (Direct Message) E2E Tests
 *
 * Tests the DM chat functionality end-to-end:
 *   - DM channel creation (REST)
 *   - DM message sending via REST + WebSocket
 *   - DM message receiving via WebSocket broadcast
 *   - DM typing indicators
 *   - DM message edit and delete
 *   - DM reactions (add, remove, fetch)
 *   - DM reply / quote (replyToId)
 *   - Bot relay (relayDmToBot → dm:message:new)
 *   - Bot reply (bot REST send → human receives dm:message)
 *   - Friend list API with claw status
 *
 * Requires: docker compose postgres running on localhost:5432
 */

import { createServer, type Server as HttpServer } from 'node:http'
import { ShadowSocket } from '@shadowob/sdk'
import { asValue } from 'awilix'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { Server as SocketIOServer } from 'socket.io'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import { type AppContainer, createAppContainer } from '../src/container'
import type { Database } from '../src/db'
import * as schema from '../src/db/schema'
import { signAccessToken } from '../src/lib/jwt'
import { setupWebSocket } from '../src/ws'

const TEST_DB_URL = process.env.DATABASE_URL ?? 'postgresql://shadow:shadow@127.0.0.1:5432/shadow'

let sql: ReturnType<typeof postgres>
let db: Database
let container: AppContainer
let httpServer: HttpServer
let io: SocketIOServer
let baseUrl: string

let userId: string
let userToken: string
let user2Id: string
let user2Token: string

let ws1: ShadowSocket
let ws2: ShadowSocket

function waitForRawEvent<T>(ws: ShadowSocket, event: string, timeout = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${event}`)), timeout)
    ws.raw.once(event, (data: T) => {
      clearTimeout(timer)
      resolve(data)
    })
  })
}

beforeAll(async () => {
  sql = postgres(TEST_DB_URL, { max: 5 })
  db = drizzle(sql, { schema })
  container = createAppContainer(db)
  const app = createApp(container)

  httpServer = createServer(async (req, res) => {
    const response = await app.fetch(
      new Request(`http://localhost${req.url}`, {
        method: req.method,
        headers: req.headers as HeadersInit,
        body: ['GET', 'HEAD'].includes(req.method ?? '')
          ? undefined
          : await new Promise<string>((resolve) => {
              const chunks: Uint8Array[] = []
              req.on('data', (c: Uint8Array) => chunks.push(c))
              req.on('end', () => resolve(Buffer.concat(chunks).toString()))
            }),
      }),
    )
    res.writeHead(response.status, Object.fromEntries(response.headers.entries()))
    const body = await response.arrayBuffer()
    res.end(Buffer.from(body))
  })

  io = new SocketIOServer(httpServer, {
    cors: { origin: '*' },
    transports: ['websocket'],
  })
  setupWebSocket(io, container)
  container.register({ io: asValue(io) })

  await new Promise<void>((resolve) => {
    httpServer.listen(0, '127.0.0.1', () => resolve())
  })
  const addr = httpServer.address()
  const port = typeof addr === 'object' && addr ? addr.port : 0
  baseUrl = `http://127.0.0.1:${port}`

  // Create test users
  const userDao = container.resolve('userDao')
  const ts = Date.now()

  const user1 = await userDao.create({
    email: `dm-e2e-1-${ts}@test.local`,
    username: `dm1_${ts}`,
    passwordHash: 'not-used',
  })
  userId = user1!.id
  userToken = signAccessToken({
    userId,
    email: user1!.email,
    username: user1!.username,
  })

  const user2 = await userDao.create({
    email: `dm-e2e-2-${ts}@test.local`,
    username: `dm2_${ts}`,
    passwordHash: 'not-used',
  })
  user2Id = user2!.id
  user2Token = signAccessToken({
    userId: user2Id,
    email: user2!.email,
    username: user2!.username,
  })

  // Connect WebSocket clients
  ws1 = new ShadowSocket({ serverUrl: baseUrl, token: userToken })
  ws2 = new ShadowSocket({ serverUrl: baseUrl, token: user2Token })
  ws1.connect()
  ws2.connect()
  await Promise.all([ws1.waitForConnect(), ws2.waitForConnect()])
}, 30_000)

afterAll(async () => {
  ws1?.disconnect()
  ws2?.disconnect()
  // Wait for disconnect handlers (e.g., presence gateway) to finish before closing DB
  await new Promise((r) => setTimeout(r, 500))
  io?.close()
  httpServer?.close()
  await sql?.end()
})

describe('DM Chat E2E', () => {
  let dmChannelId: string

  it('creates a DM channel between two users via REST', async () => {
    const res = await fetch(`${baseUrl}/api/dm/channels`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({ userId: user2Id }),
    })
    expect(res.status).toBe(201)

    const channel = (await res.json()) as { id: string; userAId: string; userBId: string }
    expect(channel.id).toBeDefined()
    dmChannelId = channel.id
  })

  it('returns the same DM channel for the reverse direction', async () => {
    const res = await fetch(`${baseUrl}/api/dm/channels`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user2Token}`,
      },
      body: JSON.stringify({ userId }),
    })
    expect(res.status).toBe(201)

    const channel = (await res.json()) as { id: string }
    expect(channel.id).toBe(dmChannelId)
  })

  it('lists DM channels for a user', async () => {
    const res = await fetch(`${baseUrl}/api/dm/channels`, {
      headers: { Authorization: `Bearer ${userToken}` },
    })
    expect(res.status).toBe(200)

    const channels = (await res.json()) as Array<{
      id: string
      otherUser: { id: string; username: string }
    }>
    expect(channels.length).toBeGreaterThanOrEqual(1)

    const ourChannel = channels.find((c) => c.id === dmChannelId)
    expect(ourChannel).toBeDefined()
    expect(ourChannel!.otherUser.id).toBe(user2Id)
  })

  it('sends a DM message via REST and gets it back', async () => {
    const res = await fetch(`${baseUrl}/api/dm/channels/${dmChannelId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({ content: 'Hello via REST' }),
    })
    expect(res.status).toBe(201)

    const msg = (await res.json()) as {
      id: string
      content: string
      dmChannelId: string
      authorId: string
      author?: { id: string; username: string }
    }
    expect(msg.content).toBe('Hello via REST')
    expect(msg.dmChannelId).toBe(dmChannelId)
    expect(msg.authorId).toBe(userId)
    expect(msg.author).toBeDefined()
  })

  it('fetches DM messages with pagination', async () => {
    const res = await fetch(`${baseUrl}/api/dm/channels/${dmChannelId}/messages?limit=10`, {
      headers: { Authorization: `Bearer ${userToken}` },
    })
    expect(res.status).toBe(200)

    const msgs = (await res.json()) as Array<{ id: string; content: string }>
    expect(msgs.length).toBeGreaterThanOrEqual(1)
    expect(msgs[0]!.content).toBe('Hello via REST')
  })

  it('user2 receives dm:message via WebSocket when user1 sends via dm:send', async () => {
    // Both users join the DM room
    ws1.raw.emit('dm:join', { dmChannelId })
    ws2.raw.emit('dm:join', { dmChannelId })
    await new Promise((r) => setTimeout(r, 200))

    const received = waitForRawEvent<{ content: string; dmChannelId: string }>(ws2, 'dm:message')
    // ws1 also receives the broadcast — drain it so it doesn't pollute the next test
    const drain = waitForRawEvent(ws1, 'dm:message')

    ws1.raw.emit('dm:send', { dmChannelId, content: 'Hello via WS' })

    const msg = await received
    expect(msg.content).toBe('Hello via WS')
    expect(msg.dmChannelId).toBe(dmChannelId)
    await drain
  })

  it('user1 also receives own dm:message (io.to broadcasts to all in DM room)', async () => {
    const received = waitForRawEvent<{ content: string }>(ws1, 'dm:message')

    ws1.raw.emit('dm:send', { dmChannelId, content: 'Self-receive DM test' })

    const msg = await received
    expect(msg.content).toBe('Self-receive DM test')
  })

  it('user2 receives dm:message via WebSocket when user1 sends via REST', async () => {
    // Drain any pending dm:message events from previous test (self-receive broadcasts to all)
    await new Promise((r) => setTimeout(r, 200))
    ws2.raw.removeAllListeners('dm:message')

    const received = waitForRawEvent<{ content: string }>(ws2, 'dm:message')

    const res = await fetch(`${baseUrl}/api/dm/channels/${dmChannelId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({ content: 'REST broadcast test' }),
    })
    expect(res.status).toBe(201)

    const msg = await received
    expect(msg.content).toBe('REST broadcast test')
  })

  it('user1 receives dm:typing from user2', async () => {
    const received = waitForRawEvent<{ dmChannelId: string; userId: string }>(ws1, 'dm:typing')

    ws2.raw.emit('dm:typing', { dmChannelId })

    const payload = await received
    expect(payload.dmChannelId).toBe(dmChannelId)
    expect(payload.userId).toBe(user2Id)
  })

  it('typing event is NOT received by the sender', async () => {
    let selfReceived = false
    const handler = () => {
      selfReceived = true
    }
    ws1.raw.on('dm:typing', handler)

    ws1.raw.emit('dm:typing', { dmChannelId })
    await new Promise((r) => setTimeout(r, 300))

    expect(selfReceived).toBe(false)
    ws1.raw.off('dm:typing', handler)
  })

  it('after dm:leave, user2 stops receiving dm:message events', async () => {
    ws2.raw.emit('dm:leave', { dmChannelId })
    await new Promise((r) => setTimeout(r, 100))

    let received = false
    const handler = () => {
      received = true
    }
    ws2.raw.on('dm:message', handler)

    ws1.raw.emit('dm:send', { dmChannelId, content: 'After leave' })
    await new Promise((r) => setTimeout(r, 500))

    expect(received).toBe(false)
    ws2.raw.off('dm:message', handler)

    // Rejoin for subsequent tests
    ws2.raw.emit('dm:join', { dmChannelId })
    await new Promise((r) => setTimeout(r, 100))
  })

  it('non-participant cannot join DM room', async () => {
    // Create a third user
    const userDao = container.resolve('userDao')
    const ts = Date.now()
    const user3 = await userDao.create({
      email: `dm-e2e-3-${ts}@test.local`,
      username: `dm3_${ts}`,
      passwordHash: 'not-used',
    })
    const user3Token = signAccessToken({
      userId: user3!.id,
      email: user3!.email,
      username: user3!.username,
    })
    const ws3 = new ShadowSocket({ serverUrl: baseUrl, token: user3Token })
    ws3.connect()
    await ws3.waitForConnect()

    // Try to join the DM room
    ws3.raw.emit('dm:join', { dmChannelId })
    await new Promise((r) => setTimeout(r, 200))

    // Try to send a message — should fail
    let receivedError = false
    ws3.raw.on('error', () => {
      receivedError = true
    })
    ws3.raw.emit('dm:send', { dmChannelId, content: 'Unauthorized attempt' })
    await new Promise((r) => setTimeout(r, 300))

    expect(receivedError).toBe(true)
    ws3.disconnect()
  })
})

describe('DM Message Edit & Delete', () => {
  let dmChannelId: string
  let messageId: string

  it('setup: create DM channel and message', async () => {
    const res = await fetch(`${baseUrl}/api/dm/channels`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({ userId: user2Id }),
    })
    const channel = (await res.json()) as { id: string }
    dmChannelId = channel.id

    const msgRes = await fetch(`${baseUrl}/api/dm/channels/${dmChannelId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({ content: 'Original content' }),
    })
    const msg = (await msgRes.json()) as { id: string }
    messageId = msg.id
  })

  it('edits a DM message via REST', async () => {
    const res = await fetch(`${baseUrl}/api/dm/channels/${dmChannelId}/messages/${messageId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({ content: 'Edited content' }),
    })
    expect(res.status).toBe(200)

    const updated = (await res.json()) as { id: string; content: string; isEdited: boolean }
    expect(updated.content).toBe('Edited content')
    expect(updated.isEdited).toBe(true)
  })

  it('non-author cannot edit a DM message', async () => {
    const res = await fetch(`${baseUrl}/api/dm/channels/${dmChannelId}/messages/${messageId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user2Token}`,
      },
      body: JSON.stringify({ content: 'Hack attempt' }),
    })
    expect(res.status).toBe(403)
  })

  it('user2 receives dm:message:updated via WebSocket on edit', async () => {
    ws1.raw.emit('dm:join', { dmChannelId })
    ws2.raw.emit('dm:join', { dmChannelId })
    await new Promise((r) => setTimeout(r, 200))

    const received = waitForRawEvent<{ id: string; content: string; isEdited: boolean }>(
      ws2,
      'dm:message:updated',
    )

    await fetch(`${baseUrl}/api/dm/channels/${dmChannelId}/messages/${messageId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({ content: 'Edited again' }),
    })

    const msg = await received
    expect(msg.id).toBe(messageId)
    expect(msg.content).toBe('Edited again')
    expect(msg.isEdited).toBe(true)
  })

  it('deletes a DM message via REST', async () => {
    const res = await fetch(`${baseUrl}/api/dm/channels/${dmChannelId}/messages/${messageId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${userToken}` },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean }
    expect(body.success).toBe(true)
  })

  it('user2 receives dm:message:deleted via WebSocket on delete', async () => {
    // Create a new message to delete
    const msgRes = await fetch(`${baseUrl}/api/dm/channels/${dmChannelId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({ content: 'Will be deleted' }),
    })
    const msg = (await msgRes.json()) as { id: string }

    const received = waitForRawEvent<{ id: string; dmChannelId: string }>(ws2, 'dm:message:deleted')

    await fetch(`${baseUrl}/api/dm/channels/${dmChannelId}/messages/${msg.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${userToken}` },
    })

    const deleted = await received
    expect(deleted.id).toBe(msg.id)
    expect(deleted.dmChannelId).toBe(dmChannelId)
  })

  it('non-author cannot delete a DM message', async () => {
    // Create message from user1
    const msgRes = await fetch(`${baseUrl}/api/dm/channels/${dmChannelId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({ content: 'User1 message' }),
    })
    const msg = (await msgRes.json()) as { id: string }

    // User2 tries to delete it
    const res = await fetch(`${baseUrl}/api/dm/channels/${dmChannelId}/messages/${msg.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${user2Token}` },
    })
    expect(res.status).toBe(403)
  })
})

describe('DM Reactions', () => {
  let dmChannelId: string
  let messageId: string

  it('setup: create DM channel and message', async () => {
    const res = await fetch(`${baseUrl}/api/dm/channels`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({ userId: user2Id }),
    })
    const channel = (await res.json()) as { id: string }
    dmChannelId = channel.id

    const msgRes = await fetch(`${baseUrl}/api/dm/channels/${dmChannelId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({ content: 'React to this' }),
    })
    const msg = (await msgRes.json()) as { id: string }
    messageId = msg.id
  })

  it('adds a reaction to a DM message', async () => {
    const res = await fetch(`${baseUrl}/api/dm/messages/${messageId}/reactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({ emoji: '👍' }),
    })
    expect(res.status).toBe(201)
  })

  it('fetches reactions for a DM message', async () => {
    const res = await fetch(`${baseUrl}/api/dm/messages/${messageId}/reactions`, {
      headers: { Authorization: `Bearer ${userToken}` },
    })
    expect(res.status).toBe(200)

    const reactions = (await res.json()) as Array<{
      emoji: string
      count: number
      userIds: string[]
    }>
    expect(reactions.length).toBe(1)
    expect(reactions[0]!.emoji).toBe('👍')
    expect(reactions[0]!.count).toBe(1)
    expect(reactions[0]!.userIds).toContain(userId)
  })

  it('user2 also adds a reaction', async () => {
    const res = await fetch(`${baseUrl}/api/dm/messages/${messageId}/reactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user2Token}`,
      },
      body: JSON.stringify({ emoji: '👍' }),
    })
    expect(res.status).toBe(201)

    // Verify count is now 2
    const reactionsRes = await fetch(`${baseUrl}/api/dm/messages/${messageId}/reactions`, {
      headers: { Authorization: `Bearer ${userToken}` },
    })
    const reactions = (await reactionsRes.json()) as Array<{
      emoji: string
      count: number
      userIds: string[]
    }>
    expect(reactions[0]!.count).toBe(2)
  })

  it('broadcasts dm:reaction:updated via WebSocket', async () => {
    ws1.raw.emit('dm:join', { dmChannelId })
    ws2.raw.emit('dm:join', { dmChannelId })
    await new Promise((r) => setTimeout(r, 200))

    const received = waitForRawEvent<{
      dmMessageId: string
      reactions: Array<{ emoji: string; count: number }>
    }>(ws1, 'dm:reaction:updated')

    await fetch(`${baseUrl}/api/dm/messages/${messageId}/reactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user2Token}`,
      },
      body: JSON.stringify({ emoji: '❤️' }),
    })

    const payload = await received
    expect(payload.dmMessageId).toBe(messageId)
    expect(payload.reactions.length).toBeGreaterThanOrEqual(2)
  })

  it('removes a reaction from a DM message', async () => {
    const res = await fetch(
      `${baseUrl}/api/dm/messages/${messageId}/reactions/${encodeURIComponent('👍')}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${userToken}` },
      },
    )
    expect(res.status).toBe(200)

    // Verify reaction count decreased
    const reactionsRes = await fetch(`${baseUrl}/api/dm/messages/${messageId}/reactions`, {
      headers: { Authorization: `Bearer ${userToken}` },
    })
    const reactions = (await reactionsRes.json()) as Array<{
      emoji: string
      count: number
      userIds: string[]
    }>
    const thumbsUp = reactions.find((r) => r.emoji === '👍')
    if (thumbsUp) {
      expect(thumbsUp.userIds).not.toContain(userId)
    }
  })
})

describe('DM Reply / Quote', () => {
  let dmChannelId: string
  let originalMessageId: string

  it('setup: create DM channel and original message', async () => {
    const res = await fetch(`${baseUrl}/api/dm/channels`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({ userId: user2Id }),
    })
    const channel = (await res.json()) as { id: string }
    dmChannelId = channel.id

    const msgRes = await fetch(`${baseUrl}/api/dm/channels/${dmChannelId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({ content: 'Original message' }),
    })
    const msg = (await msgRes.json()) as { id: string }
    originalMessageId = msg.id
  })

  it('sends a DM reply with replyToId via REST', async () => {
    const res = await fetch(`${baseUrl}/api/dm/channels/${dmChannelId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user2Token}`,
      },
      body: JSON.stringify({
        content: 'This is a reply',
        replyToId: originalMessageId,
      }),
    })
    expect(res.status).toBe(201)

    const msg = (await res.json()) as {
      id: string
      content: string
      replyToId: string | null
    }
    expect(msg.content).toBe('This is a reply')
    expect(msg.replyToId).toBe(originalMessageId)
  })

  it('sends a DM reply with replyToId via WebSocket', async () => {
    ws1.raw.emit('dm:join', { dmChannelId })
    ws2.raw.emit('dm:join', { dmChannelId })
    await new Promise((r) => setTimeout(r, 200))

    const received = waitForRawEvent<{
      content: string
      replyToId: string | null
    }>(ws1, 'dm:message')

    ws2.raw.emit('dm:send', {
      dmChannelId,
      content: 'WS reply',
      replyToId: originalMessageId,
    })

    const msg = await received
    expect(msg.content).toBe('WS reply')
    expect(msg.replyToId).toBe(originalMessageId)
  })

  it('fetched messages include replyToId', async () => {
    const res = await fetch(`${baseUrl}/api/dm/channels/${dmChannelId}/messages?limit=10`, {
      headers: { Authorization: `Bearer ${userToken}` },
    })
    const msgs = (await res.json()) as Array<{
      id: string
      content: string
      replyToId: string | null
    }>

    const replyMsg = msgs.find((m) => m.content === 'This is a reply')
    expect(replyMsg).toBeDefined()
    expect(replyMsg!.replyToId).toBe(originalMessageId)
  })
})

describe('Bot DM Relay', () => {
  let botUserId: string
  let botToken: string
  let wsBotClient: ShadowSocket
  let dmChannelId: string

  it('setup: create bot user and connect', async () => {
    const userDao = container.resolve('userDao')
    const ts = Date.now()

    const botUser = await userDao.create({
      email: `relay-bot-${ts}@test.local`,
      username: `relay_bot_${ts}`,
      passwordHash: 'not-used',
    })
    botUserId = botUser!.id

    // Mark as bot
    await db.update(schema.users).set({ isBot: true }).where(eq(schema.users.id, botUserId))

    botToken = signAccessToken({
      userId: botUserId,
      email: botUser!.email,
      username: botUser!.username,
    })

    // Connect bot WebSocket
    wsBotClient = new ShadowSocket({ serverUrl: baseUrl, token: botToken })
    wsBotClient.connect()
    await wsBotClient.waitForConnect()
  })

  it('creates DM channel between user and bot', async () => {
    const res = await fetch(`${baseUrl}/api/dm/channels`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({ userId: botUserId }),
    })
    expect(res.status).toBe(201)
    const channel = (await res.json()) as { id: string }
    dmChannelId = channel.id
  })

  it('bot receives dm:message:new when user sends DM via REST', async () => {
    // User joins DM room
    ws1.raw.emit('dm:join', { dmChannelId })
    await new Promise((r) => setTimeout(r, 200))

    const botReceived = waitForRawEvent<{
      id: string
      content: string
      dmChannelId: string
      senderId: string
      receiverId: string
      authorId: string
      replyToId: string | null
      attachments: unknown[]
    }>(wsBotClient, 'dm:message:new')

    await fetch(`${baseUrl}/api/dm/channels/${dmChannelId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({ content: 'Hello bot!' }),
    })

    const msg = await botReceived
    expect(msg.content).toBe('Hello bot!')
    expect(msg.dmChannelId).toBe(dmChannelId)
    expect(msg.senderId).toBe(userId)
    expect(msg.receiverId).toBe(botUserId)
    expect(msg.attachments).toBeDefined()
    expect(msg.replyToId).toBeNull()
  })

  it('bot receives dm:message:new when user sends DM via WebSocket', async () => {
    const botReceived = waitForRawEvent<{
      content: string
      dmChannelId: string
      senderId: string
    }>(wsBotClient, 'dm:message:new')

    ws1.raw.emit('dm:send', { dmChannelId, content: 'Hello bot via WS!' })

    const msg = await botReceived
    expect(msg.content).toBe('Hello bot via WS!')
    expect(msg.dmChannelId).toBe(dmChannelId)
    expect(msg.senderId).toBe(userId)
  })

  it('bot receives dm:message:new with replyToId when user quotes', async () => {
    // Set up drain listener BEFORE sending so the event isn't lost
    const drainPromise = waitForRawEvent(wsBotClient, 'dm:message:new')

    // Send an original message first
    const originalRes = await fetch(`${baseUrl}/api/dm/channels/${dmChannelId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({ content: 'Original for bot reply test' }),
    })
    const original = (await originalRes.json()) as { id: string }

    // Drain the dm:message:new from the original message
    await drainPromise

    const botReceived = waitForRawEvent<{
      content: string
      replyToId: string | null
    }>(wsBotClient, 'dm:message:new')

    await fetch(`${baseUrl}/api/dm/channels/${dmChannelId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({
        content: 'Quoting you',
        replyToId: original.id,
      }),
    })

    const msg = await botReceived
    expect(msg.content).toBe('Quoting you')
    expect(msg.replyToId).toBe(original.id)
  })

  it('user receives dm:message when bot replies via REST', async () => {
    ws1.raw.emit('dm:join', { dmChannelId })
    await new Promise((r) => setTimeout(r, 200))

    // Clear any pending events
    ws1.raw.removeAllListeners('dm:message')

    const userReceived = waitForRawEvent<{
      content: string
      authorId: string
      dmChannelId: string
      author?: { id: string; isBot?: boolean }
    }>(ws1, 'dm:message')

    // Bot sends a reply via REST (same as ShadowClient.sendDmMessage)
    const res = await fetch(`${baseUrl}/api/dm/channels/${dmChannelId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${botToken}`,
      },
      body: JSON.stringify({ content: 'Bot reply!' }),
    })
    expect(res.status).toBe(201)

    const msg = await userReceived
    expect(msg.content).toBe('Bot reply!')
    expect(msg.authorId).toBe(botUserId)
    expect(msg.dmChannelId).toBe(dmChannelId)
  })

  it('bot reply does NOT trigger relay back to human (human is not a bot)', async () => {
    // The relayDmToBot should skip since the other user (user1) is not a bot.
    // We verify by ensuring user1 does NOT receive dm:message:new (only dm:message).
    let receivedDmMessageNew = false
    const handler = () => {
      receivedDmMessageNew = true
    }
    ws1.raw.on('dm:message:new', handler)

    await fetch(`${baseUrl}/api/dm/channels/${dmChannelId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${botToken}`,
      },
      body: JSON.stringify({ content: 'Another bot message' }),
    })
    await new Promise((r) => setTimeout(r, 500))

    expect(receivedDmMessageNew).toBe(false)
    ws1.raw.off('dm:message:new', handler)
  })

  it('cleanup: disconnect bot client', () => {
    wsBotClient?.disconnect()
  })
})

describe('DM WebSocket Edit & Delete Events', () => {
  let dmChannelId: string

  it('setup: get or create DM channel', async () => {
    const res = await fetch(`${baseUrl}/api/dm/channels`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({ userId: user2Id }),
    })
    const channel = (await res.json()) as { id: string }
    dmChannelId = channel.id

    ws1.raw.emit('dm:join', { dmChannelId })
    ws2.raw.emit('dm:join', { dmChannelId })
    await new Promise((r) => setTimeout(r, 200))
  })

  it('dm:edit updates a message and broadcasts dm:message:updated', async () => {
    // Send a message first
    const sendReceived = waitForRawEvent<{ id: string; content: string }>(ws2, 'dm:message')
    ws1.raw.emit('dm:send', { dmChannelId, content: 'Before edit' })
    const sent = await sendReceived

    // Edit via socket
    const editReceived = waitForRawEvent<{ id: string; content: string; isEdited: boolean }>(
      ws2,
      'dm:message:updated',
    )
    ws1.raw.emit('dm:edit', {
      dmChannelId,
      messageId: sent.id,
      content: 'After WS edit',
    })

    const edited = await editReceived
    expect(edited.id).toBe(sent.id)
    expect(edited.content).toBe('After WS edit')
    expect(edited.isEdited).toBe(true)
  })

  it('dm:delete removes a message and broadcasts dm:message:deleted', async () => {
    // Send a message first
    const sendReceived = waitForRawEvent<{ id: string }>(ws2, 'dm:message')
    ws1.raw.emit('dm:send', { dmChannelId, content: 'Will be WS deleted' })
    const sent = await sendReceived

    // Delete via socket
    const deleteReceived = waitForRawEvent<{ id: string; dmChannelId: string }>(
      ws2,
      'dm:message:deleted',
    )
    ws1.raw.emit('dm:delete', { dmChannelId, messageId: sent.id })

    const deleted = await deleteReceived
    expect(deleted.id).toBe(sent.id)
    expect(deleted.dmChannelId).toBe(dmChannelId)
  })
})

describe('Friends API with Claw Status', () => {
  it('returns friend list with correct sources', async () => {
    // First, make them friends
    const userDao = container.resolve('userDao')
    const user2 = await userDao.findById(user2Id)

    const reqRes = await fetch(`${baseUrl}/api/friends/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({ username: user2!.username }),
    })
    // Could be 201 (new) or 409 (already exists) depending on test order
    expect([200, 201, 409].includes(reqRes.status)).toBe(true)

    // If pending, accept from user2 side
    const pendingRes = await fetch(`${baseUrl}/api/friends/pending`, {
      headers: { Authorization: `Bearer ${user2Token}` },
    })
    const pending = (await pendingRes.json()) as Array<{ friendshipId: string }>
    if (pending.length > 0) {
      await fetch(`${baseUrl}/api/friends/${pending[0]!.friendshipId}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${user2Token}` },
      })
    }

    // Fetch friends list
    const friendsRes = await fetch(`${baseUrl}/api/friends`, {
      headers: { Authorization: `Bearer ${userToken}` },
    })
    expect(friendsRes.status).toBe(200)

    const friends = (await friendsRes.json()) as Array<{
      friendshipId: string
      source: string
      user: { id: string; username: string }
      clawStatus?: string
    }>

    // Should find user2 as a friend
    const friendEntry = friends.find((f) => f.user.id === user2Id)
    expect(friendEntry).toBeDefined()
    expect(friendEntry!.source).toBe('friend')
  })

  it('returns owned claws with clawStatus', async () => {
    // Create a bot user + agent for user1
    const userDao = container.resolve('userDao')
    const agentDao = container.resolve('agentDao')
    const ts = Date.now()

    const botUser = await userDao.create({
      email: `bot-dm-${ts}@test.local`,
      username: `bot_dm_${ts}`,
      passwordHash: 'not-used',
    })
    // Mark as bot directly since userDao.create doesn't accept isBot
    await db.update(schema.users).set({ isBot: true }).where(eq(schema.users.id, botUser!.id))

    await agentDao.create({
      userId: botUser!.id,
      ownerId: userId,
      kernelType: 'custom',
      config: {},
    })

    // Fetch friends — bot should appear as owned_claw with status 'available'
    const friendsRes = await fetch(`${baseUrl}/api/friends`, {
      headers: { Authorization: `Bearer ${userToken}` },
    })
    const friends = (await friendsRes.json()) as Array<{
      friendshipId: string
      source: string
      user: { id: string }
      clawStatus?: string
    }>

    const botEntry = friends.find((f) => f.user.id === botUser!.id)
    expect(botEntry).toBeDefined()
    expect(botEntry!.source).toBe('owned_claw')
    expect(botEntry!.clawStatus).toBe('available')
  })
})
