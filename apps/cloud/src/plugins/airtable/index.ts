/**
 * Airtable plugin — spreadsheet-database management via Airtable.
 */

import { defineSkillPlugin } from '../helpers.js'
import type { PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

export default defineSkillPlugin(manifest as PluginManifest, {
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
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'airtable-mcp-server'],
    // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
    env: { AIRTABLE_API_KEY: '${env:AIRTABLE_API_KEY}' },
  },
})
