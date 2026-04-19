/**
 * Prisma Postgres plugin — ORM with managed Postgres via prisma mcp CLI.
 */

import { defineSkillPlugin } from '../helpers.js'
import type { PluginDefinition, PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

const plugin: PluginDefinition = defineSkillPlugin(manifest as PluginManifest, {
  skills: {
    bundled: ['prisma'],
    entries: [
      {
        id: 'prisma',
        name: 'Prisma',
        description: 'Migrations, schema introspection, Prisma Studio, database creation',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
        env: { DATABASE_URL: '${env:DATABASE_URL}' },
      },
    ],
    install: { npmPackages: ['prisma'] },
  },
  cli: [
    {
      name: 'prisma',
      command: 'prisma',
      description: 'Prisma CLI — migrations, generate, studio, db push',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
      env: { DATABASE_URL: '${env:DATABASE_URL}' },
    },
  ],
  mcp: {
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'prisma', 'mcp'],
  },
})

export default plugin
