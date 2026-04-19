/**
 * PayPal plugin — invoices, orders, payments, disputes, and subscriptions.
 */

import { createSkillPlugin } from '../helpers.js'
import type { PluginDefinition, PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

const plugin: PluginDefinition = createSkillPlugin(manifest as PluginManifest, {
  skills: {
    bundled: ['paypal'],
    entries: [
      {
        id: 'paypal',
        name: 'PayPal',
        description: 'Invoices, orders, payments, disputes, subscriptions, and catalog management',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
        env: { PAYPAL_ACCESS_TOKEN: '${env:PAYPAL_ACCESS_TOKEN}' },
      },
    ],
    install: { npmPackages: ['@paypal/mcp'] },
  },
  mcp: {
    server: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@paypal/mcp', '--tools=all'],
      // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
      env: { PAYPAL_ACCESS_TOKEN: '${env:PAYPAL_ACCESS_TOKEN}' },
    },
  },
})

export default plugin
