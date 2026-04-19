/** OpenRouter plugin — AI model provider. */

import { defineProviderPlugin } from '../helpers.js'
import type { PluginDefinition, PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

const plugin: PluginDefinition = defineProviderPlugin(manifest as PluginManifest, {
  provider: { id: 'openrouter', api: 'openai', baseUrl: 'https://openrouter.ai/api/v1' },
})

export default plugin
