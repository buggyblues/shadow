/**
 * Make plugin — Visual workflow automation (formerly Integromat).
 */

import { createSkillPlugin } from '../helpers.js'
import type { PluginDefinition, PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

const plugin: PluginDefinition = createSkillPlugin(manifest as PluginManifest, {
  skills: {
    bundled: ['make'],
    entries: [
      {
        id: 'make',
        name: 'Make',
        description: 'Trigger scenarios, manage organizations, connect 1,500+ apps',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
        env: { MAKE_API_TOKEN: '${env:MAKE_API_TOKEN}' },
      },
    ],
  },
})

export default plugin
