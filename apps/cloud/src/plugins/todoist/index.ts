/**
 * Todoist plugin — task management, projects, labels, and filters.
 */

import { defineSkillPlugin } from '../helpers.js'
import type { PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

export default defineSkillPlugin(manifest as PluginManifest, {
  skills: {
    bundled: ['todoist'],
    entries: [
      {
        id: 'todoist',
        name: 'Todoist',
        description: 'Task CRUD, project management, labels, filters, and bulk operations',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
        env: { TODOIST_API_TOKEN: '${env:TODOIST_API_TOKEN}' },
      },
    ],
    install: { npmPackages: ['@greirson/mcp-todoist'] },
  },
  mcp: {
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@greirson/mcp-todoist'],
    // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
    env: { TODOIST_API_TOKEN: '${env:TODOIST_API_TOKEN}' },
  },
})
