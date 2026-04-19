/**
 * Outlook Calendar plugin — calendar, email, contacts, and tasks via Microsoft Graph API.
 */

import { createSkillPlugin } from '../helpers.js'
import type { PluginDefinition, PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

const plugin: PluginDefinition = createSkillPlugin(manifest as PluginManifest, {
  skills: {
    bundled: ['outlook-calendar'],
    entries: [
      {
        id: 'outlook-calendar',
        name: 'Outlook Calendar',
        description: 'Calendar management, email, contacts, and tasks via Microsoft Graph API',
        env: {
          // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
          MS_CLIENT_ID: '${env:MS_CLIENT_ID}',
          // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
          MS_CLIENT_SECRET: '${env:MS_CLIENT_SECRET}',
        },
      },
    ],
    install: { npmPackages: ['outlook-mcp'] },
  },
  mcp: {
    server: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', 'outlook-mcp'],
      env: {
        // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
        MS_CLIENT_ID: '${env:MS_CLIENT_ID}',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
        MS_CLIENT_SECRET: '${env:MS_CLIENT_SECRET}',
      },
    },
  },
})

export default plugin
