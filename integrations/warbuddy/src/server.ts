import 'dotenv/config'
import { createHash } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import type { Socket } from 'node:net'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import type {
  ShadowServerAppActorRef,
  ShadowServerAppCommandContext,
  ShadowServerAppCommandName,
} from '@shadowob/sdk'
import { ShadowServerAppOutbox } from '@shadowob/sdk'
import { type Context, Hono } from 'hono'
import { manifest, shadowApp } from './manifest.js'
import {
  completeWarbuddyOAuth,
  oauthSessionPayload,
  readWarbuddyOAuthSession,
  startWarbuddyOAuth,
  type WarbuddyOAuthSession,
  warbuddyActorFromOAuthSession,
} from './oauth.js'
import { shadowServerAppManifest } from './shadow-app.generated.js'
import {
  addReplayComment,
  buildBattleBrief,
  createRoom,
  createTeam,
  findActorTank,
  getMatchView,
  getRoomByCode,
  getTank,
  joinRoom,
  leaderboard,
  listMaps,
  listMatches,
  listRooms,
  listTanks,
  listTeams,
  markMatchRead,
  recordChallenge,
  replayReviewBrief,
  SYSTEM_STRATEGY_CODE,
  saveTankCode,
  simulateBattle,
} from './store.js'
import type { SkillType, WarbuddyPlayMode } from './types.js'
import { shellPage } from './ui.js'

type WarbuddyCommandName = ShadowServerAppCommandName<typeof shadowServerAppManifest>

const app = new Hono()
const port = Number(process.env.PORT ?? 4218)
const liveSockets = new Map<string, Map<Socket, LivePeer>>()
const commandNames = new Set<string>(
  shadowServerAppManifest.commands.map((command) => command.name),
)

type LivePeer = {
  socket: Socket
  actorId: string | null
  displayName: string
  teamId: string | null
  mode: WarbuddyPlayMode | null
  joinedAt: string
  lastSeenAt: string
}

function commandName(value: string): WarbuddyCommandName | null {
  return commandNames.has(value) ? (value as WarbuddyCommandName) : null
}

function localActor(session?: WarbuddyOAuthSession | null): ShadowServerAppActorRef {
  if (session) return warbuddyActorFromOAuthSession(session)
  return {
    kind: 'local',
    id: 'local',
    userId: 'local',
    buddyAgentId: null,
    ownerId: null,
    displayName: 'Local Pilot',
    avatarUrl: null,
  }
}

function localContext(
  command: WarbuddyCommandName,
  session?: WarbuddyOAuthSession | null,
): ShadowServerAppCommandContext {
  const manifestCommand = shadowServerAppManifest.commands.find((item) => item.name === command)
  const actor = localActor(session)
  return {
    protocol: 'shadow.app/1',
    serverId: 'local',
    serverAppId: 'local',
    appKey: shadowServerAppManifest.appKey,
    command,
    actor: {
      kind: actor.kind,
      userId: actor.userId,
      buddyAgentId: actor.buddyAgentId,
      ownerId: actor.ownerId,
      profile: {
        id: actor.id,
        displayName: actor.displayName,
        avatarUrl: actor.avatarUrl,
      },
    },
    permission: manifestCommand?.permission ?? 'local',
    action: manifestCommand?.action ?? 'read',
    dataClass: manifestCommand?.dataClass ?? 'server-private',
  }
}

function iconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
  <rect width="96" height="96" rx="18" fill="#213a2b"/>
  <path d="M15 62h42v12H15zM24 30h33v24H24z" fill="#d9c84d"/>
  <path d="M57 38h22v8H57z" fill="#d9c84d"/>
  <path d="M27 24h21v12H27z" fill="#4f8f63"/>
  <circle cx="24" cy="74" r="5" fill="#f4ead0"/>
  <circle cx="48" cy="74" r="5" fill="#f4ead0"/>
  <path d="M62 63l8 6 8-6v16H62z" fill="#c75b44"/>
  <path d="M10 10h76v76H10z" fill="none" stroke="#8aa36f" stroke-width="5"/>
