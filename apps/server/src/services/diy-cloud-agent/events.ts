import type { AgentEvent } from '@earendil-works/pi-agent-core'
import type { AgentFinalAnswer, DiyCloudGenerationOptions, DiyCloudStepId } from './types'
import { compactText, emitProgress, parseStepId, parseStringArray, redactRawJson } from './utils'

type RuntimeEventState = {
  textBuffer: string
  currentStep: DiyCloudStepId
  lastAssistantText: string
  started: boolean
  toolArgsByCallId: Map<string, unknown>
}

const TOOL_STEP: Record<string, DiyCloudStepId> = {
  search_plugins: 'search',
  inspect_plugin: 'search',
  search_templates: 'search',
  inspect_template: 'search',
  collect_required_keys: 'search',
  compile_template_dsl: 'generate',
  validate_template_dsl: 'validate',
}

function progressReport(args: unknown) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return null
  const record = args as Record<string, unknown>
  const step = parseStepId(record.step)
  const title = compactText(record.title, 90)
  const detail = compactText(record.detail, 300)
  if (!step || !title || !detail) return null
  return {
    step,
    title,
    detail,
    basis: parseStringArray(record.basis, 4),
  }
}

function compactArgs(args: unknown) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return ''
  const record = args as Record<string, unknown>
  const preferred = [
    record.query,
    record.pluginId,
    record.slug,
    record.selectedPluginIds,
    record.pluginIds,
  ]
    .map((value) => {
      if (typeof value === 'string') return value
      if (Array.isArray(value)) return value.filter((item) => typeof item === 'string').join(', ')
      return ''
    })
    .find(Boolean)
  if (preferred) return preferred
  return JSON.stringify(redactRawJson(args)).slice(0, 220)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function compactTitle(text: string) {
  const firstSentence = text
    .split(/(?<=[。！？.!?])\s+|\n/)
    .map((line) => line.trim())
    .find(Boolean)
  const title = firstSentence || text
  return title.length > 68 ? `${title.slice(0, 65)}...` : title
}

