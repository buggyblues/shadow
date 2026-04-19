/**
 * Cloudflare plugin — Workers, KV, DNS, and more via remote MCP servers.
 */

import { createSkillPlugin } from '../helpers.js'
import type { PluginDefinition, PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

const plugin: PluginDefinition = createSkillPlugin(manifest as PluginManifest, {
  skills: {
    bundled: ['cloudflare'],
    entries: [
      {
        id: 'cloudflare',
        name: 'Cloudflare',
        description: 'Workers, KV, DNS, and infrastructure management',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
        env: { CLOUDFLARE_API_TOKEN: '${env:CLOUDFLARE_API_TOKEN}' },
      },
    ],
    install: { npmPackages: ['mcp-remote'] },
  },
  cli: {
    tools: [
      {
        name: 'wrangler',
        command: 'wrangler',
        description: 'Cloudflare Wrangler CLI — deploy Workers, manage KV, R2, D1',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
        env: { CLOUDFLARE_API_TOKEN: '${env:CLOUDFLARE_API_TOKEN}' },
      },
    ],
  },
  mcp: {
    server: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', 'mcp-remote', 'https://bindings.mcp.cloudflare.com/mcp'],
      // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
      env: { CLOUDFLARE_API_TOKEN: '${env:CLOUDFLARE_API_TOKEN}' },
    },
  },
})

export default plugin
