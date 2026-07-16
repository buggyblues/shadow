import type { Server as HttpServer, IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import { WebSocket, WebSocketServer } from 'ws'
import type { AppContainer } from '../container.js'
import { createId } from '../lib/id.js'
import { nowIso } from '../lib/time.js'
import { assertTravelRequestAuthenticated } from '../middleware/auth.middleware.js'
import { createTravelRequestContextFromHeaders } from '../middleware/request-context.middleware.js'
import type { ActorRef, RequestContext, TravelEvent } from '../types.js'

interface TravelSocketPresence {
  connectionId: string
  actor: ActorRef
  connectedAt: string
  updatedAt: string
  status?: string
  cursor?: Record<string, unknown>
}

interface TravelSocketMeta {
  connectionId: string
  context: RequestContext
  tripId: string
  since: number
}

interface ClientSocketMessage {
  type?: string
  since?: number
  status?: string
  cursor?: Record<string, unknown>
}

const heartbeatIntervalMs = 25000

function headersFromIncoming(request: IncomingMessage) {
  const headers = new Headers()
  for (const [key, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) headers.set(key, value.join(', '))
    else if (typeof value === 'string') headers.set(key, value)
  }
  return headers
}

function rejectUpgrade(socket: Duplex, statusCode: number, message: string) {
  socket.write(`HTTP/1.1 ${statusCode} ${message}\r\nConnection: close\r\n\r\n`)
  socket.destroy()
}

function parseTripWebSocketUrl(request: IncomingMessage) {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)
  const match = url.pathname.match(/^\/api\/trips\/([^/]+)\/ws\/?$/)
  if (!match?.[1]) return null
  const sinceRaw = url.searchParams.get('since') ?? url.searchParams.get('lastEventId')
  const since = sinceRaw ? Number(sinceRaw) : null
  return {
    tripId: decodeURIComponent(match[1]),
    since: since !== null && Number.isFinite(since) ? since : null,
  }
}

function sendJson(socket: WebSocket, value: unknown) {
  if (socket.readyState !== WebSocket.OPEN) return
  socket.send(JSON.stringify(value))
}

function parseClientMessage(raw: WebSocket.RawData): ClientSocketMessage | null {
  const text = Array.isArray(raw)
    ? Buffer.concat(raw).toString('utf8')
    : Buffer.isBuffer(raw)
      ? raw.toString('utf8')
      : raw.toString()
  try {
    const parsed = JSON.parse(text) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as ClientSocketMessage) : null
  } catch {
    return null
  }
}

function eventPayload(event: TravelEvent) {
  return {
    kind: 'event',
    ...event,
  }
}

export class TravelWebSocketHub {
  private readonly server = new WebSocketServer({ noServer: true })
  private readonly presence = new Map<string, Map<string, TravelSocketPresence>>()

  constructor(private readonly container: AppContainer) {}

  attach(server: HttpServer) {
    server.on('upgrade', (request, socket, head) => {
      const parsed = parseTripWebSocketUrl(request)
      if (!parsed) return rejectUpgrade(socket, 404, 'Not Found')
      void this.acceptUpgrade(request, socket, head, parsed.tripId, parsed.since)
    })
    return this.server
  }

  private async acceptUpgrade(
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    tripId: string,
    since: number | null,
  ) {
    try {
      const headers = headersFromIncoming(request)
      const context = await createTravelRequestContextFromHeaders({
        headers,
        identityService: this.container.identityService,
      })
      assertTravelRequestAuthenticated(context)
      await this.container.accessPolicy.requireTripRead(context, tripId)
      this.server.handleUpgrade(request, socket, head, (webSocket) => {
        this.bindSocket(webSocket, {
          connectionId: createId('ws'),
          context,
          tripId,
          // A fresh subscriber already loaded the current resource state. Start at
          // the current cursor so reconnect replay is useful without replaying the
          // entire in-memory history on every page load.
          since: since ?? this.container.eventBus.currentSequence(),
        })
      })
    } catch {
      rejectUpgrade(socket, 401, 'Unauthorized')
    }
  }

