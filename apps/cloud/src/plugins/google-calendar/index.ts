/**
 * Google Calendar plugin — calendar listing, event CRUD, and scheduling.
 */

import { createSkillPlugin } from '../helpers.js'
import type { PluginDefinition, PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

const plugin: PluginDefinition = createSkillPlugin(manifest as PluginManifest, {
  skills: {
    bundled: ['google-calendar'],
    entries: [
      {
        id: 'google-calendar',
        name: 'Google Calendar',
        description: 'Calendar listing, event CRUD operations, scheduling',
        env: {
          // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
          GOOGLE_CALENDAR_CREDENTIALS: '${env:GOOGLE_CALENDAR_CREDENTIALS}',
        },
      },
    ],
    install: { npmPackages: ['mcp-google-calendar'] },
  },
  mcp: {
    server: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', 'mcp-google-calendar'],
      env: {
        // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
        GOOGLE_CLIENT_ID: '${env:GOOGLE_CALENDAR_CLIENT_ID}',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
        GOOGLE_CLIENT_SECRET: '${env:GOOGLE_CALENDAR_CLIENT_SECRET}',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
        GOOGLE_REFRESH_TOKEN: '${env:GOOGLE_CALENDAR_REFRESH_TOKEN}',
      },
    },
  },
})

export default plugin
