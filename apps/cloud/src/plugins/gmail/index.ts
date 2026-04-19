/**
 * Gmail plugin — channel integration for email via Gmail.
 */
import { createChannelPlugin } from '../helpers.js'
import type {
  PluginBuildContext,
  PluginConfigFragment,
  PluginDefinition,
  PluginManifest,
} from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

function buildGmailConfig(
  agentConfig: Record<string, unknown>,
  context: PluginBuildContext,
): PluginConfigFragment {
  const labels = (agentConfig.labels as string[]) ?? ['INBOX']
  return {
    channels: {
      gmail: {
        enabled: true,
        accounts: {
          [context.agent.id]: {
            // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
            clientId: '${env:GMAIL_CLIENT_ID}',
            // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
            clientSecret: '${env:GMAIL_CLIENT_SECRET}',
            // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
            refreshToken: '${env:GMAIL_REFRESH_TOKEN}',
            labels,
            pollInterval: agentConfig.pollInterval ?? 60,
          },
        },
      },
    },
    bindings: [
      {
        agentId: context.agent.id,
        type: 'route',
        match: { channel: 'gmail', accountId: context.agent.id },
      },
    ],
  }
}

const plugin: PluginDefinition = createChannelPlugin(manifest as PluginManifest, buildGmailConfig)
export default plugin
