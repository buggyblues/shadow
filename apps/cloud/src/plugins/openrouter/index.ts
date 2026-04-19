/** OpenRouter plugin — AI model provider. */

import { createProviderPlugin } from '../helpers.js'
import type { PluginDefinition, PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

const plugin: PluginDefinition = createProviderPlugin(manifest as PluginManifest, {
  provider: { id: 'openrouter', api: 'openai', baseUrl: 'https://openrouter.ai/api/v1' },
  defaultModel: 'anthropic/claude-sonnet-4-20250514',
})

export default plugin
