/**
 * Shadow message monitor — connects to Shadow's Socket.IO gateway and
 * processes incoming messages through the OpenClaw inbound pipeline.
 *
 * Server/channel configuration is fetched remotely from the Shadow API
 * via GET /api/agents/:id/config. Policies (listen, reply, mentionOnly)
 * are applied per-channel.
 *
 * Pipeline steps:
 *   1. resolveAgentRoute()
 *   2. formatAgentEnvelope()
 *   3. finalizeInboundContext()
 *   4. recordInboundSession()
 *   5. dispatchReplyWithBufferedBlockDispatcher()
 */

import type { ShadowChannelPolicy, ShadowMessage, ShadowRemoteConfig } from '@shadowob/sdk'
import { ShadowClient, ShadowSocket } from '@shadowob/sdk'
import type { PluginRuntime } from 'openclaw/plugin-sdk/core'
import { processShadowMessage } from './monitor/channel-message.js'
import { processShadowDmMessage, type ShadowDmMessage } from './monitor/dm-message.js'
import {
  formatSlashCommandPrompt,
  loadLocalSlashCommands,
  matchShadowSlashCommand,
  normalizeShadowSlashCommands,
  registerAgentSlashCommands,
} from './monitor/slash-commands.js'
import {
  appendMonitorLog,
  loadMessageWatermarks,
  loadSessionCache,
  type ShadowMessageWatermarks,
  saveMessageWatermarks,
  saveSessionCache,
  updateMessageWatermark,
} from './monitor/state.js'
import { getShadowRuntime } from './runtime.js'
import type { ShadowAccountConfig } from './types.js'

export {
  formatSlashCommandPrompt,
  matchShadowSlashCommand,
  normalizeShadowSlashCommands,
} from './monitor/slash-commands.js'

export type ShadowMonitorOptions = {
  account: ShadowAccountConfig
  accountId: string
  config: unknown
  runtime: { log?: (msg: string) => void; error?: (msg: string) => void }
  abortSignal: AbortSignal
  channelRuntime?: unknown
}

export type ShadowMonitorResult = {
  stop: () => void
}

export function resolveShadowAgentIdFromConfig(config: unknown, accountId: string): string | null {
  const cfg = config as {
    agents?: { list?: Array<{ id?: unknown; default?: boolean }> }
    bindings?: Array<{
      agentId?: unknown
      match?: { channel?: unknown; accountId?: unknown }
    }>
  }

  const routeBinding = cfg.bindings?.find((binding) => {
    return binding.match?.channel === 'shadowob' && binding.match.accountId === accountId
  })
  if (typeof routeBinding?.agentId === 'string' && routeBinding.agentId.trim()) {
    return routeBinding.agentId
  }

  const defaultAgent = cfg.agents?.list?.find((agent) => agent.default) ?? cfg.agents?.list?.[0]
  return typeof defaultAgent?.id === 'string' && defaultAgent.id.trim() ? defaultAgent.id : null
}

const RECENT_MESSAGE_CATCHUP_WINDOW_MS = 30 * 60 * 1000
const MAX_TRACKED_MESSAGE_IDS = 1000

export type { ShadowMessageWatermarks } from './monitor/state.js'

function getMessageCreatedMs(message: Pick<ShadowMessage, 'createdAt'>): number | null {
  const createdMs = Date.parse(message.createdAt)
  return Number.isFinite(createdMs) ? createdMs : null
}

export function shouldCatchUpShadowMessage(
  message: Pick<ShadowMessage, 'id' | 'authorId' | 'channelId' | 'createdAt'>,
  options: {
    botUserId: string
    processedMessageIds?: ReadonlySet<string>
    startedAtMs: number
    watermarks?: ShadowMessageWatermarks
    catchupWindowMs?: number
  },
): boolean {
  if (message.authorId === options.botUserId) return false
  if (options.processedMessageIds?.has(message.id)) return false

  const createdMs = getMessageCreatedMs(message)
  if (createdMs === null) return false

  const watermark = options.watermarks?.[message.channelId]
  const watermarkMs = watermark ? Date.parse(watermark.createdAt) : Number.NaN
  if (Number.isFinite(watermarkMs)) {
    return createdMs > watermarkMs
  }

  return (
    createdMs >= options.startedAtMs - (options.catchupWindowMs ?? RECENT_MESSAGE_CATCHUP_WINDOW_MS)
  )
}

