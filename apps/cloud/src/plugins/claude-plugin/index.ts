/**
 * claude-plugin — import Claude Code plugins and marketplaces from GitHub/Git.
 */

import { definePlugin } from '../helpers.js'
import type {
  PluginBuildContext,
  PluginConfigFragment,
  PluginK8sEnvVar,
  PluginK8sProvider,
  PluginK8sResult,
  PluginManifest,
  PluginValidationResult,
} from '../types.js'
import {
  buildClaudePluginInitContainer,
  buildClaudePluginInitScript,
  buildClaudePluginSyncScript,
  buildClaudePluginSyncSidecar,
  type ClaudePluginSlashCommandIndexOptions,
  type ClaudePluginSourcePlan,
  claudePluginSlashCommandsIndexPath,
  normalizeClaudePluginGitSource,
  parsePollInterval,
} from './k8s.js'
import manifest from './manifest.json' with { type: 'json' }

const VOLUME_NAME = 'claude-plugins'
const SCRIPT_VOLUME_NAME = 'claude-plugin-scripts'
const DEFAULT_MOUNT = '/claude-plugins'
const GLOBAL_SKILLS_DIR = '.shadow/skills'
const GLOBAL_BIN_DIR = '.shadow/bin'
const DEFAULT_CONTAINER_PATH = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'

export interface ClaudePluginGitSourceOption {
  id?: string
  /** GitHub owner/repo shorthand, e.g. "anthropics/financial-services". */
  repo?: string
  /** Full git URL, owner/repo shorthand, or GitHub tree URL. */
  url?: string
  /** Branch, tag, or commit-ish. GitHub tree URLs provide this automatically. */
  ref?: string
  /** Exact commit SHA to checkout after cloning. */
  sha?: string
  /** Shallow clone depth. Defaults to 1. */
  depth?: number
  /** Marketplace root or plugin/plugin-collection path inside the repository. */
  path?: string
}

export interface ClaudePluginMarketplaceOption extends ClaudePluginGitSourceOption {
  /** Path to `.claude-plugin/marketplace.json`, relative to `path` or repo root. */
  marketplacePath?: string
  /** Marketplace plugin names to import. Omit to import every marketplace entry. */
  plugins?: string[]
}

export interface ClaudePluginDirectOption extends ClaudePluginGitSourceOption {
  /** Plugin directory names or manifest names to import when `path` is a collection. */
  plugins?: string[]
}

export interface ClaudePluginOptions {
  marketplaces?: ClaudePluginMarketplaceOption[]
  plugins?: ClaudePluginDirectOption[]
  mountPath?: string
  poll?: string | number
  slashCommands?: {
    autoRegister?: boolean
    inferInteractions?: boolean
    includeScripts?: boolean
    generateScriptSkills?: boolean
    maxScriptCommandsPerPack?: number
    rules?: unknown[]
  }
}

interface ClaudePluginOptionsValidationError {
  path: string
  expected: string
}

