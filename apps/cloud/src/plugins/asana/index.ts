/**
 * Asana plugin — project and task management with Asana.
 */

import { defineSkillPlugin } from '../helpers.js'
import type { PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

export default defineSkillPlugin(manifest as PluginManifest, {
  skills: {
    bundled: ['asana'],
    entries: [
      {
        id: 'asana',
        name: 'Asana',
        description: 'Workspace, project, task, comment, section, and tag management',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
        env: { ASANA_ACCESS_TOKEN: '${env:ASANA_ACCESS_TOKEN}' },
      },
    ],
    install: { npmPackages: ['@roychri/mcp-server-asana'] },
  },
  mcp: {
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@roychri/mcp-server-asana'],
    // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
    env: { ASANA_ACCESS_TOKEN: '${env:ASANA_ACCESS_TOKEN}' },
  },
})
