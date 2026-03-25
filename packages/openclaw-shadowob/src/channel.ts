/**
 * Shadow channel plugin for OpenClaw.
 *
 * Built using the official SDK helpers:
 *   - createChannelPluginBase  — id + setup adapter
 *   - createChatChannelPlugin  — full channel plugin with all adapters
 *
 * See: https://docs.openclaw.ai/plugins/sdk-channel-plugins
 */

import { ShadowClient } from '@shadowob/sdk'
import type { ChannelGatewayContext, ChannelMessageActionContext } from 'openclaw/plugin-sdk'
import { createChatChannelPlugin, type OpenClawConfig } from 'openclaw/plugin-sdk/core'
import { DEFAULT_ACCOUNT_ID, getAccountConfig, listAccountIds } from './config.js'
import { parseTarget, shadowOutbound } from './outbound.js'
import type { ShadowAccountConfig } from './types.js'

// ─── Account Resolution ─────────────────────────────────────────────────────

function resolveAccount(cfg: OpenClawConfig, accountId?: string | null): ShadowAccountConfig {
  const account = getAccountConfig(cfg, accountId ?? DEFAULT_ACCOUNT_ID)
  if (!account) {
    return { token: '', serverUrl: 'https://shadowob.com', enabled: false }
  }
  return account
}

function inspectAccount(
  cfg: OpenClawConfig,
  accountId?: string | null,
): { enabled: boolean; configured: boolean; tokenStatus: string } {
  const account = getAccountConfig(cfg, accountId ?? DEFAULT_ACCOUNT_ID)
  return {
    enabled: account?.enabled !== false,
    configured: !!account?.token?.trim(),
    tokenStatus: account?.token?.trim() ? 'available' : 'missing',
  }
}

// ─── Channel Plugin ─────────────────────────────────────────────────────────

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
      chatTypes: ['channel', 'thread'],
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

      resolveAccount: (cfg: OpenClawConfig, accountId?: string | null): ShadowAccountConfig => {
        return resolveAccount(cfg, accountId)
      },

      defaultAccountId: (): string => DEFAULT_ACCOUNT_ID,

      isConfigured: (account: ShadowAccountConfig): boolean => {
        return !!account?.token?.trim()
      },

      isEnabled: (account: ShadowAccountConfig): boolean => {
        return account?.enabled !== false
      },

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

  // DM security: define allowlist-based DM policy
  security: {
    dm: {
      channelKey: 'shadowob',
      resolvePolicy: (account) => {
        // No DM policy field on ShadowAccountConfig currently — default to allowlist
        return undefined
      },
      resolveAllowFrom: (_account) => [],
      defaultPolicy: 'allowlist',
    },
  },

  // Threading: how replies are delivered (config-driven with fallback)
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

  // Outbound: send messages to the platform
  outbound: shadowOutbound,

  // ── Additional adapters (set directly on the plugin object) ──────────────

  // The createChatChannelPlugin helper builds the standard ChannelPlugin.
  // We extend it below with adapters that the helper doesn't cover.
})

// ── Extend with adapters not covered by createChatChannelPlugin ─────────────

/** Plugin metadata */
shadowPlugin.meta = {
  id: 'shadowob',
  label: 'ShadowOwnBuddy',
  selectionLabel: 'ShadowOwnBuddy (Server)',
  docsPath: '/channels/shadowob',
  blurb: 'Shadow server channel integration — chat with AI agents in Shadow channels',
  aliases: ['shadow-server', 'openclaw-shadowob'],
}

/** Supported chat capabilities */
shadowPlugin.capabilities = {
  chatTypes: ['channel', 'thread'],
  reactions: true,
  threads: true,
  media: true,
  reply: true,
  edit: true,
  unsend: true,
}

/** Auto-reload when shadow config changes */
shadowPlugin.reload = {
  configPrefixes: ['channels.shadowob'],
}

/** Default debounce */
shadowPlugin.defaults = {
  queue: { debounceMs: 500 },
}

