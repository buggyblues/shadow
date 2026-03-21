#!/usr/bin/env node

/**
 * Model Presets Audit & Update Script
 *
 * Audits the current model-presets.ts against live provider APIs
 * and generates a diff report with actionable suggestions.
 *
 * Features:
 * - Parses current preset model IDs from model-presets.ts
 * - Fetches live model lists from providers via /v1/models (when API keys available)
 * - Generates a diff report showing new/missing/deprecated models
 * - Outputs verification links for manual checking
 *
 * Usage:
 *   node scripts/update-model-presets.mjs                  # Full audit report
 *   node scripts/update-model-presets.mjs --provider openai # Single provider
 *   node scripts/update-model-presets.mjs --api             # Also query live APIs
 *
 * API Key env vars (optional, for --api mode):
 *   OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY,
 *   DEEPSEEK_API_KEY, MISTRAL_API_KEY, MOONSHOT_API_KEY, XAI_API_KEY
 */

import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const PRESETS_PATH = path.join(ROOT, 'apps/desktop/src/renderer/pages/openclaw/model-presets.ts')
const OUTPUT_DIR = path.join(ROOT, '.research')

// ─── Provider Registry ───────────────────────────────────────────────────────

const PROVIDERS = {
  openai: {
    name: 'OpenAI',
    apiModelsUrl: 'https://api.openai.com/v1/models',
    envKey: 'OPENAI_API_KEY',
    docsUrl: 'https://docs.openclaw.ai/providers/openai',
    pricingUrl: 'https://openai.com/api/pricing/',
    filterModels: (models) =>
      models.filter(
        (m) =>
          /^(gpt-|o[0-9]|chatgpt-)/.test(m.id) &&
          !m.id.includes('instruct') &&
          !m.id.includes('audio') &&
          !m.id.includes('realtime') &&
          !m.id.includes('tts') &&
          !m.id.includes('dall-e') &&
          !m.id.includes('whisper') &&
          !m.id.includes('embedding'),
      ),
  },
  anthropic: {
    name: 'Anthropic',
    // Anthropic doesn't have a public /v1/models endpoint
    envKey: 'ANTHROPIC_API_KEY',
    docsUrl: 'https://docs.openclaw.ai/providers/anthropic',
    pricingUrl: 'https://www.anthropic.com/pricing',
  },
  google: {
    name: 'Google AI',
    apiModelsUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    envKey: 'GEMINI_API_KEY',
    authMethod: 'query', // Uses ?key= instead of Bearer
    docsUrl: 'https://docs.openclaw.ai/providers/google',
    pricingUrl: 'https://ai.google.dev/pricing',
    filterModels: (models) =>
      models.filter(
        (m) => m.id.startsWith('gemini-') && !m.id.includes('embedding') && !m.id.includes('aqa'),
      ),
  },
  deepseek: {
    name: 'DeepSeek',
    apiModelsUrl: 'https://api.deepseek.com/v1/models',
    envKey: 'DEEPSEEK_API_KEY',
    docsUrl: 'https://api-docs.deepseek.com/',
    pricingUrl: 'https://api-docs.deepseek.com/quick_start/pricing',
    filterModels: (models) => models.filter((m) => m.id.startsWith('deepseek-')),
  },
  xai: {
    name: 'xAI',
    apiModelsUrl: 'https://api.x.ai/v1/models',
    envKey: 'XAI_API_KEY',
    docsUrl: 'https://docs.x.ai/docs',
    pricingUrl: 'https://docs.x.ai/docs/pricing',
    filterModels: (models) => models.filter((m) => m.id.startsWith('grok-')),
  },
  mistral: {
    name: 'Mistral AI',
    apiModelsUrl: 'https://api.mistral.ai/v1/models',
    envKey: 'MISTRAL_API_KEY',
    docsUrl: 'https://docs.mistral.ai/',
    pricingUrl: 'https://mistral.ai/products/la-plateforme#pricing',
  },
  zhipu: {
    name: '智谱 AI (Z.AI)',
    envKey: 'ZAI_API_KEY',
    docsUrl: 'https://docs.openclaw.ai/providers/zai',
    pricingUrl: 'https://open.bigmodel.cn/pricing',
  },
  moonshot: {
    name: 'Moonshot (Kimi)',
    apiModelsUrl: 'https://api.moonshot.cn/v1/models',
    envKey: 'MOONSHOT_API_KEY',
    docsUrl: 'https://docs.openclaw.ai/providers/moonshot',
    pricingUrl: 'https://platform.moonshot.cn/docs/pricing',
  },
  bailian: {
    name: '阿里云百炼 (ModelStudio)',
    apiModelsUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/models',
    envKey: 'MODELSTUDIO_API_KEY',
    docsUrl: 'https://docs.openclaw.ai/providers/modelstudio',
    pricingUrl: 'https://help.aliyun.com/zh/model-studio/billing-for-model-studio',
  },
  minimax: {
    name: 'MiniMax',
    envKey: 'MINIMAX_API_KEY',
    docsUrl: 'https://docs.openclaw.ai/providers/minimax',
    pricingUrl: 'https://platform.minimaxi.com/docs/pricing',
  },
  volcengine: {
    name: '火山引擎 (Volcengine)',
    envKey: 'VOLCANO_ENGINE_API_KEY',
    docsUrl: 'https://docs.openclaw.ai/providers/volcengine',
    pricingUrl: 'https://www.volcengine.com/pricing?product=doubao',
  },
  'tencent-hunyuan': {
    name: '腾讯混元',
    envKey: 'HUNYUAN_API_KEY',
    docsUrl: 'https://www.tencentcloud.com/techpedia/142830',
    pricingUrl: 'https://cloud.tencent.com/document/product/1729/97731',
  },
}

