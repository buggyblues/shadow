/**
 * ZoomInfo plugin — B2B data enrichment via ZoomInfo REST API.
 */

import { defineSkillPlugin } from '../helpers.js'
import type { PluginDefinition, PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

const plugin: PluginDefinition = defineSkillPlugin(manifest as PluginManifest, {
  skills: {
    bundled: ['zoominfo'],
    entries: [
      {
        id: 'zoominfo',
        name: 'ZoomInfo',
        description: 'B2B contact and company data enrichment, search, intent signals',
        env: {
          // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
          ZOOMINFO_CLIENT_ID: '${env:ZOOMINFO_CLIENT_ID}',
          // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
          ZOOMINFO_PRIVATE_KEY: '${env:ZOOMINFO_PRIVATE_KEY}',
        },
      },
    ],
  },
})

export default plugin
