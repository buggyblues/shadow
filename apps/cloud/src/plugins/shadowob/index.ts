/**
 * Shadow Chat Platform plugin — connects agents to Shadow buddies.
 *
 * Builds OpenClaw channel config for the shadowob messaging platform,
 * mapping agent deployments to buddy accounts with routing and reply policies.
 */

import { createChannelPlugin } from '../helpers.js'
import type {
  PluginBuildContext,
  PluginConfigFragment,
  PluginDefinition,
  PluginManifest,
  PluginValidationError,
} from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

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

function buildShadowConfig(
  agentConfig: Record<string, unknown>,
  context: PluginBuildContext,
): PluginConfigFragment {
  const shadowConfig = agentConfig as unknown as ShadowobPluginConfig
  const bindings = shadowConfig.bindings?.filter((b) => b.agentId === context.agent.id) ?? []
  if (bindings.length === 0) return {}

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

const basePlugin = createChannelPlugin(manifest as PluginManifest, buildShadowConfig)

// Override validation with custom buddy/binding checks
const plugin: PluginDefinition = {
  ...basePlugin,
  validation: {
    validate(agentConfig: Record<string, unknown>, context: PluginBuildContext) {
      // Run base validation first (checks required auth fields)
      const baseResult = basePlugin.validation!.validate(agentConfig, context)
      const errors: PluginValidationError[] = [...baseResult.errors]

      // Custom: warn if SHADOW_SERVER_URL is missing
      if (!context.secrets.SHADOW_SERVER_URL) {
        errors.push({
          path: 'secrets.SHADOW_SERVER_URL',
          message: 'Shadow server URL is required for shadowob channel',
          severity: 'warning',
        })
      }

      // Custom: error if bindings reference non-existent buddies
      const shadowConfig = agentConfig as unknown as ShadowobPluginConfig
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
    },
  },
}

export default plugin
