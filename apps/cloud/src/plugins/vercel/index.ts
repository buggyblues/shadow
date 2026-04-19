/**
 * Vercel plugin — deployment, environment management, and logs.
 */

import { defineSkillPlugin } from '../helpers.js'
import type { PluginDefinition, PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

const plugin: PluginDefinition = defineSkillPlugin(manifest as PluginManifest, {
  skills: {
    bundled: ['vercel'],
    entries: [
      {
        id: 'vercel',
        name: 'Vercel',
        description: 'Project deployment, environment management, logs access',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
        env: { VERCEL_TOKEN: '${env:VERCEL_TOKEN}' },
      },
    ],
    install: { npmPackages: ['@vercel/mcp'] },
  },
  cli: [
    {
      name: 'vercel',
      command: 'vercel',
      description: 'Vercel CLI — deploy, manage env vars, view logs',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
      env: { VERCEL_TOKEN: '${env:VERCEL_TOKEN}' },
    },
  ],
  mcp: {
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@vercel/mcp'],
    // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
    env: { VERCEL_TOKEN: '${env:VERCEL_TOKEN}' },
  },
})

export default plugin
