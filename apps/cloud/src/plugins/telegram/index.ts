/**
 * Telegram plugin — channel integration for Telegram.
 */
import { createChannelPlugin } from '../helpers.js'
import type {
  PluginBuildContext,
  PluginConfigFragment,
  PluginDefinition,
  PluginManifest,
} from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

function buildTelegramConfig(
  agentConfig: Record<string, unknown>,
  context: PluginBuildContext,
): PluginConfigFragment {
  const allowedChats = (agentConfig.allowedChats as string[]) ?? []
  const polling = agentConfig.polling !== false

  return {
    channels: {
      telegram: {
        enabled: true,
        accounts: {
          [context.agent.id]: {
            // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
            token: '${env:TELEGRAM_BOT_TOKEN}',
            allowedChats,
            polling,
          },
        },
      },
    },
    bindings: [
      {
        agentId: context.agent.id,
        type: 'route',
        match: { channel: 'telegram', accountId: context.agent.id },
      },
    ],
  }
}

const plugin: PluginDefinition = createChannelPlugin(
  manifest as PluginManifest,
  buildTelegramConfig,
)
export default plugin
