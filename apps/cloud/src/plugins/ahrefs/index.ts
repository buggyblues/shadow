/**
 * Ahrefs plugin — SEO analytics, backlink analysis, and keyword research.
 */

import { defineSkillPlugin } from '../helpers.js'
import type { PluginDefinition, PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

const plugin: PluginDefinition = defineSkillPlugin(manifest as PluginManifest, {
  skills: {
    bundled: ['seo-analysis'],
    entries: [
      {
        id: 'seo-analysis',
        name: 'Ahrefs',
        description: 'SEO analytics, backlink analysis, and keyword research',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
        env: { AHREFS_API_KEY: '${env:AHREFS_API_KEY}' },
      },
    ],
    install: { npmPackages: ['@ahrefs/mcp'] },
  },
  mcp: {
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@ahrefs/mcp@latest'],
    // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
    env: { API_KEY: '${env:AHREFS_API_KEY}' },
  },
})

export default plugin
