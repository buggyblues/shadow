/**
 * Sentry plugin — error tracking, performance monitoring, and debugging.
 */

import { defineSkillPlugin } from '../helpers.js'
import type { PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

export default defineSkillPlugin(manifest as PluginManifest, {
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
  cli: [
    {
      name: 'sentry-cli',
      command: 'sentry-cli',
      description: 'Sentry CLI — manage releases, source maps, debug files',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
      env: { SENTRY_AUTH_TOKEN: '${env:SENTRY_AUTH_TOKEN}' },
    },
  ],
  mcp: {
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@sentry/mcp-server'],
    // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
    env: { SENTRY_AUTH_TOKEN: '${env:SENTRY_AUTH_TOKEN}' },
  },
})