</svg>`
}

function statusOf(error: unknown) {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = Number((error as { status?: unknown }).status)
    if (Number.isInteger(status) && status >= 400 && status <= 599) return status
  }
  return 500
}

function toCommandError(error: unknown): never {
  const status = statusOf(error)
  const message = error instanceof Error ? error.message : String(error)
  throw shadowApp.error(status, message)
}

async function handle<T>(fn: () => T | Promise<T>) {
  try {
    return await fn()
  } catch (error) {
    toCommandError(error)
  }
}

const commands = shadowApp.defineCommands({
  'teams.list': (_input, { actor }) => handle(() => listTeams(actor)),
  'teams.create': (input, { actor }) =>
    handle(() =>
      createTeam(actor, {
        name: input.name,
        description: input.description,
        color: input.color,
      }),
    ),
  'rooms.list': () => handle(() => listRooms()),
  'rooms.create': (input, { actor }) =>
    handle(() =>
      createRoom(actor, {
        name: input.name,
        mapId: input.mapId,
        mode: input.mode as WarbuddyPlayMode | undefined,
        teamId: input.teamId,
      }),
    ),
  'rooms.join': (input, { actor }) =>
    handle(() =>
      joinRoom(actor, {
        code: input.code,
        mode: input.mode as WarbuddyPlayMode | undefined,
        teamId: input.teamId,
      }),
    ),
  'tanks.list': (input) =>
    handle(() => ({
      maps: listMaps(),
      tanks: listTanks({
        query: input.query,
        ownerKind: (input.ownerKind ?? 'all') as 'all',
        limit: input.limit,
      }),
    })),
  'tanks.get': (input, { actor }) =>
    handle(() => {
      const tank = input.mine
        ? (findActorTank(actor) ??
          saveTankCode(actor, {
            code: SYSTEM_STRATEGY_CODE,
            name: `${actor.displayName}'s Tank`,
            skillType: 'shield',
            notes: 'System AI controls this squad until a Buddy writes strategy code.',
            submittedBy: actor.displayName,
          }))
        : input.tankId
          ? getTank(input.tankId)
          : null
      if (!tank) throw Object.assign(new Error('tank_not_found'), { status: 404 })
      return { tank, maps: listMaps() }
    }),
  'tanks.saveCode': (input, { actor }) =>
    handle(() => ({
      tank: saveTankCode(actor, {
        tankId: input.tankId,
        name: input.name,
        appearance: input.appearance,
        skillType: input.skillType as SkillType | undefined,
        code: input.code,
        notes: input.notes,
        submittedBy: input.submittedBy,
      }),
    })),
  'matches.simulate': (input, { actor }) =>
    handle(() =>
      simulateBattle({
        challengerTankId: input.challengerTankId,
        defenderTankId: input.defenderTankId,
        opponentId: input.opponentId,
        mapId: input.mapId,
        seed: input.seed,
        candidate: input.candidateCode
          ? {
              actor,
              code: input.candidateCode,
              name: input.candidateName,
              skillType: input.candidateSkillType as SkillType | undefined,
            }
          : undefined,
      }),
    ),
  'matches.challenge': (input) =>
    handle(() => {
      const match = recordChallenge({
        challengerTankId: input.challengerTankId,
        defenderTankId: input.defenderTankId,
        mapId: input.mapId,
        seed: input.seed,
      })
      const result = { match }
      if (!input.announceChannelName) return result
      return new ShadowServerAppOutbox()
        .sendChannelMessage({
          channelName: input.announceChannelName,
          idempotencyKey: `warbuddy:match:${match.id}`,
          content: [
            `WarBuddy battle settled: ${match.participants.challenger.tankName} vs ${match.participants.defender.tankName}.`,
            match.winnerTankName
              ? `${match.winnerTankName} won by ${match.resultReason}.`
              : `The match ended in a draw by ${match.resultReason}.`,
            `Map: ${match.mapName}. Excitement: ${match.excitementScore}.`,
          ].join(' '),
          metadata: {
            custom: {
              warbuddy: {
                matchId: match.id,
                urlId: match.urlId,
                winnerTankId: match.winnerTankId,
              },
            },
          },
        })
        .attachTo(result)
    }),
  'matches.list': (input, { actor }) =>
    handle(() => ({
      matches: listMatches(
        {
          tankId: input.tankId,
          limit: input.limit,
          offset: input.offset,
        },
        actor,
      ),
    })),
  'matches.get': (input) =>
    handle(() =>
      getMatchView({
        matchId: input.matchId,
        view: input.view as 'summary' | 'events' | 'raw' | 'frames' | undefined,
        from: input.from,
        to: input.to,
      }),
    ),
  'matches.markRead': (input, { actor }) =>
    handle(() => markMatchRead(actor, { matchId: input.matchId })),
  'replay.comment': (input, { actor }) =>
    handle(() =>
      addReplayComment(actor, {
        matchId: input.matchId,
        frame: input.frame,
        rect: input.rect,
        body: input.body,
      }),
    ),
  'replay.reviewBrief': (input) => handle(() => replayReviewBrief({ matchId: input.matchId })),
  'leaderboard.get': (input) =>
    handle(() => ({
      leaderboard: leaderboard({
        sort: input.sort as 'rating' | 'wins' | 'win_rate' | 'excitement' | undefined,
        limit: input.limit,
      }),
    })),
  'battle.brief': (input, { actor }) =>
    handle(() =>
      buildBattleBrief({
        actor,
        teamId: input.teamId,
        targets: input.targets,
        mapId: input.mapId,
        opponentHint: input.opponentHint,
        notes: input.notes,
      }),
    ),
})

