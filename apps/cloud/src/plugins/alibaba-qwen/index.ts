/** Alibaba Qwen plugin — AI model provider. */

import { defineProviderPlugin } from '../helpers.js'
import type { PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

export default defineProviderPlugin(manifest as PluginManifest, {
  provider: {
    id: 'qwen',
    api: 'openai',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    envKey: 'DASHSCOPE_API_KEY',
    envKeyAliases: ['ALIBABA_API_KEY', 'QWEN_API_KEY'],
    priority: 52,
    models: [
      {
        id: 'qwen-turbo',
        name: 'Qwen Turbo',
        tags: ['fast', 'flash'],
        contextWindow: 1_000_000,
        capabilities: { tools: true },
      },
      {
        id: 'qwen-plus',
        name: 'Qwen Plus',
        tags: ['default'],
        contextWindow: 1_000_000,
        capabilities: { tools: true },
      },
      {
        id: 'qwen-max',
        name: 'Qwen Max',
        tags: ['reasoning'],
        contextWindow: 32_768,
        capabilities: { tools: true, reasoning: true },
      },
      {
        id: 'qwen-vl-plus',
        name: 'Qwen VL Plus',
        tags: ['vision'],
        contextWindow: 128_000,
        capabilities: { vision: true, tools: true },
      },
    ],
  },
})
