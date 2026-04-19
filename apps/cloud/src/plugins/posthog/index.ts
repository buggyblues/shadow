/**
 * PostHog plugin — product analytics, feature flags, experiments, and error tracking.
 */

import { createSkillPlugin } from '../helpers.js'
import type { PluginDefinition, PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

const plugin: PluginDefinition = createSkillPlugin(manifest as PluginManifest, {
  skills: {
    bundled: ['posthog'],
    entries: [
      {
        id: 'posthog',
        name: 'PostHog',
        description:
          'Product analytics, feature flags, experiments, error tracking, and LLM analytics',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
        env: { POSTHOG_API_TOKEN: '${env:POSTHOG_API_TOKEN}' },
      },
    ],
    install: { npmPackages: ['@andrew_eragon/mcp-server-posthog'] },
  },
  mcp: {
    server: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@andrew_eragon/mcp-server-posthog@latest'],
      // biome-ignore lint/suspicious/noTemplateCurlyInString: OpenClaw template syntax
      env: { POSTHOG_API_TOKEN: '${env:POSTHOG_API_TOKEN}' },
    },
  },
})

export default plugin