function errorResponse(c: Context, error: unknown) {
  const status = statusOf(error)
  const message = error instanceof Error ? error.message : 'internal_error'
  return c.json({ ok: false, error: message }, status as 500)
}

app.get('/.well-known/shadow-app.json', (c) => c.json(manifest()))
app.get('/assets/icon.svg', (c) => c.text(iconSvg(), 200, { 'Content-Type': 'image/svg+xml' }))
app.get('/assets/*', serveStatic({ root: './dist/client' }))
app.get('/shadow/server', (c) => c.html(shellPage()))
app.get('/shadow/server/*', (c) => c.html(shellPage()))
app.get('/api/maps', (c) => c.json({ maps: listMaps() }))
app.get('/api/local/inboxes', (c) => c.json({ inboxes: [] }))
app.get('/api/oauth/session', (c) => c.json(oauthSessionPayload(c)))
app.get('/shadow/oauth/start', startWarbuddyOAuth)
app.get('/shadow/oauth/callback', completeWarbuddyOAuth)

app.post('/api/local/commands/:commandName', async (c) => {
  try {
    const name = commandName(c.req.param('commandName'))
    if (!name) return c.json({ ok: false, error: 'command_not_found' }, 404)
    const body = (await c.req.json().catch(() => ({}))) as { input?: unknown }
    const result = await shadowApp.executeLocal(
      name,
      body.input ?? {},
      localContext(name, readWarbuddyOAuthSession(c)),
      commands,
    )
    return c.json(result.body, result.status as 200)
  } catch (error) {
    return errorResponse(c, error)
  }
})

app.post('/api/shadow/commands/:commandName', async (c) => {
  try {
    const name = commandName(c.req.param('commandName'))
    if (!name) return c.json({ ok: false, error: 'command_not_found' }, 404)
    const result = await shadowApp.executeCommand(
      name,
      {
        authorizationHeader: c.req.header('authorization'),
        serverIdHeader: c.req.header('X-Shadow-Server-Id'),
        appKeyHeader: c.req.header('X-Shadow-App-Key'),
        requestBody: await c.req.text(),
      },
      commands,
    )
    return c.json(result.body, result.status as 200)
  } catch (error) {
    return errorResponse(c, error)
  }
})

const server = serve({ fetch: app.fetch, port })
server.on('upgrade', handleLiveUpgrade)

console.log(`Shadow WarBuddy listening on http://localhost:${port}`)

function handleLiveUpgrade(req: IncomingMessage, socket: Socket) {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? `localhost:${port}`}`)
  if (!url.pathname.startsWith('/api/live/rooms/')) {
    socket.destroy()
    return
  }
  const key = req.headers['sec-websocket-key']
  if (typeof key !== 'string') {
    socket.destroy()
    return
  }
  const roomCode = decodeURIComponent(url.pathname.split('/').pop() || 'LOBBY').toUpperCase()
  if (!getRoomByCode(roomCode)) {
    socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\nroom_not_found')
    return
  }
  const accept = createHash('sha1')
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest('base64')
  socket.write(
    [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${accept}`,
      '',
      '',
    ].join('\r\n'),
  )
  const peers = liveSockets.get(roomCode) ?? new Map<Socket, LivePeer>()
  const timestamp = new Date().toISOString()
  const peer: LivePeer = {
    socket,
    actorId: null,
    displayName: 'Pilot',
    teamId: null,
    mode: null,
    joinedAt: timestamp,
    lastSeenAt: timestamp,
  }
  peers.set(socket, peer)
  liveSockets.set(roomCode, peers)
  sendWsJson(socket, { type: 'joined', roomCode, peers: roomPeers(roomCode) })
  broadcastPresence(roomCode)

  socket.on('data', (chunk) => {
    const text = decodeWsTextFrame(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    if (!text) return
    try {
      const payload = JSON.parse(text) as Record<string, unknown>
      peer.lastSeenAt = new Date().toISOString()
      if (payload.type === 'hello') {
        peer.actorId = textField(payload.actorId) ?? peer.actorId
        peer.displayName = textField(payload.displayName) ?? peer.displayName
        peer.teamId = textField(payload.teamId) ?? peer.teamId
        peer.mode = playMode(payload.mode) ?? peer.mode
        broadcastPresence(roomCode)
        return
      }
      broadcastRoom(
        roomCode,
        {
          type: 'room.message',
          roomCode,
          from: peerPayload(peer),
          payload,
          sentAt: peer.lastSeenAt,
        },
        socket,
      )
    } catch {
      sendWsJson(socket, { type: 'error', error: 'invalid_json' })
    }
  })
  socket.on('close', () => leaveLiveRoom(roomCode, socket))
  socket.on('error', () => leaveLiveRoom(roomCode, socket))
}

