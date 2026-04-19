/** Google Gemini plugin — AI model provider. */

import { defineProviderPlugin } from '../helpers.js'
import type { PluginDefinition, PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

const plugin: PluginDefinition = defineProviderPlugin(manifest as PluginManifest, {
  provider: {
    id: 'google-gemini',
    api: 'google',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  },
})

export default plugin
