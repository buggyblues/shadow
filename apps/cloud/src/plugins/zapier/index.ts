/**
 * Zapier plugin — workflow automation and app integration.
 */

import { defineSkillPlugin } from '../helpers.js'
import type { PluginDefinition, PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

const plugin: PluginDefinition = defineSkillPlugin(manifest as PluginManifest, {
  skills: {
    bundled: ['zapier'],
    entries: [
      {
        id: 'zapier',
        name: 'Zapier',
        description: 'Workflow automation, action execution, app/connection management',
        env: {
          // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
          ZAPIER_CLIENT_ID: '${env:ZAPIER_CLIENT_ID}',
          // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
          ZAPIER_CLIENT_SECRET: '${env:ZAPIER_CLIENT_SECRET}',
        },
      },
    ],
    install: { npmPackages: ['@zapier/zapier-sdk-cli'] },
  },
  mcp: {
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@zapier/zapier-sdk-cli', 'mcp'],
    env: {
      // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
      ZAPIER_CLIENT_ID: '${env:ZAPIER_CLIENT_ID}',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
      ZAPIER_CLIENT_SECRET: '${env:ZAPIER_CLIENT_SECRET}',
    },
  },
})

export default plugin
