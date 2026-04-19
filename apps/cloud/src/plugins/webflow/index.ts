/**
 * Webflow plugin — Site management via official Webflow MCP server.
 */

import { defineSkillPlugin } from '../helpers.js'
import type { PluginDefinition, PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

const plugin: PluginDefinition = defineSkillPlugin(manifest as PluginManifest, {
  skills: {
    bundled: ['webflow'],
    entries: [
      {
        id: 'webflow',
        name: 'Webflow',
        description: 'Site management, CMS collections, page content, assets, forms',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
        env: { WEBFLOW_TOKEN: '${env:WEBFLOW_TOKEN}' },
      },
    ],
  },
  mcp: {
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'webflow-mcp-server@latest'],
    // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
    env: { WEBFLOW_TOKEN: '${env:WEBFLOW_TOKEN}' },
  },
})

export default plugin
