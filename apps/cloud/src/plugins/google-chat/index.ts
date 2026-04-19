/**
 * Google Chat plugin — channel integration for Google Workspace.
 */
import { defineChannelPlugin } from '../helpers.js'
import type { PluginBuildContext, PluginConfigFragment, PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

function buildGoogleChatConfig(context: PluginBuildContext): PluginConfigFragment {
  const { agentConfig } = context
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

export default defineChannelPlugin(manifest as PluginManifest, buildGoogleChatConfig)
