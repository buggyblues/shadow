import { describe, expect, it } from 'vitest'
import {
  listPluginLibrary,
  listTemplateLibrary,
  searchPluginLibrary,
  searchTemplateLibrary,
} from '../../src/index.js'

describe('generated Cloud libraries', () => {
  it('packs plugin README and manifest data into the searchable library', () => {
    const plugins = listPluginLibrary()
    const googleWorkspace = plugins.find((plugin) => plugin.id === 'google-workspace')

    expect(plugins.length).toBeGreaterThan(40)
    expect(googleWorkspace?.manifest.auth.type).toBe('oauth2')
    expect(googleWorkspace?.readme.excerpt).toContain('Google Workspace')
    expect(googleWorkspace?.searchText).toContain('drive')
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
