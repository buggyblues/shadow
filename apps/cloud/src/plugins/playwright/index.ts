/**
 * Playwright plugin — browser automation via @playwright/mcp.
 */

import { defineSkillPlugin } from '../helpers.js'
import type { PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

export default defineSkillPlugin(manifest as PluginManifest, {
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
  cli: [
    {
      name: 'playwright',
      command: 'playwright',
      description: 'Playwright CLI — run tests, codegen, trace viewer',
    },
  ],
  mcp: {
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@playwright/mcp'],
  },
})
