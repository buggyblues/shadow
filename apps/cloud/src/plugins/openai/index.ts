/**
 * OpenAI plugin — AI model provider.
 *
 * Configures OpenAI (GPT-4o, o1, etc.) as a model provider in OpenClaw.
 */

import { createProviderPlugin } from '../helpers.js'
import type { PluginDefinition, PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

const plugin: PluginDefinition = createProviderPlugin(manifest as PluginManifest, {
  provider: { id: 'openai', api: 'openai' },
  defaultModel: 'gpt-4o',
})

export default plugin
