/**
 * Outlook Mail plugin — channel integration for Microsoft email.
 */
import { defineChannelPlugin } from '../helpers.js'
import type { PluginBuildContext, PluginConfigFragment, PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

function buildOutlookMailConfig(context: PluginBuildContext): PluginConfigFragment {
  const { agentConfig } = context
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

export default defineChannelPlugin(manifest as PluginManifest, buildOutlookMailConfig)