// ─── Current Presets Parser ──────────────────────────────────────────────────

function parseCurrentPresets() {
  const content = fs.readFileSync(PRESETS_PATH, 'utf8')
  const result = {}

  // Find all const *_MODELS arrays and extract their model IDs
  // More robust: find the array from `const X_MODELS` to the closing `]`
  const lines = content.split('\n')
  let currentArray = null
  let depth = 0
  const arrays = {}

  for (const line of lines) {
    const arrayStart = line.match(/^const\s+(\w+_MODELS):\s*ModelPreset\[\]\s*=\s*\[/)
    if (arrayStart) {
      currentArray = arrayStart[1]
      arrays[currentArray] = { ids: [], deprecated: [], recommended: [] }
      depth = 1
      continue
    }
    if (currentArray) {
      for (const ch of line) {
        if (ch === '[') depth++
        if (ch === ']') depth--
      }
      const idMatch = line.match(/^\s*id:\s*'([^']+)'/)
      if (idMatch) {
        arrays[currentArray]._lastId = idMatch[1]
        arrays[currentArray].ids.push(idMatch[1])
      }
      if (line.includes('deprecated: true') && arrays[currentArray]._lastId) {
        arrays[currentArray].deprecated.push(arrays[currentArray]._lastId)
      }
      if (line.includes('recommended: true') && arrays[currentArray]._lastId) {
        arrays[currentArray].recommended.push(arrays[currentArray]._lastId)
      }
      if (depth <= 0) {
        delete arrays[currentArray]._lastId
        currentArray = null
      }
    }
  }

  // Map provider IDs to model arrays
  const providerMap = {
    openai: 'OPENAI_MODELS',
    anthropic: 'ANTHROPIC_MODELS',
    google: 'GOOGLE_MODELS',
    deepseek: 'DEEPSEEK_MODELS',
    xai: 'XAI_MODELS',
    mistral: 'MISTRAL_MODELS',
    cohere: 'COHERE_MODELS',
    zhipu: 'ZHIPU_MODELS',
    moonshot: 'MOONSHOT_MODELS',
    bailian: 'BAILIAN_MODELS',
    minimax: 'MINIMAX_MODELS',
    'tencent-hunyuan': 'TENCENT_HUNYUAN_MODELS',
    volcengine: 'VOLCENGINE_MODELS',
    openrouter: 'OPENROUTER_MODELS',
    together: 'TOGETHER_MODELS',
    groq: 'GROQ_MODELS',
    siliconflow: 'SILICONFLOW_MODELS',
    bedrock: 'BEDROCK_MODELS',
    ollama: 'OLLAMA_MODELS',
  }

  for (const [providerId, arrayName] of Object.entries(providerMap)) {
    const arr = arrays[arrayName]
    result[providerId] = arr || { ids: [], deprecated: [], recommended: [] }
  }

  // Also extract codingPlan info
  const codingPlanRegex = /codingPlan:\s*\{[\s\S]*?models:\s*\[([\s\S]*?)\]/g
  const codingPlans = []
  let match = codingPlanRegex.exec(content)
  while (match !== null) {
    const models = match[1].match(/'([^']+)'/g)?.map((s) => s.replace(/'/g, ''))
    codingPlans.push(models || [])
    match = codingPlanRegex.exec(content)
  }

  return { providers: result, codingPlans, raw: content }
}

