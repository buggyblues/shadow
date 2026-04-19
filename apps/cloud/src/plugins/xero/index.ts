/**
 * Xero plugin — accounting, invoicing, contacts, payroll, and financial reporting.
 */

import { defineSkillPlugin } from '../helpers.js'
import type { PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

export default defineSkillPlugin(manifest as PluginManifest, {
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
})
