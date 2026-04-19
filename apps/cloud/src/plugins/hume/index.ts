/**
 * Hume AI plugin — emotion AI and empathic voice interface.
 * Uses the official @humeai/mcp-server for real-time emotion analysis.
 */

import { defineSkillPlugin } from '../helpers.js'
import type { PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

export default defineSkillPlugin(manifest as PluginManifest, {
  skills: {
    bundled: ['hume'],
    entries: [
      {
        id: 'hume-evi',
        name: 'Hume EVI',
        description: 'Empathic Voice Interface — emotion-aware AI conversations',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
        apiKey: '${env:HUME_API_KEY}',
      },
      {
        id: 'hume-expression',
        name: 'Hume Expression Measurement',
        description: 'Analyze facial expressions and vocal emotions',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
        apiKey: '${env:HUME_API_KEY}',
      },
    ],
    install: { npmPackages: ['@humeai/mcp-server'] },
  },
  mcp: {
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@humeai/mcp-server'],
    // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
    env: { HUME_API_KEY: '${env:HUME_API_KEY}' },
  },
})
