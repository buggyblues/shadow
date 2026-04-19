/**
 * HeyGen plugin — AI avatar video generation via HeyGen MCP server.
 */

import { createSkillPlugin } from '../helpers.js'
import type { PluginDefinition, PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

const plugin: PluginDefinition = createSkillPlugin(manifest as PluginManifest, {
  skills: {
    bundled: ['avatar-video'],
    entries: [
      {
        id: 'avatar-video',
        name: 'HeyGen',
        description: 'AI avatar video generation, voice management, templates, video translation',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
        env: { HEYGEN_API_KEY: '${env:HEYGEN_API_KEY}' },
      },
    ],
  },
  mcp: {
    server: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@mnicole-dev/heygen-mcp-server'],
      // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
      env: { HEYGEN_API_KEY: '${env:HEYGEN_API_KEY}' },
    },
  },
})

export default plugin