/** Config schema */
shadowPlugin.configSchema = {
  schema: {
    type: 'object',
    properties: {
      token: { type: 'string', description: 'Agent JWT token' },
      serverUrl: { type: 'string', description: 'Shadow server URL' },
      enabled: { type: 'boolean' },
      accounts: {
        type: 'object',
        additionalProperties: {
          type: 'object',
          properties: {
            token: { type: 'string' },
            serverUrl: { type: 'string' },
            enabled: { type: 'boolean' },
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

/** Agent prompt hints — injected into the AI's system prompt for the message tool */
shadowPlugin.agentPrompt = {
  messageToolHints: () => [
    '- Shadow server management: use `action: "get-server"` with `serverId` (slug or UUID) to fetch server info including homepage HTML.',
    '- Shadow homepage decoration: use `action: "update-homepage"` with `serverId` (slug or UUID) and `html` (full HTML string) to update the server\'s homepage. Set `html` to null to reset to default.',
    '- The server slug or ID is provided in the message context as ServerSlug/ServerId when the message originates from a Shadow channel.',
    '- When a user asks to customize/decorate the server homepage, first use `get-server` to see current state, then generate beautiful HTML and use `update-homepage` to apply it.',
    '- Connection diagnostics: use `action: "get-connection-status"` (no params) to probe all configured Shadow accounts and report connection health.',
  ],
}

/** Mention handling — strips @username patterns from incoming messages */
shadowPlugin.mentions = {
  stripPatterns: () => ['@[\\w-]+'],
}

/** Streaming defaults */
shadowPlugin.streaming = {
  blockStreamingCoalesceDefaults: { minChars: 1500, idleMs: 1000 },
}

/** Target normalization */
shadowPlugin.messaging = {
  normalizeTarget: (raw: string): string | undefined => {
    if (/^(shadowob|openclaw-shadowob):(channel|thread):.+$/i.test(raw)) return raw
    // UUID pattern
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) {
      return `shadowob:channel:${raw}`
    }
    return undefined
  },
  targetResolver: {
    looksLikeId: (raw: string): boolean =>
      /^(shadowob|openclaw-shadowob):(channel|thread):.+$/i.test(raw) ||
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw),
    hint: 'Provide a Shadow channel UUID or shadowob:channel:<uuid>',
  },
}

/** Status monitoring */
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

/** Gateway adapter — manages Socket.IO connection lifecycle */
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

    const { monitorShadowProvider } = await import('./monitor.js')
    await monitorShadowProvider({
      account,
      accountId,
      config: ctx.cfg,
      runtime: {
        log: (msg: string) => ctx.log?.info(msg),
        error: (msg: string) => ctx.log?.error(msg),
      },
      abortSignal: ctx.abortSignal,
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

// ── Actions adapter ─────────────────────────────────────────────────────────

/**
 * Supported message actions for the Shadow channel.
 * Standard actions (send, react, edit, delete, reply, thread-create, thread-reply)
 * are handled by OpenClaw core's shared message tool. Custom domain-specific
 * actions (sendAttachment, get-server, update-homepage, get-connection-status)
 * need explicit handlers here.
 */
const SHADOW_ACTIONS = [
  'send',
  'sendAttachment',
  'react',
  'edit',
  'delete',
  'reply',
  'thread-create',
  'thread-reply',
  'pin',
  'unpin',
  'update-homepage',
  'get-server',
  'get-connection-status',
] as const

shadowPlugin.actions = {
  describeMessageTool: () => null,

  supportsAction: ({ action }: { action: string }): boolean =>
    (SHADOW_ACTIONS as readonly string[]).includes(action),

  handleAction: async (ctx: ChannelMessageActionContext) => {
    const textResult = (value: Record<string, unknown>) => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(value),
        },
      ],
      details: value,
    })

    const account = getAccountConfig(ctx.cfg, ctx.accountId ?? DEFAULT_ACCOUNT_ID)
    if (!account) {
      return textResult({ ok: false, error: 'Shadow account not configured' })
    }

    const action = String(ctx.action)
    const { params } = ctx

    // sendAttachment — upload file with base64 buffer or URL fallback
    if (action === 'sendAttachment') {
      try {
        const client = new ShadowClient(account.serverUrl, account.token)
        const to = (params.to as string) ?? ''
        const text = (params.message as string) ?? (params.caption as string) ?? ''
        const filename = (params.filename as string) || 'file'
        const contentType =
          (params.contentType as string) ||
          (params.mimeType as string) ||
          'application/octet-stream'
        const base64Buffer = params.buffer as string | undefined
        const mediaUrl =
          (params.media as string) ?? (params.path as string) ?? (params.filePath as string) ?? ''

        const { channelId, threadId: parsedThreadId } = parseTarget(to)
        const threadId = (params.threadId as string) ?? parsedThreadId

        const content = text || '\u200B'
        let message: Awaited<ReturnType<typeof client.sendMessage>> | undefined
        if (threadId) {
          message = await client.sendToThread(threadId, content)
        } else if (channelId) {
          message = await client.sendMessage(channelId, content, {
            replyToId: params.replyTo as string | undefined,
          })
        } else {
          return textResult({
            ok: false,
            error: 'Could not resolve target channel or thread',
          })
        }

        if (base64Buffer) {
          const raw = base64Buffer.includes(',') ? (base64Buffer.split(',')[1] ?? '') : base64Buffer
          if (!raw) throw new Error('Invalid base64 attachment payload')
          const bytes = Buffer.from(raw, 'base64')
          const blob = new Blob([Uint8Array.from(bytes)], { type: contentType })
          await client.uploadMedia(blob, filename, contentType, message.id)
        } else if (mediaUrl) {
          await client.uploadMediaFromUrl(mediaUrl, message.id)
        } else {
          return textResult({
            ok: false,
            error: 'No buffer or media URL provided for attachment',
          })
        }

        return textResult({
          ok: true,
          action: 'sendAttachment',
          messageId: message.id,
          filename,
        })
      } catch (err) {
        return textResult({ ok: false, error: err instanceof Error ? err.message : String(err) })
      }
    }

    // react
    if (action === 'react') {
      const client = new ShadowClient(account.serverUrl, account.token)
      const messageId = (params.messageId as string) ?? (params.message_id as string) ?? ''
      const emoji = (params.emoji as string) ?? (params.reaction as string) ?? ''
      if (!messageId || !emoji) {
        return textResult({ ok: false, error: 'messageId and emoji are required' })
      }
      try {
        await client.addReaction(messageId, emoji)
        return textResult({ ok: true, action: 'react', messageId, emoji })
      } catch (err) {
        return textResult({ ok: false, error: String(err) })
      }
    }

    // edit
    if (action === 'edit') {
      const client = new ShadowClient(account.serverUrl, account.token)
      const messageId = (params.messageId as string) ?? (params.message_id as string) ?? ''
      const content = (params.message as string) ?? (params.content as string) ?? ''
      if (!messageId || !content) {
        return textResult({ ok: false, error: 'messageId and content are required' })
      }
      try {
        await client.editMessage(messageId, content)
        return textResult({ ok: true, action: 'edit', messageId })
      } catch (err) {
        return textResult({ ok: false, error: String(err) })
      }
    }

    // delete
    if (action === 'delete') {
      const client = new ShadowClient(account.serverUrl, account.token)
      const messageId = (params.messageId as string) ?? (params.message_id as string) ?? ''
      if (!messageId) {
        return textResult({ ok: false, error: 'messageId is required' })
      }
      try {
        await client.deleteMessage(messageId)
        return textResult({ ok: true, action: 'delete', messageId })
      } catch (err) {
        return textResult({ ok: false, error: String(err) })
      }
    }

    // pin / unpin — not yet supported
    if (action === 'pin' || action === 'unpin') {
      return textResult({ ok: false, error: `${action} is not yet supported for Shadow channels` })
    }

    // get-server — fetch server info
    if (action === 'get-server') {
      const serverId =
        (params.serverId as string) ??
        (params.server_id as string) ??
        (params.server as string) ??
        ''
      if (!serverId) {
        return textResult({ ok: false, error: 'serverId is required' })
      }
      try {
        const client = new ShadowClient(account.serverUrl, account.token)
        const server = await client.getServer(serverId)
        return textResult({ ok: true, action: 'get-server', server })
      } catch (err) {
        return textResult({ ok: false, error: String(err) })
      }
    }

    // update-homepage — update server homepage HTML
    if (action === 'update-homepage') {
      const serverId =
        (params.serverId as string) ??
        (params.server_id as string) ??
        (params.server as string) ??
        ''
      const html =
        (params.html as string) ??
        (params.homepageHtml as string) ??
        (params.homepage_html as string) ??
        null
      if (!serverId) {
        return textResult({ ok: false, error: 'serverId is required' })
      }
      try {
        const client = new ShadowClient(account.serverUrl, account.token)
        const result = await client.updateServerHomepage(serverId, html)
        return textResult({
          ok: true,
          action: 'update-homepage',
          serverId: result.id,
          slug: result.slug,
          homepageHtml: result.homepageHtml ? `(${result.homepageHtml.length} chars)` : null,
        })
      } catch (err) {
        return textResult({ ok: false, error: String(err) })
      }
    }

    // get-connection-status — probe all accounts
    if (action === 'get-connection-status') {
      const accountIds = listAccountIds(ctx.cfg)
      const results = await Promise.all(
        accountIds.map(async (id) => {
          const acc = getAccountConfig(ctx.cfg, id)
          if (!acc) return { accountId: id, configured: false, ok: false, error: 'not configured' }
          if (!acc.token?.trim())
            return { accountId: id, configured: false, ok: false, error: 'no token' }
          try {
            const client = new ShadowClient(acc.serverUrl, acc.token)
            const me = await client.getMe()
            return {
              accountId: id,
              configured: true,
              enabled: acc.enabled !== false,
              ok: true,
              serverUrl: acc.serverUrl,
              user: me,
            }
          } catch (err) {
            return {
              accountId: id,
              configured: true,
              enabled: acc.enabled !== false,
              ok: false,
              serverUrl: acc.serverUrl,
              error: err instanceof Error ? err.message : String(err),
            }
          }
        }),
      )
      return textResult({ ok: true, action: 'get-connection-status', accounts: results })
    }

    // Default: unsupported action
    return textResult({ ok: false, error: `Action ${action} not yet implemented` })
  },
}