// ─── Main Monitor ─────────────────────────────────────────────────────────

export async function monitorShadowProvider(
  options: ShadowMonitorOptions,
): Promise<ShadowMonitorResult> {
  const { account, accountId, config, abortSignal } = options
  const runtime = {
    log: (msg: string) => {
      options.runtime.log?.(msg)
      void appendMonitorLog(accountId, 'info', msg)
    },
    error: (msg: string) => {
      options.runtime.error?.(msg)
      void appendMonitorLog(accountId, 'error', msg)
    },
  }

  const core = options.channelRuntime
    ? ({ channel: options.channelRuntime } as PluginRuntime)
    : getShadowRuntime()
  let stopped = false
  const monitorStartedAtMs = Date.now()

  const client = new ShadowClient(account.serverUrl, account.token)
  const me = await client.getMe()
  const botUserId = me.id

  runtime.log?.(`Shadow bot connected as ${me.username} (${botUserId})`)

  const agentId = account.agentId ?? me.agentId ?? resolveShadowAgentIdFromConfig(config, accountId)
  if (!agentId) {
    runtime.error?.(
      '[config] Cannot resolve agentId — heartbeat and remote config will be unavailable',
    )
  } else {
    runtime.log?.(`[config] Resolved agentId: ${agentId}`)
  }

  const slashCommands = await loadLocalSlashCommands(runtime)
  if (agentId) {
    try {
      await registerAgentSlashCommands({ account, agentId, commands: slashCommands })
      runtime.log?.(`[slash] Registered ${slashCommands.length} slash command(s) with Shadow`)
    } catch (err) {
      runtime.error?.(`[slash] Failed to register slash commands: ${String(err)}`)
    }
  }

  let remoteConfig: ShadowRemoteConfig | null = null
  const channelPolicies = new Map<string, ShadowChannelPolicy>()
  const channelServerMap = new Map<
    string,
    { serverId: string; serverSlug: string; serverName: string; channelName: string }
  >()
  const allChannelIds: string[] = []
  const messageWatermarks = await loadMessageWatermarks(accountId)
  const processedMessageIds = new Set<string>()
  const catchupInFlight = new Map<string, Promise<void>>()

  const rememberProcessedMessage = (messageId: string) => {
    processedMessageIds.add(messageId)
    if (processedMessageIds.size > MAX_TRACKED_MESSAGE_IDS) {
      const first = processedMessageIds.values().next().value
      if (first) processedMessageIds.delete(first)
    }
  }

  if (agentId) {
    try {
      remoteConfig = await client.getAgentConfig(agentId)
      runtime.log?.(`[config] Fetched remote config: ${remoteConfig.servers.length} server(s)`)

      for (const server of remoteConfig.servers) {
        runtime.log?.(
          `[config] Server "${server.name}" (${server.id}) — ${server.channels.length} channel(s)`,
        )
        for (const ch of server.channels) {
          channelPolicies.set(ch.id, ch.policy)
          channelServerMap.set(ch.id, {
            serverId: server.id,
            serverSlug: server.slug ?? server.id,
            serverName: server.name,
            channelName: ch.name,
          })
          if (ch.policy.listen) {
            allChannelIds.push(ch.id)
            runtime.log?.(
              `[config]   ✓ #${ch.name} (${ch.id}) — listen=true reply=${ch.policy.reply} mentionOnly=${ch.policy.mentionOnly}`,
            )
          } else {
            runtime.log?.(`[config]   ✗ #${ch.name} (${ch.id}) — listen=false, skipping`)
          }
        }
      }

      runtime.log?.(
        `[config] Monitoring ${allChannelIds.length} channel(s) across ${remoteConfig.servers.length} server(s)`,
      )
      void saveSessionCache(accountId, { remoteConfig, botUserId, botUsername: me.username })
    } catch (err) {
      runtime.error?.(`[config] Failed to fetch remote config: ${String(err)}`)

      const cached = await loadSessionCache(accountId)
      if (cached) {
        runtime.log?.('[config] Loaded session from cache — using cached config')
        remoteConfig = cached.remoteConfig
        for (const server of remoteConfig.servers) {
          for (const ch of server.channels) {
            channelPolicies.set(ch.id, ch.policy)
            channelServerMap.set(ch.id, {
              serverId: server.id,
              serverSlug: server.slug ?? server.id,
              serverName: server.name,
              channelName: ch.name,
            })
            if (ch.policy.listen) allChannelIds.push(ch.id)
          }
        }
        runtime.log?.(`[config] Restored ${allChannelIds.length} channel(s) from cache`)
      } else {
        runtime.log?.('[config] No cached session — falling back to monitoring no channels')
      }
    }
  }

  let heartbeatInterval: ReturnType<typeof setInterval> | null = null
  if (agentId) {
    const sendHeartbeat = async () => {
      try {
        await client.sendHeartbeat(agentId!)
        runtime.log?.('[heartbeat] Heartbeat sent')
      } catch (err) {
        runtime.error?.(`[heartbeat] Heartbeat failed: ${String(err)}`)
      }
    }
    void sendHeartbeat()
    heartbeatInterval = setInterval(sendHeartbeat, 30_000)
  }

  runtime.log?.(`[ws] Connecting to Shadow WebSocket at ${account.serverUrl}`)

  const socket = new ShadowSocket({
    serverUrl: account.serverUrl,
    token: account.token,
    transports: ['websocket', 'polling'],
  })

  const processChannelMessageWithRetry = async (
    message: ShadowMessage,
    source: 'ws' | 'catchup',
    attempt = 0,
  ): Promise<void> => {
    try {
      await processShadowMessage({
        message,
        account,
        accountId,
        config,
        runtime,
        core,
        botUserId,
        botUsername: me.username,
        agentId,
        channelPolicies,
        channelServerMap,
        slashCommands,
        socket,
      })
      if (updateMessageWatermark(messageWatermarks, message)) {
        void saveMessageWatermarks(accountId, messageWatermarks)
      }
    } catch (err) {
      const MAX_RETRIES = 2
      runtime.error?.(
        `[${source}] Message processing failed (attempt ${attempt + 1}): ${String(err)}`,
      )
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
        return processChannelMessageWithRetry(message, source, attempt + 1)
      }
      runtime.error?.(
        `[${source}] Message permanently failed after ${MAX_RETRIES + 1} attempts: ${message.id}`,
      )
    }
  }

  const catchUpChannel = async (channelId: string, reason: string) => {
    try {
      const result = await client.getMessages(channelId, 50)
      if (!messageWatermarks[channelId]) {
        const latestBotMessage = [...result.messages]
          .reverse()
          .find((message) => message.authorId === botUserId)
        if (latestBotMessage && updateMessageWatermark(messageWatermarks, latestBotMessage)) {
          void saveMessageWatermarks(accountId, messageWatermarks)
        }
      }
      const candidates = result.messages.filter((message) =>
        shouldCatchUpShadowMessage(message, {
          botUserId,
          processedMessageIds,
          startedAtMs: monitorStartedAtMs,
          watermarks: messageWatermarks,
        }),
      )
      if (candidates.length > 0) {
        runtime.log?.(
          `[catchup] Replaying ${candidates.length} missed message(s) in channel ${channelId} (${reason})`,
        )
      }
      for (const message of candidates) {
        rememberProcessedMessage(message.id)
        await processChannelMessageWithRetry(message, 'catchup')
      }
    } catch (err) {
      runtime.error?.(`[catchup] Failed for channel ${channelId}: ${String(err)}`)
    }
  }

  const enqueueChannelCatchup = (channelId: string, reason: string) => {
    if (catchupInFlight.has(channelId)) return
    const task = catchUpChannel(channelId, reason).finally(() => {
      catchupInFlight.delete(channelId)
    })
    catchupInFlight.set(channelId, task)
  }

  socket.onConnect(() => {
    runtime.log?.(`[ws] Connected (sid=${socket.raw.id})`)
    if (allChannelIds.length === 0) {
      runtime.log?.('[ws] No channels to join — allChannelIds is empty')
      runtime.log?.('[ws] Shadow channel monitor ready (no channels configured)')
    }
    for (const chId of allChannelIds) {
      runtime.log?.(`[ws] Emitting channel:join for ${chId}`)
      socket.joinChannel(chId).then((ack) => {
        if (ack?.ok) {
          runtime.log?.(`[ws] ✓ Joined channel room ${chId} (server confirmed)`)
          runtime.log?.('[ws] Shadow channel monitor ready')
        } else {
          runtime.log?.(`[ws] channel:join for ${chId} — no ack received (older server?)`)
          runtime.log?.('[ws] Shadow channel monitor ready')
        }
        enqueueChannelCatchup(chId, 'connect')
      })
    }
    runtime.log?.(
      `[ws] Emitted channel:join for ${allChannelIds.length} channel(s), listening for messages`,
    )

    ;(async () => {
      try {
        const dmChannels = await client.listDmChannels()
        for (const ch of dmChannels) {
          socket.joinDmChannel(ch.id)
          runtime.log?.(`[ws] Joined DM room dm:${ch.id}`)
        }
        runtime.log?.(`[ws] Joined ${dmChannels.length} DM channel room(s)`)
      } catch (err) {
        runtime.error?.(`[ws] Failed to join DM rooms: ${String(err)}`)
      }
    })()
  })

  socket.onConnectError((err) => {
    runtime.error?.(`[ws] Connection error: ${err.message}`)
  })
  socket.onDisconnect((reason) => {
    runtime.log?.(`[ws] Disconnected: ${reason}`)
  })
  socket.raw.io.on('reconnect', (attempt: number) => {
    runtime.log?.(`[ws] Reconnected after ${attempt} attempt(s)`)
  })
  socket.raw.io.on('reconnect_attempt', (attempt: number) => {
    runtime.log?.(`[ws] Reconnect attempt #${attempt}`)
  })

  socket.on('server:joined', async (data: { serverId: string; agentId?: string }) => {
    if (!agentId) return
    runtime.log?.(`[ws] Received server:joined for server ${data.serverId} — refreshing channels`)
    try {
      const updatedConfig = await client.getAgentConfig(agentId)
      runtime.log?.(`[config] Refreshed config: ${updatedConfig.servers.length} server(s)`)
      for (const server of updatedConfig.servers) {
        for (const ch of server.channels) {
          channelServerMap.set(ch.id, {
            serverId: server.id,
            serverSlug: server.slug ?? server.id,
            serverName: server.name,
            channelName: ch.name,
          })
          if (!channelPolicies.has(ch.id)) {
            channelPolicies.set(ch.id, ch.policy)
            if (ch.policy.listen) {
              allChannelIds.push(ch.id)
              runtime.log?.(`[config] New channel: #${ch.name} (${ch.id}) — joining`)
              socket.joinChannel(ch.id).then((ack) => {
                if (ack?.ok) {
                  runtime.log?.(`[ws] ✓ Joined new channel room ${ch.id}`)
                  runtime.log?.('[ws] Shadow channel monitor ready')
                }
              })
            }
          } else {
            channelPolicies.set(ch.id, ch.policy)
          }
        }
      }
      remoteConfig = updatedConfig
    } catch (err) {
      runtime.error?.(`[config] Failed to refresh config after server:joined: ${String(err)}`)
    }
  })

  socket.on(
    'channel:created',
    async (data: { id: string; name: string; serverId: string; type: string }) => {
      runtime.log?.(
        `[ws] Received channel:created: #${data.name} (${data.id}) in server ${data.serverId} — ignoring (bot must be explicitly added)`,
      )
    },
  )

  socket.on(
    'agent:policy-changed',
    (data: {
      agentId: string
      serverId?: string
      channelId?: string | null
      mentionOnly?: boolean
      reply?: boolean
      config?: Record<string, unknown>
    }) => {
      if (data.agentId !== agentId) return
      if (!data.channelId) return
      const mentionOnly = data.mentionOnly ?? false
      runtime.log?.(
        `[ws] Received agent:policy-changed for channel ${data.channelId}: mentionOnly=${mentionOnly}, reply=${data.reply}, config=${JSON.stringify(data.config ?? {})}`,
      )
      const existing = channelPolicies.get(data.channelId)
      if (existing) {
        channelPolicies.set(data.channelId, {
          ...existing,
          mentionOnly,
          reply: data.reply ?? existing.reply,
          config: data.config ?? existing.config,
        })
      } else {
        channelPolicies.set(data.channelId, {
          listen: true,
          reply: data.reply ?? true,
          mentionOnly,
          config: data.config ?? {},
        })
      }
    },
  )

  socket.on('channel:member-added', (data: { channelId: string; serverId?: string }) => {
    runtime.log?.(
      `[ws] Received channel:member-added: channel ${data.channelId} in server ${data.serverId}`,
    )
    if (!channelPolicies.has(data.channelId)) {
      const defaultPolicy: ShadowChannelPolicy = {
        listen: true,
        reply: true,
        mentionOnly: false,
        config: {},
      }
      channelPolicies.set(data.channelId, defaultPolicy)
      allChannelIds.push(data.channelId)
    }
    socket.joinChannel(data.channelId).then((ack) => {
      if (ack?.ok) {
        runtime.log?.(`[ws] ✓ Joined channel room ${data.channelId} after member-added`)
        runtime.log?.('[ws] Shadow channel monitor ready')
      }
      enqueueChannelCatchup(data.channelId, 'member-added')
    })
  })

  socket.on('channel:member-removed', (data: { channelId: string; serverId?: string }) => {
    runtime.log?.(
      `[ws] Received channel:member-removed: channel ${data.channelId} in server ${data.serverId}`,
    )
    channelPolicies.delete(data.channelId)
    const idx = allChannelIds.indexOf(data.channelId)
    if (idx !== -1) allChannelIds.splice(idx, 1)
    socket.leaveChannel(data.channelId)
    runtime.log?.(`[ws] Left channel room ${data.channelId} after member-removed`)
  })

  const processedDmIds = new Set<string>()
  socket.on('dm:message:new', (dmMessage: ShadowDmMessage) => {
    if (processedDmIds.has(dmMessage.id)) {
      runtime.log?.(`[ws] Skipping duplicate dm:message:new ${dmMessage.id}`)
      return
    }
    processedDmIds.add(dmMessage.id)
    if (processedDmIds.size > 500) {
      const first = processedDmIds.values().next().value
      if (first) processedDmIds.delete(first)
    }

    const senderLabel = dmMessage.author?.username ?? dmMessage.senderId
    runtime.log?.(
      `[ws] ← dm:message:new from ${senderLabel} in DM ${dmMessage.dmChannelId}: "${dmMessage.content?.slice(0, 60)}" (${dmMessage.id})`,
    )

    if (stopped) {
      runtime.log?.('[ws] Monitor stopped, ignoring DM message')
      return
    }

    const processWithRetry = async (attempt = 0) => {
      try {
        await processShadowDmMessage({
          dmMessage,
          account,
          accountId,
          config,
          runtime,
          core,
          botUserId,
          botUsername: me.username,
          shadowAgentId: agentId,
          slashCommands,
          socket,
        })
      } catch (err) {
        const MAX_RETRIES = 2
        runtime.error?.(`[ws] DM processing failed (attempt ${attempt + 1}): ${String(err)}`)
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
          return processWithRetry(attempt + 1)
        }
        runtime.error?.(
          `[ws] DM permanently failed after ${MAX_RETRIES + 1} attempts: ${dmMessage.id}`,
        )
      }
    }
    void processWithRetry()
  })

  socket.on('message:new', (message: ShadowMessage) => {
    const senderLabel = message.author?.username ?? message.authorId
    runtime.log?.(
      `[ws] ← message:new from ${senderLabel} in channel ${message.channelId}: "${message.content?.slice(0, 60)}" (${message.id})`,
    )

    if (processedMessageIds.has(message.id)) {
      runtime.log?.(`[ws] Skipping duplicate message:new ${message.id}`)
      return
    }
    rememberProcessedMessage(message.id)

    if (stopped) {
      runtime.log?.('[ws] Monitor stopped, ignoring message')
      return
    }

    if (allChannelIds.length > 0 && !allChannelIds.includes(message.channelId)) {
      runtime.log?.(`[ws] Message from unmonitored channel ${message.channelId}, ignoring`)
      return
    }

    void processChannelMessageWithRetry(message, 'ws')
  })

  socket.connect()

  const stop = () => {
    runtime.log?.('[lifecycle] Stopping Shadow monitor...')
    stopped = true
    if (heartbeatInterval) clearInterval(heartbeatInterval)
    socket.disconnect()
    runtime.log?.('[lifecycle] Shadow monitor stopped')
  }

  abortSignal.addEventListener('abort', stop, { once: true })

  await new Promise<void>((resolve) => {
    if (abortSignal.aborted) {
      resolve()
      return
    }
    abortSignal.addEventListener('abort', () => resolve(), { once: true })
  })

  return { stop }
}
