import { ShadowClient } from '@shadowob/sdk'
import type { ChannelGatewayContext } from 'openclaw/plugin-sdk'
import {
  buildChannelOutboundSessionRoute,
  buildThreadAwareOutboundSessionRoute,
  createChatChannelPlugin,
  type OpenClawConfig,
} from 'openclaw/plugin-sdk/core'
import { DEFAULT_ACCOUNT_ID, listAccountIds } from '../config.js'
import { shadowOutbound } from '../outbound.js'
import type { ShadowAccountConfig } from '../types.js'
import { inspectAccount, resolveAccount } from './account.js'
import { shadowMessageActions } from './actions.js'
import { shadowAgentPromptHints } from './prompt.js'

export const shadowPlugin = createChatChannelPlugin<ShadowAccountConfig>({
  base: {
    id: 'shadowob',

    meta: {
      id: 'shadowob',
      label: 'ShadowOwnBuddy',
      selectionLabel: 'ShadowOwnBuddy (Server)',
      docsPath: '/channels/shadowob',
      blurb: 'Shadow server channel integration — chat with AI agents in Shadow channels',
      aliases: ['shadow-server', 'openclaw-shadowob'],
    },

    capabilities: {
      chatTypes: ['channel', 'thread', 'direct'],
      reactions: true,
      threads: true,
      media: true,
      reply: true,
      edit: true,
      unsend: true,
    },

    config: {
      listAccountIds: (cfg: OpenClawConfig): string[] => listAccountIds(cfg),
      inspectAccount,
      resolveAccount,
      defaultAccountId: (): string => DEFAULT_ACCOUNT_ID,
      isConfigured: (account: ShadowAccountConfig): boolean => !!account?.token?.trim(),
      isEnabled: (account: ShadowAccountConfig): boolean => account?.enabled !== false,
      describeAccount: (account: ShadowAccountConfig) => ({
        accountId: DEFAULT_ACCOUNT_ID,
        enabled: account?.enabled !== false,
        configured: !!account?.token?.trim(),
      }),
    },

    setup: {
      resolveAccountId: ({ accountId }) => accountId ?? DEFAULT_ACCOUNT_ID,
      applyAccountConfig: ({ cfg }) => cfg,
    },
  },

  security: {
    dm: {
      channelKey: 'shadowob',
      resolvePolicy: () => undefined,
      resolveAllowFrom: () => [],
      defaultPolicy: 'allowlist',
    },
  },

  threading: {
    topLevelReplyToMode: 'reply',
    resolveReplyToMode: ({ cfg }: { cfg: OpenClawConfig }) => {
      const shadow = (cfg.channels?.shadowob ?? cfg.channels?.['openclaw-shadowob']) as
        | Record<string, unknown>
        | undefined
      const mode = shadow?.replyToMode
      if (mode === 'first' || mode === 'all' || mode === 'off') return mode
      return 'first'
    },
  },

  outbound: shadowOutbound,
})

shadowPlugin.meta = {
  id: 'shadowob',
  label: 'ShadowOwnBuddy',
  selectionLabel: 'ShadowOwnBuddy (Server)',
  docsPath: '/channels/shadowob',
  blurb: 'Shadow server channel integration — chat with AI agents in Shadow channels',
  aliases: ['shadow-server', 'openclaw-shadowob'],
}

shadowPlugin.capabilities = {
  chatTypes: ['channel', 'thread', 'direct'],
  reactions: true,
  threads: true,
  media: true,
  reply: true,
  edit: true,
  unsend: true,
}

shadowPlugin.reload = {
  configPrefixes: ['channels.shadowob'],
}

shadowPlugin.defaults = {
  queue: { debounceMs: 500 },
}

