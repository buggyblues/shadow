/**
 * Mailchimp plugin — email marketing campaigns, lists, automations, and analytics.
 */

import { createSkillPlugin } from '../helpers.js'
import type { PluginDefinition, PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

const plugin: PluginDefinition = createSkillPlugin(manifest as PluginManifest, {
  skills: {
    bundled: ['mailchimp'],
    entries: [
      {
        id: 'mailchimp',
        name: 'Mailchimp',
        description: 'Email marketing campaigns, lists, automations, and analytics',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
        env: { MAILCHIMP_API_KEY: '${env:MAILCHIMP_API_KEY}' },
      },
    ],
    install: { npmPackages: ['@agentx-ai/mailchimp-mcp-server'] },
  },
  mcp: {
    server: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@agentx-ai/mailchimp-mcp-server'],
      // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
      env: { MAILCHIMP_API_KEY: '${env:MAILCHIMP_API_KEY}' },
    },
  },
})

export default plugin
