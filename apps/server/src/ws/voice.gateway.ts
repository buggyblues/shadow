import { randomUUID } from 'node:crypto'
import type { Socket, Server as SocketIOServer } from 'socket.io'
import type { AppContainer } from '../container'
import { logger } from '../lib/logger'

/**
 * Voice channel gateway — Socket.IO events for voice channel signaling.
 *
 * Events:
 *   Client → Server:
 *     voice:join       — user wants to join a voice channel
 *     voice:leave      — user leaves a voice channel
 *     voice:mute       — user toggles mute
 *     voice:screenshare:start — user starts screen sharing
 *     voice:screenshare:stop  — user stops screen sharing
 *     voice:device-change — user changes audio device
 *
 *   Server → Client:
 *     voice:user-joined
 *     voice:user-left
 *     voice:user-muted
 *     voice:user-unmuted
 *     voice:screenshare-started
 *     voice:screenshare-stopped
 *     voice:state          — full channel state snapshot
 */

interface VoiceChannelState {
  channelId: string
  members: Array<{
    userId: string
    username: string
    displayName: string
    muted: boolean
    screenSharing: boolean
    joinedAt: string
  }>
}

// In-memory state for voice channels
const voiceChannels = new Map<string, VoiceChannelState>()
const graceTimers = new Map<string, ReturnType<typeof setTimeout>>()

const GRACE_PERIOD_MS = 5 * 60 * 1000 // 5 minutes

