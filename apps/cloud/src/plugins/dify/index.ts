/**
 * Dify plugin — AI workflow and application platform.
 */

import { createSkillPlugin } from '../helpers.js'
import type { PluginDefinition, PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

const plugin: PluginDefinition = createSkillPlugin(manifest as PluginManifest, {
  skills: {
    bundled: ['dify'],
    entries: [
      {
        id: 'dify',
        name: 'Dify',
        description: 'Orchestrate LLM apps, knowledge bases, agent workflows',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
        env: { DIFY_API_KEY: '${env:DIFY_API_KEY}' },
      },
    ],
  },
})

export default plugin
