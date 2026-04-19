/** Cohere plugin — AI model provider. */

import { createProviderPlugin } from '../helpers.js'
import type { PluginDefinition, PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

const plugin: PluginDefinition = createProviderPlugin(manifest as PluginManifest, {
  provider: { id: 'cohere', api: 'openai', baseUrl: 'https://api.cohere.com/v2' },
  defaultModel: 'command-r-plus',
})

export default plugin
