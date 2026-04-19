/**
 * Close plugin — Sales CRM via Close REST API.
 */

import { defineSkillPlugin } from '../helpers.js'
import type { PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

export default defineSkillPlugin(manifest as PluginManifest, {
  skills: {
    bundled: ['close-crm'],
    entries: [
      {
        id: 'close-crm',
        name: 'Close',
        description: 'Leads, contacts, activities, sequences, pipeline management',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
        env: { CLOSE_API_KEY: '${env:CLOSE_API_KEY}' },
      },
    ],
  },
})
