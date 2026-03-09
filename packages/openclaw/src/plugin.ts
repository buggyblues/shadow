/**
 * Shadow channel plugin for OpenClaw.
 *
 * Implements the ChannelPlugin interface to provide Shadow server integration.
 * Supports channel messaging, threads, @mentions, reactions, and media.
 */

import { DEFAULT_ACCOUNT_ID, getAccountConfig, listAccountIds } from './config.js'
import { parseTarget, shadowOutbound } from './outbound.js'
import { ShadowClient } from './shadow-client.js'
import type {
  ChannelAccountSnapshot,
  ChannelCapabilities,
  ChannelMeta,
  ChannelPlugin,
  OpenClawConfig,
  ShadowAccountConfig,
} from './types.js'

/**
 * Supported message actions for the Shadow channel.
 * Returned by actions.listActions so that OpenClaw's message tool
 * exposes these actions to the AI agent.
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
] as const

export const shadowPlugin: ChannelPlugin<ShadowAccountConfig> = {
  /** Plugin identifier */
  id: 'shadowob',

  /** Plugin metadata */
  meta: {
    id: 'shadowob',
    label: 'ShadowOwnBuddy',
    selectionLabel: 'ShadowOwnBuddy (Server)',
    docsPath: '/channels/shadowob',
    blurb: 'Shadow server channel integration — chat with AI agents in Shadow channels',
    aliases: ['shadow-server'],
  } satisfies ChannelMeta,

  /** Supported chat capabilities */
  capabilities: {
    chatTypes: ['channel', 'thread'],
    reactions: true,
    threads: true,
    media: true,
    reply: true,
    edit: true,
    unsend: true,
  } satisfies ChannelCapabilities,

  /** Auto-reload when shadow config changes */
  reload: {
    configPrefixes: ['channels.shadowob'],
  },

  /** Default debounce */
  defaults: {
    queue: { debounceMs: 500 },
  },

  /** Config schema (JSON Schema — wrapped for OpenClaw channel plugin API) */
  configSchema: {
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
  },

  /** Account configuration management */
  config: {
    listAccountIds: (cfg: OpenClawConfig): string[] => listAccountIds(cfg),

    resolveAccount: (cfg: OpenClawConfig, accountId?: string | null): ShadowAccountConfig => {
      const account = getAccountConfig(cfg, accountId ?? DEFAULT_ACCOUNT_ID)
      if (!account) {
        return {
          token: '',
          serverUrl: 'https://shadowob.com',
          enabled: false,
        }
      }
      return account
    },

    defaultAccountId: (): string => DEFAULT_ACCOUNT_ID,

    isConfigured: (account: ShadowAccountConfig): boolean => {
      return !!account?.token?.trim()
    },

    isEnabled: (account: ShadowAccountConfig): boolean => {
      return account?.enabled !== false
    },

    describeAccount: (account: ShadowAccountConfig): ChannelAccountSnapshot => {
      return {
        accountId: DEFAULT_ACCOUNT_ID,
        enabled: account?.enabled !== false,
        configured: !!account?.token?.trim(),
      }
    },
  },

  /** Outbound message adapter */
  outbound: shadowOutbound,

  /**
   * Message actions — advertises supported actions to the AI agent's message tool.
   * Without this, the agent's system prompt shows capabilities=none and it refuses
   * to send files/attachments via the Shadow channel.
   */
  actions: {
    listActions: () => [...SHADOW_ACTIONS],

    supportsAction: ({ action }: { action: string }): boolean =>
      (SHADOW_ACTIONS as readonly string[]).includes(action),

    handleAction: async (ctx: {
      cfg: OpenClawConfig
      action: string
      params: Record<string, unknown>
      accountId?: string
      [key: string]: unknown
    }) => {
      const account = getAccountConfig(ctx.cfg, ctx.accountId ?? DEFAULT_ACCOUNT_ID)
      if (!account) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ ok: false, error: 'Shadow account not configured' }),
            },
          ],
        }
      }

      const action = ctx.action
      const params = ctx.params

      // sendAttachment — OpenClaw core hydrates params.buffer (base64) via hydrateAttachmentParamsForAction
      // before calling handleAction. We use the pre-loaded buffer for direct upload.
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

          // Step 1: Create a message to attach the file to
          const content = text || '\u200B' // zero-width space for file-only messages
          let message: Awaited<ReturnType<typeof client.sendMessage>> | undefined
          if (threadId) {
            message = await client.sendToThread(threadId, content)
          } else if (channelId) {
            message = await client.sendMessage(channelId, content, {
              replyToId: params.replyTo as string | undefined,
            })
          } else {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify({
                    ok: false,
                    error: 'Could not resolve target channel or thread',
                  }),
                },
              ],
            }
          }

          // Step 2: Upload the file and attach to the message
          if (base64Buffer) {
            // Use the hydrated base64 buffer provided by OpenClaw core
            const bytes = Uint8Array.from(atob(base64Buffer), (c) => c.charCodeAt(0))
            const blob = new Blob([bytes], { type: contentType })
            await client.uploadMedia(blob, filename, contentType, message.id)
          } else if (mediaUrl) {
            // Fallback: try to upload from URL/path
            await client.uploadMediaFromUrl(mediaUrl, message.id)
          } else {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify({
                    ok: false,
                    error: 'No buffer or media URL provided for attachment',
                  }),
                },
              ],
            }
          }

          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  ok: true,
                  action: 'sendAttachment',
                  messageId: message.id,
                  filename,
                }),
              },
            ],
          }
        } catch (err) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  ok: false,
                  error: err instanceof Error ? err.message : String(err),
                }),
              },
            ],
          }
        }
      }

      // react — add a reaction to a message
      if (action === 'react') {
        const client = new ShadowClient(account.serverUrl, account.token)
        const messageId = (params.messageId as string) ?? (params.message_id as string) ?? ''
        const emoji = (params.emoji as string) ?? (params.reaction as string) ?? ''
        if (!messageId || !emoji) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({ ok: false, error: 'messageId and emoji are required' }),
              },
            ],
          }
        }
        try {
          await client.addReaction(messageId, emoji)
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({ ok: true, action: 'react', messageId, emoji }),
              },
            ],
          }
        } catch (err) {
          return {
            content: [
              { type: 'text' as const, text: JSON.stringify({ ok: false, error: String(err) }) },
            ],
          }
        }
      }

      // edit — edit a message
      if (action === 'edit') {
        const client = new ShadowClient(account.serverUrl, account.token)
        const messageId = (params.messageId as string) ?? (params.message_id as string) ?? ''
        const content = (params.message as string) ?? (params.content as string) ?? ''
        if (!messageId || !content) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({ ok: false, error: 'messageId and content are required' }),
              },
            ],
          }
        }
        try {
          await client.editMessage(messageId, content)
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({ ok: true, action: 'edit', messageId }),
              },
            ],
          }
        } catch (err) {
          return {
            content: [
              { type: 'text' as const, text: JSON.stringify({ ok: false, error: String(err) }) },
            ],
          }
        }
      }

      // delete — delete a message
      if (action === 'delete') {
        const client = new ShadowClient(account.serverUrl, account.token)
        const messageId = (params.messageId as string) ?? (params.message_id as string) ?? ''
        if (!messageId) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({ ok: false, error: 'messageId is required' }),
              },
            ],
          }
        }
        try {
          await client.deleteMessage(messageId)
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({ ok: true, action: 'delete', messageId }),
              },
            ],
          }
        } catch (err) {
          return {
            content: [
              { type: 'text' as const, text: JSON.stringify({ ok: false, error: String(err) }) },
            ],
          }
        }
      }

      // pin / unpin — requires channelId context which is not always available
      if (action === 'pin' || action === 'unpin') {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                ok: false,
                error: `${action} is not yet supported for Shadow channels`,
              }),
            },
          ],
        }
      }

      // get-server — fetch server info (name, description, homepage, etc.)
      if (action === 'get-server') {
        const serverId = (params.serverId as string) ?? (params.server_id as string) ?? (params.server as string) ?? ''
        if (!serverId) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({ ok: false, error: 'serverId is required' }),
              },
            ],
          }
        }
        try {
          const client = new ShadowClient(account.serverUrl, account.token)
          const server = await client.getServer(serverId)
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({ ok: true, action: 'get-server', server }),
              },
            ],
          }
        } catch (err) {
          return {
            content: [
              { type: 'text' as const, text: JSON.stringify({ ok: false, error: String(err) }) },
            ],
          }
        }
      }

      // update-homepage — update server homepage HTML for decoration
      if (action === 'update-homepage') {
        const serverId = (params.serverId as string) ?? (params.server_id as string) ?? (params.server as string) ?? ''
        const html = (params.html as string) ?? (params.homepageHtml as string) ?? (params.homepage_html as string) ?? null
        if (!serverId) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({ ok: false, error: 'serverId is required' }),
              },
            ],
          }
        }
        try {
          const client = new ShadowClient(account.serverUrl, account.token)
          const result = await client.updateServerHomepage(serverId, html)
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  ok: true,
                  action: 'update-homepage',
                  serverId: result.id,
                  slug: result.slug,
                  homepageHtml: result.homepageHtml ? `(${result.homepageHtml.length} chars)` : null,
                }),
              },
            ],
          }
        } catch (err) {
          return {
            content: [
              { type: 'text' as const, text: JSON.stringify({ ok: false, error: String(err) }) },
            ],
          }
        }
      }

      // Default: unsupported action
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ ok: false, error: `Action ${action} not yet implemented` }),
          },
        ],
      }
    },
  },

  /** Agent prompt hints — injected into the AI's system prompt for the message tool */
  agentPrompt: {
    messageToolHints: () => [
      '- Shadow server management: use `action: "get-server"` with `serverId` (slug or UUID) to fetch server info including homepage HTML.',
      '- Shadow homepage decoration: use `action: "update-homepage"` with `serverId` (slug or UUID) and `html` (full HTML string) to update the server\'s homepage. Set `html` to null to reset to default.',
      '- The server slug or ID is provided in the message context as ServerSlug/ServerId when the message originates from a Shadow channel.',
      '- When a user asks to customize/decorate the server homepage, first use `get-server` to see current state, then generate beautiful HTML and use `update-homepage` to apply it.',
    ],
  },

  /** Mention handling — strips @username patterns from incoming messages */
  mentions: {
    stripPatterns: () => ['@[\\w-]+'],
  },

  /** Threading support */
  threading: {
    resolveReplyToMode: ({ cfg }) => {
      const shadow = cfg.channels?.shadowob as Record<string, unknown> | undefined
      const mode = shadow?.replyToMode
      if (mode === 'first' || mode === 'all' || mode === 'off') return mode
      return 'first'
    },
  },

  /** Streaming defaults */
  streaming: {
    blockStreamingCoalesceDefaults: { minChars: 1500, idleMs: 1000 },
  },

  /** Target normalization */
  messaging: {
    normalizeTarget: (raw: string): string | undefined => {
      // Accept "shadowob:channel:<id>", "shadowob:thread:<id>", or bare UUID
      if (/^shadowob:(channel|thread):.+$/i.test(raw)) return raw
      // UUID pattern
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) {
        return `shadowob:channel:${raw}`
      }
      return undefined
    },
    targetResolver: {
      looksLikeId: (raw: string): boolean =>
        /^shadowob:(channel|thread):.+$/i.test(raw) ||
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw),
      hint: 'Provide a Shadow channel UUID or shadowob:channel:<uuid>',
    },
  },

  /** Status monitoring */
  status: {
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
      runtime?: ChannelAccountSnapshot
      probe?: unknown
    }): ChannelAccountSnapshot => {
      return {
        accountId: DEFAULT_ACCOUNT_ID,
        enabled: account?.enabled !== false,
        configured: !!account?.token?.trim(),
        running: runtime?.running ?? false,
        lastStartAt: runtime?.lastStartAt ?? null,
        lastStopAt: runtime?.lastStopAt ?? null,
        lastError: runtime?.lastError ?? null,
        probe,
      }
    },

    buildChannelSummary: ({ snapshot }: { snapshot: ChannelAccountSnapshot }) => ({
      configured: snapshot.configured ?? false,
      running: snapshot.running ?? false,
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null,
      probe: snapshot.probe,
    }),
  },

  /** Gateway adapter — manages Socket.IO connection lifecycle */
  gateway: {
    startAccount: async (ctx): Promise<void> => {
      const account = ctx.account
      const accountId = ctx.accountId

      ctx.setStatus({
        accountId,
        running: true,
        lastStartAt: Date.now(),
        lastError: null,
      })

      ctx.log?.info(`Starting Shadow connection for account ${accountId}`)

      // Lazy import to avoid init cycles
      const { monitorShadowProvider } = await import('./monitor.js')
      await monitorShadowProvider({
        account,
        accountId,
        config: ctx.cfg,
        runtime: {
          log: (msg) => ctx.log?.info(msg),
          error: (msg) => ctx.log?.error(msg),
        },
        abortSignal: ctx.abortSignal,
      })
    },

    stopAccount: async (ctx): Promise<void> => {
      ctx.setStatus({
        accountId: ctx.accountId,
        running: false,
        lastStopAt: Date.now(),
      })

      ctx.log?.info(`Stopped Shadow connection for account ${ctx.accountId}`)
    },
  },
}
