/**
 * Shadow Chat Platform plugin — connects agents to Shadow buddies.
 *
 * Builds OpenClaw channel config for the shadowob messaging platform,
 * mapping agent deployments to buddy accounts with routing and reply policies.
 */

import { defineChannelPlugin } from '../helpers.js'
import type {
  PluginBuildContext,
  PluginConfigFragment,
  PluginManifest,
  PluginProvisionContext,
  PluginValidationError,
} from '../types.js'
import manifest from './manifest.json' with { type: 'json' }
import { provisionShadowResources } from './provisioning.js'

interface ShadowBuddy {
  id: string
  name: string
  description?: string
}

interface ShadowBinding {
  agentId: string
  targetId: string
  targetType?: string
  servers?: string[]
  channels?: string[]
  replyPolicy?: {
    mode: string
    custom?: Record<string, unknown>
  }
}

interface ShadowServerApp {
  id: string
  serverId: string
  manifestUrl?: string
  manifest?: Record<string, unknown>
  grants?: Array<{
    buddyId: string
    permissions?: string[]
    approvalMode?: string
    resourceRules?: Record<string, unknown>
  }>
}

interface ShadowobPluginConfig {
  buddies?: ShadowBuddy[]
  bindings?: ShadowBinding[]
  servers?: Array<{ id: string; name?: string }>
  serverApps?: ShadowServerApp[]
  commerce?: {
    paidFiles?: Array<{
      id: string
      name: string
      summary?: string
      serverId: string
      sellerBuddyId?: string
      shop?: { kind?: string; buddyId?: string }
    }>
  }
}

const SHADOWOB_OPENCLAW_EXTENSION_ID = 'shadowob'
const SHADOWOB_OPENCLAW_PLUGIN_ID = 'openclaw-shadowob'
const SHADOWOB_OPENCLAW_EXTENSION_PATH = `/app/extensions/${SHADOWOB_OPENCLAW_EXTENSION_ID}`
const SHADOWOB_CLI_SKILL_INTRO =
  'Shadow context: use the mounted shadowob-cli skill and `shadowob` CLI when you need current channel/DM history, pins, members, server/channel/workspace state, server App resources, or to send/manage Shadow content. For installed server Apps, use the CLI path only: run `shadowob app discover --server "$SHADOWOB_SERVER_ID" --json`, then `shadowob app call <app-key> <command> --server "$SHADOWOB_SERVER_ID" --json-input \'<raw-command-input-json>\' --json`. Do not use curl, fetch, raw HTTP routes, or the JavaScript SDK for server App commands. Keep reads narrow and prefer `--json`.'

function shadowEnvKey(prefix: string, id: string) {
  return `${prefix}_${id.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`
}

function shadowEnvRef(key: string) {
  return `\${env:${key}}`
}

function shadowobChannelCapabilities(): Record<string, unknown> {
  return {
    inlineButtons: 'all',
    interactive: true,
    forms: true,
  }
}

function shadowobChannelCapabilitiesSchema(): Record<string, unknown> {
  return {
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
  }
}

function shadowobOpenClawPluginConfig(): Pick<PluginConfigFragment, 'plugins'> {
  return {
    plugins: {
      enabled: true,
      load: { paths: [SHADOWOB_OPENCLAW_EXTENSION_PATH] },
      entries: { [SHADOWOB_OPENCLAW_PLUGIN_ID]: { enabled: true } },
    },
  }
}

function shadowobRuntimeTokenEnvKey(buddyId: string): string {
  return `SHADOW_TOKEN_${buddyId.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`
}

