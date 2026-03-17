/**
 * Socket.IO Real-time E2E Tests
 *
 * Tests the mobile app's socket event flow using ShadowSocket + raw socket
 * to reproduce the exact same pattern the mobile app uses:
 *   - channel:join with ack
 *   - message:new events (via WS and REST)
 *   - message:typing events
 *   - message:updated / message:deleted events
 *   - Reconnection + re-join behavior
 *
 * Requires: docker compose postgres running on localhost:5432
 */

import { createServer, type Server as HttpServer } from 'node:http'
import { ShadowSocket } from '@shadowob/sdk'
import { asValue } from 'awilix'
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

const TEST_DB_URL = process.env.DATABASE_URL ?? 'postgresql://shadow:shadow@localhost:5432/shadow'

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
let serverId: string
let channelId: string

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
              const chunks: Buffer[] = []
              req.on('data', (c: Buffer) => chunks.push(c))
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
    httpServer.listen(0, () => resolve())
  })
  const addr = httpServer.address()
  const port = typeof addr === 'object' && addr ? addr.port : 0
  baseUrl = `http://localhost:${port}`

  // Create test users
  const userDao = container.resolve('userDao')
  const ts = Date.now()

  const user1 = await userDao.create({
    email: `rtm-e2e-1-${ts}@test.local`,
    username: `rtm1_${ts}`,
    passwordHash: 'not-used',
  })
  userId = user1!.id
  userToken = signAccessToken({
    userId,
    email: user1!.email,
    username: user1!.username,
  })

  const user2 = await userDao.create({
    email: `rtm-e2e-2-${ts}@test.local`,
    username: `rtm2_${ts}`,
    passwordHash: 'not-used',
  })
  user2Id = user2!.id
  user2Token = signAccessToken({
    userId: user2Id,
    email: user2!.email,
    username: user2!.username,
  })

  // Create server + channel + memberships
  const serverDao = container.resolve('serverDao')
  const channelService = container.resolve('channelService')

  const server = await serverDao.create({ name: `rtm-e2e-${ts}`, ownerId: userId })
  serverId = server!.id
  await serverDao.addMember(serverId, userId, 'owner')
  await serverDao.addMember(serverId, user2Id, 'member')

  const ch = await channelService.create(
    serverId,
    {
      name: 'rtm-test-channel',
      type: 'text',
    },
    userId,
  )
  channelId = ch.id
  // user2 must also be a channel member for channel:join to succeed
  await channelService.addMember(channelId, user2Id)

  // Connect sockets (same pattern as mobile: auth token, websocket transport)
  ws1 = new ShadowSocket({ serverUrl: baseUrl, token: userToken })
  ws2 = new ShadowSocket({ serverUrl: baseUrl, token: user2Token })

  ws1.connect()
  ws2.connect()
  await Promise.all([ws1.waitForConnect(), ws2.waitForConnect()])
}, 30_000)

afterAll(async () => {
  ws1?.disconnect()
  ws2?.disconnect()
  // Give presence gateway time to process disconnect before closing
  await new Promise((r) => setTimeout(r, 500))
  io?.close()
  httpServer?.close()
  await sql?.end()
})

