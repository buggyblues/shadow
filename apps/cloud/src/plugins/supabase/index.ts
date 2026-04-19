/**
 * Supabase plugin — Postgres, auth, edge functions, and storage.
 */

import { defineSkillPlugin } from '../helpers.js'
import type { PluginDefinition, PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

const plugin: PluginDefinition = defineSkillPlugin(manifest as PluginManifest, {
  skills: {
    bundled: ['supabase'],
    entries: [
      {
        id: 'supabase',
        name: 'Supabase',
        description: 'Database management, migrations, edge functions, storage',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
        env: { SUPABASE_ACCESS_TOKEN: '${env:SUPABASE_ACCESS_TOKEN}' },
      },
    ],
    install: { npmPackages: ['@supabase/mcp-server-supabase'] },
  },
  cli: [
    {
      name: 'supabase',
      command: 'supabase',
      description: 'Supabase CLI — manage projects, migrations, edge functions',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
      env: { SUPABASE_ACCESS_TOKEN: '${env:SUPABASE_ACCESS_TOKEN}' },
    },
  ],
  mcp: {
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@supabase/mcp-server-supabase'],
    // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
    env: { SUPABASE_ACCESS_TOKEN: '${env:SUPABASE_ACCESS_TOKEN}' },
  },
})

export default plugin
