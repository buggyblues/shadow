/**
 * Telegram plugin — channel integration for Telegram.
 */
import { defineChannelPlugin } from '../helpers.js'
import type { PluginBuildContext, PluginConfigFragment, PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

function buildTelegramConfig(context: PluginBuildContext): PluginConfigFragment {
  const { agentConfig } = context
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

export default defineChannelPlugin(manifest as PluginManifest, buildTelegramConfig)