describe('Socket.IO Real-time (mobile pattern)', () => {
  it('both sockets connect successfully', () => {
    expect(ws1.connected).toBe(true)
    expect(ws2.connected).toBe(true)
  })

  it('channel:join returns ok:true for members', async () => {
    const res1 = await ws1.joinChannel(channelId)
    expect(res1.ok).toBe(true)

    const res2 = await ws2.joinChannel(channelId)
    expect(res2.ok).toBe(true)
  })

  it('user2 receives message:new when user1 sends via message:send', async () => {
    const received = waitForRawEvent<{ content: string; channelId: string }>(ws2, 'message:new')

    ws1.sendMessage({ channelId, content: 'Hello from user1 via WS' })

    const msg = await received
    expect(msg.content).toBe('Hello from user1 via WS')
    expect(msg.channelId).toBe(channelId)
  })

  it('user1 also receives own message:new (io.to broadcasts to all in room)', async () => {
    const received = waitForRawEvent<{ content: string }>(ws1, 'message:new')
    // ws2 also receives the broadcast — drain it so it doesn't pollute the next test
    const drain = waitForRawEvent(ws2, 'message:new')

    ws1.sendMessage({ channelId, content: 'Self-receive test' })

    const msg = await received
    expect(msg.content).toBe('Self-receive test')
    await drain
  })

  it('user2 receives message:new when user1 sends via REST', async () => {
    const received = waitForRawEvent<{ content: string; channelId: string }>(ws2, 'message:new')

    const res = await fetch(`${baseUrl}/api/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({ content: 'Hello from REST API' }),
    })
    expect(res.status).toBe(201)

    const msg = await received
    expect(msg.content).toBe('Hello from REST API')
  })

  it('user1 receives message:typing from user2', async () => {
    // Server emits 'message:typing' (not 'member:typing' from SDK types)
    const received = waitForRawEvent<{ channelId: string; userId: string; username: string }>(
      ws1,
      'message:typing',
    )

    ws2.sendTyping(channelId)

    const payload = await received
    expect(payload.channelId).toBe(channelId)
    expect(payload.userId).toBe(user2Id)
  })

  it('typing event is NOT received by the sender', async () => {
    let selfReceived = false
    const handler = () => {
      selfReceived = true
    }
    ws2.raw.on('message:typing', handler)

    ws2.sendTyping(channelId)
    await new Promise((r) => setTimeout(r, 300))

    expect(selfReceived).toBe(false)
    ws2.raw.off('message:typing', handler)
  })

  it('user2 receives message:updated when message is edited via REST', async () => {
    const createRes = await fetch(`${baseUrl}/api/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({ content: 'Original content' }),
    })
    const created = (await createRes.json()) as { id: string }

    const received = waitForRawEvent<{ id: string; content: string }>(ws2, 'message:updated')

    await fetch(`${baseUrl}/api/messages/${created.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({ content: 'Edited content' }),
    })

    const msg = await received
    expect(msg.id).toBe(created.id)
    expect(msg.content).toBe('Edited content')
  })

  it('user2 receives message:deleted when message is deleted via REST', async () => {
    const createRes = await fetch(`${baseUrl}/api/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({ content: 'To be deleted' }),
    })
    const created = (await createRes.json()) as { id: string }

    const received = waitForRawEvent<{ id: string; channelId: string }>(ws2, 'message:deleted')

    await fetch(`${baseUrl}/api/messages/${created.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${userToken}` },
    })

    const payload = await received
    expect(payload.id).toBe(created.id)
  })

  it('after channel:leave, user2 stops receiving events', async () => {
    ws2.leaveChannel(channelId)
    await new Promise((r) => setTimeout(r, 100))

    let received = false
    const handler = () => {
      received = true
    }
    ws2.raw.on('message:new', handler)

    ws1.sendMessage({ channelId, content: 'After leave' })
    await new Promise((r) => setTimeout(r, 500))

    expect(received).toBe(false)
    ws2.raw.off('message:new', handler)

    // Re-join for subsequent tests
    const res = await ws2.joinChannel(channelId)
    expect(res.ok).toBe(true)
  })

  it('reconnect + re-join restores event reception', async () => {
    ws2.disconnect()
    await new Promise((r) => setTimeout(r, 100))
    expect(ws2.connected).toBe(false)

    ws2.connect()
    await ws2.waitForConnect()
    expect(ws2.connected).toBe(true)

    // Re-join channel (mobile does this on 'connect' event)
    const res = await ws2.joinChannel(channelId)
    expect(res.ok).toBe(true)

    // Verify events are received again
    const received = waitForRawEvent<{ content: string }>(ws2, 'message:new')
    ws1.sendMessage({ channelId, content: 'After reconnect' })
    const msg = await received
    expect(msg.content).toBe('After reconnect')
  })
})
