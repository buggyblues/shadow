/**
 * PayPal plugin — invoices, orders, payments, disputes, and subscriptions.
 */

import { defineSkillPlugin } from '../helpers.js'
import type { PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

export default defineSkillPlugin(manifest as PluginManifest, {
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
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@paypal/mcp', '--tools=all'],
    // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
    env: { PAYPAL_ACCESS_TOKEN: '${env:PAYPAL_ACCESS_TOKEN}' },
  },
})
