/** Hugging Face plugin — AI model provider. */

import { defineProviderPlugin } from '../helpers.js'
import type { PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

export default defineProviderPlugin(manifest as PluginManifest, {
  provider: {
    id: 'hugging-face',
    api: 'openai',
    baseUrl: 'https://api-inference.huggingface.co/v1',
    priority: 80,
    models: [{ id: 'meta-llama/Llama-3.1-70B-Instruct', tags: ['default'] }],
  },
})
