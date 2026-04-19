/** Hugging Face plugin — AI model provider. */

import { defineProviderPlugin } from '../helpers.js'
import type { PluginDefinition, PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

const plugin: PluginDefinition = defineProviderPlugin(manifest as PluginManifest, {
  provider: {
    id: 'hugging-face',
    api: 'openai',
    baseUrl: 'https://api-inference.huggingface.co/v1',
  },
})

export default plugin
