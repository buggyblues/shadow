/**
 * Slack plugin — channel integration for messaging.
 *
 * Configures Slack as an OpenClaw communication channel with
 * per-agent account binding and message routing.
 */

import { createChannelPlugin } from '../helpers.js'
import type {
  PluginBuildContext,
  PluginConfigFragment,
  PluginDefinition,
  PluginManifest,
} from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

function buildSlackConfig(context: PluginBuildContext): PluginConfigFragment {
  const { agentConfig } = context
  const channels = (agentConfig.channels as string[]) ?? []
  const mentionOnly = agentConfig.mentionOnly !== false

  return {
    channels: {
      slack: {
        enabled: true,
        accounts: {
          [context.agent.id]: {
            // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
            token: '${env:SLACK_BOT_TOKEN}',
            channels,
            mentionOnly,
            ...(agentConfig.defaultChannel ? { defaultChannel: agentConfig.defaultChannel } : {}),
          },
        },
      },
    },
    bindings: [
      {
        agentId: context.agent.id,
        type: 'route',
        match: { channel: 'slack', accountId: context.agent.id },
      },
    ],
  }
}

const plugin: PluginDefinition = {
  ...createChannelPlugin(manifest as PluginManifest, buildSlackConfig),
  async healthCheck(context) {
    const token = context.secrets.SLACK_BOT_TOKEN
    if (!token) {
      return { healthy: false, message: 'SLACK_BOT_TOKEN not configured' }
    }
    try {
      const res = await fetch('https://slack.com/api/auth.test', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      })
      if (res.ok) {
        const data = (await res.json()) as {
          ok: boolean
          user?: string
          team?: string
          error?: string
        }
        if (data.ok) {
          return { healthy: true, message: `Connected as ${data.user} in ${data.team}` }
        }
        return { healthy: false, message: `Slack auth failed: ${data.error}` }
      }
      return { healthy: false, message: `Slack API returned ${res.status}` }
    } catch (err) {
      return { healthy: false, message: `Slack API unreachable: ${err}` }
    }
  },
}

export default plugin
