/**
 * Linear plugin — issue tracking and project management via Linear.
 */

import { createSkillPlugin } from '../helpers.js'
import type { PluginDefinition, PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

const plugin: PluginDefinition = createSkillPlugin(manifest as PluginManifest, {
  skills: {
    bundled: ['linear'],
    entries: [
      {
        id: 'linear',
        name: 'Linear',
        description: 'Issue tracking, project management, team and cycle operations',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
        env: { LINEAR_API_KEY: '${env:LINEAR_API_KEY}' },
      },
    ],
    install: { npmPackages: ['linear-mcp-server'] },
  },
  mcp: {
    server: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', 'linear-mcp-server'],
      // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
      env: { LINEAR_API_KEY: '${env:LINEAR_API_KEY}' },
    },
  },
})

export default plugin
