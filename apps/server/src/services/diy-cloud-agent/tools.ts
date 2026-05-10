import type { AgentTool } from '@earendil-works/pi-agent-core'
import { type Static, type TSchema, Type } from '@earendil-works/pi-ai'
import { listPluginLibrary, listTemplateLibrary, searchPluginLibrary } from '@shadowob/cloud'
import { BASE_PLUGIN_IDS } from './config'
import {
  compactPlugin,
  compactTemplate,
  compileTemplateDsl,
  ensureReliableTemplate,
  pickKnownPluginIds,
  requiredKeysForPlugins,
  searchDiyCloudTemplates,
} from './dsl'
import type {
  DiyCloudGenerateInput,
  DiyCloudToolExecution,
  DiyCloudToolName,
  DiyTemplateDsl,
} from './types'
import { compactText, parseStringArray, redactRawJson, toDsl } from './utils'

type ToolDef<TParameters extends TSchema> = AgentTool<TParameters, Record<string, unknown>>

type ToolRegistry = {
  tools: ToolDef<TSchema>[]
  executions: DiyCloudToolExecution[]
  labels: Map<string, string>
}

function textResult(result: unknown, details: Record<string, unknown> = {}) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(redactRawJson(result)) }],
    details: { result: redactRawJson(result), ...details },
  }
}

function toolFailureResult(err: unknown) {
  return {
    valid: false,
    error: err instanceof Error ? err.message : 'Tool execution failed',
  }
}

