/**
 * tl;dv plugin — meeting listing, transcripts, and AI-generated highlights.
 */

import { createSkillPlugin } from '../helpers.js'
import type { PluginDefinition, PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

const plugin: PluginDefinition = createSkillPlugin(manifest as PluginManifest, {
  skills: {
    bundled: ['meeting-recording'],
    entries: [
      {
        id: 'meeting-recording',
        name: 'tl;dv',
        description: 'Meeting listing, transcript retrieval, and AI-generated highlights',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
        env: { TLDV_API_KEY: '${env:TLDV_API_KEY}' },
      },
    ],
    install: { npmPackages: ['tldv-mcp'] },
  },
  mcp: {
    server: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', 'tldv-mcp'],
      // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
      env: { TLDV_API_KEY: '${env:TLDV_API_KEY}' },
    },
  },
})

export default plugin
