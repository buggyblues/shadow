/** Z.ai plugin — AI model provider. */

import { defineProviderPlugin } from '../helpers.js'
import type { PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

export default defineProviderPlugin(manifest as PluginManifest, {
  provider: {
    id: 'zai',
    api: 'openai',
    baseUrl: 'https://api.z.ai/api/paas/v4',
    envKey: 'ZAI_API_KEY',
    envKeyAliases: ['ZHIPUAI_API_KEY', 'GLM_API_KEY', 'BIGMODEL_API_KEY'],
    priority: 58,
    models: [
      {
        id: 'glm-4.5-air',
        name: 'GLM 4.5 Air',
        tags: ['fast', 'flash'],
        contextWindow: 128_000,
        capabilities: { tools: true, reasoning: true },
      },
      {
        id: 'glm-4.5',
        name: 'GLM 4.5',
        tags: ['default', 'reasoning'],
        contextWindow: 128_000,
        capabilities: { tools: true, reasoning: true },
      },
      {
        id: 'glm-4.5v',
        name: 'GLM 4.5V',
        tags: ['vision'],
        contextWindow: 128_000,
        capabilities: { vision: true, tools: true },
      },
    ],
  },
})
