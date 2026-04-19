/**
 * RevenueCat plugin — in-app subscription management.
 */

import { defineSkillPlugin } from '../helpers.js'
import type { PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

export default defineSkillPlugin(manifest as PluginManifest, {
  skills: {
    bundled: ['revenucat'],
    entries: [
      {
        id: 'revenucat',
        name: 'RevenueCat',
        description: 'Offerings, products, entitlements, packages, and price experiments',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
        env: { REVENUECAT_SECRET_KEY: '${env:REVENUECAT_SECRET_KEY}' },
      },
    ],
    install: { npmPackages: ['revenuecat-mcp'] },
  },
  mcp: {
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'revenuecat-mcp'],
    // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
    env: { REVENUECAT_SECRET_KEY: '${env:REVENUECAT_SECRET_KEY}' },
  },
})