shadowPlugin.configSchema = {
  schema: {
    type: 'object',
    properties: {
      token: { type: 'string', description: 'Agent JWT token' },
      serverUrl: { type: 'string', description: 'Shadow server URL' },
      enabled: { type: 'boolean' },
      capabilities: {
        type: 'object',
        additionalProperties: true,
        properties: {
          inlineButtons: {
            anyOf: [
              { type: 'string', enum: ['off', 'dm', 'group', 'all', 'allowlist'] },
              { type: 'boolean' },
            ],
          },
          uploadFile: { type: 'boolean' },
          interactive: { type: 'boolean' },
          forms: { type: 'boolean' },
        },
      },
      accounts: {
        type: 'object',
        additionalProperties: {
          type: 'object',
          properties: {
            token: { type: 'string' },
            serverUrl: { type: 'string' },
            enabled: { type: 'boolean' },
            capabilities: {
              type: 'object',
              additionalProperties: true,
            },
          },
          required: ['token', 'serverUrl'],
        },
      },
    },
  },
  uiHints: {
    token: {
      label: 'Agent Token',
      sensitive: true,
      placeholder: 'Paste the JWT token generated in Shadow → Agents',
    },
    serverUrl: {
      label: 'Server URL',
      placeholder: 'https://shadowob.com',
    },
    enabled: {
      label: 'Enabled',
    },
  },
}

shadowPlugin.agentPrompt = {
  messageToolHints: () => shadowAgentPromptHints,
}

shadowPlugin.mentions = {
  stripPatterns: () => ['@[\\w-]+'],
}

shadowPlugin.streaming = {
  blockStreamingCoalesceDefaults: { minChars: 1500, idleMs: 1000 },
}

shadowPlugin.messaging = {
  normalizeTarget: (raw: string): string | undefined => {
    if (/^(shadowob|openclaw-shadowob):(channel|thread|dm):.+$/i.test(raw)) return raw
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) {
      return `shadowob:channel:${raw}`
    }
    return undefined
  },
  parseExplicitTarget: ({ raw }) => {
    const normalized = shadowPlugin.messaging?.normalizeTarget?.(raw)
    if (!normalized) return null
    const match = normalized.match(/^(?:shadowob|openclaw-shadowob):(channel|thread|dm):(.+)$/i)
    if (!match) return { to: normalized, chatType: 'channel' as const }
    if (match[1] === 'dm') return { to: normalized, chatType: 'direct' as const }
    return match[1] === 'thread'
      ? { to: normalized, threadId: match[2], chatType: 'channel' as const }
      : { to: normalized, chatType: 'channel' as const }
  },
  inferTargetChatType: ({ to }) =>
    /^(?:shadowob|openclaw-shadowob):dm:/i.test(to) ? 'direct' : 'channel',
  resolveSessionTarget: ({ id, threadId }) =>
    threadId ? `shadowob:channel:${id}:thread:${threadId}` : `shadowob:channel:${id}`,
  resolveOutboundSessionRoute: ({ cfg, agentId, accountId, target, threadId }) => {
    const normalized = shadowPlugin.messaging?.normalizeTarget?.(target) ?? target
    const match = normalized.match(/^(?:shadowob|openclaw-shadowob):(channel|thread|dm):(.+)$/i)
    if (!match) return null
    const kind = match[1]!
    const id = match[2]!
    if (kind === 'dm') {
      return buildChannelOutboundSessionRoute({
        cfg,
        agentId,
        channel: 'shadowob',
        accountId,
        peer: { kind: 'direct', id },
        chatType: 'direct',
        from: `shadowob:dm:${id}`,
        to: `shadowob:dm:${id}`,
      })
    }
    const route = buildChannelOutboundSessionRoute({
      cfg,
      agentId,
      channel: 'shadowob',
      accountId,
      peer: { kind: 'channel', id },
      chatType: 'channel',
      from: `shadowob:${kind}:${id}`,
      to: `shadowob:${kind}:${id}`,
      threadId: kind === 'thread' ? id : undefined,
    })
    return buildThreadAwareOutboundSessionRoute({
      route,
      threadId: kind === 'thread' ? id : threadId,
      precedence: ['threadId'],
      useSuffix: false,
    })
  },
  targetResolver: {
    looksLikeId: (raw: string): boolean =>
      /^(shadowob|openclaw-shadowob):(channel|thread|dm):.+$/i.test(raw) ||
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw),
    hint: 'Provide a Shadow channel UUID, shadowob:channel:<uuid>, or shadowob:dm:<uuid>',
  },
}

