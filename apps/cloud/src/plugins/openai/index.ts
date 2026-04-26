/**
 * OpenAI plugin — AI model provider.
 *
 * Configures OpenAI (GPT-4o, o1, etc.) as a model provider in OpenClaw.
 */

import { defineProviderPlugin } from '../helpers.js'
import type { PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

export default defineProviderPlugin(manifest as PluginManifest, {
  provider: {
    id: 'openai',
    api: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    priority: 20,
    models: [
      { id: 'gpt-4o', tags: ['default', 'vision'] },
      { id: 'gpt-4o-mini', tags: ['flash'] },
      { id: 'o3', tags: ['reasoning'] },
    ],
  },
})
