/**
 * Sentry plugin — error tracking, performance monitoring, and debugging.
 */

import { createSkillPlugin } from '../helpers.js'
import type { PluginDefinition, PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

const plugin: PluginDefinition = createSkillPlugin(manifest as PluginManifest, {
  skills: {
    bundled: ['sentry'],
    entries: [
      {
        id: 'sentry',
        name: 'Sentry',
        description: 'Error tracking, issue search, performance monitoring',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
        env: { SENTRY_AUTH_TOKEN: '${env:SENTRY_AUTH_TOKEN}' },
      },
    ],
    install: { npmPackages: ['@sentry/mcp-server'] },
  },
  cli: {
    tools: [
      {
        name: 'sentry-cli',
        command: 'sentry-cli',
        description: 'Sentry CLI — manage releases, source maps, debug files',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
        env: { SENTRY_AUTH_TOKEN: '${env:SENTRY_AUTH_TOKEN}' },
      },
    ],
  },
  mcp: {
    server: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@sentry/mcp-server'],
      // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
      env: { SENTRY_AUTH_TOKEN: '${env:SENTRY_AUTH_TOKEN}' },
    },
  },
})

export default plugin
