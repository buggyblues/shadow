/**
 * Dropbox plugin — file and folder management on Dropbox.
 */

import { createSkillPlugin } from '../helpers.js'
import type { PluginDefinition, PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

const plugin: PluginDefinition = createSkillPlugin(manifest as PluginManifest, {
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
    server: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@microagents/mcp-server-dropbox'],
      // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
      env: { DROPBOX_ACCESS_TOKEN: '${env:DROPBOX_ACCESS_TOKEN}' },
    },
  },
})

export default plugin
