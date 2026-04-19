/**
 * Explorium plugin — Business data enrichment via Explorium's remote MCP server.
 */

import { defineSkillPlugin } from '../helpers.js'
import type { PluginDefinition, PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

const plugin: PluginDefinition = defineSkillPlugin(manifest as PluginManifest, {
  skills: {
    bundled: ['explorium'],
    entries: [
      {
        id: 'explorium',
        name: 'Explorium',
        description: 'Business data enrichment, company search, contact discovery',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
        env: { EXPLORIUM_API_KEY: '${env:EXPLORIUM_API_KEY}' },
      },
    ],
  },
  mcp: {
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'mcp-remote', 'https://mcp.explorium.ai/mcp'],
    // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
    env: { API_ACCESS_TOKEN: '${env:EXPLORIUM_API_KEY}' },
  },
})

export default plugin