function leaveLiveRoom(roomCode: string, socket: Socket) {
  const peers = liveSockets.get(roomCode)
  if (!peers) return
  peers.delete(socket)
  if (!peers.size) liveSockets.delete(roomCode)
  else broadcastPresence(roomCode)
}

function broadcastRoom(roomCode: string, payload: unknown, except?: Socket) {
  const peers = liveSockets.get(roomCode)
  if (!peers) return
  for (const peer of peers.values()) {
    if (peer.socket !== except) sendWsJson(peer.socket, payload)
  }
}

function broadcastPresence(roomCode: string) {
  broadcastRoom(roomCode, { type: 'presence', roomCode, peers: roomPeers(roomCode) })
}

function roomPeers(roomCode: string) {
  const peers = liveSockets.get(roomCode)
  if (!peers) return []
  return [...peers.values()].map(peerPayload)
}

function peerPayload(peer: LivePeer) {
  return {
    actorId: peer.actorId,
    displayName: peer.displayName,
    teamId: peer.teamId,
    mode: peer.mode,
    joinedAt: peer.joinedAt,
    lastSeenAt: peer.lastSeenAt,
  }
}

function textField(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 160) : null
}

function playMode(value: unknown): WarbuddyPlayMode | null {
  return value === 'auto' || value === 'manual' || value === 'coop' ? value : null
}

function sendWsJson(socket: Socket, payload: unknown) {
  socket.write(encodeWsTextFrame(JSON.stringify(payload)))
}

function encodeWsTextFrame(text: string) {
  const data = Buffer.from(text)
  if (data.length < 126) return Buffer.concat([Buffer.from([0x81, data.length]), data])
  if (data.length < 65536) {
    const header = Buffer.alloc(4)
    header[0] = 0x81
    header[1] = 126
    header.writeUInt16BE(data.length, 2)
    return Buffer.concat([header, data])
  }
  const header = Buffer.alloc(10)
  header[0] = 0x81
  header[1] = 127
  header.writeBigUInt64BE(BigInt(data.length), 2)
  return Buffer.concat([header, data])
}

function decodeWsTextFrame(buffer: Buffer) {
  if (buffer.length < 2) return null
  const opcode = buffer[0]! & 0x0f
  if (opcode === 0x8) return null
  if (opcode !== 0x1) return null
  const masked = Boolean(buffer[1]! & 0x80)
  let length = buffer[1]! & 0x7f
  let offset = 2
  if (length === 126) {
    if (buffer.length < 4) return null
    length = buffer.readUInt16BE(2)
    offset = 4
  } else if (length === 127) {
    if (buffer.length < 10) return null
    const bigLength = buffer.readBigUInt64BE(2)
    if (bigLength > BigInt(Number.MAX_SAFE_INTEGER)) return null
    length = Number(bigLength)
    offset = 10
  }
  let mask: Buffer | null = null
  if (masked) {
    if (buffer.length < offset + 4) return null
    mask = buffer.subarray(offset, offset + 4)
    offset += 4
  }
  if (buffer.length < offset + length) return null
  const data = Buffer.from(buffer.subarray(offset, offset + length))
  if (mask) {
    for (let index = 0; index < data.length; index += 1)
      data[index] = data[index]! ^ mask[index % 4]!
  }
  return data.toString('utf8')
}
