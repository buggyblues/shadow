/**
 * Google Chat plugin — channel integration for Google Workspace.
 */
import { createChannelPlugin } from '../helpers.js'
import type {
  PluginBuildContext,
  PluginConfigFragment,
  PluginDefinition,
  PluginManifest,
} from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

function buildGoogleChatConfig(
  agentConfig: Record<string, unknown>,
  context: PluginBuildContext,
): PluginConfigFragment {
  const spaces = (agentConfig.spaces as string[]) ?? []
  return {
    channels: {
      'google-chat': {
        enabled: true,
        accounts: {
          [context.agent.id]: {
            // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
            serviceAccountKey: '${env:GOOGLE_CHAT_SERVICE_ACCOUNT_KEY}',
            spaces,
          },
        },
      },
    },
    bindings: [
      {
        agentId: context.agent.id,
        type: 'route',
        match: { channel: 'google-chat', accountId: context.agent.id },
      },
    ],
  }
}

const plugin: PluginDefinition = createChannelPlugin(
  manifest as PluginManifest,
  buildGoogleChatConfig,
)
export default plugin
