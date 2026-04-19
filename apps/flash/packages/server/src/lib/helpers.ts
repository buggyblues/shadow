// ═══════════════════════════════════════════════════════════════
// Helper Utilities — Material/Card context builders for LLM
//
// v8: materialDao now requires projectId
// ═══════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises'
import type { CardRecord, MaterialRecord } from '@shadowob/flash-types'
import { materialDao } from '../dao/index.js'

/** Build material context string for LLM prompts */
export async function buildMaterialContext(
  mats: Array<Partial<MaterialRecord>>,
  pid = 'default',
): Promise<string> {
  const parts: string[] = []
  for (const mat of mats) {
    // Prefer DAO lookup; fall back to the mat object from frontend (which may contain path)
    const stored = mat.id ? materialDao.getById(pid, mat.id) : undefined
    if (!stored && mat.id) {
      console.log(
        `[helpers] materialDao.getById(${pid}, ${mat.id}) not found, using mat.path=${mat.path}`,
      )
    }
    const path = stored?.path || mat.path
    if (!path) {
      if (mat.content) parts.push(`### ${mat.name}\n${mat.content}`)
      else console.warn(`[helpers] material ${mat.id} (${mat.name}) has no path and no content`)
      continue
    }
    try {
      const type = stored?.type || mat.type
      if (['text', 'markdown', 'idea', 'url'].includes(type || '')) {
        const content = await readFile(path, 'utf-8')
        parts.push(`### ${mat.name} (${type})\n${content.slice(0, 10000)}`)
      } else if (type === 'code' || type === 'json' || type === 'csv') {
        const content = await readFile(path, 'utf-8')
        parts.push(`### ${mat.name} (${type})\n\`\`\`\n${content.slice(0, 8000)}\n\`\`\``)
      } else if (type === 'image') {
        try {
          const buf = await readFile(path)
          const base64 = buf.toString('base64')
          parts.push(
            `### ${mat.name} (image)\n[Image data: data:${stored?.mimeType || 'image/png'};base64,${base64.slice(0, 200)}...]\n[Full base64 passed to AI]`,
          )
        } catch {
          parts.push(`### ${mat.name} (image)\n[Image: ${path}, please analyze]`)
        }
      } else {
        parts.push(`### ${mat.name} (${type})\n[File: ${path}]`)
      }
    } catch {
      parts.push(`### ${mat.name}\n[File read failed]`)
    }
  }
  return parts.join('\n\n')
}

/** Build card context string for LLM prompts — pass structured data */
export function buildCardContext(cardsList: Array<Partial<CardRecord>>): string {
  if (!cardsList || cardsList.length === 0) return ''
  const sorted = [...cardsList].sort((a, b) => (b.rating || 0) - (a.rating || 0))
  const lines = sorted.map((c) => {
    const links = c.linkedCardIds?.length ? ` [linked: ${c.linkedCardIds.join(',')}]` : ''
    const tags = c.tags?.length ? ` #${c.tags.join(' #')}` : ''
    const rating = c.rating ? ` ★${c.rating}` : ''
    const deckInfo = c.deckIds?.length ? ` [Decks: ${c.deckIds.join(',')}]` : ''
    const priority = c.priority === 'high' ? ' 🔴high' : c.priority === 'medium' ? ' 🟡medium' : ''
    const contentLen = c.rating && c.rating >= 4 ? 800 : c.rating && c.rating >= 3 ? 500 : 300

    // Extract structured data summary
    const meta = (c.meta || {}) as Record<string, unknown>
    let structuredSummary = ''
    switch (c.kind) {
      case 'data': {
        const metrics = meta.metrics as
          | { key: string; value: string | number; unit?: string }[]
          | undefined
        if (metrics?.length) {
          structuredSummary = ` 📊[${metrics.map((m) => `${m.key}:${m.value}${m.unit || ''}`).join(', ')}]`
        }
        break
      }
      case 'chart': {
        const series = meta.series as { name: string; data: number[] }[] | undefined
        const categories = meta.categories as string[] | undefined
        if (series?.length) {
          structuredSummary = ` 📈[${series.map((s) => s.name).join('/')}${categories ? ` x${categories.length}pts` : ''}]`
        }
        break
      }
      case 'table': {
        const cols = meta.columns as { label: string }[] | undefined
        const rows = meta.rows as unknown[] | undefined
        if (cols?.length) {
          structuredSummary = ` 📋[${cols.map((c) => c.label).join(',')} · ${rows?.length || 0} rows]`
        }
        break
      }
      case 'argument': {
        const claim = meta.claim as string | undefined
        const evidence = meta.evidence as unknown[] | undefined
        if (claim)
          structuredSummary = ` 💡[claim: ${claim.slice(0, 60)}${evidence?.length ? ` · ${evidence.length} evidence items` : ''}]`
        break
      }
      case 'quote': {
        const text = meta.text as string | undefined
        const author = meta.author as string | undefined
        if (text) structuredSummary = ` 💬["${text.slice(0, 50)}"${author ? ` — ${author}` : ''}]`
        break
      }
      case 'timeline': {
        const events = meta.events as { date: string; title: string }[] | undefined
        if (events?.length)
          structuredSummary = ` 🕐[${events.map((e) => `${e.date}:${e.title}`).join(' → ')}]`
        break
      }
      case 'comparison': {
        const subjects = meta.subjects as string[] | undefined
        const dims = meta.dimensions as unknown[] | undefined
        if (subjects?.length)
          structuredSummary = ` ⚖️[${subjects.join(' vs ')}${dims?.length ? ` · ${dims.length} dimensions` : ''}]`
        break
      }
      case 'process': {
        const steps = meta.steps as { label: string }[] | undefined
        if (steps?.length) structuredSummary = ` 🔄[${steps.map((s) => s.label).join(' → ')}]`
        break
      }
    }

    return `- [${c.kind}] ${c.id}: "${c.title}"${rating}${priority}${structuredSummary} — ${c.content?.slice(0, contentLen) || '(no content)'}${links}${tags}${deckInfo}`
  })
  return `\n\n## Existing Cards (${sorted.length} total, sorted by rating — ★ high-rated card content should be prioritized)\n\n⚠️ Important: Please use the actual content of the cards below to populate PPT slides. Do not ignore the card content and write your own.\n\n${lines.join('\n')}`
}
