/**
 * Jotform plugin — Online form builder and data collection.
 */

import { defineSkillPlugin } from '../helpers.js'
import type { PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

export default defineSkillPlugin(manifest as PluginManifest, {
  skills: {
    bundled: ['jotform'],
    entries: [
      {
        id: 'jotform',
        name: 'Jotform',
        description: 'Access forms, submissions, reports, webhooks',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
        env: { JOTFORM_API_KEY: '${env:JOTFORM_API_KEY}' },
      },
    ],
  },
})
