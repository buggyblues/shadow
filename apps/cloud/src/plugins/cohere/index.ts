/** Cohere plugin — AI model provider. */

import { defineProviderPlugin } from '../helpers.js'
import type { PluginDefinition, PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

const plugin: PluginDefinition = defineProviderPlugin(manifest as PluginManifest, {
  provider: { id: 'cohere', api: 'openai', baseUrl: 'https://api.cohere.com/v2' },
})

export default plugin
