/**
 * Shadow channel plugin for OpenClaw.
 *
 * Implements the ChannelPlugin interface to provide Shadow server integration.
 * Supports channel messaging, threads, @mentions, reactions, and media.
 */

import { getAccountConfig, listAccountIds, DEFAULT_ACCOUNT_ID } from './config.js'
import { shadowOutbound } from './outbound.js'
import { ShadowClient } from './shadow-client.js'
import type {
  ChannelAccountSnapshot,
  ChannelCapabilities,
  ChannelMeta,
  ChannelPlugin,
  OpenClawConfig,
  ShadowAccountConfig,
} from './types.js'

export const shadowPlugin: ChannelPlugin<ShadowAccountConfig> = {
  /** Plugin identifier */
  id: 'shadow',

  /** Plugin metadata */
  meta: {
    id: 'shadow',
    label: 'Shadow',
    selectionLabel: 'Shadow (Server)',
    docsPath: '/channels/shadow',
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
    configPrefixes: ['channels.shadow'],
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
        placeholder: 'http://localhost:3002',
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
          serverUrl: 'http://localhost:3002',
          enabled: false,
        }
      }
      return account
    },

    defaultAccountId: (): string => DEFAULT_ACCOUNT_ID,

    isConfigured: (account: ShadowAccountConfig): boolean => {
      return !!(account?.token?.trim())
    },

    isEnabled: (account: ShadowAccountConfig): boolean => {
      return account?.enabled !== false
    },

    describeAccount: (account: ShadowAccountConfig): ChannelAccountSnapshot => {
      return {
        accountId: DEFAULT_ACCOUNT_ID,
        enabled: account?.enabled !== false,
        configured: !!(account?.token?.trim()),
      }
    },
  },

  /** Outbound message adapter */
  outbound: shadowOutbound,

  /** Mention handling — strips @username patterns from incoming messages */
  mentions: {
    stripPatterns: () => ['@[\\w-]+'],
  },

  /** Threading support */
  threading: {
    resolveReplyToMode: ({ cfg }) => {
      const shadow = cfg.channels?.shadow as Record<string, unknown> | undefined
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
      // Accept "shadow:channel:<id>" or bare UUID
      if (raw.startsWith('shadow:')) return raw
      // UUID pattern
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) {
        return `shadow:channel:${raw}`
      }
      return undefined
    },
    targetResolver: {
      looksLikeId: (raw: string): boolean =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw),
      hint: 'Provide a Shadow channel UUID',
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
        configured: !!(account?.token?.trim()),
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
