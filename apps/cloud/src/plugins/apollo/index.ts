/**
 * Apollo.io plugin — Sales intelligence via Apollo API.
 */

import { defineSkillPlugin } from '../helpers.js'
import type { PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

export default defineSkillPlugin(manifest as PluginManifest, {
  skills: {
    bundled: ['apollo'],
    entries: [
      {
        id: 'apollo',
        name: 'Apollo.io',
        description: 'People search, contact enrichment, sequences, deals',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
        env: { APOLLO_API_KEY: '${env:APOLLO_API_KEY}' },
      },
    ],
  },
  mcp: {
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'apollo-mcp'],
    // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
    env: { APOLLO_API_KEY: '${env:APOLLO_API_KEY}' },
  },
})