function shadowobChannelConfigMetadata(): Record<string, unknown> {
  return {
    label: 'ShadowOwnBuddy',
    description: 'Shadow server channel integration — chat with AI agents in Shadow channels',
    schema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      additionalProperties: true,
      properties: {
        name: { type: 'string' },
        enabled: { type: 'boolean' },
        token: { type: 'string' },
        serverUrl: { type: 'string' },
        buddyId: { type: 'string' },
        buddyName: { type: 'string' },
        buddyDescription: { type: 'string' },
        replyToMode: { type: 'string', enum: ['first', 'all', 'off'] },
        capabilities: shadowobChannelCapabilitiesSchema(),
        accountAgentMap: {
          type: 'object',
          additionalProperties: { type: 'string' },
        },
        accounts: {
          type: 'object',
          additionalProperties: {
            type: 'object',
            additionalProperties: true,
            properties: {
              enabled: { type: 'boolean' },
              token: { type: 'string' },
              serverUrl: { type: 'string' },
              buddyId: { type: 'string' },
              buddyName: { type: 'string' },
              buddyDescription: { type: 'string' },
              agentId: { type: 'string' },
              capabilities: shadowobChannelCapabilitiesSchema(),
              commerceOffers: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: true,
                  properties: {
                    seedId: { type: 'string' },
                    name: { type: 'string' },
                    summary: { type: 'string' },
                    offerId: { type: 'string' },
                    productId: { type: 'string' },
                    fileId: { type: 'string' },
                    deliverableId: { type: 'string' },
                  },
                },
              },
              serverApps: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: true,
                  properties: {
                    id: { type: 'string' },
                    serverConfigId: { type: 'string' },
                    manifestUrl: { type: 'string' },
                    serverId: { type: 'string' },
                    serverAppId: { type: 'string' },
                    appKey: { type: 'string' },
                    permissions: {
                      type: 'array',
                      items: { type: 'string' },
                    },
                  },
                },
              },
            },
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
}

function buildShadowConfig(context: PluginBuildContext): PluginConfigFragment {
  const agentConfig = context.agentConfig
  const shadowConfig = agentConfig as unknown as ShadowobPluginConfig
  const bindings = shadowConfig.bindings?.filter((b) => b.agentId === context.agent.id) ?? []
  const pluginConfig = shadowobOpenClawPluginConfig()
  // Always emit channel config — disabled fallback ensures the always-installed
  // openclaw-shadowob extension passes OpenClaw config validation.
  if (bindings.length === 0) {
    return { ...pluginConfig, channels: { shadowob: { enabled: false } } }
  }

  const accounts: Record<string, Record<string, unknown>> = {}
  const configBindings: Array<Record<string, unknown>> = []

  for (const binding of bindings) {
    const buddy = shadowConfig.buddies?.find((b) => b.id === binding.targetId)
    if (!buddy) continue

    const account: Record<string, unknown> = {
      token: `\${env:SHADOW_TOKEN_${binding.targetId.toUpperCase().replace(/-/g, '_')}}`,
      serverUrl: '${env:SHADOW_SERVER_URL}',
      enabled: true,
      buddyName: buddy.name,
      ...(buddy.description ? { buddyDescription: buddy.description } : {}),
      ...(buddy.id ? { buddyId: buddy.id } : {}),
      capabilities: shadowobChannelCapabilities(),
    }

    const commerceOffers = shadowConfig.commerce?.paidFiles
      ?.filter((item) => {
        const sellerBuddyId = item.sellerBuddyId ?? item.shop?.buddyId
        return sellerBuddyId === binding.targetId
      })
      .map((item) => ({
        seedId: item.id,
        name: item.name,
        ...(item.summary ? { summary: item.summary } : {}),
        serverConfigId: item.serverId,
        offerId: shadowEnvRef(shadowEnvKey('SHADOW_COMMERCE_OFFER', item.id)),
        productId: shadowEnvRef(shadowEnvKey('SHADOW_COMMERCE_PRODUCT', item.id)),
        fileId: shadowEnvRef(shadowEnvKey('SHADOW_COMMERCE_FILE', item.id)),
        deliverableId: shadowEnvRef(shadowEnvKey('SHADOW_COMMERCE_DELIVERABLE', item.id)),
      }))
      .filter((item) => item.offerId)
    if (commerceOffers?.length) {
      account.commerceOffers = commerceOffers
    }

    const serverApps = shadowConfig.serverApps
      ?.flatMap((app) =>
        (app.grants ?? [])
          .filter((grant) => grant.buddyId === binding.targetId)
          .map((grant) => ({
            id: app.id,
            serverConfigId: app.serverId,
            ...(app.manifestUrl ? { manifestUrl: app.manifestUrl } : {}),
            serverId: shadowEnvRef(shadowEnvKey('SHADOW_SERVER_APP_SERVER', app.id)),
            serverAppId: shadowEnvRef(shadowEnvKey('SHADOW_SERVER_APP_ID', app.id)),
            appKey: shadowEnvRef(shadowEnvKey('SHADOW_SERVER_APP_KEY', app.id)),
            permissions: grant.permissions ?? ['*'],
          })),
      )
      .filter((item) => item.serverAppId)
    if (serverApps?.length) {
      account.serverApps = serverApps
    }

    if (binding.replyPolicy) {
      const policy = binding.replyPolicy
      account.replyPolicy = {
        mode: policy.mode,
        ...(policy.custom ? { config: policy.custom } : {}),
      }
    }

    accounts[binding.targetId] = account
    configBindings.push({
      agentId: context.agent.id,
      type: 'route',
      match: { channel: 'shadowob', accountId: binding.targetId },
    })
  }

  return {
    ...pluginConfig,
    channels: {
      shadowob: {
        enabled: true,
        capabilities: shadowobChannelCapabilities(),
        accounts,
      },
    },
    bindings: configBindings,
  }
}

