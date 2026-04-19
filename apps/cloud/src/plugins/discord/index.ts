/**
 * Discord plugin — channel integration for Discord servers.
 */
import { createChannelPlugin } from '../helpers.js'
import type {
  PluginBuildContext,
  PluginConfigFragment,
  PluginDefinition,
  PluginManifest,
} from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

function buildDiscordConfig(
  agentConfig: Record<string, unknown>,
  context: PluginBuildContext,
): PluginConfigFragment {
  const channels = (agentConfig.channels as string[]) ?? []
  const mentionOnly = agentConfig.mentionOnly !== false

  return {
    channels: {
      discord: {
        enabled: true,
        accounts: {
          [context.agent.id]: {
            // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
            token: '${env:DISCORD_BOT_TOKEN}',
            // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
            applicationId: '${env:DISCORD_APPLICATION_ID}',
            guildId: agentConfig.guildId ?? '',
            channels,
            mentionOnly,
          },
        },
      },
    },
    bindings: [
      {
        agentId: context.agent.id,
        type: 'route',
        match: { channel: 'discord', accountId: context.agent.id },
      },
    ],
  }
}

const plugin: PluginDefinition = createChannelPlugin(manifest as PluginManifest, buildDiscordConfig)
export default plugin
