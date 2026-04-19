/** Google Gemini plugin — AI model provider. */

import { createProviderPlugin } from '../helpers.js'
import type { PluginDefinition, PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

const plugin: PluginDefinition = createProviderPlugin(manifest as PluginManifest, {
  provider: {
    id: 'google-gemini',
    api: 'google',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  },
  defaultModel: 'gemini-2.0-flash',
})

export default plugin
