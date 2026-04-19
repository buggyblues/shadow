/**
 * monday.com plugin — board, item, column, group, and update management.
 */

import { defineSkillPlugin } from '../helpers.js'
import type { PluginDefinition, PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

const plugin: PluginDefinition = defineSkillPlugin(manifest as PluginManifest, {
  skills: {
    bundled: ['monday'],
    entries: [
      {
        id: 'monday',
        name: 'monday.com',
        description: 'Board, item, column, group, and update management',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
        env: { MONDAY_API_TOKEN: '${env:MONDAY_API_TOKEN}' },
      },
    ],
    install: { npmPackages: ['@mondaydotcomorg/monday-api-mcp'] },
  },
  mcp: {
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@mondaydotcomorg/monday-api-mcp'],
    // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
    env: { MONDAY_API_TOKEN: '${env:MONDAY_API_TOKEN}' },
  },
})

export default plugin
