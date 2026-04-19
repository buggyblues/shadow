/**
 * ElevenLabs plugin — Voice synthesis via ElevenLabs MCP server.
 */

import { createSkillPlugin } from '../helpers.js'
import type { PluginDefinition, PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

const plugin: PluginDefinition = createSkillPlugin(manifest as PluginManifest, {
  skills: {
    bundled: ['voice-synthesis'],
    entries: [
      {
        id: 'voice-synthesis',
        name: 'ElevenLabs',
        description: 'Text-to-speech, voice cloning, sound effects, audio isolation',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
        env: { ELEVENLABS_API_KEY: '${env:ELEVENLABS_API_KEY}' },
      },
    ],
  },
  mcp: {
    server: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@angelogiacco/elevenlabs-mcp-server'],
      // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
      env: { ELEVENLABS_API_KEY: '${env:ELEVENLABS_API_KEY}' },
    },
  },
})

export default plugin
