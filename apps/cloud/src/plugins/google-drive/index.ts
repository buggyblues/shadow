/**
 * Google Drive plugin — file listing, reading, and search over Google Drive.
 */

import { defineSkillPlugin } from '../helpers.js'
import type { PluginDefinition, PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

const plugin: PluginDefinition = defineSkillPlugin(manifest as PluginManifest, {
  skills: {
    bundled: ['google-drive'],
    entries: [
      {
        id: 'google-drive',
        name: 'Google Drive',
        description: 'File listing, reading, and search over Google Drive',
        env: {
          // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
          GOOGLE_CLIENT_ID: '${env:GOOGLE_CLIENT_ID}',
          // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
          GOOGLE_CLIENT_SECRET: '${env:GOOGLE_CLIENT_SECRET}',
          // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
          GOOGLE_REFRESH_TOKEN: '${env:GOOGLE_REFRESH_TOKEN}',
        },
      },
    ],
    install: { npmPackages: ['@modelcontextprotocol/server-gdrive'] },
  },
  mcp: {
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-gdrive'],
    env: {
      // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
      GDRIVE_CLIENT_ID: '${env:GOOGLE_CLIENT_ID}',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
      GDRIVE_CLIENT_SECRET: '${env:GOOGLE_CLIENT_SECRET}',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
      GDRIVE_REFRESH_TOKEN: '${env:GOOGLE_REFRESH_TOKEN}',
    },
  },
})

export default plugin
