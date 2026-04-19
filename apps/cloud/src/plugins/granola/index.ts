/**
 * Granola plugin — meeting notes, summaries, and transcripts.
 */

import { defineSkillPlugin } from '../helpers.js'
import type { PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

export default defineSkillPlugin(manifest as PluginManifest, {
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
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'granola-simple-mcp'],
    // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
    env: { GRANOLA_API_KEY: '${env:GRANOLA_API_KEY}' },
  },
})
