/**
 * n8n plugin — workflow automation, execution triggering, and credential operations.
 */

import { defineSkillPlugin } from '../helpers.js'
import type { PluginDefinition, PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

const plugin: PluginDefinition = defineSkillPlugin(manifest as PluginManifest, {
  skills: {
    bundled: ['n8n'],
    entries: [
      {
        id: 'n8n',
        name: 'n8n',
        description: 'Workflow management, execution triggering, and credential operations',
        env: {
          // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
          N8N_API_KEY: '${env:N8N_API_KEY}',
          // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
          N8N_BASE_URL: '${env:N8N_BASE_URL}',
        },
      },
    ],
    install: { npmPackages: ['@leonardsellem/n8n-mcp-server'] },
  },
  mcp: {
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@leonardsellem/n8n-mcp-server'],
    env: {
      // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
      N8N_API_KEY: '${env:N8N_API_KEY}',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
      N8N_BASE_URL: '${env:N8N_BASE_URL}',
    },
  },
})

export default plugin
