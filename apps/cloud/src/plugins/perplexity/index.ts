/** Perplexity plugin — AI model provider. */

import { createProviderPlugin } from '../helpers.js'
import type { PluginDefinition, PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

const plugin: PluginDefinition = createProviderPlugin(manifest as PluginManifest, {
  provider: { id: 'perplexity', api: 'openai', baseUrl: 'https://api.perplexity.ai' },
  defaultModel: 'llama-3.1-sonar-large-128k-online',
})

export default plugin
