/**
 * Stripe plugin — skills + CLI for payment processing.
 *
 * Provides payment management, billing, invoices via:
 * - Bundled 'stripe' skill for high-level payment operations
 * - `stripe` CLI for direct API access and webhook testing
 * - MCP server as fallback for agent toolkit integration
 */

import { createSkillPlugin } from '../helpers.js'
import type { PluginDefinition, PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

const plugin: PluginDefinition = createSkillPlugin(manifest as PluginManifest, {
  skills: {
    bundled: ['stripe'],
    entries: [
      {
        id: 'stripe',
        name: 'Stripe',
        description: 'Payment processing, billing, invoices, subscriptions',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
        env: { STRIPE_SECRET_KEY: '${env:STRIPE_SECRET_KEY}' },
      },
    ],
    install: { npmPackages: ['@stripe/agent-toolkit'] },
  },
  cli: {
    tools: [
      {
        name: 'stripe',
        command: 'stripe',
        description: 'Stripe CLI — manage payments, test webhooks',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
        env: { STRIPE_API_KEY: '${env:STRIPE_SECRET_KEY}' },
      },
    ],
  },
  mcp: {
    server: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@stripe/agent-toolkit'],
      // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
      env: { STRIPE_SECRET_KEY: '${env:STRIPE_SECRET_KEY}' },
    },
  },
})

export default plugin