function itemLabel(item: unknown) {
  if (!isRecord(item)) return ''
  for (const key of ['name', 'title', 'id', 'slug', 'key', 'compiledName']) {
    const value = item[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function itemDetail(item: unknown) {
  if (!isRecord(item)) return ''
  for (const key of ['description', 'purpose', 'role']) {
    const value = item[key]
    if (typeof value === 'string' && value.trim()) return value.replace(/\s+/g, ' ').trim()
  }
  const capabilities = Array.isArray(item.capabilities)
    ? item.capabilities.filter((value) => typeof value === 'string').slice(0, 4)
    : []
  if (capabilities.length > 0) return capabilities.join(', ')
  return ''
}

function resultItems(result: unknown) {
  if (Array.isArray(result)) return result
  if (isRecord(result)) {
    if (itemLabel(result)) return [result]
    for (const key of ['plugins', 'templates', 'requiredKeys', 'items']) {
      const value = result[key]
      if (Array.isArray(value)) return value
    }
  }
  return result === undefined || result === null ? [] : [result]
}

function resultCount(result: unknown) {
  const items = resultItems(result)
  return items.length > 0 ? items.length : 1
}

function summarizeToolResult(toolName: string, label: string, result: unknown, isError: boolean) {
  if (isError) {
    const error = isRecord(result) && typeof result.error === 'string' ? result.error : ''
    return {
      title: label,
      detail: error || label,
    }
  }

  if (isRecord(result) && typeof result.valid === 'boolean') {
    const notes = Array.isArray(result.repairNotes)
      ? result.repairNotes
          .filter((value) => typeof value === 'string')
          .slice(0, 3)
          .join('；')
      : ''
    const detail = itemDetail(result)
    return {
      title: itemLabel(result) || label,
      detail:
        notes ||
        detail ||
        (typeof result.error === 'string'
          ? result.error
          : `${label}: ${result.valid ? 'ok' : 'review'}`),
    }
  }

  const items = resultItems(result)
  const labels = items.map(itemLabel).filter(Boolean).slice(0, 4)
  if (toolName === 'search_plugins' || toolName === 'search_templates') {
    return {
      title: label,
      detail: labels.length > 0 ? labels.join(', ') : `${label}: ${resultCount(result)}`,
    }
  }
  const details = items.map(itemDetail).filter(Boolean).slice(0, 3)
  return {
    title: labels.length > 0 ? labels.join(' / ') : label,
    detail:
      details.length > 0
        ? details.join('；')
        : labels.length > 0
          ? labels.join(', ')
          : `${label}: ${resultCount(result)}`,
  }
}

function publicAssistantText(buffer: string) {
  const text = buffer.trim()
  if (!text || text.startsWith('{') || text.startsWith('[')) return ''
  const compact = text.replace(/\s+/g, ' ')
  if (compact.length < 24) return ''
  return compact.slice(-900)
}

async function flushAssistantText(options: DiyCloudGenerationOptions, state: RuntimeEventState) {
  const text = publicAssistantText(state.textBuffer)
  state.textBuffer = ''
  if (!text || text === state.lastAssistantText) return
  state.lastAssistantText = text
  await emitProgress(options, {
    step: state.currentStep,
    status: 'running',
    title: compactTitle(text),
    detail: text,
    channel: 'rationale',
    meta: { source: 'assistant_message' },
  })
}

export async function handlePiAgentEvent(
  event: AgentEvent,
  options: DiyCloudGenerationOptions,
  state: RuntimeEventState,
  toolLabels: Map<string, string>,
) {
  if (event.type === 'agent_start') {
    if (state.started) return
    state.started = true
    state.currentStep = 'think'
    return
  }

  if (event.type === 'message_update') {
    const assistantEvent = event.assistantMessageEvent
    if (assistantEvent.type === 'text_delta') {
      state.textBuffer += assistantEvent.delta
      return
    }
    if (assistantEvent.type === 'text_end') {
      await flushAssistantText(options, state)
    }
    if (assistantEvent.type === 'toolcall_start') {
      state.textBuffer = ''
    }
    return
  }

  if (event.type === 'tool_execution_start') {
    if (event.toolName === 'report_progress') {
      const report = progressReport(event.args)
      if (report) {
        state.currentStep = report.step
        await emitProgress(options, {
          step: report.step,
          status: 'running',
          title: report.title,
          detail: report.detail,
          channel: 'rationale',
          meta: { source: 'model_progress', basis: report.basis },
        })
      }
      return
    }

    const step = TOOL_STEP[event.toolName] ?? 'search'
    state.currentStep = step
    state.toolArgsByCallId.set(event.toolCallId, event.args)
    const label = toolLabels.get(event.toolName) ?? event.toolName
    const args = compactArgs(event.args)
    await emitProgress(options, {
      step,
      status: 'running',
      title: args || label,
      detail: args || label,
      channel: 'status',
      meta: { tool: event.toolName, args: redactRawJson(event.args) as Record<string, unknown> },
    })
    return
  }

  if (event.type === 'tool_execution_end') {
    if (event.toolName === 'report_progress') return

    const step = TOOL_STEP[event.toolName] ?? 'search'
    state.currentStep = step
    const label = toolLabels.get(event.toolName) ?? event.toolName
    const args = state.toolArgsByCallId.get(event.toolCallId)
    state.toolArgsByCallId.delete(event.toolCallId)
    const result = event.result?.details?.result ?? event.result
    const summary = summarizeToolResult(event.toolName, label, result, event.isError)
    await emitProgress(options, {
      step,
      status: event.isError ? 'warning' : 'completed',
      title: summary.title,
      detail: summary.detail,
      channel: 'status',
      meta: {
        tool: event.toolName,
        args: redactRawJson(args) as Record<string, unknown>,
        result: redactRawJson(result) as Record<string, unknown>,
        isError: event.isError,
      },
    })
  }
}

export function decisionEvidence(answer: AgentFinalAnswer, step: DiyCloudStepId) {
  const decision = answer.decisions?.find((item) => item.step === step)
  return {
    title: decision?.title ?? step,
    selected: decision?.selected ?? decision?.title ?? step,
    rationale: decision?.rationale ?? '',
    evidence: Array.isArray(decision?.evidence) ? decision.evidence : [],
    rejectedOptions: Array.isArray(decision?.rejectedOptions)
      ? decision.rejectedOptions.map((item) =>
          typeof item === 'string' ? { option: item, reason: '' } : item,
        )
      : [],
    confidence: typeof decision?.confidence === 'number' ? decision.confidence : undefined,
  }
}
