import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  CONNECTOR_PRESENTATION_LOCALES,
  listPluginLibrary,
  listTemplateLibrary,
  normalizeConnectorPresentationLocale,
  searchPluginLibrary,
  searchTemplateLibrary,
} from '../../src/index.js'

const HIDDEN_CONNECTOR_IDS = new Set([
  'agent-pack',
  'claude-plugin',
  'model-provider',
  'shadowob',
  'skills',
])

describe('generated Cloud libraries', () => {
  it('packs plugin README and manifest data into the searchable library', () => {
    const plugins = listPluginLibrary()
    const googleWorkspace = plugins.find((plugin) => plugin.id === 'google-workspace')
    const lark = plugins.find((plugin) => plugin.id === 'lark')
    const canva = plugins.find((plugin) => plugin.id === 'canva')

    expect(plugins.length).toBeGreaterThan(40)
    expect(googleWorkspace?.manifest.auth.type).toBe('oauth2')
    expect(googleWorkspace?.readme.excerpt).toContain('Google Workspace')
    expect(googleWorkspace?.searchText).toContain('drive')
    expect(lark?.manifest.capabilities).toEqual(expect.arrayContaining(['cli', 'skill']))
    expect(lark?.manifest.capabilities).not.toContain('mcp')
    expect(canva?.manifest.auth.oauth).toMatchObject({
      pkce: true,
      accessTokenField: 'CANVA_ACCESS_TOKEN',
    })
    expect(
      lark?.manifest.auth.fields.find((field) => field.key === 'LARKSUITE_CLI_APP_ID')?.helpUrl,
    ).toBe('https://open.feishu.cn/app')
  })

  it('searches plugins by request text instead of hardcoded scenario rules', () => {
    const results = searchPluginLibrary('整理竞品、生成增长周报、连接 Google Drive', {
      limit: 8,
      includeIds: ['model-provider', 'shadowob'],
    })
    const ids = results.map((plugin) => plugin.id)

    expect(ids).toContain('model-provider')
    expect(ids).toContain('shadowob')
    expect(ids).toContain('google-workspace')
  })

  it('packs a verified icon and complete localized presentation for every connector', () => {
    const connectors = listPluginLibrary().filter((plugin) => !HIDDEN_CONNECTOR_IDS.has(plugin.id))

    expect(connectors).toHaveLength(67)
    for (const connector of connectors) {
      expect(connector.iconDataUrl, connector.id).toMatch(/^data:image\/png;base64,/)
      expect(connector.iconSource?.sourceType, connector.id).not.toBe('generated-fallback')
      expect(connector.iconSource?.website, connector.id).toBe(connector.website)
      expect(connector.iconSource?.sourceUrl, connector.id).toBeTruthy()
      expect(connector.iconSource?.sha256, connector.id).toMatch(/^[a-f0-9]{64}$/)
      const pngBytes = Buffer.from(connector.iconDataUrl?.split(',')[1] ?? '', 'base64')
      expect(createHash('sha256').update(pngBytes).digest('hex'), connector.id).toBe(
        connector.iconSource?.sha256,
      )
      const visualBounds = connector.iconSource?.visualBounds
      expect(visualBounds, connector.id).toBeDefined()
      expect(
        Math.max(visualBounds?.width ?? 0, visualBounds?.height ?? 0),
        connector.id,
      ).toBeGreaterThanOrEqual(112)
      expect(visualBounds?.x, connector.id).toBeGreaterThanOrEqual(0)
      expect(visualBounds?.y, connector.id).toBeGreaterThanOrEqual(0)

      for (const locale of CONNECTOR_PRESENTATION_LOCALES) {
        expect(
          connector.localizations[locale]?.name.trim(),
          `${connector.id}:${locale}`,
        ).toBeTruthy()
        expect(
          connector.localizations[locale]?.description.trim(),
          `${connector.id}:${locale}`,
        ).toBeTruthy()
      }
    }
  })

  it('normalizes supported connector locales with deterministic fallbacks', () => {
    expect(normalizeConnectorPresentationLocale('zh-HK')).toBe('zh-TW')
    expect(normalizeConnectorPresentationLocale('zh_CN')).toBe('zh-CN')
    expect(normalizeConnectorPresentationLocale('ja-JP')).toBe('ja')
    expect(normalizeConnectorPresentationLocale('ko-KR')).toBe('ko')
    expect(normalizeConnectorPresentationLocale('fr-FR')).toBe('en')
  })

  it('keeps plugin search evidence tied to matched terms instead of popularity noise', () => {
    const results = searchPluginLibrary('competitor monitoring competitive intelligence', {
      limit: 8,
    })
    const ids = results.map((plugin) => plugin.id)

    expect(results.length).toBeGreaterThan(0)
    expect(results.every((plugin) => plugin.matchedTerms.length > 0)).toBe(true)
    expect(ids).toContain('firecrawl')
    expect(ids).not.toContain('canva')
    expect(ids).not.toContain('coze')
  })

  it('ranks the official Google Workspace connector first for Google Drive searches', () => {
    const results = searchPluginLibrary('Google Drive Google Workspace connector', {
      limit: 5,
    })

    expect(results[0]?.id).toBe('google-workspace')
    expect(results[0]?.matchedTerms).toEqual(expect.arrayContaining(['google', 'drive']))
  })

  it('packs valid official templates for generation references', () => {
    const templates = listTemplateLibrary()
    const results = searchTemplateLibrary('SEO 增长 周报', { limit: 6 })

    expect(templates.length).toBeGreaterThan(10)
    expect(templates.every((template) => template.valid)).toBe(true)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0]?.plugins.length).toBeGreaterThan(0)
  })
})
