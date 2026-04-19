/**
 * Intercom plugin — channel integration for customer support.
 */
import { defineChannelPlugin } from '../helpers.js'
import type {
  PluginBuildContext,
  PluginConfigFragment,
  PluginDefinition,
  PluginManifest,
} from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

function buildIntercomConfig(context: PluginBuildContext): PluginConfigFragment {
  const { agentConfig } = context
  return {
    channels: {
      intercom: {
        enabled: true,
        accounts: {
          [context.agent.id]: {
            // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
            accessToken: '${env:INTERCOM_ACCESS_TOKEN}',
            enableInbox: agentConfig.enableInbox !== false,
            autoAssign: agentConfig.autoAssign === true,
          },
        },
      },
    },
    bindings: [
      {
        agentId: context.agent.id,
        type: 'route',
        match: { channel: 'intercom', accountId: context.agent.id },
      },
    ],
  }
}

const plugin: PluginDefinition = defineChannelPlugin(
  manifest as PluginManifest,
  buildIntercomConfig,
)
export default plugin
