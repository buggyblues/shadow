// ═══════════════════════════════════════════════════════════════
// ThemeService — SDK Theme index, search, detail, components
// ═══════════════════════════════════════════════════════════════

import { existsSync, readdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ThemeComponent, ThemeFolder } from '@shadowob/flash-types'
import { THEMES_DIR } from '../config.js'

let themeIndexCache: { folders: ThemeFolder[] } | null = null
const themeDetailsCache = new Map<string, ThemeFolder>()
let themeThumbnailCache: Record<string, string> | null = null

async function loadThemeIndex(): Promise<{ folders: ThemeFolder[] }> {
  if (themeIndexCache) return themeIndexCache
  const indexPath = join(THEMES_DIR, 'index.json')
  if (!existsSync(indexPath)) {
    console.warn('⚠️ SDK themes index.json not found at', indexPath)
    return { folders: [] }
  }
  try {
    const data = JSON.parse(await readFile(indexPath, 'utf-8'))
    const enrichedFolders: ThemeFolder[] = []
    for (const folder of data.folders || []) {
      const candidates = [
        folder.path,
        folder.path?.replace(/ /g, '-'),
        folder.name,
        folder.name?.replace(/ /g, '-'),
      ].filter(Boolean)

      let resolvedPath: string | null = null
      for (const candidate of candidates) {
        if (existsSync(join(THEMES_DIR, candidate))) {
          resolvedPath = candidate
          break
        }
      }

      let themeDetail: ThemeFolder = { ...folder }
      if (resolvedPath) {
        themeDetail._resolvedPath = resolvedPath
        try {
          const subIndex = JSON.parse(
            await readFile(join(THEMES_DIR, resolvedPath, 'index.json'), 'utf-8'),
          )
          themeDetail = { ...themeDetail, ...subIndex, _resolvedPath: resolvedPath }
        } catch {
          /* use root index data */
        }
        try {
          const promptPath = join(THEMES_DIR, resolvedPath, 'prompts', 'THEME.md.json')
          if (existsSync(promptPath)) {
            const promptData = JSON.parse(await readFile(promptPath, 'utf-8'))
            themeDetail._themeDescription = promptData.content || ''
            const kwMatch = promptData.content?.match(/## Keywords\n([^\n]*(?:\n[^\n#]*)*)/m)
            if (kwMatch) themeDetail._keywords = kwMatch[1].trim()
          }
        } catch {
          /* ignore */
        }
      }
      enrichedFolders.push(themeDetail)
    }
    const result = { ...data, folders: enrichedFolders }
    themeIndexCache = result
    console.log(`🎨 Loaded ${enrichedFolders.length} SDK themes`)
    return result
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Failed to load theme index:', msg)
    return { folders: [] }
  }
}

function searchThemes(themes: ThemeFolder[], query: string, limit = 20): ThemeFolder[] {
  if (!query) return themes.slice(0, limit)
  const q = query.toLowerCase()
  const scored = themes.map((t) => {
    let score = 0
    const name = (t.name || '').toLowerCase()
    const desc = (t._themeDescription || '').toLowerCase()
    const kw = (t._keywords || '').toLowerCase()
    if (name.includes(q)) score += 10
    if (kw.includes(q)) score += 5
    if (desc.includes(q)) score += 3
    for (const word of q.split(/\s+/)) {
      if (word.length < 2) continue
      if (name.includes(word)) score += 4
      if (kw.includes(word)) score += 2
      if (desc.includes(word)) score += 1
    }
    return { ...t, _score: score }
  })
  return scored
    .filter((t) => !query || (t._score ?? 0) > 0)
    .sort((a, b) => (b._score ?? 0) - (a._score ?? 0))
    .slice(0, limit)
}

async function getThemeThumbnails(themes: ThemeFolder[]): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  for (const theme of themes) {
    if (!theme._resolvedPath) continue
    const compDir = join(THEMES_DIR, theme._resolvedPath, 'components')
    if (!existsSync(compDir)) continue
    try {
      const compFiles = readdirSync(compDir).filter((f) => f.endsWith('.json'))
      const coverFile = compFiles.find((f) => /cover|1_cover/i.test(f)) || compFiles[0]
      if (coverFile) {
        const compData = JSON.parse(await readFile(join(compDir, coverFile), 'utf-8'))
        if (compData.previewThumbnailUrl) result[theme.id] = compData.previewThumbnailUrl
      }
    } catch {
      /* ignore */
    }
  }
  return result
}

