/**
 * TemplateService — template discovery and metadata.
 *
 * All I/O is delegated to TemplateDao. This service handles
 * business logic: i18n resolution, sorting, metadata mapping.
 */

import type { TemplateDao } from '../dao/template.dao.js'

export interface TemplateMeta {
  name: string
  /** Relative path to the config file from templatesDir */
  file: string
  description: string
  teamName: string
  agentCount: number
  namespace: string
  /** Absolute path to the directory containing the config (for relative path resolution) */
  dir: string
}

export class TemplateService {
  constructor(private readonly dao: TemplateDao) {}

  /** Get the templates directory path. */
  getDir(): string {
    return this.dao.templatesDir
  }

  /** Discover all available config templates. */
  async discover(locale?: string): Promise<TemplateMeta[]> {
    const records = await this.dao.findAll()
    const results: TemplateMeta[] = []

    for (const record of records) {
      const raw = await this.dao.readJson(record.configPath)
      if (!raw) {
        results.push({
          name: record.slug,
          file: record.isFolder
            ? `${record.slug}/shadowob-cloud.json`
            : `${record.slug}.template.json`,
          description: '',
          teamName: record.slug,
          agentCount: 0,
          namespace: record.slug,
          dir: record.dir,
        })
        continue
      }

      const indexMeta = record.indexPath ? await this.dao.readJson(record.indexPath) : null
      const source = indexMeta ?? raw
      const i18nDict = resolveI18nDict(source, locale)
      const team = source.team as Record<string, unknown> | undefined

      results.push({
        name: record.slug,
        file: record.isFolder
          ? `${record.slug}/shadowob-cloud.json`
          : `${record.slug}.template.json`,
        dir: record.dir,
        description:
          resolveI18nValue(source.description, i18nDict) ?? (team?.description as string) ?? '',
        teamName: resolveI18nValue(source.name, i18nDict) ?? (team?.name as string) ?? record.slug,
        agentCount: (((raw.deployments as Record<string, unknown>)?.agents as unknown[]) ?? [])
          .length,
        namespace:
          ((raw.deployments as Record<string, unknown>)?.namespace as string) ?? record.slug,
      })
    }

    return results.sort((a, b) => {
      if (a.name === 'shadowob-cloud') return -1
      if (b.name === 'shadowob-cloud') return 1
      return a.name.localeCompare(b.name)
    })
  }

  /**
   * Read a template config by name.
   * Prefers folder layout over flat files.
   */
  async getTemplate(name: string): Promise<unknown | null> {
    const record = await this.dao.findBySlug(name)
    if (!record) return null
    return this.dao.readJson(record.configPath)
  }

  /**
   * Get the absolute path to a template's config file.
   * Useful for resolving relative paths (e.g. gitagent source.path).
   */
  async getTemplatePath(name: string): Promise<string | null> {
    const record = await this.dao.findBySlug(name)
    return record?.configPath ?? null
  }

  /** List templates metadata (alias for discover). */
  async list(locale?: string): Promise<TemplateMeta[]> {
    return this.discover(locale)
  }
}

/**
 * Resolve i18n dict from a template's `i18n` field for the given locale.
 * Falls back to 'en' if the requested locale isn't available.
 */
function resolveI18nDict(
  raw: Record<string, unknown>,
  locale?: string,
): Record<string, string> | undefined {
  const i18n = raw.i18n as Record<string, Record<string, string>> | undefined
  if (!i18n || !locale) return undefined
  const baseLocale = locale.split('-')[0]
  return i18n[locale] ?? (baseLocale ? i18n[baseLocale] : undefined) ?? i18n.en
}

/**
 * Resolve a string value that may contain `${i18n:key}` references.
 */
function resolveI18nValue(value: unknown, i18nDict?: Record<string, string>): string | undefined {
  if (typeof value !== 'string') return undefined
  if (!i18nDict) return value
  const key = /^\$\{i18n:([^}]+)\}$/.exec(value)?.[1]
  if (!key) return value
  return i18nDict[key] ?? value
}
