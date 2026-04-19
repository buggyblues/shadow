/**
 * Airtable plugin — spreadsheet-database management via Airtable.
 */

import { createSkillPlugin } from '../helpers.js'
import type { PluginDefinition, PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

const plugin: PluginDefinition = createSkillPlugin(manifest as PluginManifest, {
  skills: {
    bundled: ['airtable'],
    entries: [
      {
        id: 'airtable',
        name: 'Airtable',
        description: 'Base/table listing, record CRUD, search, schema management, and comments',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
        env: { AIRTABLE_API_KEY: '${env:AIRTABLE_API_KEY}' },
      },
    ],
    install: { npmPackages: ['airtable-mcp-server'] },
  },
  mcp: {
    server: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', 'airtable-mcp-server'],
      // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
      env: { AIRTABLE_API_KEY: '${env:AIRTABLE_API_KEY}' },
    },
  },
})

export default plugin
