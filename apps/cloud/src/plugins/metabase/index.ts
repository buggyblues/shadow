/**
 * Metabase plugin — BI analytics, dashboards, and native SQL queries.
 */

import { defineSkillPlugin } from '../helpers.js'
import type { PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

export default defineSkillPlugin(manifest as PluginManifest, {
  skills: {
    bundled: ['metabase'],
    entries: [
      {
        id: 'metabase',
        name: 'Metabase',
        description:
          'BI analytics: query databases, manage dashboards, cards, collections, and run native SQL',
        env: {
          // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
          METABASE_API_KEY: '${env:METABASE_API_KEY}',
          // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
          METABASE_URL: '${env:METABASE_URL}',
        },
      },
    ],
    install: { npmPackages: ['@getnao/metabase-mcp-server'] },
  },
  mcp: {
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@getnao/metabase-mcp-server@latest'],
    env: {
      // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
      METABASE_API_KEY: '${env:METABASE_API_KEY}',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
      METABASE_URL: '${env:METABASE_URL}',
    },
  },
})
