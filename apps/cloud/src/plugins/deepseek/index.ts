/** DeepSeek plugin — AI model provider. */

import { defineProviderPlugin } from '../helpers.js'
import type { PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

export default defineProviderPlugin(manifest as PluginManifest, {
  provider: {
    id: 'deepseek',
    api: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    priority: 50,
    models: [
      { id: 'deepseek-chat', tags: ['default', 'flash'] },
      { id: 'deepseek-reasoner', tags: ['reasoning'] },
    ],
  },
})
