/** Cohere plugin — AI model provider. */

import { defineProviderPlugin } from '../helpers.js'
import type { PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

export default defineProviderPlugin(manifest as PluginManifest, {
  provider: { id: 'cohere', api: 'openai', baseUrl: 'https://api.cohere.com/v2' },
})
