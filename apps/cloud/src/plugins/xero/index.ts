/**
 * Xero plugin — accounting, invoicing, contacts, payroll, and financial reporting.
 */

import { createSkillPlugin } from '../helpers.js'
import type { PluginDefinition, PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

const plugin: PluginDefinition = createSkillPlugin(manifest as PluginManifest, {
  skills: {
    bundled: ['xero'],
    entries: [
      {
        id: 'xero',
        name: 'Xero',
        description: 'Accounting, invoicing, contacts, payroll, and financial reporting',
        env: {
          // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
          XERO_CLIENT_ID: '${env:XERO_CLIENT_ID}',
          // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
          XERO_CLIENT_SECRET: '${env:XERO_CLIENT_SECRET}',
        },
      },
    ],
    install: { npmPackages: ['@xeroapi/xero-mcp-server'] },
  },
  mcp: {
    server: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@xeroapi/xero-mcp-server@latest'],
      env: {
        // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
        XERO_CLIENT_ID: '${env:XERO_CLIENT_ID}',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
        XERO_CLIENT_SECRET: '${env:XERO_CLIENT_SECRET}',
      },
    },
  },
})

export default plugin