// ─── Live API Fetcher ────────────────────────────────────────────────────────

async function fetchLiveModels(providerId, config) {
  if (!config.apiModelsUrl) {
    return { skipped: true, reason: 'No API endpoint configured' }
  }

  const apiKey = process.env[config.envKey]
  if (!apiKey) {
    return { skipped: true, reason: `No ${config.envKey} in environment` }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10000)

  try {
    let url = config.apiModelsUrl
    const headers = {}

    if (config.authMethod === 'query') {
      url = `${url}?key=${apiKey}`
    } else {
      headers.Authorization = `Bearer ${apiKey}`
    }

    const res = await fetch(url, {
      signal: controller.signal,
      headers,
    })

    if (!res.ok) {
      return { error: `HTTP ${res.status}` }
    }

    const data = await res.json()
    let models = []

    if (config.authMethod === 'query') {
      // Google format
      models = (data.models || []).map((m) => ({
        id: m.name?.replace('models/', ''),
        displayName: m.displayName,
        inputTokenLimit: m.inputTokenLimit,
        outputTokenLimit: m.outputTokenLimit,
      }))
    } else {
      // OpenAI-compatible format
      models = (data.data || data.models || []).map((m) => ({
        id: m.id,
        ownedBy: m.owned_by,
        created: m.created ? new Date(m.created * 1000).toISOString().slice(0, 10) : undefined,
      }))
    }

    // Apply provider-specific filter
    if (config.filterModels) {
      models = config.filterModels(models)
    }

    return { models }
  } catch (err) {
    return { error: err.message }
  } finally {
    clearTimeout(timer)
  }
}

// ─── Report Generator ────────────────────────────────────────────────────────