export function setupVoiceGateway(io: SocketIOServer, container: AppContainer): void {
  io.on('connection', (socket: Socket) => {
    const userId = socket.data.userId as string | undefined
    const username = socket.data.username as string | undefined

    // voice:join
    socket.on(
      'voice:join',
      async (
        { channelId, agoraUid }: { channelId: string; agoraUid?: string },
        ack?: (res: { ok: boolean; state?: VoiceChannelState; error?: string }) => void,
      ) => {
        if (!userId) {
          ack?.({ ok: false, error: 'Not authenticated' })
          return
        }

        try {
          // Verify channel membership
          const channelMemberDao = container.resolve('channelMemberDao')
          const membership = await channelMemberDao.get(channelId, userId)
          if (!membership) {
            logger.warn({ userId, channelId }, 'Denied voice:join — not a member')
            ack?.({ ok: false, error: 'Not a member of this channel' })
            return
          }

          // Verify channel is a voice channel
          const channelDao = container.resolve('channelDao')
          const channel = await channelDao.findById(channelId)
          if (!channel || channel.type !== 'voice') {
            ack?.({ ok: false, error: 'Not a voice channel' })
            return
          }

          // Join the Socket.IO room for this voice channel
          await socket.join(`voice:${channelId}`)

          // Get or create channel state
          let state = voiceChannels.get(channelId)
          if (!state) {
            state = { channelId, members: [] }
            voiceChannels.set(channelId, state)

            // Clear any pending grace timer
            const timer = graceTimers.get(channelId)
            if (timer) {
              clearTimeout(timer)
              graceTimers.delete(channelId)
            }
          }

          // Check if user already in state
          const existingMember = state.members.find((m) => m.userId === userId)
          if (!existingMember) {
            const displayName = username ?? 'Unknown'
            state.members.push({
              userId,
              username: username ?? '',
              displayName,
              muted: false,
              screenSharing: false,
              joinedAt: new Date().toISOString(),
            })

            // Broadcast to other members
            socket.to(`voice:${channelId}`).emit('voice:user-joined', {
              userId,
              username,
              displayName,
              agoraUid: agoraUid ?? 0,
            })
          }

          logger.info({ userId, channelId, socketId: socket.id }, 'Joined voice channel')
          ack?.({
            ok: true,
            state: { ...state, members: state.members.filter((m) => m.userId !== userId) },
          })
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Failed to join voice channel'
          logger.error({ err: error, userId, channelId }, 'voice:join error')
          ack?.({ ok: false, error: msg })
        }
      },
    )

    // voice:leave
    socket.on(
      'voice:leave',
      async ({ channelId }: { channelId: string }, ack?: (res: { ok: boolean }) => void) => {
        if (!userId) return

        try {
          await socket.leave(`voice:${channelId}`)

          const state = voiceChannels.get(channelId)
          if (state) {
            const memberIndex = state.members.findIndex((m) => m.userId === userId)
            if (memberIndex >= 0) {
              state.members.splice(memberIndex, 1)

              // Broadcast to remaining members
              socket.to(`voice:${channelId}`).emit('voice:user-left', { userId })

              logger.info({ userId, channelId, socketId: socket.id }, 'Left voice channel')
            }

            // If no members left, start grace period
            if (state.members.length === 0) {
              startGracePeriod(channelId)
            }
          }

          ack?.({ ok: true })
        } catch (error) {
          logger.error({ err: error, userId, channelId }, 'voice:leave error')
          ack?.({ ok: false })
        }
      },
    )

    // voice:mute
    socket.on('voice:mute', ({ channelId, muted }: { channelId: string; muted: boolean }) => {
      if (!userId) return

      const state = voiceChannels.get(channelId)
      if (state) {
        const member = state.members.find((m) => m.userId === userId)
        if (member) {
          member.muted = muted
          io.to(`voice:${channelId}`).emit('voice:user-muted', { userId, muted })
        }
      }
    })

    // voice:screenshare:start
    socket.on('voice:screenshare:start', ({ channelId }: { channelId: string }) => {
      if (!userId) return

      const state = voiceChannels.get(channelId)
      if (state) {
        const member = state.members.find((m) => m.userId === userId)
        if (member) {
          member.screenSharing = true
          io.to(`voice:${channelId}`).emit('voice:screenshare-started', { userId })
          logger.info({ userId, channelId }, 'Started screen sharing')
        }
      }
    })

    // voice:screenshare:stop
    socket.on('voice:screenshare:stop', ({ channelId }: { channelId: string }) => {
      if (!userId) return

      const state = voiceChannels.get(channelId)
      if (state) {
        const member = state.members.find((m) => m.userId === userId)
        if (member) {
          member.screenSharing = false
          io.to(`voice:${channelId}`).emit('voice:screenshare-stopped', { userId })
          logger.info({ userId, channelId }, 'Stopped screen sharing')
        }
      }
    })

    // voice:device-change
    socket.on(
      'voice:device-change',
      ({
        channelId,
        device,
      }: {
        channelId: string
        device: { type: string; deviceId: string }
      }) => {
        if (!userId) return
        // Log for analytics / debugging
        logger.debug({ userId, channelId, device }, 'User changed audio device')
      },
    )

    // Disconnect — handle cleanup
    socket.on('disconnect', async (reason) => {
      if (!userId) return

      // Find all voice channels this user was in
      for (const [channelId, state] of voiceChannels.entries()) {
        const memberIndex = state.members.findIndex((m) => m.userId === userId)
        if (memberIndex >= 0) {
          state.members.splice(memberIndex, 1)
          io.to(`voice:${channelId}`).emit('voice:user-left', { userId, reason })
          logger.info({ userId, channelId, reason }, 'User disconnected from voice channel')

          // If no members left, start grace period
          if (state.members.length === 0) {
            startGracePeriod(channelId)
          }
        }
      }
    })
  })

  /**
   * Start grace period for a voice channel.
   * If no one rejoins within GRACE_PERIOD_MS, clean up the channel state.
   */
  function startGracePeriod(channelId: string) {
    // Clear existing timer if any
    const existing = graceTimers.get(channelId)
    if (existing) clearTimeout(existing)

    const timer = setTimeout(() => {
      const state = voiceChannels.get(channelId)
      if (state && state.members.length === 0) {
        voiceChannels.delete(channelId)
        graceTimers.delete(channelId)
        logger.info({ channelId }, 'Voice channel cleaned up after grace period')

        // Notify agents/bots via API (fire-and-forget)
        try {
          const agentPolicyService = container.resolve('agentPolicyService')
          // Agents with voice policy on this channel can be notified here
          // For now, we just log — agents can poll the channel state
          logger.debug({ channelId }, 'Voice channel fully empty, agents should disconnect')
        } catch {
          // Non-critical
        }
      }
    }, GRACE_PERIOD_MS)

    graceTimers.set(channelId, timer)
    logger.info(
      { channelId, gracePeriodMs: GRACE_PERIOD_MS },
      'Started grace period for voice channel',
    )
  }
}
