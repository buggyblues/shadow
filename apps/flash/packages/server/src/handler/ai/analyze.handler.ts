// ═══════════════════════════════════════════════════════════════
// Analyze Handler — Materials + Cards → Outline
//
// Core principle: file write is the source of truth!
// AI writes outline to file via OpenClaw write tool →
// server detects file via file-watcher → immediately pushes to frontend
//
// v8: AI writes to /data/projects/{pid}/ai-output/outline.json
// ═══════════════════════════════════════════════════════════════

import { writeFile } from 'node:fs/promises'
import type { ServerResponse } from 'node:http'
import { ensureProjectDirs, projectAiOutput, projectLogs } from '../../config.js'
import { watchForJson } from '../../lib/file-watcher.js'
import { buildCardContext, buildMaterialContext } from '../../lib/helpers.js'
import { callOpenClawStream } from '../../lib/openclaw.js'
import { createNodeSSEWriter, finishSSE } from '../../lib/sse.js'

/** Normalize outline entries */
function normalizeOutline(outline: unknown): Record<string, unknown>[] {
  const arr = Array.isArray(outline) ? outline : [outline]
  return arr.map((item: Record<string, unknown>, idx: number) => ({
    ...item,
    slideIndex:
      typeof item.slideIndex === 'number' && !isNaN(item.slideIndex as number)
        ? item.slideIndex
        : idx,
    cardRefs: (item.cardRefs as string[]) || [],
    keyPoints: (item.keyPoints as string[]) || [],
    materialRefs: (item.materialRefs as string[]) || [],
  }))
}

export async function handleAnalyze(
  body: Record<string, unknown>,
  res: ServerResponse,
): Promise<void> {
  const { projectId, materials, cards, existingOutline, theme, deckId, todos } = body

  const writer = createNodeSSEWriter(res)
  const pid = (projectId as string) || 'default'
  const sessionKey = `sf-${pid}-${deckId || 'default'}`

  ensureProjectDirs(pid)

  const materialContext = await buildMaterialContext((materials as []) || [], pid)
  const cardContext = buildCardContext((cards as []) || [])

  // Dynamic context fragments
  const outlineJson = (existingOutline as unknown[])?.length
    ? `\n\n## Existing Outline (please refine, do not rewrite)\n${JSON.stringify(existingOutline, null, 2)}`
    : ''
  const themeObj = theme as Record<string, unknown> | undefined
  const themeInfo = themeObj
    ? `\n\n## Theme Style\n- Name: ${themeObj.name}\n- Appearance: ${themeObj.appearance}\n- Accent Color: ${(themeObj.colorScheme as Record<string, string>)?.accent1}\n- Background: ${(themeObj.colorScheme as Record<string, string>)?.dk1}\n- Fonts: ${(themeObj.fontScheme as Record<string, string>)?.majorFont} / ${(themeObj.fontScheme as Record<string, string>)?.minorFont}`
    : ''
  const todoContext =
    ((todos as Array<{ done: boolean; text: string }>) || []).length > 0
      ? `\n\n## User Requirements (TODO queue, must be reflected in outline)\n${((todos as Array<{ done: boolean; text: string }>) || []).map((t) => `- [${t.done ? '✅' : '⬜'}] ${t.text}`).join('\n')}`
      : ''

  // v8: AI outputs to project ai-output directory
  const outlineFilePath = projectAiOutput(pid, 'outline.json')

  // ── Prompt: explicitly instruct AI to write file using write tool ──
  const messages = [
    {
      role: 'user',
      content: `[skill: analyze]\n\nPlease generate a PPT outline following the analyze skill rules.\n\n**You must use the write tool to write the outline array to file: \`${outlineFilePath}\`**\n\n## Material Content\n\n${materialContext}\n${cardContext}${outlineJson}${themeInfo}${todoContext}`,
    },
  ]

  // ── Start in parallel: LLM stream + file watcher ──
  let outlinePushed = false

  // File watcher: triggers immediately when AI writes the file
  const fileWatchPromise = watchForJson<unknown>(
    outlineFilePath,
    (data: unknown) => {
      // Outline can be an array or an object
      if (Array.isArray(data) && data.length > 0) return true
      if (typeof data === 'object' && data !== null) return true
      return false
    },
    {
      debounceMs: 300,
      timeoutMs: 300_000,
      pollIntervalMs: 2000,
      minFileSize: 10,
    },
  )
    .then((result) => {
      if (!outlinePushed) {
        outlinePushed = true
        const normalizedOutline = normalizeOutline(result.data)
        console.log(
          `[Analyze] 📂 File watcher triggered (${result.source}), detected ${normalizedOutline.length} outline slides after ${result.elapsedMs}ms`,
        )
        writer.write(
          `data: ${JSON.stringify({ type: 'outline', data: JSON.stringify(normalizedOutline) })}\n\n`,
        )
      }
    })
    .catch((err) => {
      if (!outlinePushed) {
        console.warn(
          `[Analyze] File watcher failed to capture:`,
          err instanceof Error ? err.message : err,
        )
      }
    })

  // LLM stream
  const fullContent = await callOpenClawStream(messages, sessionKey, writer)

  // ── Fallback check after LLM stream ends ──
  if (!outlinePushed && fullContent) {
    await Promise.race([fileWatchPromise, new Promise((resolve) => setTimeout(resolve, 3000))])
  }

  if (!outlinePushed) {
    console.error(
      `[Analyze] ❌ AI did not write a valid outline file. fullContent length: ${fullContent?.length || 0}`,
    )
    writer.write(
      `data: ${JSON.stringify({
        type: 'error',
        data: 'AI failed to write the outline to the specified file. Please retry, or check that OpenClaw has the write tool configured.',
      })}\n\n`,
    )
  }

  // Save raw response log
  if (fullContent) {
    await writeFile(
      projectLogs(pid, 'analyze-response.md'),
      `<!-- pushed: ${outlinePushed} -->\n\n${fullContent}`,
      'utf-8',
    )
  }

  finishSSE(writer, res)
}