export const themeService = {
  loadThemeIndex,

  async search(query: string, category: string, limit: number) {
    const index = await loadThemeIndex()
    let themes = index.folders || []

    if (category) {
      themes = themes.filter((t) => {
        const name = t.name || ''
        if (category === 'cover') return name.toLowerCase().includes('cover')
        if (category === 'report')
          return name.toLowerCase().includes('report') || name.toLowerCase().includes('work report')
        if (category === 'official') return name.toLowerCase().includes('official')
        return true
      })
    }

    themes = query ? searchThemes(themes, query, limit) : themes.slice(0, limit)

    if (!themeThumbnailCache) {
      themeThumbnailCache = await getThemeThumbnails(index.folders || [])
    }

    return {
      themes: themes.map((t) => ({
        id: t.id,
        name: t.name,
        componentCount: t.componentCount || 0,
        promptCount: t.promptCount || 0,
        keywords: t._keywords || '',
        description: (t._themeDescription || '').slice(0, 200),
        category: (t.name || '').toLowerCase().includes('cover')
          ? 'cover'
          : (t.name || '').toLowerCase().includes('report')
            ? 'report'
            : 'official',
        thumbnailUrl: themeThumbnailCache?.[t.id] || null,
      })),
      total: (index.folders || []).length,
    }
  },

  async getThumbnails() {
    if (themeThumbnailCache) return themeThumbnailCache
    const index = await loadThemeIndex()
    themeThumbnailCache = await getThemeThumbnails(index.folders || [])
    return themeThumbnailCache
  },

  async getDetail(themeId: string) {
    if (themeDetailsCache.has(themeId)) return themeDetailsCache.get(themeId)!

    const index = await loadThemeIndex()
    const theme = (index.folders || []).find((f) => f.id === themeId)
    if (!theme) return null

    const resolvedPath = theme._resolvedPath
    if (!resolvedPath) return theme

    const detail: ThemeFolder = { ...theme, components: [], promptContent: '' }
    const compDir = join(THEMES_DIR, resolvedPath, 'components')
    if (existsSync(compDir)) {
      for (const cf of readdirSync(compDir).filter((f) => f.endsWith('.json'))) {
        try {
          const compData = JSON.parse(await readFile(join(compDir, cf), 'utf-8'))
          detail.components!.push({
            id: compData.id,
            name: compData.name,
            notes: compData.notes || '',
            jsxCode: compData.jsxCode || '',
          })
        } catch {
          /* ignore */
        }
      }
    }
    detail.promptContent = theme._themeDescription || ''
    themeDetailsCache.set(themeId, detail)
    return detail
  },

  async getComponents(themeId: string): Promise<ThemeComponent[] | null> {
    const index = await loadThemeIndex()
    const theme = (index.folders || []).find((f) => f.id === themeId)
    if (!theme || !theme._resolvedPath) return null

    const compDir = join(THEMES_DIR, theme._resolvedPath, 'components')
    if (!existsSync(compDir)) return []

    const components: ThemeComponent[] = []
    for (const cf of readdirSync(compDir).filter((f) => f.endsWith('.json'))) {
      try {
        const data = JSON.parse(await readFile(join(compDir, cf), 'utf-8'))
        components.push({
          id: data.id,
          name: data.name,
          notes: data.notes || '',
          jsxCode: data.jsxCode || '',
        })
      } catch {
        /* ignore */
      }
    }
    return components
  },
}
