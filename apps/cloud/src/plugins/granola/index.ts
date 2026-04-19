/**
 * Granola plugin — meeting notes, summaries, and transcripts.
 */

import { createSkillPlugin } from '../helpers.js'
import type { PluginDefinition, PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

const plugin: PluginDefinition = createSkillPlugin(manifest as PluginManifest, {
  skills: {
    bundled: ['meeting-notes'],
    entries: [
      {
        id: 'meeting-notes',
        name: 'Granola',
        description: 'Meeting notes, summaries, and transcripts from Granola',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
        env: { GRANOLA_API_KEY: '${env:GRANOLA_API_KEY}' },
      },
    ],
    install: { npmPackages: ['granola-simple-mcp'] },
  },
  mcp: {
    server: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', 'granola-simple-mcp'],
      // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
      env: { GRANOLA_API_KEY: '${env:GRANOLA_API_KEY}' },
    },
  },
})

export default plugin
