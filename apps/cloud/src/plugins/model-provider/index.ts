/**
 * model-provider plugin — auto-discovers AI model providers from environment variables.
 *
 * Architecture:
 *   - Each provider preset declares its full model catalog.
 *   - Each model declares the tags it satisfies (e.g. "flash", "reasoning").
 *   - Agents select models by tag; the plugin resolves which concrete model(s) to use
 *     by scanning all discovered providers in priority order.
 *
 * Usage in template (top-level, activates provider discovery):
 *   { "plugin": "model-provider" }
 *
 * Usage per agent (optional tag override):
 *   { "plugin": "model-provider", "options": { "tag": "flash" } }
 *
 * Supported tags:
 *   default   — standard capable model
 *   flash     — fast / low-cost model
 *   reasoning — extended thinking / chain-of-thought model
 *   vision    — vision / multimodal model
 *
 * Env var → provider mapping:
 *   ANTHROPIC_API_KEY                        → anthropic
 *   OPENAI_API_KEY                           → openai
 *   DEEPSEEK_API_KEY                         → deepseek
 *   GEMINI_API_KEY / GOOGLE_API_KEY          → gemini
 *   GROK_API_KEY                             → grok
 *   OPENROUTER_API_KEY                       → openrouter
 *   OPENAI_COMPATIBLE_BASE_URL +
 *   OPENAI_COMPATIBLE_API_KEY                → custom
 */

import { definePlugin } from '../helpers.js'
import type { PluginConfigFragment, PluginManifest } from '../types.js'
import manifest from './manifest.json' with { type: 'json' }

// ─── Types ────────────────────────────────────────────────────────────────────

export type ModelTag = 'default' | 'flash' | 'reasoning' | 'vision'

const ALL_TAGS: readonly ModelTag[] = ['default', 'flash', 'reasoning', 'vision']

interface ModelEntry {
  /** Model ID within the provider (e.g. "claude-sonnet-4-5") */
  id: string
  /** Tags this model satisfies */
  tags: ModelTag[]
  /** Optional context window (tokens) */
  contextWindow?: number
}

interface ProviderPreset {
  /** OpenClaw provider ID */
  id: string
  /** OpenClaw API adapter */
  api: string
  /** Base URL for the API (if non-default) */
  baseUrl?: string
  /** Env var name that holds the API key */
  envKey: string
  /**
   * Model catalog — models listed first get higher priority within this provider.
   * Tags on models represent capabilities; resolution picks the first model matching
   * the requested tag across providers ordered by their position in PROVIDER_PRESETS.
   */
  models: ModelEntry[]
}

// ─── Provider presets with co-located model catalog ──────────────────────────
//
// Provider order determines priority when multiple providers satisfy the same tag.
// First entry = highest priority.

const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'anthropic',
    api: 'anthropic-messages',
    envKey: 'ANTHROPIC_API_KEY',
    models: [
      { id: 'claude-sonnet-4-5', tags: ['default', 'vision'] },
      { id: 'claude-3-5-haiku-20241022', tags: ['flash'] },
      { id: 'claude-opus-4-5', tags: ['reasoning'] },
    ],
  },
  {
    id: 'openai',
    api: 'openai-completions',
    envKey: 'OPENAI_API_KEY',
    models: [
      { id: 'gpt-4o', tags: ['default', 'vision'] },
      { id: 'gpt-4o-mini', tags: ['flash'] },
      { id: 'o3', tags: ['reasoning'] },
    ],
  },
  {
    id: 'gemini',
    api: 'google-generative-ai',
    envKey: 'GEMINI_API_KEY',
    models: [
      { id: 'gemini-2.0-flash', tags: ['default', 'flash', 'vision'] },
      { id: 'gemini-2.5-pro', tags: ['reasoning'] },
    ],
  },
  {
    id: 'google',
    api: 'google-generative-ai',
    envKey: 'GOOGLE_API_KEY',
    models: [
      { id: 'gemini-2.0-flash', tags: ['default', 'flash', 'vision'] },
      { id: 'gemini-2.5-pro', tags: ['reasoning'] },
    ],
  },
  {
    id: 'grok',
    api: 'openai-completions',
    baseUrl: 'https://api.x.ai/v1',
    envKey: 'GROK_API_KEY',
    models: [
      { id: 'grok-3', tags: ['default', 'reasoning'] },
      { id: 'grok-3-mini', tags: ['flash'] },
      { id: 'grok-2-vision-1212', tags: ['vision'] },
    ],
  },
  {
    id: 'deepseek',
    api: 'openai-completions',
    baseUrl: 'https://api.deepseek.com/v1',
    envKey: 'DEEPSEEK_API_KEY',
    models: [
      { id: 'deepseek-chat', tags: ['default', 'flash'] },
      { id: 'deepseek-reasoner', tags: ['reasoning'] },
    ],
  },
  {
    id: 'openrouter',
    api: 'openai-completions',
    baseUrl: 'https://openrouter.ai/api/v1',
    envKey: 'OPENROUTER_API_KEY',
    models: [{ id: 'auto', tags: ['default', 'flash', 'reasoning', 'vision'] }],
  },
]

