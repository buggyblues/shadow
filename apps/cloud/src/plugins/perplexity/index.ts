/** Perplexity plugin — AI model provider. */

import { defineProviderPlugin } from '../helpers.js'
import type { PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

export default defineProviderPlugin(manifest as PluginManifest, {
  provider: {
    id: 'perplexity',
    api: 'openai',
    baseUrl: 'https://api.perplexity.ai',
    priority: 65,
    models: [
      { id: 'sonar-pro', tags: ['default'] },
      { id: 'sonar', tags: ['flash'] },
      { id: 'sonar-reasoning-pro', tags: ['reasoning'] },
    ],
  },
})
