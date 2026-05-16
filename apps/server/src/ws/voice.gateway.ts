import type { Socket, Server as SocketIOServer } from 'socket.io'
import type { AppContainer } from '../container'
import { logger } from '../lib/logger'
import { actorFromUserId } from '../security/actor'

type VoiceJoinPayload = {
  channelId: string
  clientId?: string | null
  muted?: boolean
  deafened?: boolean
}

type VoiceStatePayload = {
  channelId: string
  muted?: boolean
  deafened?: boolean
  speaking?: boolean
  screenSharing?: boolean
}

type VoiceAck = { ok: true; data: unknown } | { ok: false; error: string; code?: string }

function socketActor(socket: Socket) {
  const userId = socket.data.userId as string | undefined
  if (!userId) {
    throw Object.assign(new Error('Authentication required'), { status: 401 })
  }
  return actorFromUserId(userId)
}

function socketVoiceChannels(socket: Socket): Set<string> {
  if (!socket.data.voiceChannels) {
    socket.data.voiceChannels = new Set<string>()
  }
  return socket.data.voiceChannels as Set<string>
}

function voicePayload(
  data: Awaited<ReturnType<AppContainer['cradle']['voiceChannelService']['join']>>,
) {
  return {
    credentials: data.credentials,
    participant: data.participant,
    state: data.state,
  }
}

function errorAck(err: unknown): VoiceAck {
  const error = err as { message?: string; code?: string }
  return { ok: false, error: error.message ?? 'Voice operation failed', code: error.code }
}

export function setupVoiceGateway(io: SocketIOServer, container: AppContainer): void {
  io.on('connection', (socket: Socket) => {
    socket.on('voice:join', async (payload: VoiceJoinPayload, ack?: (res: VoiceAck) => void) => {
      try {
        const actor = socketActor(socket)
        const voiceChannelService = container.resolve('voiceChannelService')
        const result = await voiceChannelService.join(actor, payload.channelId, {
          clientId: payload.clientId,
          muted: payload.muted,
          deafened: payload.deafened,
        })
        await socket.join(`voice:${payload.channelId}`)
        socketVoiceChannels(socket).add(payload.channelId)
        socket.to(`voice:${payload.channelId}`).emit('voice:participant-joined', {
          channelId: payload.channelId,
          participant: result.participant,
          state: result.state,
        })
        socket.emit('voice:state', result.state)
        ack?.({ ok: true, data: voicePayload(result) })
      } catch (err) {
        logger.warn({ err, socketId: socket.id }, 'voice:join failed')
        ack?.(errorAck(err))
      }
    })

    socket.on(
      'voice:leave',
      async ({ channelId }: { channelId: string }, ack?: (res: VoiceAck) => void) => {
        try {
          const actor = socketActor(socket)
          const voiceChannelService = container.resolve('voiceChannelService')
          const result = await voiceChannelService.leave(actor, channelId)
          await socket.leave(`voice:${channelId}`)
          socketVoiceChannels(socket).delete(channelId)
          socket.to(`voice:${channelId}`).emit('voice:participant-left', {
            channelId,
            participant: result.participant,
            state: result.state,
          })
          ack?.({ ok: true, data: result })
        } catch (err) {
          logger.warn({ err, socketId: socket.id }, 'voice:leave failed')
          ack?.(errorAck(err))
        }
      },
    )

    socket.on(
      'voice:state:update',
      async (payload: VoiceStatePayload, ack?: (res: VoiceAck) => void) => {
        try {
          const actor = socketActor(socket)
          const voiceChannelService = container.resolve('voiceChannelService')
          const result = await voiceChannelService.updateParticipant(actor, payload.channelId, {
            isMuted: payload.muted,
            isDeafened: payload.deafened,
            isSpeaking: payload.speaking,
            isScreenSharing: payload.screenSharing,
          })
          io.to(`voice:${payload.channelId}`).emit('voice:participant-updated', {
            channelId: payload.channelId,
            participant: result.participant,
            state: result.state,
          })
          ack?.({ ok: true, data: result })
        } catch (err) {
          logger.warn({ err, socketId: socket.id }, 'voice:state:update failed')
          ack?.(errorAck(err))
        }
      },
    )

    socket.on('voice:heartbeat', async ({ channelId }: { channelId: string }) => {
      try {
        await container.resolve('voiceChannelService').heartbeat(socketActor(socket), channelId)
      } catch {
        socketVoiceChannels(socket).delete(channelId)
        await socket.leave(`voice:${channelId}`)
      }
    })

    socket.on('disconnect', async () => {
      const voiceChannelService = container.resolve('voiceChannelService')
      const actor = (() => {
        try {
          return socketActor(socket)
        } catch {
          return null
        }
      })()
      if (!actor) return
      for (const channelId of socketVoiceChannels(socket)) {
        try {
          const result = await voiceChannelService.leave(actor, channelId)
          socket.to(`voice:${channelId}`).emit('voice:participant-left', {
            channelId,
            participant: result.participant,
            state: result.state,
          })
        } catch (err) {
          logger.warn({ err, channelId, socketId: socket.id }, 'voice disconnect cleanup failed')
        }
      }
    })
  })
}
