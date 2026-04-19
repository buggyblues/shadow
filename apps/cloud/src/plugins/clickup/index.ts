/**
 * ClickUp plugin — task, document, chat, and time-tracking management.
 */

import { createSkillPlugin } from '../helpers.js'
import type { PluginDefinition, PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

const plugin: PluginDefinition = createSkillPlugin(manifest as PluginManifest, {
  skills: {
    bundled: ['clickup'],
    entries: [
      {
        id: 'clickup',
        name: 'ClickUp',
        description: 'Task, document, chat, and time-tracking management',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
        env: { CLICKUP_API_TOKEN: '${env:CLICKUP_API_TOKEN}' },
      },
    ],
    install: { npmPackages: ['@taazkareem/clickup-mcp-server'] },
  },
  mcp: {
    server: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@taazkareem/clickup-mcp-server'],
      // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
      env: { CLICKUP_API_TOKEN: '${env:CLICKUP_API_TOKEN}' },
    },
  },
})

export default plugin
