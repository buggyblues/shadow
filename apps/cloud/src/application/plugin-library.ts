import type { PluginCapability, PluginCategory, PluginManifest } from '../plugins/types.js'
import { GENERATED_PLUGIN_LIBRARY } from './plugin-library.generated.js'

export interface PluginLibraryEntry {
  id: string
  name: string
  description: string
  version: string
  category: PluginCategory
  capabilities: PluginCapability[]
  tags: string[]
  authType: PluginManifest['auth']['type']
  website?: string
  docs?: string
  popularity?: number
  manifest: PluginManifest
  requiredFields: Array<{
    key: string
    label: string
    description?: string
    sensitive: boolean
  }>
  readme: {
    title: string
    excerpt: string
    headings: string[]
  }
  searchText: string
}

export interface PluginLibrarySearchResult extends PluginLibraryEntry {
  score: number
  matchedTerms: string[]
}

const TOKEN_ALIASES: Record<string, string[]> = {
  周报: ['brief', 'report', 'daily-brief'],
  简报: ['brief', 'report'],
  竞品: ['competitor', 'research', 'crawl', 'browser'],
  增长: ['growth', 'seo', 'analytics', 'marketing'],
  文档: ['docs', 'drive', 'notion', 'knowledge'],
  知识库: ['knowledge', 'notion', 'docs'],
  客服: ['support', 'knowledge', 'crm'],
  代码: ['github', 'repo', 'pull request'],
  仓库: ['github', 'repo', 'gitee'],
  网站: ['seo', 'analytics', 'web', 'vercel'],
  支付: ['stripe', 'paypal', 'alipay', 'wechat-pay'],
}

const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'build',
  'by',
  'for',
  'from',
  'in',
  'into',
  'is',
  'it',
  'of',
  'on',
  'or',
  'space',
  'that',
  'the',
  'to',
  'with',
])

function normalizeQuery(query: string) {
  const rawTerms = query
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fa5._-]+/u)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2 && !STOPWORDS.has(term))
    .slice(0, 48)
  const expanded = new Set<string>()
  for (const term of rawTerms) {
    expanded.add(term)
    for (const [alias, terms] of Object.entries(TOKEN_ALIASES)) {
      if (term.includes(alias)) {
        for (const item of terms) expanded.add(item)
      }
    }
  }
  return [...expanded]
}

function scorePlugin(entry: PluginLibraryEntry, terms: string[]) {
  if (terms.length === 0) return 0
  let score = 0
  const matchedTerms: string[] = []
  const haystack = entry.searchText
  for (const term of terms) {
    if (!haystack.includes(term)) continue
    matchedTerms.push(term)
    if (entry.id.includes(term)) score += 18
    if (entry.name.toLowerCase().includes(term)) score += 14
    if (entry.tags.some((tag) => tag.toLowerCase().includes(term))) score += 8
    if (entry.capabilities.some((capability) => capability.includes(term))) score += 5
    score += 3
  }
  if (matchedTerms.length === 0) return 0
  score += Math.min(10, Math.round((entry.popularity ?? 0) / 12))
  return { score, matchedTerms }
}

export function listPluginLibrary(): PluginLibraryEntry[] {
  return GENERATED_PLUGIN_LIBRARY
}

export function searchPluginLibrary(
  query: string,
  options: { limit?: number; includeIds?: string[] } = {},
): PluginLibrarySearchResult[] {
  const includeIds = new Set(options.includeIds ?? [])
  const terms = normalizeQuery(query)
  const scored = listPluginLibrary()
    .map((entry) => {
      const result = scorePlugin(entry, terms)
      const forced = includeIds.has(entry.id)
      const score = typeof result === 'number' ? result : result.score
      const matchedTerms = typeof result === 'number' ? [] : result.matchedTerms
      return {
        ...entry,
        score: forced ? Math.max(score, 999) : score,
        matchedTerms,
      }
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))

  return scored.slice(0, options.limit ?? 16)
}

export function getPluginLibraryEntry(id: string): PluginLibraryEntry | undefined {
  return listPluginLibrary().find((entry) => entry.id === id)
}
