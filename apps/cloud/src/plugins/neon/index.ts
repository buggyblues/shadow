/**
 * Neon plugin — serverless Postgres with branching, migrations, and SQL.
 */

import { createSkillPlugin } from '../helpers.js'
import type { PluginDefinition, PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

const plugin: PluginDefinition = createSkillPlugin(manifest as PluginManifest, {
  skills: {
    bundled: ['neon'],
    entries: [
      {
        id: 'neon',
        name: 'Neon',
        description: 'Serverless Postgres — branching, migrations, SQL execution',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
        env: { NEON_API_KEY: '${env:NEON_API_KEY}' },
      },
    ],
    install: { npmPackages: ['@neondatabase/mcp-server-neon'] },
  },
  cli: {
    tools: [
      {
        name: 'neonctl',
        command: 'neonctl',
        description: 'Neon CLI — manage projects, branches, databases',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
        env: { NEON_API_KEY: '${env:NEON_API_KEY}' },
      },
    ],
  },
  mcp: {
    server: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@neondatabase/mcp-server-neon'],
      // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
      env: { NEON_API_KEY: '${env:NEON_API_KEY}' },
    },
  },
})

export default plugin
