/**
 * LINE plugin — channel integration for LINE messaging.
 */
import { createChannelPlugin } from '../helpers.js'
import type {
  PluginBuildContext,
  PluginConfigFragment,
  PluginDefinition,
  PluginManifest,
} from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

function buildLineConfig(
  agentConfig: Record<string, unknown>,
  context: PluginBuildContext,
): PluginConfigFragment {
  return {
    channels: {
      line: {
        enabled: true,
        accounts: {
          [context.agent.id]: {
            // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
            channelAccessToken: '${env:LINE_CHANNEL_ACCESS_TOKEN}',
            // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
            channelSecret: '${env:LINE_CHANNEL_SECRET}',
            replyMode: agentConfig.replyMode ?? 'reply',
          },
        },
      },
    },
    bindings: [
      {
        agentId: context.agent.id,
        type: 'route',
        match: { channel: 'line', accountId: context.agent.id },
      },
    ],
  }
}

const plugin: PluginDefinition = createChannelPlugin(manifest as PluginManifest, buildLineConfig)
export default plugin
