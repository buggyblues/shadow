/**
 * Dropbox plugin — file and folder management on Dropbox.
 */

import { defineSkillPlugin } from '../helpers.js'
import type { PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

export default defineSkillPlugin(manifest as PluginManifest, {
  skills: {
    bundled: ['dropbox'],
    entries: [
      {
        id: 'dropbox',
        name: 'Dropbox',
        description: 'File/folder CRUD, upload, download, listing, and search',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
        env: { DROPBOX_ACCESS_TOKEN: '${env:DROPBOX_ACCESS_TOKEN}' },
      },
    ],
    install: { npmPackages: ['@microagents/mcp-server-dropbox'] },
  },
  mcp: {
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@microagents/mcp-server-dropbox'],
    // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
    env: { DROPBOX_ACCESS_TOKEN: '${env:DROPBOX_ACCESS_TOKEN}' },
  },
})