interface ClaudePluginOptionsValidation {
  success: boolean
  errors: ClaudePluginOptionsValidationError[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function validateGitSource(
  value: unknown,
  path: string,
  errors: ClaudePluginOptionsValidationError[],
) {
  if (!isRecord(value)) {
    errors.push({ path, expected: 'ClaudePluginGitSourceOption' })
    return
  }
  for (const key of ['id', 'repo', 'url', 'ref', 'sha', 'path', 'marketplacePath'] as const) {
    if (value[key] !== undefined && typeof value[key] !== 'string') {
      errors.push({ path: `${path}.${key}`, expected: 'string | undefined' })
    }
  }
  if (value.depth !== undefined && typeof value.depth !== 'number') {
    errors.push({ path: `${path}.depth`, expected: 'number | undefined' })
  }
  if (
    value.plugins !== undefined &&
    (!Array.isArray(value.plugins) || !value.plugins.every((item) => typeof item === 'string'))
  ) {
    errors.push({ path: `${path}.plugins`, expected: 'string[] | undefined' })
  }
}

export function validateClaudePluginOptions(input: unknown): ClaudePluginOptionsValidation {
  const errors: ClaudePluginOptionsValidationError[] = []
  if (!isRecord(input)) return { success: false, errors: [{ path: '', expected: 'object' }] }

  for (const field of ['marketplaces', 'plugins'] as const) {
    const value = input[field]
    if (value === undefined) continue
    if (!Array.isArray(value)) {
      errors.push({ path: `.${field}`, expected: 'array | undefined' })
      continue
    }
    value.forEach((item, index) => validateGitSource(item, `.${field}[${index}]`, errors))
  }

  if (input.mountPath !== undefined && typeof input.mountPath !== 'string') {
    errors.push({ path: '.mountPath', expected: 'string | undefined' })
  }
  if (
    input.poll !== undefined &&
    typeof input.poll !== 'string' &&
    typeof input.poll !== 'number'
  ) {
    errors.push({ path: '.poll', expected: 'string | number | undefined' })
  }
  if (input.slashCommands !== undefined) {
    if (!isRecord(input.slashCommands)) {
      errors.push({ path: '.slashCommands', expected: 'object | undefined' })
    } else {
      for (const key of [
        'autoRegister',
        'inferInteractions',
        'includeScripts',
        'generateScriptSkills',
      ] as const) {
        if (
          input.slashCommands[key] !== undefined &&
          typeof input.slashCommands[key] !== 'boolean'
        ) {
          errors.push({ path: `.slashCommands.${key}`, expected: 'boolean | undefined' })
        }
      }
      if (
        input.slashCommands.maxScriptCommandsPerPack !== undefined &&
        typeof input.slashCommands.maxScriptCommandsPerPack !== 'number'
      ) {
        errors.push({
          path: '.slashCommands.maxScriptCommandsPerPack',
          expected: 'number | undefined',
        })
      }
      if (input.slashCommands.rules !== undefined && !Array.isArray(input.slashCommands.rules)) {
        errors.push({ path: '.slashCommands.rules', expected: 'array | undefined' })
      }
    }
  }

  return { success: errors.length === 0, errors }
}

function mergeClaudePluginOptions(entries: ClaudePluginOptions[]): ClaudePluginOptions | null {
  if (entries.length === 0) return null

  const merged: ClaudePluginOptions = {}
  for (const entry of entries) {
    if (entry.marketplaces?.length) {
      merged.marketplaces = [...(merged.marketplaces ?? []), ...entry.marketplaces]
    }
    if (entry.plugins?.length) {
      merged.plugins = [...(merged.plugins ?? []), ...entry.plugins]
    }
    if (entry.mountPath !== undefined) merged.mountPath = entry.mountPath
    if (entry.poll !== undefined) merged.poll = entry.poll
    if (entry.slashCommands) {
      merged.slashCommands = {
        ...(merged.slashCommands ?? {}),
        ...entry.slashCommands,
        ...(merged.slashCommands?.rules || entry.slashCommands.rules
          ? {
              rules: [...(merged.slashCommands?.rules ?? []), ...(entry.slashCommands.rules ?? [])],
            }
          : {}),
      }
    }
  }

  return merged
}

function readOptions(
  agent: PluginBuildContext['agent'],
  config?: PluginBuildContext['config'],
): ClaudePluginOptions | null {
  const entries = [
    ...((config?.use ?? [])
      .filter((u) => u.plugin === 'claude-plugin')
      .map((entry) => entry.options ?? {}) as ClaudePluginOptions[]),
    ...((agent.use ?? [])
      .filter((u) => u.plugin === 'claude-plugin')
      .map((entry) => entry.options ?? {}) as ClaudePluginOptions[]),
  ]
  return mergeClaudePluginOptions(entries)
}

export function resolveClaudePluginSources(opts: ClaudePluginOptions): ClaudePluginSourcePlan[] {
  const sources: ClaudePluginSourcePlan[] = []
  const seen = new Set<string>()

  for (const source of opts.marketplaces ?? []) {
    const normalized = normalizeClaudePluginGitSource(source)
    if (!normalized) continue
    const item: ClaudePluginSourcePlan = {
      ...normalized,
      kind: 'marketplace',
      ...(source.marketplacePath ? { marketplacePath: source.marketplacePath } : {}),
      ...(source.plugins?.length ? { include: [...new Set(source.plugins)] } : {}),
    }
    const key = JSON.stringify(item)
    if (seen.has(key)) continue
    seen.add(key)
    sources.push(item)
  }

  for (const source of opts.plugins ?? []) {
    const normalized = normalizeClaudePluginGitSource(source)
    if (!normalized) continue
    const item: ClaudePluginSourcePlan = {
      ...normalized,
      kind: 'plugins',
      ...(source.plugins?.length ? { include: [...new Set(source.plugins)] } : {}),
    }
    const key = JSON.stringify(item)
    if (seen.has(key)) continue
    seen.add(key)
    sources.push(item)
  }

  return sources
}

export function buildClaudePluginPrompt(
  sources: ClaudePluginSourcePlan[],
  mountPath: string,
): string {
  const lines = [
    '## Imported Claude Plugins',
    '',
    `Claude Code plugin assets are mounted under \`${mountPath}\` and normalized into OpenClaw skills at \`${mountPath}/${GLOBAL_SKILLS_DIR}\`.`,
    '',
    'Imported sources:',
  ]

  for (const source of sources) {
    const selected = source.include?.length ? source.include.join(', ') : 'all plugins'
    const path = source.path ? ` path ${source.path}` : ''
    lines.push(`- **${source.id}** — ${source.kind}${path}, ${selected}`)
  }

  lines.push(
    '',
    'When an imported Claude plugin is relevant, prefer its mounted skills, command definitions, agent files, MCP descriptors, LSP/monitor/hook descriptors, settings, bin tools, and instructions over generic memory.',
    'If a plugin has an agent file under `agents/`, treat it as workflow guidance and follow its guardrails.',
  )

  return lines.join('\n')
}

function slashCommandIndexOptions(
  opts: ClaudePluginOptions,
  mountPath: string,
): ClaudePluginSlashCommandIndexOptions | undefined {
  const slashCommands = opts.slashCommands ?? {}
  if (slashCommands.autoRegister === false) return undefined
  return {
    enabled: true,
    outputPath: claudePluginSlashCommandsIndexPath(mountPath),
    inferInteractions: slashCommands.inferInteractions ?? true,
    includeScripts: slashCommands.includeScripts ?? false,
    generateScriptSkills: slashCommands.generateScriptSkills ?? false,
    maxScriptCommandsPerPack: slashCommands.maxScriptCommandsPerPack,
    rules: slashCommands.rules,
  }
}

const claudePluginK8sProvider: PluginK8sProvider = {
  buildK8s(agent, ctx): PluginK8sResult | undefined {
    const opts = readOptions(agent, ctx.config)
    if (!opts) return undefined
    const sources = resolveClaudePluginSources(opts)
    if (sources.length === 0) return undefined

    const mountPath = opts.mountPath ?? DEFAULT_MOUNT
    const slashCommandIndex = slashCommandIndexOptions(opts, mountPath)
    const scriptConfigMapName = `${agent.id}-claude-plugin-scripts`
    const envVars: PluginK8sEnvVar[] = [
      { name: 'PATH', value: `${mountPath}/${GLOBAL_BIN_DIR}:${DEFAULT_CONTAINER_PATH}` },
      { name: 'SHADOWOB_CLAUDE_PLUGIN_MOUNT_ROOT', value: mountPath },
      { name: 'SHADOWOB_CLAUDE_PLUGIN_SKILLS_DIR', value: `${mountPath}/${GLOBAL_SKILLS_DIR}` },
      { name: 'SHADOWOB_CLAUDE_PLUGIN_BIN_DIR', value: `${mountPath}/${GLOBAL_BIN_DIR}` },
      {
        name: 'SHADOWOB_CLAUDE_PLUGIN_COMMANDS_PATH',
        value: `${mountPath}/.shadow/slash-commands.json`,
      },
      { name: 'SHADOWOB_CLAUDE_PLUGIN_COMPONENT_ROOT', value: mountPath },
    ]

    const result: PluginK8sResult = {
      initContainers: [
        buildClaudePluginInitContainer(sources, mountPath, VOLUME_NAME, SCRIPT_VOLUME_NAME),
      ],
      configMaps: [
        {
          name: scriptConfigMapName,
          data: {
            'init.sh': buildClaudePluginInitScript(sources, mountPath, slashCommandIndex),
            'sync.sh': buildClaudePluginSyncScript({
              sources,
              mountPath,
              intervalSec: parsePollInterval(opts.poll),
              slashCommandIndex,
            }),
          },
          labels: {
            app: 'shadowob-cloud',
            agent: agent.id,
          },
        },
      ],
      volumes: [
        { name: VOLUME_NAME, spec: { emptyDir: {} } },
        {
          name: SCRIPT_VOLUME_NAME,
          spec: {
            configMap: {
              name: scriptConfigMapName,
              defaultMode: 0o755,
            },
          },
        },
      ],
      volumeMounts: [{ name: VOLUME_NAME, mountPath, readOnly: false }],
      envVars,
      labels: {
        'claude-plugin.sources': sources
          .map((source) => source.id)
          .join('_')
          .slice(0, 63),
      },
    }

    const sidecar = buildClaudePluginSyncSidecar({
      sources,
      mountPath,
      volumeName: VOLUME_NAME,
      scriptVolumeName: SCRIPT_VOLUME_NAME,
      intervalSec: parsePollInterval(opts.poll),
    })
    if (sidecar) result.sidecars = [sidecar]

    return result
  },
}

const plugin = definePlugin(manifest as PluginManifest, (api) => {
  api.onBuildConfig((context: PluginBuildContext): PluginConfigFragment => {
    const opts = readOptions(context.agent, context.config)
    if (!opts) return {}
    const sources = resolveClaudePluginSources(opts)
    if (sources.length === 0) return {}
    const mountPath = opts.mountPath ?? DEFAULT_MOUNT
    return {
      skills: {
        load: { extraDirs: [`${mountPath}/${GLOBAL_SKILLS_DIR}`] },
      } as Record<string, unknown>,
    }
  })

  api.onBuildPrompt((context: PluginBuildContext): string | void => {
    const opts = readOptions(context.agent, context.config)
    if (!opts) return
    const sources = resolveClaudePluginSources(opts)
    if (sources.length === 0) return
    return buildClaudePluginPrompt(sources, opts.mountPath ?? DEFAULT_MOUNT)
  })

  api.onBuildRuntime((context: PluginBuildContext) => {
    const opts = readOptions(context.agent, context.config)
    if (!opts) return
    const sources = resolveClaudePluginSources(opts)
    if (sources.length === 0) return
    const slashCommands = opts.slashCommands ?? {}
    if (slashCommands.autoRegister === false) return
    return {
      artifacts: [
        {
          kind: 'shadow.slashCommands',
          path: claudePluginSlashCommandsIndexPath(opts.mountPath ?? DEFAULT_MOUNT),
          mediaType: 'application/json',
        },
      ],
    }
  })

  api.onBuildEnv((context: PluginBuildContext) => {
    const token = context.secrets.GITHUB_TOKEN
    if (!token) return
    return { GITHUB_TOKEN: token }
  })

  api.onValidate((context: PluginBuildContext): PluginValidationResult | void => {
    const opts = readOptions(context.agent, context.config)
    if (!opts) return
    const shape = validateClaudePluginOptions(opts)
    const errors: PluginValidationResult['errors'] = []
    if (!shape.success) {
      errors.push(
        ...shape.errors.map((error) => ({
          path: `use.claude-plugin.options${error.path}`,
          message: error.expected,
          severity: 'error' as const,
        })),
      )
    }

    const candidates = [...(opts.marketplaces ?? []), ...(opts.plugins ?? [])]
    if (candidates.length === 0) {
      errors.push({
        path: 'use.claude-plugin.options',
        message: 'Configure at least one marketplace or direct plugin source.',
        severity: 'error',
      })
    }

    candidates.forEach((source, index) => {
      if (!source.repo && !source.url) {
        errors.push({
          path: `use.claude-plugin.options.sources[${index}]`,
          message: 'Each Claude plugin source must specify "repo" or "url".',
          severity: 'error',
        })
      }
    })

    if (errors.length > 0) return { valid: false, errors }
  })
})

plugin.k8s = claudePluginK8sProvider

export default plugin
