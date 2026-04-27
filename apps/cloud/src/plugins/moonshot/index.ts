/** Moonshot Kimi plugin — AI model provider. */

import { defineProviderPlugin } from '../helpers.js'
import type { PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

export default defineProviderPlugin(manifest as PluginManifest, {
  provider: {
    id: 'moonshot',
    api: 'openai',
    baseUrl: 'https://api.moonshot.ai/v1',
    envKeyAliases: ['KIMI_API_KEY'],
    priority: 56,
    models: [
      {
        id: 'moonshot-v1-8k',
        name: 'Moonshot 8K',
        tags: ['fast', 'flash'],
        contextWindow: 8_192,
        capabilities: { tools: true },
      },
      {
        id: 'moonshot-v1-32k',
        name: 'Moonshot 32K',
        tags: ['default'],
        contextWindow: 32_768,
        capabilities: { tools: true },
      },
      {
        id: 'moonshot-v1-128k',
        name: 'Moonshot 128K',
        tags: ['reasoning'],
        contextWindow: 131_072,
        capabilities: { tools: true, reasoning: true },
      },
    ],
  },
})
