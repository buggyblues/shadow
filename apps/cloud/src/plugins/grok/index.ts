/** Grok plugin — AI model provider. */

import { defineProviderPlugin } from '../helpers.js'
import type { PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

export default defineProviderPlugin(manifest as PluginManifest, {
  provider: {
    id: 'grok',
    api: 'openai',
    baseUrl: 'https://api.x.ai/v1',
    envKeyAliases: ['GROK_API_KEY'],
    priority: 40,
    models: [
      { id: 'grok-3', tags: ['default', 'reasoning'] },
      { id: 'grok-3-mini', tags: ['flash'] },
      { id: 'grok-2-vision-1212', tags: ['vision'] },
    ],
  },
})
