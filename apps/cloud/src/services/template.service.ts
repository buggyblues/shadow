/**
 * TemplateService — template discovery and reading.
 *
 * Provides access to config templates for `init` and `serve` commands.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseJsonc } from '../utils/jsonc.js'

export interface TemplateMeta {
  name: string
  file: string
  description: string
  teamName: string
  agentCount: number
  namespace: string
}

export class TemplateService {
  private templatesDir: string

  constructor(templatesDir?: string) {
    // After tsup bundling, import.meta.url points to dist/index.js
    // so we only need to go up 1 level to reach the package root.
    this.templatesDir =
      templatesDir ?? resolve(fileURLToPath(import.meta.url), '..', '..', 'templates')
  }

  /** Get the templates directory path. */
  getDir(): string {
    return this.templatesDir
  }

  /** Discover all available config templates. */
  discover(locale?: string): TemplateMeta[] {
    if (!existsSync(this.templatesDir)) return []
    return readdirSync(this.templatesDir)
      .filter((f) => f.endsWith('.template.json'))
      .map((file) => {
        const name = file.replace(/\.template\.json$/, '')
        const filePath = resolve(this.templatesDir, file)
        try {
          const raw = parseJsonc<Record<string, unknown>>(readFileSync(filePath, 'utf-8'), filePath)
          const i18nDict = resolveI18nDict(raw, locale)
          const team = raw.team as Record<string, unknown> | undefined
          return {
            name,
            file,
            description:
              resolveI18nValue(raw.description, i18nDict) ?? (team?.description as string) ?? '',
            teamName: resolveI18nValue(raw.name, i18nDict) ?? (team?.name as string) ?? name,
            agentCount: (((raw.deployments as Record<string, unknown>)?.agents as unknown[]) ?? [])
              .length,
            namespace: (raw.deployments as Record<string, unknown>)?.namespace ?? name,
          } as TemplateMeta
        } catch {
          return { name, file, description: '', teamName: name, agentCount: 0, namespace: name }
        }
      })
      .sort((a, b) => {
        if (a.name === 'shadowob-cloud') return -1
        if (b.name === 'shadowob-cloud') return 1
        return a.name.localeCompare(b.name)
      })
  }

  /** Read a template by name. Returns parsed JSON or null if not found. */
  getTemplate(name: string): unknown | null {
    const filePath = resolve(this.templatesDir, `${name}.template.json`)
    if (!existsSync(filePath)) return null
    try {
      return parseJsonc(readFileSync(filePath, 'utf-8'), filePath)
    } catch {
      return null
    }
  }

  /** List templates in a display-friendly format. */
  list(locale?: string): Array<{
    name: string
    description: string
    teamName: string
    agentCount: number
    namespace: string
  }> {
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
 * Returns the translated string if available, or the raw value as fallback.
 */
function resolveI18nValue(value: unknown, i18nDict?: Record<string, string>): string | undefined {
  if (typeof value !== 'string') return undefined
  if (!i18nDict) return value
  const key = /^\$\{i18n:([^}]+)\}$/.exec(value)?.[1]
  if (!key) return value
  return i18nDict[key] ?? value
}
