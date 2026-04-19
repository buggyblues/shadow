/** Hugging Face plugin — AI model provider. */

import { createProviderPlugin } from '../helpers.js'
import type { PluginDefinition, PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

const plugin: PluginDefinition = createProviderPlugin(manifest as PluginManifest, {
  provider: {
    id: 'hugging-face',
    api: 'openai',
    baseUrl: 'https://api-inference.huggingface.co/v1',
  },
  defaultModel: 'meta-llama/Llama-3-70b-chat-hf',
})

export default plugin
