/**
 * Notion plugin — page management, database queries, search, and knowledge management.
 */

import { defineSkillPlugin } from '../helpers.js'
import type { PluginDefinition, PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

const plugin: PluginDefinition = defineSkillPlugin(manifest as PluginManifest, {
  skills: {
    bundled: ['notion'],
    entries: [
      {
        id: 'notion',
        name: 'Notion',
        description: 'Page management, database queries, search, knowledge management',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
        env: { NOTION_API_KEY: '${env:NOTION_API_KEY}' },
      },
    ],
    install: { npmPackages: ['@notionhq/notion-mcp-server'] },
  },
  mcp: {
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@notionhq/notion-mcp-server'],
    // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
    env: { NOTION_API_KEY: '${env:NOTION_API_KEY}' },
  },
})

export default plugin
