/** MiniMax plugin — AI model provider. */

import { defineProviderPlugin } from '../helpers.js'
import type { PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

export default defineProviderPlugin(manifest as PluginManifest, {
  provider: {
    id: 'minimax',
    api: 'openai',
    baseUrl: 'https://api.minimax.io/v1',
    priority: 54,
    models: [
      {
        id: 'MiniMax-M2.1',
        name: 'MiniMax M2.1',
        tags: ['default'],
        contextWindow: 128_000,
        capabilities: { tools: true },
      },
      {
        id: 'MiniMax-M2.1-highspeed',
        name: 'MiniMax M2.1 Highspeed',
        tags: ['fast', 'flash'],
        contextWindow: 128_000,
        capabilities: { tools: true },
      },
      {
        id: 'MiniMax-M2.5',
        name: 'MiniMax M2.5',
        tags: ['reasoning'],
        contextWindow: 128_000,
        capabilities: { tools: true, reasoning: true },
      },
    ],
  },
})
