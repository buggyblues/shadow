import type { OpenClawConfig } from 'openclaw/plugin-sdk/core'
import { DEFAULT_ACCOUNT_ID, listAccountIds } from '../config.js'
import type { ShadowAccountConfig } from '../types.js'
import { inspectAccount, resolveAccount } from './account.js'

export const shadowPluginMeta = {
  id: 'shadowob',
  label: 'ShadowOwnBuddy',
  selectionLabel: 'ShadowOwnBuddy (Server)',
  docsPath: '/channels/shadowob',
  blurb: 'Shadow server channel integration — chat with AI agents in Shadow channels',
  aliases: ['shadow-server'],
}

export const shadowPluginCapabilities = {
  chatTypes: ['channel' as const, 'thread' as const, 'direct' as const],
  reactions: true,
  threads: true,
  media: true,
  reply: true,
  edit: true,
  unsend: true,
}

export const shadowPluginConfig = {
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
}

export const shadowPluginSetup = {
  resolveAccountId: ({ accountId }: { accountId?: string | null }) =>
    accountId ?? DEFAULT_ACCOUNT_ID,
  applyAccountConfig: ({ cfg }: { cfg: OpenClawConfig }) => cfg,
}

export const shadowPluginConfigSchema = {
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
      placeholder: 'Paste the JWT token generated in Shadow -> Agents',
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

export const shadowSetupPlugin = {
  id: 'shadowob',
  meta: shadowPluginMeta,
  capabilities: shadowPluginCapabilities,
  config: shadowPluginConfig,
  setup: shadowPluginSetup,
  configSchema: shadowPluginConfigSchema,
}
