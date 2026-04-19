/** Grok plugin — AI model provider. */

import { defineProviderPlugin } from '../helpers.js'
import type { PluginDefinition, PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

const plugin: PluginDefinition = defineProviderPlugin(manifest as PluginManifest, {
  provider: { id: 'grok', api: 'openai', baseUrl: 'https://api.x.ai/v1' },
})

export default plugin
