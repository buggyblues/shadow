/** Anthropic plugin — AI model provider. */

import { defineProviderPlugin } from '../helpers.js'
import type { PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

export default defineProviderPlugin(manifest as PluginManifest, {
  provider: {
    id: 'anthropic',
    api: 'anthropic',
    envKeyAliases: ['ANTHROPIC_AUTH_TOKEN'],
    baseUrlEnvKey: 'ANTHROPIC_BASE_URL',
    modelEnvKey: 'ANTHROPIC_MODEL',
    priority: 10,
    models: [
      { id: 'claude-sonnet-4-5', tags: ['default', 'vision'] },
      { id: 'claude-3-5-haiku-20241022', tags: ['flash'] },
      { id: 'claude-opus-4-5', tags: ['reasoning'] },
    ],
  },
})
