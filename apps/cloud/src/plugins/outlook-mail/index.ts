/**
 * Outlook Mail plugin — channel integration for Microsoft email.
 */
import { createChannelPlugin } from '../helpers.js'
import type {
  PluginBuildContext,
  PluginConfigFragment,
  PluginDefinition,
  PluginManifest,
} from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

function buildOutlookMailConfig(
  agentConfig: Record<string, unknown>,
  context: PluginBuildContext,
): PluginConfigFragment {
  const folders = (agentConfig.folders as string[]) ?? ['Inbox']
  return {
    channels: {
      'outlook-mail': {
        enabled: true,
        accounts: {
          [context.agent.id]: {
            // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
            clientId: '${env:OUTLOOK_CLIENT_ID}',
            // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
            clientSecret: '${env:OUTLOOK_CLIENT_SECRET}',
            // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
            tenantId: '${env:OUTLOOK_TENANT_ID}',
            folders,
          },
        },
      },
    },
    bindings: [
      {
        agentId: context.agent.id,
        type: 'route',
        match: { channel: 'outlook-mail', accountId: context.agent.id },
      },
    ],
  }
}

const plugin: PluginDefinition = createChannelPlugin(
  manifest as PluginManifest,
  buildOutlookMailConfig,
)
export default plugin