  private bindSocket(socket: WebSocket, meta: TravelSocketMeta) {
    const presence = this.join(meta)
    let alive = true
    socket.on('pong', () => {
      alive = true
    })

    const heartbeat = setInterval(() => {
      if (!alive) {
        socket.terminate()
        return
      }
      alive = false
      socket.ping()
      sendJson(socket, { kind: 'heartbeat', tripId: meta.tripId, emittedAt: nowIso() })
    }, heartbeatIntervalMs)

    const unsubscribe = this.container.eventBus.onTrip(meta.tripId, (event) => {
      sendJson(socket, eventPayload(event))
    })

    sendJson(socket, {
      kind: 'ready',
      transport: 'websocket',
      tripId: meta.tripId,
      connectionId: meta.connectionId,
      lastEventId: String(meta.since),
      presence: this.presenceSnapshot(meta.tripId),
    })
    for (const event of this.container.eventBus.recentTripEvents(meta.tripId, meta.since)) {
      sendJson(socket, eventPayload(event))
    }

    this.container.eventBus.emit(
      {
        type: 'presence.joined',
        tripId: meta.tripId,
        payload: { presence, members: this.presenceSnapshot(meta.tripId) },
      },
      { recordHistory: false },
    )

    socket.on('message', (raw) => this.handleClientMessage(socket, meta, raw))
    socket.on('close', () => {
      clearInterval(heartbeat)
      unsubscribe()
      const departed = this.leave(meta)
      this.container.eventBus.emit(
        {
          type: 'presence.left',
          tripId: meta.tripId,
          payload: { presence: departed, members: this.presenceSnapshot(meta.tripId) },
        },
        { recordHistory: false },
      )
    })
  }

  private handleClientMessage(socket: WebSocket, meta: TravelSocketMeta, raw: WebSocket.RawData) {
    const message = parseClientMessage(raw)
    if (!message?.type) return
    if (message.type === 'ping') {
      sendJson(socket, { kind: 'pong', tripId: meta.tripId, emittedAt: nowIso() })
      return
    }
    if (message.type === 'replay') {
      const since =
        typeof message.since === 'number' && Number.isFinite(message.since) ? message.since : 0
      for (const event of this.container.eventBus.recentTripEvents(meta.tripId, since)) {
        sendJson(socket, eventPayload(event))
      }
      return
    }
    if (message.type === 'presence.update') {
      const presence = this.updatePresence(meta, {
        status: message.status,
        cursor: message.cursor,
      })
      this.container.eventBus.emit(
        {
          type: 'presence.updated',
          tripId: meta.tripId,
          payload: { presence, members: this.presenceSnapshot(meta.tripId) },
        },
        { recordHistory: false },
      )
    }
  }

  private join(meta: TravelSocketMeta) {
    const room = this.presence.get(meta.tripId) ?? new Map<string, TravelSocketPresence>()
    const presence: TravelSocketPresence = {
      connectionId: meta.connectionId,
      actor: meta.context.actor,
      connectedAt: nowIso(),
      updatedAt: nowIso(),
    }
    room.set(meta.connectionId, presence)
    this.presence.set(meta.tripId, room)
    return presence
  }

  private leave(meta: TravelSocketMeta) {
    const room = this.presence.get(meta.tripId)
    const presence = room?.get(meta.connectionId) ?? null
    room?.delete(meta.connectionId)
    if (room?.size === 0) this.presence.delete(meta.tripId)
    return presence
  }

  private updatePresence(
    meta: TravelSocketMeta,
    input: Pick<TravelSocketPresence, 'cursor' | 'status'>,
  ) {
    const room = this.presence.get(meta.tripId)
    const presence = room?.get(meta.connectionId)
    if (!presence) return null
    presence.status = input.status
    presence.cursor = input.cursor
    presence.updatedAt = nowIso()
    return presence
  }

  private presenceSnapshot(tripId: string) {
    return [...(this.presence.get(tripId)?.values() ?? [])]
  }
}

export function attachTravelWebSocketServer(server: HttpServer, container: AppContainer) {
  return new TravelWebSocketHub(container).attach(server)
}