function recordExecution(
  executions: DiyCloudToolExecution[],
  callId: string,
  name: DiyCloudToolName,
  label: string,
  args: Record<string, unknown>,
  result: unknown,
) {
  executions.push({ callId, name, label, args, result: redactRawJson(result) })
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function withExecution<TParameters extends TSchema>(
  executions: DiyCloudToolExecution[],
  tool: Omit<ToolDef<TParameters>, 'execute'> & {
    run: (params: Static<TParameters>, signal?: AbortSignal) => unknown | Promise<unknown>
  },
): ToolDef<TParameters> {
  return {
    ...tool,
    execute: async (toolCallId, params, signal) => {
      let result: unknown
      try {
        result = await tool.run(params, signal)
      } catch (err) {
        result = toolFailureResult(err)
      }
      recordExecution(
        executions,
        toolCallId,
        tool.name as DiyCloudToolName,
        tool.label,
        asRecord(params),
        result,
      )
      return textResult(result, {
        tool: tool.name,
        label: tool.label,
      })
    },
  }
}

export function createDiyCloudTools(input: DiyCloudGenerateInput): ToolRegistry {
  const executions: DiyCloudToolExecution[] = []
  const tools = [
    {
      name: 'report_progress',
      label: 'Sharing progress',
      description:
        'Stream one concise public progress update to the UI. Use requested locale. Explain what you are doing and the decision basis. Do not include raw tool names, search queries, environment variable names, manifests, IDs, or long candidate lists.',
      parameters: Type.Object({
        step: Type.String(),
        title: Type.String(),
        detail: Type.String(),
        basis: Type.Optional(Type.Array(Type.String())),
      }),
      execute: async (_toolCallId, params) => {
        const record = asRecord(params)
        return textResult({
          accepted: true,
          step: compactText(record.step, 24),
          title: compactText(record.title, 90),
        })
      },
    },
    withExecution(executions, {
      name: 'search_plugins',
      label: 'Checking available integrations',
      description:
        'Search official DIY Cloud plugins by semantic user need. Use broad natural-language queries and let tool evidence drive selection.',
      parameters: Type.Object({
        query: Type.String(),
        limit: Type.Optional(Type.Number()),
      }),
      run: (params) => {
        const query = compactText(params.query, 500) || input.prompt
        const limit = Math.max(1, Math.min(12, Number(params.limit) || 8))
        const results = searchPluginLibrary(query, { limit: limit + BASE_PLUGIN_IDS.length })
        return {
          query,
          plugins: results
            .filter(
              (plugin) => !BASE_PLUGIN_IDS.includes(plugin.id as (typeof BASE_PLUGIN_IDS)[number]),
            )
            .slice(0, limit)
            .map(compactPlugin),
          baselinePlugins: BASE_PLUGIN_IDS,
        }
      },
    }),
    withExecution(executions, {
      name: 'inspect_plugin',
      label: 'Reading integration evidence',
      description:
        'Read one official plugin manifest, capabilities, required keys, and documentation excerpt before selecting or rejecting it.',
      parameters: Type.Object({
        pluginId: Type.String(),
      }),
      run: (params) => {
        const pluginId = compactText(params.pluginId, 80)
        const plugin = listPluginLibrary().find((entry) => entry.id === pluginId)
        return plugin ? compactPlugin(plugin) : { error: 'Plugin not found', pluginId }
      },
    }),
    withExecution(executions, {
      name: 'search_templates',
      label: 'Looking for reference spaces',
      description:
        'Search official deployable Cloud templates for structure inspiration and concrete references.',
      parameters: Type.Object({
        query: Type.String(),
        limit: Type.Optional(Type.Number()),
      }),
      run: (params) => {
        const query = compactText(params.query, 500) || input.prompt
        const limit = Math.max(1, Math.min(8, Number(params.limit) || 5))
        return searchDiyCloudTemplates(query, limit).map(compactTemplate)
      },
    }),
    withExecution(executions, {
      name: 'inspect_template',
      label: 'Reading reference space',
      description:
        'Read one official template summary, plugin mix, channels, and Buddy roles before using it as a reference.',
      parameters: Type.Object({
        slug: Type.String(),
      }),
      run: (params) => {
        const slug = compactText(params.slug, 120)
        const template = listTemplateLibrary().find((entry) => entry.slug === slug)
        return template ? compactTemplate(template) : { error: 'Template not found', slug }
      },
    }),
    withExecution(executions, {
      name: 'collect_required_keys',
      label: 'Checking required credentials',
      description:
        'Collect credential keys and deployment setup requirements for selected plugin IDs.',
      parameters: Type.Object({
        pluginIds: Type.Array(Type.String()),
      }),
      run: (params) => {
        const pluginIds = pickKnownPluginIds(parseStringArray(params.pluginIds, 12), [])
        return requiredKeysForPlugins(pluginIds)
      },
    }),
    withExecution(executions, {
      name: 'compile_template_dsl',
      label: 'Compiling workspace draft',
      description:
        'Compile model-authored Template DSL and selected plugins into a deployable Cloud config candidate.',
      parameters: Type.Object({
        dsl: Type.Any(),
        selectedPluginIds: Type.Array(Type.String()),
      }),
      executionMode: 'sequential',
      run: (params) => {
        const pluginIds = pickKnownPluginIds(parseStringArray(params.selectedPluginIds, 12), [])
        return compileTemplateDsl(input, toDsl(params.dsl) as DiyTemplateDsl, pluginIds)
      },
    }),
    withExecution(executions, {
      name: 'validate_template_dsl',
      label: 'Validating workspace draft',
      description:
        'Compile and validate Template DSL against server-side Cloud schema and template policy.',
      parameters: Type.Object({
        dsl: Type.Any(),
        selectedPluginIds: Type.Array(Type.String()),
      }),
      executionMode: 'sequential',
      run: (params) => {
        const pluginIds = pickKnownPluginIds(parseStringArray(params.selectedPluginIds, 12), [])
        const dsl = toDsl(params.dsl)
        const candidate = compileTemplateDsl(input, dsl, pluginIds)
        try {
          const reliable = ensureReliableTemplate(candidate, input, dsl, pluginIds)
          return {
            valid: reliable.validation.valid,
            validation: reliable.validation,
            repairNotes: reliable.repairNotes,
            compiledName: reliable.template.name,
          }
        } catch (err) {
          return {
            valid: false,
            error: err instanceof Error ? err.message : 'Validation failed',
            compiledName: candidate.name,
          }
        }
      },
    }),
  ] satisfies ToolDef<TSchema>[]

  return {
    tools,
    executions,
    labels: new Map(tools.map((tool) => [tool.name, tool.label])),
  }
}
