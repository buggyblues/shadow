/**
 * Firecrawl plugin — web scraping, crawling, and structured data extraction.
 */

import { defineSkillPlugin } from '../helpers.js'
import type { PluginDefinition, PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

const plugin: PluginDefinition = defineSkillPlugin(manifest as PluginManifest, {
  skills: {
    bundled: ['web-crawl'],
    entries: [
      {
        id: 'firecrawl',
        name: 'Firecrawl',
        description: 'Web scraping, crawling, search, and structured data extraction',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
        env: { FIRECRAWL_API_KEY: '${env:FIRECRAWL_API_KEY}' },
      },
    ],
    install: { npmPackages: ['firecrawl-mcp'] },
  },
  mcp: {
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'firecrawl-mcp'],
    // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
    env: { FIRECRAWL_API_KEY: '${env:FIRECRAWL_API_KEY}' },
  },
})

export default plugin
