/**
 * Database Seed — populate templates from the filesystem on first run.
 * Only inserts templates that don't already exist (by slug).
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { eq } from 'drizzle-orm'
import { parseJsonc } from '../utils/jsonc.js'
import type { CloudDatabase } from './index.js'
import { templates } from './schema.js'

export function seedTemplates(db: CloudDatabase) {
  const templatesDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'templates')
  if (!existsSync(templatesDir)) return

  const files = readdirSync(templatesDir).filter((f) => f.endsWith('.template.json'))

  for (const file of files) {
    const slug = file.replace('.template.json', '')
    const existing = db.select().from(templates).where(eq(templates.slug, slug)).get()
    if (existing) continue

    try {
      const raw = readFileSync(join(templatesDir, file), 'utf-8')
      const content = parseJsonc<Record<string, unknown>>(raw, file)
      const meta = content.metadata as Record<string, unknown> | undefined

      db.insert(templates)
        .values({
          slug,
          name: (meta?.name as string) ?? slug,
          description: (meta?.description as string) ?? '',
          category: (meta?.category as string) ?? 'general',
          featured: Boolean(meta?.featured),
          content: content as never,
          version: (content.version as string) ?? '1.0.0',
          metadata: meta as never,
        })
        .run()
    } catch {
      // Skip invalid template files
    }
  }
}
