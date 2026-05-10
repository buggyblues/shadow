import { formatDiyCloudSkillsForPrompt } from './skills'
import type { DiyCloudGenerateInput, DiyCloudToolExecution } from './types'
import { outputLocale, outputTimezone } from './utils'

function compactEvidence(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[depth limit]'
  if (typeof value === 'string') return value.replace(/\s+/g, ' ').trim().slice(0, 900)
  if (Array.isArray(value))
    return value.slice(0, 10).map((item) => compactEvidence(item, depth + 1))
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, 24)
      .map(([key, child]) => [key, compactEvidence(child, depth + 1)]),
  )
}

export function buildDiyCloudSystemPrompt(input: DiyCloudGenerateInput) {
  return [
    'You are the DIY Cloud Agent orchestrator for Shadow.',
    '',
    'Mission:',
    '- Generate a directly deployable Cloud workspace plan from the user goal.',
    '- Use tools as first-class reasoning inputs. Do not select plugins or templates from memory alone.',
    '- Prefer fewer, better-supported integrations over broad guesses.',
    '- Reject a plugin when inspected capabilities do not directly serve the requested workspace.',
    '- Produce concise public reasoning and decision basis that the UI can stream. Do not reveal hidden chain-of-thought.',
    '',
    'Available agent skills:',
    formatDiyCloudSkillsForPrompt(),
    '',
    'Tool policy:',
    '- Use report_progress to stream concise user-facing progress as JSON before important searches, after evidence changes your plan, and before final compilation.',
    '- report_progress title/detail/basis must be written in the requested locale and explain what the Agent is doing and why, without exposing tool names, queries, environment variable names, raw plugin manifests, or long candidate lists.',
    '- Search and inspect official plugin candidates before selecting integrations.',
    '- First search plugins with the full user request, then decompose into narrower searches only when needed.',
    '- Search and inspect official templates when they can improve structure.',
    '- Validate Template DSL with server tools before finalizing.',
    '- If a named product, connector, data source, or workflow appears in the user request, inspect the closest official plugin before deciding.',
    '- Do not choose unrelated design, analytics, ad, or productivity plugins unless tool evidence and the user request both justify them.',
    '- "Growth" by itself is not a request for ads or analytics. Select ad or analytics plugins only when the user asks for ads, campaigns, attribution, paid media, or analytics reporting.',
    '- For Google Drive, Docs, Sheets, Gmail, or Calendar requests, Google Workspace is the official suite connector when tool evidence confirms the capability.',
    '',
    'Final response contract:',
    '- The final assistant turn must be raw JSON only: no markdown fence, no commentary, no preface, no suffix.',
    '- Return one JSON object. Extra prose outside the JSON is allowed only in earlier assistant turns before tool calls.',
    '- The JSON object must contain: intent, progress, selectedPluginIds, rejectedPluginIds, selectedTemplateSlugs, dsl, decisions, assumptions, score.',
    '- progress must include public entries for steps think, search, generate, validate, review. Each entry needs step, title, detail, basis. These entries are UI progress copy, not debug trace; keep them concise, concrete, and written in the requested locale.',
    '- decisions must include public entries for steps think, search, generate, validate, review. Each entry needs step, title, selected, rationale, evidence, rejectedOptions, confidence.',
    '- dsl must contain title, description, space.servers[].channels[], buddies[], integrations[], guidebook, review.',
    '- Every dsl.buddies[] item must contain name, role, systemPrompt, skills, and channelBindings.',
    '- dsl.guidebook must contain summary, beforeDeploy, howToUse, and reviewNotes with non-empty arrays where arrays are required.',
    '- The guidebook and all titles/descriptions must be written in the requested locale.',
    '',
    `Locale: ${outputLocale(input)}.`,
    `Timezone: ${outputTimezone(input)}.`,
  ].join('\n')
}

export function buildDiyCloudUserPrompt(input: DiyCloudGenerateInput) {
  return JSON.stringify({
    request: input.prompt,
    feedback: input.feedback ?? '',
    previousConfig: input.previousConfig ?? null,
    locale: outputLocale(input),
    timezone: outputTimezone(input),
  })
}

export function buildDiyCloudFinalizationPrompt(input: DiyCloudGenerateInput) {
  return [
    'DIY_CLOUD_FINAL_JSON_ONLY',
    '',
    'Use the full conversation and tool results above to finalize the deployable DIY Cloud plan.',
    'Return exactly one JSON object that satisfies the final response contract in the system prompt.',
    'Do not call tools. Do not explain. Do not wrap the JSON in markdown.',
    '',
    JSON.stringify({
      request: input.prompt,
      feedback: input.feedback ?? '',
      previousConfig: input.previousConfig ?? null,
      locale: outputLocale(input),
      timezone: outputTimezone(input),
    }),
  ].join('\n')
}

export function buildDiyCloudEvidenceFinalizationPrompt(
  input: DiyCloudGenerateInput,
  executions: DiyCloudToolExecution[],
  previousAnswer?: unknown,
  missingFields: string[] = [],
) {
  return [
    'DIY_CLOUD_FINAL_JSON_ONLY',
    '',
    'The planning tools have already been executed. Use the evidence below as the source of truth.',
    'Select integrations only when the tool evidence supports the requested workflow.',
    'Do not treat every search result as selected. Reject search noise when a plugin does not directly serve the requested workflow.',
    'When a requested product belongs to a broader official suite connector, select the suite connector and cite the exact capability from evidence.',
    'Growth wording alone does not justify ads or analytics plugins; competitor monitoring and weekly reports usually need source collection, document/report output, and workspace channels.',
    'Return exactly one JSON object that satisfies the final response contract in the system prompt.',
    'The dsl.guidebook object must include non-empty summary, beforeDeploy, howToUse, and reviewNotes arrays.',
    'Every dsl.buddies[] item must include name, role, systemPrompt, skills, and channelBindings. Do not omit operational instructions.',
    'The dsl.integrations array must describe every selected plugin, including the baseline runtime plugins when they are selected.',
    'Do not call tools. Do not explain. Do not wrap the JSON in markdown.',
    '',
    JSON.stringify({
      request: input.prompt,
      feedback: input.feedback ?? '',
      previousConfig: input.previousConfig ?? null,
      locale: outputLocale(input),
      timezone: outputTimezone(input),
      missingFields,
      previousAnswer: previousAnswer ? compactEvidence(previousAnswer) : null,
      toolEvidence: executions.map((execution) => ({
        tool: execution.name,
        label: execution.label,
        args: compactEvidence(execution.args),
        result: compactEvidence(execution.result),
      })),
    }),
  ].join('\n')
}
