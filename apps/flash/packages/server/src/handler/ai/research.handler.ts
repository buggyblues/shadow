// ═══════════════════════════════════════════════════════════════
// Research Handler — Multi-angle deep research
//
// Skill: research + web-search (online search + multi-angle research)
// AI writes research cards directly to file, no longer outputs JSON code blocks
//
// v8: AI writes to /data/projects/{pid}/ai-output/research-{angleId}-{ts}.json
// ═══════════════════════════════════════════════════════════════

import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import type { ServerResponse } from 'node:http'
import { ensureProjectDirs, OPENCLAW_TOKEN, OPENCLAW_URL, projectAiOutput } from '../../config.js'
import { buildCardContext, buildMaterialContext } from '../../lib/helpers.js'
import { createNodeSSEWriter, finishSSE } from '../../lib/sse.js'
import { cardService } from '../../service/card.service.js'

interface ResearchAngle {
  name: string
  description: string
}

export async function handleResearch(
  body: Record<string, unknown>,
  res: ServerResponse,
): Promise<void> {
  const { projectId, topic, materials, cards, angles, goals } = body

  const writer = createNodeSSEWriter(res)
  const pid = (projectId as string) || 'default'

  ensureProjectDirs(pid)

  const materialContext = await buildMaterialContext((materials as []) || [], pid)
  const cardContext = buildCardContext((cards as []) || [])
  const goalsArr = (goals as string[]) || []
  const goalsContext = goalsArr.length > 0 ? `\nResearch goals: ${goalsArr.join(', ')}` : ''

  writer.write(
    `data: ${JSON.stringify({ type: 'progress', data: `Starting deep research: ${topic}${goalsContext}, ${((angles as []) || []).length} angles in parallel...` })}\n\n`,
  )

  const anglePromises = ((angles as ResearchAngle[]) || []).map(async (angle, idx) => {
    const angleId = `angle-${idx}`
    writer.write(
      `data: ${JSON.stringify({ type: 'angle_started', data: JSON.stringify({ angleId }) })}\n\n`,
    )

    const sessionKey = `sf-research-${pid}-${angleId}`
    // v8: independent card output file per angle
    const cardFilePath = projectAiOutput(pid, `research-${angleId}-${Date.now()}.json`)
    const prompt = buildResearchAnglePrompt(
      topic as string,
      angle,
      materialContext,
      cardContext,
      goalsArr,
      cardFilePath,
    )

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENCLAW_TOKEN}`,
      }
      if (sessionKey) headers['x-openclaw-session-key'] = sessionKey

      const response = await fetch(`${OPENCLAW_URL}/v1/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: 'openclaw',
          stream: true,
          user: sessionKey,
          messages: [{ role: 'user', content: prompt }],
        }),
      })

      if (!response.ok) {
        const errText = await response.text()
        writer.write(
          `data: ${JSON.stringify({ type: 'angle_log', data: JSON.stringify({ angleId, message: `Error: ${response.status}` }) })}\n\n`,
        )
        return { angleId, cards: [] as Record<string, unknown>[], error: errText }
      }

      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = '',
        fullContent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const payload = line.slice(6)
            if (payload === '[DONE]') continue
            try {
              const delta = JSON.parse(payload)?.choices?.[0]?.delta?.content
              if (delta) {
                fullContent += delta
                if (delta.length > 20)
                  writer.write(
                    `data: ${JSON.stringify({ type: 'angle_log', data: JSON.stringify({ angleId, message: delta.slice(0, 80) }) })}\n\n`,
                  )
              }
            } catch {
              /* ignore */
            }
          }
        }
      }

      // AI has written cards to file, attempt to read
      let angleCards: Record<string, unknown>[] = []
      try {
        if (existsSync(cardFilePath)) {
          const raw = await readFile(cardFilePath, 'utf-8')
          const parsed = JSON.parse(raw)
          if (Array.isArray(parsed)) {
            // Per-kind field mapping
            const KIND_FIELDS: Record<string, string[]> = {
              data: ['metrics', 'period', 'benchmark', 'highlight', 'visualHint'],
              chart: [
                'chartType',
                'categories',
                'series',
                'unit',
                'xAxisLabel',
                'yAxisLabel',
                'dataSource',
                'insight',
              ],
              table: ['columns', 'rows', 'sortBy', 'sortDirection', 'highlightRow', 'caption'],
              quote: ['text', 'author', 'role', 'source', 'language', 'emphasis'],
              argument: ['claim', 'evidence', 'counterpoint', 'strength', 'logicType'],
              keypoint: ['points', 'context', 'layout'],
              definition: [
                'term',
                'abbreviation',
                'fullName',
                'definition',
                'category',
                'relatedTerms',
                'example',
                'formula',
              ],
              example: [
                'subject',
                'scenario',
                'challenge',
                'approach',
                'results',
                'takeaway',
                'industry',
              ],
              timeline: ['events', 'span', 'direction'],
              comparison: ['subjects', 'dimensions', 'conclusion', 'visualHint'],
              process: ['steps', 'isLinear', 'visualHint'],
              reference: [
                'refTitle',
                'authors',
                'publishDate',
                'url',
                'refType',
                'credibility',
                'citedIn',
              ],
              summary: ['body'],
              idea: ['body'],
              inspiration: ['body', 'ideaType', 'impact', 'difficulty'],
            }

            angleCards = parsed.map((c: Record<string, unknown>) => {
              const kind = (c.kind as string) || 'text'
              const fields = KIND_FIELDS[kind] || []
              const existingMeta = (c.meta as Record<string, unknown>) || {}
              const structuredMeta: Record<string, unknown> = {
                ...existingMeta,
                researchAngle: angleId,
              }
              for (const field of fields) {
                if (c[field] !== undefined && structuredMeta[field] === undefined) {
                  structuredMeta[field] = c[field]
                }
              }
              return {
                ...c,
                id: (c.id as string) || `${angleId}-${randomUUID().slice(0, 8)}`,
                autoGenerated: true,
                rating: (c.rating as number) || 3,
                deckIds: (c.deckIds as string[]) || [],
                linkedCardIds: (c.linkedCardIds as string[]) || [],
                tags: (c.tags as string[]) || [],
                sourceId: (c.sourceId as string) || null,
                meta: structuredMeta,
                createdAt: Date.now(),
                updatedAt: Date.now(),
              }
            })
          }
        }
      } catch {
        /* AI may have failed to write file */
      }

      for (const card of angleCards) {
        writer.write(`data: ${JSON.stringify({ type: 'card', data: JSON.stringify(card) })}\n\n`)
      }
      cardService.saveBulk(angleCards, pid)

      writer.write(
        `data: ${JSON.stringify({ type: 'angle_completed', data: JSON.stringify({ angleId, cardIds: angleCards.map((c) => c.id) }) })}\n\n`,
      )
      writer.write(
        `data: ${JSON.stringify({ type: 'angle_log', data: JSON.stringify({ angleId, message: `Completed, produced ${angleCards.length} cards` }) })}\n\n`,
      )
      return { angleId, cards: angleCards, error: null }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      writer.write(
        `data: ${JSON.stringify({ type: 'angle_log', data: JSON.stringify({ angleId, message: `Error: ${msg}` }) })}\n\n`,
      )
      return { angleId, cards: [] as Record<string, unknown>[], error: msg }
    }
  })

  const results = await Promise.allSettled(anglePromises)
  const allNewCards: Record<string, unknown>[] = []
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value?.cards) allNewCards.push(...r.value.cards)
  }

  if (allNewCards.length > 0) {
    writer.write(
      `data: ${JSON.stringify({
        type: 'research_summary',
        data: JSON.stringify({
          totalCards: allNewCards.length,
          byAngle: results.map((r, i) => ({
            angleId: `angle-${i}`,
            name: ((angles as ResearchAngle[]) || [])[i]?.name || `Angle ${i + 1}`,
            cardCount: r.status === 'fulfilled' ? r.value?.cards?.length || 0 : 0,
          })),
        }),
      })}\n\n`,
    )
  }

  writer.write(
    `data: ${JSON.stringify({ type: 'progress', data: `Deep research complete, produced ${allNewCards.length} cards in total` })}\n\n`,
  )
  finishSSE(writer, res)
}

// v8: minimal prompt — tell AI to write cards to ai-output directory
function buildResearchAnglePrompt(
  topic: string,
  angle: ResearchAngle,
  materialContext: string,
  cardContext: string,
  goals?: string[],
  cardFilePath?: string,
): string {
  const goalsText =
    (goals || []).length > 0
      ? `\n\n## Research Goals\n${goals!.map((g) => `- ${g}`).join('\n')}`
      : ''
  const fileInstruction = cardFilePath
    ? `\n\n**Please write the research card array to file: ${cardFilePath}**`
    : ''
  return `[skill: research, web-search]\n\nPlease deeply research the following topic from the "${angle.name}" angle following the research skill rules.${fileInstruction}\n\n## Research Topic\n${topic}${goalsText}\n\n## Research Direction\n${angle.description}\n\n## Existing Materials\n${materialContext || 'No materials'}\n${cardContext || 'No cards'}`
}
