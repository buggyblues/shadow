/**
 * HeyGen plugin — AI avatar video generation via HeyGen MCP server.
 */

import { defineSkillPlugin } from '../helpers.js'
import type { PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

export default defineSkillPlugin(manifest as PluginManifest, {
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
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@mnicole-dev/heygen-mcp-server'],
    // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
    env: { HEYGEN_API_KEY: '${env:HEYGEN_API_KEY}' },
  },
})
