/** OpenRouter plugin — AI model provider. */

import { defineProviderPlugin } from '../helpers.js'
import type { PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

export default defineProviderPlugin(manifest as PluginManifest, {
  provider: {
    id: 'openrouter',
    api: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    priority: 60,
    models: [{ id: 'auto', tags: ['default', 'flash', 'reasoning', 'vision'] }],
  },
})
