/**
 * Serena plugin — semantic code analysis, symbol navigation, and code search.
 */

import { createSkillPlugin } from '../helpers.js'
import type { PluginDefinition, PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

const plugin: PluginDefinition = createSkillPlugin(manifest as PluginManifest, {
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
    server: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', 'serena', '/workspace'],
    },
  },
})

export default plugin
