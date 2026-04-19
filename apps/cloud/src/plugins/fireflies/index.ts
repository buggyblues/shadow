/**
 * Fireflies.ai plugin — Meeting transcription via Fireflies GraphQL API.
 */

import { defineSkillPlugin } from '../helpers.js'
import type { PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

export default defineSkillPlugin(manifest as PluginManifest, {
  skills: {
    bundled: ['fireflies'],
    entries: [
      {
        id: 'fireflies',
        name: 'Fireflies.ai',
        description: 'Meeting transcript search, summaries, action item extraction',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
        env: { FIREFLIES_API_KEY: '${env:FIREFLIES_API_KEY}' },
      },
    ],
  },
})