function generateReport(currentPresets, liveData) {
  const report = {
    timestamp: new Date().toISOString(),
    summary: { total: 0, withApi: 0, newModels: 0, deprecatedCount: 0 },
    providers: {},
  }

  for (const [providerId, config] of Object.entries(PROVIDERS)) {
    const current = currentPresets.providers[providerId] || {
      ids: [],
      deprecated: [],
      recommended: [],
    }
    const live = liveData[providerId]

    const provider = {
      name: config.name,
      docsUrl: config.docsUrl,
      pricingUrl: config.pricingUrl,
      currentModels: current.ids,
      currentCount: current.ids.length,
      deprecated: current.deprecated,
      recommended: current.recommended,
    }

    if (live?.models) {
      const liveIds = live.models.map((m) => m.id)
      const currentSet = new Set(current.ids)
      const liveSet = new Set(liveIds)

      provider.liveModels = live.models
      provider.liveCount = liveIds.length
      provider.newInApi = liveIds.filter((id) => !currentSet.has(id))
      provider.missingFromApi = current.ids.filter((id) => !liveSet.has(id))

      report.summary.withApi++
      report.summary.newModels += provider.newInApi.length
    } else if (live?.skipped) {
      provider.apiStatus = `Skipped: ${live.reason}`
    } else if (live?.error) {
      provider.apiStatus = `Error: ${live.error}`
    }

    report.summary.total += current.ids.length
    report.summary.deprecatedCount += current.deprecated.length
    report.providers[providerId] = provider
  }

  return report
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  const targetProvider = args.includes('--provider') ? args[args.indexOf('--provider') + 1] : null
  const useApi = args.includes('--api')

  console.log('🔍 Shadow Model Presets Audit')
  console.log(`${'═'.repeat(50)}\n`)

  // 1. Parse current presets
  console.log('📄 Parsing current model-presets.ts...')
  const currentPresets = parseCurrentPresets()
  const totalModels = Object.values(currentPresets.providers).reduce(
    (sum, p) => sum + p.ids.length,
    0,
  )
  const totalDeprecated = Object.values(currentPresets.providers).reduce(
    (sum, p) => sum + p.deprecated.length,
    0,
  )
  console.log(
    `   ${Object.keys(currentPresets.providers).length} providers, ${totalModels} models (${totalDeprecated} deprecated)\n`,
  )

  // 2. Print current state
  console.log('── Current Presets ──────────────────────────────────')
  const entries = targetProvider
    ? [[targetProvider, PROVIDERS[targetProvider]]].filter(([, v]) => v)
    : Object.entries(PROVIDERS)

  for (const [providerId] of entries) {
    const current = currentPresets.providers[providerId]
    if (!current || current.ids.length === 0) continue
    const rec = current.recommended.length
    const dep = current.deprecated.length
    const active = current.ids.length - dep

    let line = `  ${providerId.padEnd(20)} ${String(active).padStart(2)} active`
    if (dep > 0) line += `, ${dep} deprecated`
    if (rec > 0) line += ` (${rec} ⭐)`
    console.log(line)
  }

  // 3. Optionally fetch live API data
  const liveData = {}

  if (useApi) {
    console.log('\n── Live API Model Discovery ─────────────────────────')

    for (const [providerId, config] of entries) {
      process.stdout.write(`  ${config.name.padEnd(25)} `)
      const result = await fetchLiveModels(providerId, config)
      liveData[providerId] = result

      if (result.models) {
        console.log(`✓ ${result.models.length} models`)
      } else if (result.skipped) {
        console.log(`⬜ ${result.reason}`)
      } else {
        console.log(`✗ ${result.error}`)
      }
    }

    // Show diffs
    console.log('\n── API vs Presets Diff ──────────────────────────────')
    let hasChanges = false

    for (const [providerId] of entries) {
      const live = liveData[providerId]
      const current = currentPresets.providers[providerId]
      if (!live?.models || !current) continue

      const currentSet = new Set(current.ids)
      const liveSet = new Set(live.models.map((m) => m.id))

      const newModels = live.models.filter((m) => !currentSet.has(m.id))
      const missing = current.ids.filter((id) => !liveSet.has(id))

      if (newModels.length > 0 || missing.length > 0) {
        hasChanges = true
        console.log(`\n  ${PROVIDERS[providerId].name} (${providerId}):`)
        for (const m of newModels) {
          const extra = m.created ? ` (${m.created})` : ''
          console.log(`    + ${m.id}${extra}`)
        }
        for (const id of missing) {
          const isDep = current.deprecated.includes(id)
          console.log(`    - ${id}${isDep ? ' [deprecated]' : ''}`)
        }
      }
    }

    if (!hasChanges) {
      console.log('  ✅ No differences detected')
    }
  }

  // 4. Print verification links
  console.log('\n── Verification Links ──────────────────────────────')
  for (const [providerId, config] of entries) {
    console.log(`  ${config.name}:`)
    console.log(`    Docs:    ${config.docsUrl}`)
    if (config.pricingUrl) {
      console.log(`    Pricing: ${config.pricingUrl}`)
    }
  }

  // 5. Save report
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  const report = generateReport(currentPresets, liveData)
  const reportPath = path.join(OUTPUT_DIR, 'model-presets-audit.json')
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
  console.log(`\n💾 Full report: ${path.relative(ROOT, reportPath)}`)

  // 6. Coding plan summary
  if (currentPresets.codingPlans.length > 0) {
    console.log('\n── Coding Plans ────────────────────────────────────')
    for (const models of currentPresets.codingPlans) {
      console.log(`  ${models.join(', ')}`)
    }
  }

  console.log('\n💡 Run with --api to discover new models from live provider APIs.')
  console.log('   Set API key env vars (OPENAI_API_KEY, etc.) for each provider.\n')
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
