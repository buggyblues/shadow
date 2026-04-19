/**
 * Serena plugin — semantic code analysis, symbol navigation, and code search.
 */

import { defineSkillPlugin } from '../helpers.js'
import type { PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

export default defineSkillPlugin(manifest as PluginManifest, {
  skills: {
    bundled: ['code-analysis'],
    entries: [
      {
        id: 'serena',
        name: 'Serena',
        description: 'Semantic code analysis, symbol navigation, code search',
      },
    ],
    install: { npmPackages: ['serena'] },
  },
  mcp: {
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'serena', '/workspace'],
  },
})
