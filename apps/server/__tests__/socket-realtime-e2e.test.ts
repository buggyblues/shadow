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
let user2Username: string
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

function waitForRawEventMatching<T>(
  ws: ShadowSocket,
  event: string,
  matches: (data: T) => boolean,
  timeout = 5000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const handler = (data: T) => {
      if (!matches(data)) return
      clearTimeout(timer)
      ws.raw.off(event, handler)
      resolve(data)
    }
    const timer = setTimeout(() => {
      ws.raw.off(event, handler)
      reject(new Error(`Timeout waiting for matching ${event}`))
    }, timeout)
    ws.raw.on(event, handler)
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
  user2Username = user2!.username
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

  it('gates private channel entry through an approval request without hiding mentions', async () => {
    const channelService = container.resolve('channelService')
    const privateChannel = await channelService.create(
      serverId,
      {
        name: `rtm-private-${Date.now()}`,
        type: 'text',
        isPrivate: true,
      },
      userId,
    )

    await Promise.all([ws1.joinChannel(channelId), ws2.joinChannel(channelId)])
    const receivedMention = waitForRawEventMatching<{
      content: string
      metadata?: { mentions?: Array<{ kind: string; channelId?: string; isPrivate?: boolean }> }
    }>(ws2, 'message:new', (msg) => msg.content.includes(`<#${privateChannel.id}>`))
    ws1.sendMessage({
      channelId,
      content: 'See private-room',
      mentions: [
        {
          kind: 'channel',
          targetId: privateChannel.id,
          channelId: privateChannel.id,
          serverId,
          token: 'private-room',
          label: `#${privateChannel.name}`,
        },
      ],
    })
    const mentionMessage = await receivedMention
    expect(mentionMessage.metadata?.mentions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'channel',
          channelId: privateChannel.id,
          isPrivate: true,
        }),
      ]),
    )

    const deniedJoin = await ws2.joinChannel(privateChannel.id)
    expect(deniedJoin.ok).toBe(false)

    const deniedMessages = await fetch(`${baseUrl}/api/channels/${privateChannel.id}/messages`, {
      headers: { Authorization: `Bearer ${user2Token}` },
    })
    expect(deniedMessages.status).toBe(403)

    const privateMessageRes = await fetch(`${baseUrl}/api/channels/${privateChannel.id}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({ content: 'private channel content' }),
    })
    expect(privateMessageRes.status).toBe(201)
    const privateMessage = (await privateMessageRes.json()) as { id: string }

    const deniedSingleMessage = await fetch(`${baseUrl}/api/messages/${privateMessage.id}`, {
      headers: { Authorization: `Bearer ${user2Token}` },
    })
    expect(deniedSingleMessage.status).toBe(403)

    const deniedInteractiveState = await fetch(
      `${baseUrl}/api/messages/${privateMessage.id}/interactive-state`,
      {
        headers: { Authorization: `Bearer ${user2Token}` },
      },
    )
    expect(deniedInteractiveState.status).toBe(403)

    const deniedReactionList = await fetch(
      `${baseUrl}/api/messages/${privateMessage.id}/reactions`,
      {
        headers: { Authorization: `Bearer ${user2Token}` },
      },
    )
    expect(deniedReactionList.status).toBe(403)

    const deniedReaction = await fetch(`${baseUrl}/api/messages/${privateMessage.id}/reactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user2Token}`,
      },
      body: JSON.stringify({ emoji: '👍' }),
    })
    expect(deniedReaction.status).toBe(403)

    const deniedThreadList = await fetch(`${baseUrl}/api/channels/${privateChannel.id}/threads`, {
      headers: { Authorization: `Bearer ${user2Token}` },
    })
    expect(deniedThreadList.status).toBe(403)

    const deniedThreadCreate = await fetch(`${baseUrl}/api/channels/${privateChannel.id}/threads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user2Token}`,
      },
      body: JSON.stringify({ name: 'blocked thread', parentMessageId: privateMessage.id }),
    })
    expect(deniedThreadCreate.status).toBe(403)

    const deniedPins = await fetch(`${baseUrl}/api/channels/${privateChannel.id}/pins`, {
      headers: { Authorization: `Bearer ${user2Token}` },
    })
    expect(deniedPins.status).toBe(403)

    const deniedPin = await fetch(
      `${baseUrl}/api/channels/${privateChannel.id}/pins/${privateMessage.id}`,
      {
        method: 'PUT',
        headers: { Authorization: `Bearer ${user2Token}` },
      },
    )
    expect(deniedPin.status).toBe(403)

    const accessBefore = await fetch(`${baseUrl}/api/channels/${privateChannel.id}/access`, {
      headers: { Authorization: `Bearer ${user2Token}` },
    })
    expect(accessBefore.status).toBe(200)
    expect(await accessBefore.json()).toEqual(
      expect.objectContaining({
        canAccess: false,
        requiresApproval: true,
        joinRequestStatus: null,
      }),
    )

    const reviewerNotification = waitForRawEventMatching<{
      kind: string
      userId: string
      referenceId: string
      scopeServerId: string
      scopeChannelId: string
      metadata?: { requestId?: string; channelName?: string }
    }>(
      ws1,
      'notification:new',
      (notification) =>
        notification.kind === 'channel.access_requested' &&
        notification.userId === userId &&
        notification.scopeChannelId === privateChannel.id,
    )
    const requestRes = await fetch(`${baseUrl}/api/channels/${privateChannel.id}/join-requests`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user2Token}` },
    })
    expect(requestRes.status).toBe(202)
    const requestBody = (await requestRes.json()) as { requestId: string; status: string }
    expect(requestBody.status).toBe('pending')
    expect(requestBody.requestId).toBeTruthy()
    await expect(reviewerNotification).resolves.toEqual(
      expect.objectContaining({
        kind: 'channel.access_requested',
        referenceId: requestBody.requestId,
        scopeServerId: serverId,
        scopeChannelId: privateChannel.id,
        metadata: expect.objectContaining({
          requestId: requestBody.requestId,
          channelName: privateChannel.name,
        }),
      }),
    )

    const accessPending = await fetch(`${baseUrl}/api/channels/${privateChannel.id}/access`, {
      headers: { Authorization: `Bearer ${user2Token}` },
    })
    expect(await accessPending.json()).toEqual(
      expect.objectContaining({
        canAccess: false,
        joinRequestStatus: 'pending',
      }),
    )

    const requesterNotification = waitForRawEventMatching<{
      kind: string
      userId: string
      referenceId: string
      scopeChannelId: string
      metadata?: { approved?: boolean }
    }>(
      ws2,
      'notification:new',
      (notification) =>
        notification.kind === 'channel.access_approved' &&
        notification.userId === user2Id &&
        notification.scopeChannelId === privateChannel.id,
    )
    const reviewRes = await fetch(`${baseUrl}/api/channel-join-requests/${requestBody.requestId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({ status: 'approved' }),
    })
    expect(reviewRes.status).toBe(200)
    await expect(requesterNotification).resolves.toEqual(
      expect.objectContaining({
        kind: 'channel.access_approved',
        referenceId: privateChannel.id,
        scopeChannelId: privateChannel.id,
        metadata: expect.objectContaining({ approved: true }),
      }),
    )

    const accessAfter = await fetch(`${baseUrl}/api/channels/${privateChannel.id}/access`, {
      headers: { Authorization: `Bearer ${user2Token}` },
    })
    expect(await accessAfter.json()).toEqual(expect.objectContaining({ canAccess: true }))

    const approvedJoin = await ws2.joinChannel(privateChannel.id)
    expect(approvedJoin.ok).toBe(true)

    const sendRes = await fetch(`${baseUrl}/api/channels/${privateChannel.id}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user2Token}`,
      },
      body: JSON.stringify({ content: 'Now approved' }),
    })
    expect(sendRes.status).toBe(201)
  })

  it('gates private server entry through an owner approval request', async () => {
    const serverDao = container.resolve('serverDao')
    const channelDao = container.resolve('channelDao')
    const channelMemberDao = container.resolve('channelMemberDao')
    const privateServer = (await serverDao.create({
      name: `rtm-private-server-${Date.now()}`,
      ownerId: userId,
      isPublic: false,
    }))!
    await serverDao.addMember(privateServer.id, userId, 'owner')
    const publicChannel = (await channelDao.create({
      name: 'general',
      serverId: privateServer.id,
      type: 'text',
    }))!
    await channelMemberDao.add(publicChannel.id, userId)

    const deniedServer = await fetch(`${baseUrl}/api/servers/${privateServer.id}`, {
      headers: { Authorization: `Bearer ${user2Token}` },
    })
    expect(deniedServer.status).toBe(403)

    const accessBefore = await fetch(`${baseUrl}/api/servers/${privateServer.id}/access`, {
      headers: { Authorization: `Bearer ${user2Token}` },
    })
    expect(accessBefore.status).toBe(200)
    expect(await accessBefore.json()).toEqual(
      expect.objectContaining({
        canAccess: false,
        requiresApproval: true,
        joinRequestStatus: null,
      }),
    )

    const reviewerNotification = waitForRawEventMatching<{
      kind: string
      userId: string
      referenceId: string
      scopeServerId: string
      metadata?: { requestId?: string; serverName?: string }
    }>(
      ws1,
      'notification:new',
      (notification) =>
        notification.kind === 'server.access_requested' &&
        notification.userId === userId &&
        notification.scopeServerId === privateServer.id,
    )
    const requestRes = await fetch(`${baseUrl}/api/servers/${privateServer.id}/join-requests`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user2Token}` },
    })
    expect(requestRes.status).toBe(202)
    const requestBody = (await requestRes.json()) as { requestId: string; status: string }
    expect(requestBody.status).toBe('pending')
    expect(requestBody.requestId).toBeTruthy()
    await expect(reviewerNotification).resolves.toEqual(
      expect.objectContaining({
        kind: 'server.access_requested',
        referenceId: requestBody.requestId,
        scopeServerId: privateServer.id,
        metadata: expect.objectContaining({
          requestId: requestBody.requestId,
          serverName: privateServer.name,
        }),
      }),
    )

    const requesterNotification = waitForRawEventMatching<{
      kind: string
      userId: string
      referenceId: string
      scopeServerId: string
      metadata?: { approved?: boolean }
    }>(
      ws2,
      'notification:new',
      (notification) =>
        notification.kind === 'server.access_approved' &&
        notification.userId === user2Id &&
        notification.scopeServerId === privateServer.id,
    )
    const reviewRes = await fetch(`${baseUrl}/api/servers/join-requests/${requestBody.requestId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({ status: 'approved' }),
    })
    expect(reviewRes.status).toBe(200)
    await expect(requesterNotification).resolves.toEqual(
      expect.objectContaining({
        kind: 'server.access_approved',
        referenceId: privateServer.id,
        scopeServerId: privateServer.id,
        metadata: expect.objectContaining({ approved: true }),
      }),
    )

    const accessAfter = await fetch(`${baseUrl}/api/servers/${privateServer.id}/access`, {
      headers: { Authorization: `Bearer ${user2Token}` },
    })
    expect(await accessAfter.json()).toEqual(
      expect.objectContaining({ canAccess: true, isMember: true }),
    )

    const approvedServer = await fetch(`${baseUrl}/api/servers/${privateServer.id}`, {
      headers: { Authorization: `Bearer ${user2Token}` },
    })
    expect(approvedServer.status).toBe(200)

    const approvedChannels = await fetch(`${baseUrl}/api/servers/${privateServer.id}/channels`, {
      headers: { Authorization: `Bearer ${user2Token}` },
    })
    expect(approvedChannels.status).toBe(200)
    expect(await approvedChannels.json()).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: publicChannel.id, isMember: true })]),
    )
  })

  it('user2 receives message:new when user1 sends via message:send', async () => {
    const received = waitForRawEventMatching<{ content: string; channelId: string }>(
      ws2,
      'message:new',
      (msg) => msg.content === 'Hello from user1 via WS',
    )

    ws1.sendMessage({ channelId, content: 'Hello from user1 via WS' })

    const msg = await received
    expect(msg.content).toBe('Hello from user1 via WS')
    expect(msg.channelId).toBe(channelId)
  })

  it('user1 also receives own message:new (io.to broadcasts to all in room)', async () => {
    const received = waitForRawEventMatching<{ content: string }>(
      ws1,
      'message:new',
      (msg) => msg.content === 'Self-receive test',
    )
    // ws2 also receives the broadcast — drain it so it doesn't pollute the next test
    const drain = waitForRawEventMatching<{ content: string }>(
      ws2,
      'message:new',
      (msg) => msg.content === 'Self-receive test',
    )

    ws1.sendMessage({ channelId, content: 'Self-receive test' })

    const msg = await received
    expect(msg.content).toBe('Self-receive test')
    await drain
  })

  it('user2 receives message:new when user1 sends via REST', async () => {
    const received = waitForRawEventMatching<{ content: string; channelId: string }>(
      ws2,
      'message:new',
      (msg) => msg.content === 'Hello from REST API',
    )

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

  it('fanouts REST thread messages to channel listeners for runtime adapters', async () => {
    await ws2.joinChannel(channelId)

    const parentRes = await fetch(`${baseUrl}/api/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({ content: 'Thread fanout parent' }),
    })
    expect(parentRes.status).toBe(201)
    const parent = (await parentRes.json()) as { id: string }

    const threadRes = await fetch(`${baseUrl}/api/channels/${channelId}/threads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({ name: 'Runtime fanout thread', parentMessageId: parent.id }),
    })
    expect(threadRes.status).toBeLessThan(300)
    const thread = (await threadRes.json()) as { id: string }

    const received = waitForRawEventMatching<{
      id: string
      content: string
      channelId: string
      threadId?: string | null
    }>(
      ws2,
      'message:new',
      (msg) =>
        msg.content === 'Thread runtime fanout' &&
        msg.channelId === channelId &&
        msg.threadId === thread.id,
    )

    const threadMessageRes = await fetch(`${baseUrl}/api/threads/${thread.id}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({ content: 'Thread runtime fanout' }),
    })
    expect(threadMessageRes.status).toBe(201)
    const threadMessage = (await threadMessageRes.json()) as { id: string }

    const msg = await received
    expect(msg.id).toBe(threadMessage.id)
  })

  it('loads a message window around a target channel message', async () => {
    const created: Array<{ id: string; content: string; createdAt: string }> = []
    for (let index = 0; index < 5; index += 1) {
      const res = await fetch(`${baseUrl}/api/channels/${channelId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify({ content: `Around target ${index}` }),
      })
      expect(res.status).toBe(201)
      created.push((await res.json()) as { id: string; content: string; createdAt: string })
      await new Promise((resolve) => setTimeout(resolve, 5))
    }

    const target = created[2]!
    const aroundRes = await fetch(
      `${baseUrl}/api/channels/${channelId}/messages/around/${target.id}?limit=3`,
      {
        headers: { Authorization: `Bearer ${userToken}` },
      },
    )
    expect(aroundRes.status).toBe(200)
    const body = (await aroundRes.json()) as {
      messages: Array<{ id: string; content: string; createdAt: string }>
      hasMore: boolean
    }

    expect(body.messages.map((message) => message.id)).toContain(target.id)
    expect(body.messages.length).toBeLessThanOrEqual(3)
    expect(body.messages.map((message) => message.createdAt)).toEqual(
      [...body.messages].map((message) => message.createdAt).sort(),
    )
  })

  it('keeps socket replies in the channel and notifies the replied user', async () => {
    await Promise.all([ws1.joinChannel(channelId), ws2.joinChannel(channelId)])

    const rootRes = await fetch(`${baseUrl}/api/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({ content: 'Reply target for notification test' }),
    })
    expect(rootRes.status).toBe(201)
    const root = (await rootRes.json()) as { id: string }

    const receivedReply = waitForRawEventMatching<{
      id: string
      content: string
      channelId: string
      replyToId?: string | null
      threadId?: string | null
    }>(
      ws1,
      'message:new',
      (msg) =>
        msg.content === 'Buddy-style channel reply' &&
        msg.channelId === channelId &&
        msg.replyToId === root.id,
    )
    const receivedNotification = waitForRawEventMatching<{
      kind: string
      userId: string
      referenceId: string
      scopeChannelId?: string | null
      metadata?: { preview?: string }
    }>(
      ws1,
      'notification:new',
      (notification) =>
        notification.kind === 'message.reply' &&
        notification.userId === userId &&
        notification.scopeChannelId === channelId,
    )

    ws2.sendMessage({
      channelId,
      content: 'Buddy-style channel reply',
      replyToId: root.id,
    })

    const reply = await receivedReply
    expect(reply.replyToId).toBe(root.id)
    expect(reply.threadId ?? null).toBeNull()
    await expect(receivedNotification).resolves.toEqual(
      expect.objectContaining({
        kind: 'message.reply',
        referenceId: reply.id,
        scopeChannelId: channelId,
        metadata: expect.objectContaining({
          preview: 'Buddy-style channel reply',
        }),
      }),
    )
  })

  it('suggests and persists structured channel/user mentions', async () => {
    await Promise.all([ws1.joinChannel(channelId), ws2.joinChannel(channelId)])

    const suggestRes = await fetch(
      `${baseUrl}/api/mentions/suggest?channelId=${channelId}&trigger=%23&q=rtm`,
      {
        headers: { Authorization: `Bearer ${userToken}` },
      },
    )
    expect(suggestRes.status).toBe(200)
    const suggestBody = (await suggestRes.json()) as {
      suggestions: Array<{ kind: string; channelId?: string; token: string }>
    }
    expect(suggestBody.suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'channel',
          channelId,
          token: '#rtm-test-channel',
        }),
      ]),
    )

    const received = waitForRawEventMatching<{
      content: string
      metadata?: {
        mentions?: Array<{ kind: string; targetId: string; token: string; sourceToken?: string }>
      }
    }>(
      ws2,
      'message:new',
      (msg) => msg.content.startsWith('Mention ') && (msg.metadata?.mentions?.length ?? 0) >= 2,
    )
    const notified = waitForRawEventMatching<{ type: string; userId: string }>(
      ws2,
      'notification:new',
      (notification) => notification.type === 'mention' && notification.userId === user2Id,
    )

    ws1.sendMessage({
      channelId,
      content: `Mention ${user2Username} and channel`,
      mentions: [
        {
          kind: 'user',
          targetId: user2Id,
          userId: user2Id,
          token: user2Username,
          label: user2Username,
        },
        {
          kind: 'channel',
          targetId: channelId,
          channelId,
          serverId,
          token: 'channel',
          label: '#rtm-test-channel',
        },
      ],
    })

    const msg = await received
    expect(msg.content).toBe(`Mention <@${user2Id}> and <#${channelId}>`)
    expect(msg.metadata?.mentions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'user',
          targetId: user2Id,
          token: `<@${user2Id}>`,
          sourceToken: user2Username,
        }),
        expect.objectContaining({
          kind: 'channel',
          targetId: channelId,
          token: `<#${channelId}>`,
          sourceToken: 'channel',
        }),
      ]),
    )
    await notified
  })

  it('creates mention notifications for raw @username websocket messages', async () => {
    await Promise.all([ws1.joinChannel(channelId), ws2.joinChannel(channelId)])

    const received = waitForRawEventMatching<{
      content: string
      metadata?: {
        mentions?: Array<{ kind: string; targetId: string; token: string; sourceToken?: string }>
      }
    }>(
      ws2,
      'message:new',
      (msg) =>
        msg.content.startsWith('Raw mention ') &&
        (msg.metadata?.mentions ?? []).some((mention) => mention.targetId === user2Id),
    )
    const notified = waitForRawEventMatching<{
      kind: string
      type: string
      userId: string
      referenceId: string
      scopeChannelId: string
      metadata?: { preview?: string }
    }>(
      ws2,
      'notification:new',
      (notification) =>
        notification.kind === 'message.mention' &&
        notification.type === 'mention' &&
        notification.userId === user2Id &&
        notification.scopeChannelId === channelId,
    )

    ws1.sendMessage({
      channelId,
      content: `Raw mention @${user2Username}`,
    })

    const msg = await received
    expect(msg.content).toBe(`Raw mention <@${user2Id}>`)
    expect(msg.metadata?.mentions).toEqual([
      expect.objectContaining({
        kind: 'user',
        targetId: user2Id,
        token: `<@${user2Id}>`,
        sourceToken: `@${user2Username}`,
      }),
    ])
    await expect(notified).resolves.toEqual(
      expect.objectContaining({
        kind: 'message.mention',
        metadata: expect.objectContaining({
          preview: `Raw mention <@${user2Id}>`,
        }),
      }),
    )
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
    const received = waitForRawEventMatching<{ content: string }>(
      ws2,
      'message:new',
      (msg) => msg.content === 'After reconnect',
    )
    ws1.sendMessage({ channelId, content: 'After reconnect' })
    const msg = await received
    expect(msg.content).toBe('After reconnect')
  })
})
