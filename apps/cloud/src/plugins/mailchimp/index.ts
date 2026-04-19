/**
 * Mailchimp plugin — email marketing campaigns, lists, automations, and analytics.
 */

import { defineSkillPlugin } from '../helpers.js'
import type { PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

export default defineSkillPlugin(manifest as PluginManifest, {
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
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@agentx-ai/mailchimp-mcp-server'],
    // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
    env: { MAILCHIMP_API_KEY: '${env:MAILCHIMP_API_KEY}' },
  },
})
