/**
 * Playwright plugin — browser automation via @playwright/mcp.
 */

import { createSkillPlugin } from '../helpers.js'
import type { PluginDefinition, PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

const plugin: PluginDefinition = createSkillPlugin(manifest as PluginManifest, {
  skills: {
    bundled: ['browser'],
    entries: [
      {
        id: 'playwright',
        name: 'Playwright',
        description: 'Browser automation through structured accessibility snapshots',
      },
    ],
    install: { npmPackages: ['@playwright/mcp'] },
  },
  cli: {
    tools: [
      {
        name: 'playwright',
        command: 'playwright',
        description: 'Playwright CLI — run tests, codegen, trace viewer',
      },
    ],
  },
  mcp: {
    server: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@playwright/mcp'],
    },
  },
})

export default plugin
