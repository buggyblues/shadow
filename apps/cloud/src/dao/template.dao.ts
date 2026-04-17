/**
 * TemplateDao — file-based template data access.
 *
 * All I/O is async. Supports two on-disk layouts:
 *   Folder: templates/<slug>/shadowob-cloud.json  (+ optional index.json)
 *   Flat:   templates/<slug>.template.json
 *
 * Folder layout takes priority over flat when both exist for the same slug.
 */

import { cp, mkdir, readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { parseJsonc } from '../utils/jsonc.js'

export interface TemplateRecord {
  slug: string
  isFolder: boolean
  configPath: string
  indexPath: string | null
  dir: string
}

export class TemplateDao {
  constructor(readonly templatesDir: string) {}

  /** Discover all available template slugs. Folder layout takes priority. */
  async findAll(): Promise<TemplateRecord[]> {
    let dirEntries: string[]
    try {
      dirEntries = await readdir(this.templatesDir)
    } catch {
      return []
    }

    const seenSlugs = new Set<string>()
    const records: TemplateRecord[] = []

    // 1. Folder-based: subdirectory containing shadowob-cloud.json
    for (const name of dirEntries) {
      const fullPath = join(this.templatesDir, name)
      let isDir = false
      try {
        isDir = (await stat(fullPath)).isDirectory()
      } catch {
        continue
      }
      if (!isDir) continue

      const slug = name
      const configPath = join(this.templatesDir, slug, 'shadowob-cloud.json')
      if (!(await this.exists(configPath))) continue
      seenSlugs.add(slug)

      const indexPath = join(this.templatesDir, slug, 'index.json')
      const hasIndex = await this.exists(indexPath)

      records.push({
        slug,
        isFolder: true,
        configPath,
        indexPath: hasIndex ? indexPath : null,
        dir: join(this.templatesDir, slug),
      })
    }

    // 2. Flat: <slug>.template.json — skip already-seen slugs
    for (const name of dirEntries) {
      if (!name.endsWith('.template.json')) continue
      const slug = name.replace(/\.template\.json$/, '')
      if (seenSlugs.has(slug)) continue
      const configPath = join(this.templatesDir, name)
      records.push({
        slug,
        isFolder: false,
        configPath,
        indexPath: null,
        dir: this.templatesDir,
      })
    }

    return records
  }

  /** Find a single template by slug. Returns null if not found. */
  async findBySlug(slug: string): Promise<TemplateRecord | null> {
    // Prefer folder
    const folderConfig = join(this.templatesDir, slug, 'shadowob-cloud.json')
    if (await this.exists(folderConfig)) {
      const indexPath = join(this.templatesDir, slug, 'index.json')
      const hasIndex = await this.exists(indexPath)
      return {
        slug,
        isFolder: true,
        configPath: folderConfig,
        indexPath: hasIndex ? indexPath : null,
        dir: join(this.templatesDir, slug),
      }
    }
    // Fall back to flat
    const flatConfig = join(this.templatesDir, `${slug}.template.json`)
    if (await this.exists(flatConfig)) {
      return {
        slug,
        isFolder: false,
        configPath: flatConfig,
        indexPath: null,
        dir: this.templatesDir,
      }
    }
    return null
  }

  /** Read and parse a JSON/JSONC file. Returns null on error. */
  async readJson<T = Record<string, unknown>>(filePath: string): Promise<T | null> {
    try {
      const raw = await readFile(filePath, 'utf-8')
      return parseJsonc<T>(raw, filePath)
    } catch {
      return null
    }
  }

  /** Get file mtime as ISO string. Returns null if file not found. */
  async mtime(filePath: string): Promise<string | null> {
    try {
      return (await stat(filePath)).mtime.toISOString()
    } catch {
      return null
    }
  }

  /** Copy a template folder (or single file) to destDir. */
  async copyTo(slug: string, destDir: string): Promise<void> {
    const record = await this.findBySlug(slug)
    if (!record) throw new Error(`Template not found: ${slug}`)
    await mkdir(destDir, { recursive: true })
    if (record.isFolder) {
      await cp(record.dir, destDir, { recursive: true })
    } else {
      await cp(record.configPath, join(destDir, 'shadowob-cloud.json'))
    }
  }

  private async exists(path: string): Promise<boolean> {
    try {
      await stat(path)
      return true
    } catch {
      return false
    }
  }
}
