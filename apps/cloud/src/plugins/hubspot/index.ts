/**
 * HubSpot plugin — CRM, marketing automation, and sales tools.
 */

import { defineSkillPlugin } from '../helpers.js'
import type { PluginDefinition, PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

const plugin: PluginDefinition = defineSkillPlugin(manifest as PluginManifest, {
  skills: {
    bundled: ['hubspot'],
    entries: [
      {
        id: 'hubspot',
        name: 'HubSpot',
        description: 'CRM, marketing automation, and sales tools',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
        env: { HUBSPOT_ACCESS_TOKEN: '${env:HUBSPOT_ACCESS_TOKEN}' },
      },
    ],
    install: { npmPackages: ['@hubspot/mcp-server'] },
  },
  mcp: {
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@hubspot/mcp-server'],
    // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
    env: { PRIVATE_APP_ACCESS_TOKEN: '${env:HUBSPOT_ACCESS_TOKEN}' },
  },
})

export default plugin