export default defineChannelPlugin(manifest as PluginManifest, buildShadowConfig, (api) => {
  api.onBuildPrompt(() => SHADOWOB_CLI_SKILL_INTRO)

  api.onBuildRuntime((context) => {
    const shadowConfig = context.agentConfig as unknown as ShadowobPluginConfig
    const bindings = shadowConfig.bindings?.filter((b) => b.agentId === context.agent.id) ?? []
    const accounts = bindings
      .map((binding) => {
        const buddy = shadowConfig.buddies?.find((b) => b.id === binding.targetId)
        if (!buddy) return undefined
        return {
          buddyId: buddy.id,
          buddyName: buddy.name,
          ...(buddy.description ? { buddyDescription: buddy.description } : {}),
          tokenEnvKey: shadowobRuntimeTokenEnvKey(binding.targetId),
          serverApps: shadowConfig.serverApps
            ?.flatMap((app) =>
              (app.grants ?? [])
                .filter((grant) => grant.buddyId === binding.targetId)
                .map((grant) => ({
                  id: app.id,
                  serverConfigId: app.serverId,
                  ...(app.manifestUrl ? { manifestUrl: app.manifestUrl } : {}),
                  appKeyEnvKey: shadowEnvKey('SHADOW_SERVER_APP_KEY', app.id),
                  serverIdEnvKey: shadowEnvKey('SHADOW_SERVER_APP_SERVER', app.id),
                  permissions: grant.permissions ?? ['*'],
                })),
            )
            .filter((item) => item.appKeyEnvKey),
          ...(binding.replyPolicy ? { replyPolicy: binding.replyPolicy } : {}),
        }
      })
      .filter((account): account is NonNullable<typeof account> => Boolean(account))

    return {
      openclaw: {
        manifestPatches: [
          {
            extensionId: SHADOWOB_OPENCLAW_EXTENSION_ID,
            channelEnvVars: {
              shadowob: ['SHADOW_SERVER_URL', 'SHADOW_AGENT_TOKEN'],
            },
            channelConfigs: {
              shadowob: shadowobChannelConfigMetadata(),
            },
          },
        ],
      },
      shadowob: {
        enabled: accounts.length > 0,
        serverUrlEnvKey: 'SHADOW_SERVER_URL',
        accounts,
        defaultAccountEnvKey: accounts[0]?.tokenEnvKey,
        capabilities: shadowobChannelCapabilities(),
      },
    }
  })

  api.onValidate((context) => {
    const errors: PluginValidationError[] = []

    // Check required auth fields from manifest
    if (!context.secrets.SHADOW_SERVER_URL) {
      errors.push({
        path: 'secrets.SHADOW_SERVER_URL',
        message: 'Shadow server URL is required for shadowob channel',
        severity: 'error',
      })
    }

    // Error if bindings reference non-existent buddies
    const shadowConfig = context.agentConfig as unknown as ShadowobPluginConfig
    const buddyIds = new Set((shadowConfig.buddies ?? []).map((b) => b.id))
    const serverIds = new Set((shadowConfig.servers ?? []).map((s) => s.id))
    for (const binding of shadowConfig.bindings ?? []) {
      if (!buddyIds.has(binding.targetId)) {
        errors.push({
          path: `bindings.${binding.targetId}`,
          message: `Binding references non-existent buddy "${binding.targetId}"`,
          severity: 'error',
        })
      }
    }
    for (const app of shadowConfig.serverApps ?? []) {
      if (!serverIds.has(app.serverId)) {
        errors.push({
          path: `serverApps.${app.id}.serverId`,
          message: `Server App "${app.id}" references non-existent server "${app.serverId}"`,
          severity: 'error',
        })
      }
      if (!app.manifestUrl && !app.manifest) {
        errors.push({
          path: `serverApps.${app.id}`,
          message: `Server App "${app.id}" must provide a manifestUrl or manifest`,
          severity: 'error',
        })
      }
      for (const grant of app.grants ?? []) {
        if (!buddyIds.has(grant.buddyId)) {
          errors.push({
            path: `serverApps.${app.id}.grants.${grant.buddyId}`,
            message: `Server App "${app.id}" grants non-existent buddy "${grant.buddyId}"`,
            severity: 'error',
          })
        }
      }
    }

    return {
      valid: errors.filter((e) => e.severity === 'error').length === 0,
      errors,
    }
  })

  api.onProvision(async (context: PluginProvisionContext) => {
    // Pod-facing URL — used as runtime env var inside the agent container
    const serverUrl = context.secrets.SHADOW_SERVER_URL
    // Host-facing URL — used by cloud backend for the provisioning API calls.
    // Falls back to pod-facing URL when not provided (e.g. CLI mode where they're equal).
    const provisionUrl =
      context.secrets.SHADOW_PROVISION_URL ?? process.env.SHADOW_PROVISION_URL ?? serverUrl
    const userToken = context.secrets.SHADOW_USER_TOKEN
    context.logger.dim(
      `  shadowob: provisionUrl=${provisionUrl} tokenPresent=${Boolean(userToken)} tokenLen=${userToken?.length ?? 0}`,
    )
    if (!serverUrl || !userToken) {
      context.logger.dim(
        '  shadowob provision skipped: SHADOW_SERVER_URL / SHADOW_USER_TOKEN not set',
      )
      return { state: {} }
    }

    const result = await provisionShadowResources(context.config, {
      serverUrl: provisionUrl ?? serverUrl,
      userToken,
      dryRun: context.dryRun,
      existingState: context.previousState as {
        servers?: Record<string, string>
        channels?: Record<string, string>
        buddies?: Record<string, { agentId: string; userId: string }>
        serverApps?: Record<string, { serverAppId: string; appKey: string; serverId: string }>
        listings?: Record<string, string>
        commerce?: Record<
          string,
          {
            shopId: string
            productId: string
            offerId: string
            fileId: string
            deliverableId: string
          }
        >
        shadowServerUrl?: string
      } | null,
      logger: context.logger as import('../../utils/logger.js').Logger,
    })

    // Expose token secrets so they become env vars in the agent container
    const secrets: Record<string, string> = {
      SHADOW_SERVER_URL: serverUrl,
    }
    for (const [buddyId, { token }] of result.buddies) {
      const key = shadowobRuntimeTokenEnvKey(buddyId)
      secrets[key] = token
    }
    for (const [seedId, ids] of result.commerce) {
      secrets[shadowEnvKey('SHADOW_COMMERCE_SHOP', seedId)] = ids.shopId
      secrets[shadowEnvKey('SHADOW_COMMERCE_PRODUCT', seedId)] = ids.productId
      secrets[shadowEnvKey('SHADOW_COMMERCE_OFFER', seedId)] = ids.offerId
      secrets[shadowEnvKey('SHADOW_COMMERCE_FILE', seedId)] = ids.fileId
      secrets[shadowEnvKey('SHADOW_COMMERCE_DELIVERABLE', seedId)] = ids.deliverableId
    }
    for (const [appId, ids] of result.serverApps) {
      secrets[shadowEnvKey('SHADOW_SERVER_APP_SERVER', appId)] = ids.serverId
      secrets[shadowEnvKey('SHADOW_SERVER_APP_ID', appId)] = ids.serverAppId
      secrets[shadowEnvKey('SHADOW_SERVER_APP_KEY', appId)] = ids.appKey
    }

    return {
      state: {
        shadowServerUrl: serverUrl,
        servers: Object.fromEntries(result.servers),
        channels: Object.fromEntries(result.channels),
        buddies: Object.fromEntries(
          [...result.buddies.entries()].map(([k, v]) => [
            k,
            { agentId: v.agentId, userId: v.userId },
          ]),
        ),
        ...(result.listings.size > 0 ? { listings: Object.fromEntries(result.listings) } : {}),
        ...(result.commerce.size > 0 ? { commerce: Object.fromEntries(result.commerce) } : {}),
        ...(result.serverApps.size > 0
          ? { serverApps: Object.fromEntries(result.serverApps) }
          : {}),
      },
      secrets,
    }
  })
})