// ─── Tag resolution ──────────────────────────────────────────────────────────

/**
 * Given a set of discovered providers and a requested tag, return an ordered list
 * of model refs ("providerId/modelId") — first entry is `primary`, rest are `fallbacks`.
 *
 * Iterates providers in PROVIDER_PRESETS order (priority), then models in the order
 * declared within each provider. First match per provider is taken.
 */
function resolveModelsByTag(discoveredPresets: ProviderPreset[], tag: ModelTag): string[] {
  const refs: string[] = []
  for (const preset of discoveredPresets) {
    const model = preset.models.find((m) => m.tags.includes(tag))
    if (model) refs.push(`${preset.id}/${model.id}`)
  }
  return refs
}

// ─── Plugin definition ────────────────────────────────────────────────────────

export default definePlugin(manifest as PluginManifest, (api) => {
  api.onBuildConfig((ctx): PluginConfigFragment => {
    const env = ctx.secrets as Record<string, string | undefined>
    const providers: Record<string, unknown> = {}
    const discoveredPresets: ProviderPreset[] = []

    for (const preset of PROVIDER_PRESETS) {
      const keyValue = env[preset.envKey] ?? process.env[preset.envKey]
      if (!keyValue) continue

      // Skip 'google' if 'gemini' already added  (both use google-generative-ai)
      if (preset.id === 'google' && providers.gemini) continue

      const entry: Record<string, unknown> = {
        api: preset.api,
        // Template syntax: resolved inside the container at runtime, not baked in.
        apiKey: `\${env:${preset.envKey}}`,
        request: { allowPrivateNetwork: true },
        // Declare the model catalog so OpenClaw knows what models are available.
        models: preset.models.map((m) => ({ id: m.id, name: m.id })),
      }
      if (preset.baseUrl) entry.baseUrl = preset.baseUrl

      providers[preset.id] = entry
      discoveredPresets.push(preset)
    }

    // Custom OpenAI-compatible provider
    const customBaseUrl = env.OPENAI_COMPATIBLE_BASE_URL ?? process.env.OPENAI_COMPATIBLE_BASE_URL
    const customApiKey = env.OPENAI_COMPATIBLE_API_KEY ?? process.env.OPENAI_COMPATIBLE_API_KEY
    if (customBaseUrl && customApiKey) {
      const customModelId = process.env.OPENAI_COMPATIBLE_MODEL_ID ?? 'default'
      providers.custom = {
        api: 'openai-completions',
        baseUrl: customBaseUrl,
        apiKey: '${env:OPENAI_COMPATIBLE_API_KEY}',
        request: { allowPrivateNetwork: true },
        models: [{ id: customModelId, name: customModelId }],
      }
      // Custom provider satisfies all tags as a last-resort fallback.
      discoveredPresets.push({
        id: 'custom',
        api: 'openai-completions',
        baseUrl: customBaseUrl,
        envKey: 'OPENAI_COMPATIBLE_API_KEY',
        models: ALL_TAGS.map((t) => ({ id: customModelId, tags: [t] })),
      })
    }

    if (Object.keys(providers).length === 0) return {}

    // ── Tag-based model selection ──────────────────────────────────────────
    // Agent-level use entry takes precedence over template-level.
    const agentUseEntry = ctx.agent.use?.find((e) => e.plugin === 'model-provider')
    const templateUseEntry = ctx.config.use?.find((e) => e.plugin === 'model-provider')
    const rawTag = (agentUseEntry?.options?.tag ??
      templateUseEntry?.options?.tag ??
      'default') as string
    const tag: ModelTag = (ALL_TAGS as readonly string[]).includes(rawTag)
      ? (rawTag as ModelTag)
      : 'default'

    const modelRefs = resolveModelsByTag(discoveredPresets, tag)

    const fragment: PluginConfigFragment = {
      models: {
        mode: 'merge',
        providers,
      },
    }

    if (modelRefs.length > 0) {
      const [primary, ...fallbacks] = modelRefs
      fragment.agents = {
        defaults: {
          model: {
            primary,
            ...(fallbacks.length > 0 ? { fallbacks } : {}),
          },
        },
      }
    }

    return fragment
  })

  api.onValidate((ctx) => {
    const env = ctx.secrets as Record<string, string | undefined>
    const knownKeys = [...PROVIDER_PRESETS.map((p) => p.envKey), 'OPENAI_COMPATIBLE_API_KEY']
    const found = knownKeys.some((k) => env[k] ?? process.env[k])
    if (!found) {
      return {
        valid: true,
        errors: [
          {
            path: 'use[model-provider]',
            message:
              'model-provider: no API keys detected. Set at least one of: ' +
              'ANTHROPIC_API_KEY, OPENAI_API_KEY, DEEPSEEK_API_KEY, GEMINI_API_KEY, ' +
              'GROK_API_KEY, OPENROUTER_API_KEY, or OPENAI_COMPATIBLE_BASE_URL + OPENAI_COMPATIBLE_API_KEY',
            severity: 'warning',
          },
        ],
      }
    }
    return { valid: true, errors: [] }
  })
})
