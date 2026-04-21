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
  replyPolicy?: {
    mode: string
    custom?: Record<string, unknown>
  }
}

interface ShadowobPluginConfig {
  buddies?: ShadowBuddy[]
  bindings?: ShadowBinding[]
  servers?: Array<{ url: string }>
}

function buildShadowConfig(context: PluginBuildContext): PluginConfigFragment {
  const agentConfig = context.agentConfig
  const shadowConfig = agentConfig as unknown as ShadowobPluginConfig
  const bindings = shadowConfig.bindings?.filter((b) => b.agentId === context.agent.id) ?? []
  // Always emit channel config — disabled fallback ensures the always-installed
  // openclaw-shadowob extension passes OpenClaw config validation.
  if (bindings.length === 0) return { channels: { shadowob: { enabled: false } } }

  const accounts: Record<string, Record<string, unknown>> = {}
  const configBindings: Array<Record<string, unknown>> = []

  for (const binding of bindings) {
    const buddy = shadowConfig.buddies?.find((b) => b.id === binding.targetId)
    if (!buddy) continue

    const account: Record<string, unknown> = {
      token: `\${env:SHADOW_TOKEN_${binding.targetId.toUpperCase().replace(/-/g, '_')}}`,
      // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
      serverUrl: '${env:SHADOW_SERVER_URL}',
      enabled: true,
      buddyName: buddy.name,
      ...(buddy.description ? { buddyDescription: buddy.description } : {}),
      ...(buddy.id ? { buddyId: buddy.id } : {}),
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
    channels: { shadowob: { enabled: true, accounts } },
    bindings: configBindings,
  }
}

export default defineChannelPlugin(manifest as PluginManifest, buildShadowConfig, (api) => {
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
    for (const binding of shadowConfig.bindings ?? []) {
      if (!buddyIds.has(binding.targetId)) {
        errors.push({
          path: `bindings.${binding.targetId}`,
          message: `Binding references non-existent buddy "${binding.targetId}"`,
          severity: 'error',
        })
      }
    }

    return {
      valid: errors.filter((e) => e.severity === 'error').length === 0,
      errors,
    }
  })

  api.onProvision(async (context: PluginProvisionContext) => {
    const serverUrl = context.secrets.SHADOW_SERVER_URL
    const userToken = context.secrets.SHADOW_USER_TOKEN
    if (!serverUrl || !userToken) {
      context.logger.dim(
        '  shadowob provision skipped: SHADOW_SERVER_URL / SHADOW_USER_TOKEN not set',
      )
      return { state: {} }
    }

    const result = await provisionShadowResources(context.config, {
      serverUrl,
      userToken,
      dryRun: context.dryRun,
      existingState: context.previousState as {
        servers?: Record<string, string>
        channels?: Record<string, string>
        buddies?: Record<string, { agentId: string; userId: string; token: string }>
        listings?: Record<string, string>
        shadowServerUrl?: string
      } | null,
      logger: context.logger as import('../../utils/logger.js').Logger,
    })

    // Expose token secrets so they become env vars in the agent container
    const secrets: Record<string, string> = {
      SHADOW_SERVER_URL: serverUrl,
    }
    for (const [buddyId, { token }] of result.buddies) {
      const key = `SHADOW_TOKEN_${buddyId.toUpperCase().replace(/-/g, '_')}`
      secrets[key] = token
    }

    return {
      state: {
        shadowServerUrl: serverUrl,
        servers: Object.fromEntries(result.servers),
        channels: Object.fromEntries(result.channels),
        buddies: Object.fromEntries(
          [...result.buddies.entries()].map(([k, v]) => [
            k,
            { agentId: v.agentId, userId: v.userId, token: v.token },
          ]),
        ),
        ...(result.listings.size > 0 ? { listings: Object.fromEntries(result.listings) } : {}),
      },
      secrets,
    }
  })
})
