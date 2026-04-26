/** Google Gemini plugin — AI model provider. */

import { defineProviderPlugin } from '../helpers.js'
import type { PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

export default defineProviderPlugin(manifest as PluginManifest, {
  provider: {
    id: 'gemini',
    api: 'google',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    envKey: 'GEMINI_API_KEY',
    envKeyAliases: ['GOOGLE_API_KEY', 'GOOGLE_AI_API_KEY'],
    priority: 30,
    models: [
      { id: 'gemini-2.0-flash', tags: ['default', 'flash', 'vision'] },
      { id: 'gemini-2.5-pro', tags: ['reasoning'] },
    ],
  },
})