shadowPlugin.status = {
  defaultRuntime: {
    accountId: DEFAULT_ACCOUNT_ID,
    running: false,
    lastStartAt: null,
    lastStopAt: null,
    lastError: null,
  },

  probeAccount: async ({
    account,
    timeoutMs,
  }: {
    account: ShadowAccountConfig
    timeoutMs: number
  }): Promise<unknown> => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const client = new ShadowClient(account.serverUrl, account.token)
      const me = await client.getMe()
      return { ok: true, user: me }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    } finally {
      clearTimeout(timeout)
    }
  },

  buildAccountSnapshot: ({
    account,
    runtime,
    probe,
  }: {
    account: ShadowAccountConfig
    cfg: OpenClawConfig
    runtime?: {
      running?: boolean
      lastStartAt?: number | null
      lastStopAt?: number | null
      lastError?: string | null
    }
    probe?: unknown
  }) => ({
    accountId: DEFAULT_ACCOUNT_ID,
    enabled: account?.enabled !== false,
    configured: !!account?.token?.trim(),
    running: runtime?.running ?? false,
    lastStartAt: runtime?.lastStartAt ?? null,
    lastStopAt: runtime?.lastStopAt ?? null,
    lastError: runtime?.lastError ?? null,
    probe,
  }),

  buildChannelSummary: ({
    snapshot,
  }: {
    snapshot: {
      configured?: boolean
      running?: boolean
      lastStartAt?: number | null
      lastStopAt?: number | null
      lastError?: string | null
      probe?: unknown
    }
  }) => ({
    configured: snapshot.configured ?? false,
    running: snapshot.running ?? false,
    lastStartAt: snapshot.lastStartAt ?? null,
    lastStopAt: snapshot.lastStopAt ?? null,
    lastError: snapshot.lastError ?? null,
    probe: snapshot.probe,
  }),
}

shadowPlugin.gateway = {
  startAccount: async (ctx: ChannelGatewayContext<ShadowAccountConfig>): Promise<void> => {
    const account = ctx.account
    const accountId = ctx.accountId

    ctx.setStatus({
      accountId,
      running: true,
      lastStartAt: Date.now(),
      lastError: null,
    })

    ctx.log?.info(`Starting Shadow connection for account ${accountId}`)

    const { monitorShadowProvider } = await import('../monitor.js')
    await monitorShadowProvider({
      account,
      accountId,
      config: ctx.cfg,
      runtime: {
        log: (msg: string) => ctx.log?.info(msg),
        error: (msg: string) => ctx.log?.error(msg),
      },
      abortSignal: ctx.abortSignal,
      channelRuntime: ctx.channelRuntime,
    })
  },

  stopAccount: async (ctx: ChannelGatewayContext<ShadowAccountConfig>): Promise<void> => {
    ctx.setStatus({
      accountId: ctx.accountId,
      running: false,
      lastStopAt: Date.now(),
    })

    ctx.log?.info(`Stopped Shadow connection for account ${ctx.accountId}`)
  },
}

shadowPlugin.heartbeat = {
  sendTyping: async ({ cfg, to, accountId, threadId }) => {
    const account = resolveAccount(cfg, accountId)
    if (!account.token?.trim()) return
    const normalized = shadowPlugin.messaging?.normalizeTarget?.(to) ?? to
    const match = normalized.match(/^(?:shadowob|openclaw-shadowob):(channel|thread):(.+)$/i)
    const channelId = match?.[1] === 'channel' ? match[2] : undefined
    const targetChannelId = channelId ?? (threadId ? undefined : normalized)
    if (!targetChannelId) return
    const { ShadowSocket } = await import('@shadowob/sdk')
    const socket = new ShadowSocket({
      serverUrl: account.serverUrl,
      token: account.token,
      transports: ['websocket', 'polling'],
    })
    socket.connect()
    await new Promise<void>((resolve) => {
      socket.onConnect(() => {
        socket.updateActivity(targetChannelId, 'thinking')
        socket.disconnect()
        resolve()
      })
      socket.onConnectError(() => {
        socket.disconnect()
        resolve()
      })
      setTimeout(() => {
        socket.disconnect()
        resolve()
      }, 3000)
    })
  },
}

shadowPlugin.actions = shadowMessageActions
