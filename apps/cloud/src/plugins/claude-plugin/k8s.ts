/**
 * claude-plugin K8s adapter — imports Claude Code plugin marketplaces and
 * plugin directories from GitHub/Git repositories into a shared EmptyDir.
 */

import { AGENT_PACK_SLASH_INDEXER_SCRIPT } from '../agent-pack/indexer-script.js'
import type { PluginK8sInitContainer, PluginK8sSidecar } from '../types.js'
import { CLAUDE_PLUGIN_IMPORTER_SCRIPT } from './importer-script.js'

const CLAUDE_PLUGIN_IMAGE = 'node:22-bookworm'
const IMPORTER_PATH = '/tmp/claude-plugin-importer.mjs'
const SLASH_INDEXER_PATH = '/tmp/claude-plugin-slash-indexer.mjs'
export const CLAUDE_PLUGIN_SCRIPT_MOUNT_PATH = '/opt/shadow-claude-plugin'
const CLAUDE_PLUGIN_HELPER_SECURITY_CONTEXT = {
  runAsNonRoot: true,
  runAsUser: 1000,
  runAsGroup: 1000,
  allowPrivilegeEscalation: false,
  capabilities: { drop: ['ALL'] },
}
const CLAUDE_PLUGIN_TOOL_CHECKS = [
  'command -v git >/dev/null 2>&1 || { echo "[claude-plugin] git is missing from helper image" >&2; exit 127; }',
  'command -v node >/dev/null 2>&1 || { echo "[claude-plugin] node is missing from helper image" >&2; exit 127; }',
]

export interface ClaudePluginSourcePlan {
  id: string
  kind: 'marketplace' | 'plugins'
  url: string
  ref?: string
  sha?: string
  depth: number
  path?: string
  marketplacePath?: string
  include?: string[]
}

export interface ClaudePluginSlashCommandIndexOptions {
  enabled: boolean
  outputPath: string
  inferInteractions?: boolean
  includeScripts?: boolean
  generateScriptSkills?: boolean
  maxScriptCommandsPerPack?: number
  rules?: unknown[]
}

export function parsePollInterval(input: string | number | undefined): number {
  if (input == null) return 0
  if (typeof input === 'number') return Math.max(0, Math.floor(input))
  const m = /^(\d+)\s*(s|m|h)?$/.exec(input.trim())
  if (!m) return 0
  const n = Number(m[1])
  const unit = m[2] ?? 's'
  switch (unit) {
    case 'h':
      return n * 3600
    case 'm':
      return n * 60
    default:
      return n
  }
}

export function sanitizeId(value: string): string {
  const sanitized = value
    .replace(/\.git$/i, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)
  return sanitized || 'claude-plugin'
}

export function claudePluginSlashCommandsIndexPath(mountPath: string): string {
  return `${mountPath}/.shadow/slash-commands.json`
}

function shQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}

function parseGithubTreeUrl(input: string):
  | {
      url: string
      ref?: string
      path?: string
      idHint?: string
    }
  | undefined {
  const match = input.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)(?:\/(.+))?$/)
  if (!match) return undefined
  const owner = match[1]
  const repoRaw = match[2]
  const ref = match[3]
  const path = match[4]
  if (!owner || !repoRaw || !ref) return undefined
  const repo = repoRaw.replace(/\.git$/i, '')
  return {
    url: `https://github.com/${owner}/${repo}.git`,
    ref,
    path,
    idHint: sanitizeId(`${owner}-${repo}${path ? `-${path}` : ''}`),
  }
}

function normalizeGitUrl(input: string): string {
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(input)) {
    return `https://github.com/${input}.git`
  }
  return input
}

function deriveSourceId(input: {
  id?: string
  repo?: string
  url?: string
  path?: string
  parsedTreeId?: string
}): string {
  if (input.id) return sanitizeId(input.id)
  if (input.parsedTreeId) return input.parsedTreeId
  const raw = input.repo ?? input.url ?? 'claude-plugin'
  return sanitizeId(`${raw}${input.path ? `-${input.path}` : ''}`)
}

export function normalizeClaudePluginGitSource(input: {
  id?: string
  repo?: string
  url?: string
  ref?: string
  sha?: string
  depth?: number
  path?: string
}): Omit<ClaudePluginSourcePlan, 'kind'> | null {
  const sourceText = input.repo ?? input.url
  if (!sourceText) return null

  const parsedTree = input.url ? parseGithubTreeUrl(input.url) : undefined
  const url = parsedTree?.url ?? normalizeGitUrl(sourceText)
  const path = input.path ?? parsedTree?.path
  const ref = input.ref ?? parsedTree?.ref
  return {
    id: deriveSourceId({
      id: input.id,
      repo: input.repo,
      url,
      path,
      parsedTreeId: parsedTree?.idHint,
    }),
    url,
    ...(ref ? { ref } : {}),
    ...(input.sha ? { sha: input.sha } : {}),
    depth: Math.max(1, Math.floor(input.depth ?? 1)),
    ...(path ? { path } : {}),
  }
}

function buildImporterSnippet(plan: { mountPath: string; sources: ClaudePluginSourcePlan[] }) {
  return [
    `cat > ${IMPORTER_PATH} <<'SHADOWOB_CLAUDE_PLUGIN_IMPORTER'`,
    CLAUDE_PLUGIN_IMPORTER_SCRIPT,
    'SHADOWOB_CLAUDE_PLUGIN_IMPORTER',
    `cat > /tmp/claude-plugin-plan.json <<'SHADOWOB_CLAUDE_PLUGIN_PLAN'`,
    JSON.stringify(plan, null, 2),
    'SHADOWOB_CLAUDE_PLUGIN_PLAN',
    `node ${IMPORTER_PATH} /tmp/claude-plugin-plan.json`,
  ].join('\n')
}

function buildSlashCommandIndexSnippet(
  mountPath: string,
  options?: ClaudePluginSlashCommandIndexOptions,
): string {
  if (!options?.enabled) return ''

  const rulesJson = JSON.stringify(options.rules ?? [])
  return [
    `cat > ${SLASH_INDEXER_PATH} <<'SHADOWOB_CLAUDE_PLUGIN_SLASH_INDEXER'`,
    AGENT_PACK_SLASH_INDEXER_SCRIPT,
    'SHADOWOB_CLAUDE_PLUGIN_SLASH_INDEXER',
    [
      `node ${SLASH_INDEXER_PATH}`,
      `--mount-path ${shQuote(mountPath)}`,
      `--output ${shQuote(options.outputPath)}`,
      `--infer-interactions ${options.inferInteractions === false ? 'false' : 'true'}`,
      `--include-scripts ${options.includeScripts === false ? 'false' : 'true'}`,
      `--generate-script-skills ${options.generateScriptSkills === false ? 'false' : 'true'}`,
      `--max-script-commands-per-pack ${Math.max(0, Math.floor(options.maxScriptCommandsPerPack ?? 80))}`,
      `--rules-json ${shQuote(rulesJson)}`,
    ].join(' '),
  ].join('\n')
}

function buildImportScript(
  sources: ClaudePluginSourcePlan[],
  mountPath: string,
  slashCommandIndex?: ClaudePluginSlashCommandIndexOptions,
): string {
  return [
    'set -e',
    ...CLAUDE_PLUGIN_TOOL_CHECKS,
    `mkdir -p ${shQuote(mountPath)}`,
    buildImporterSnippet({ mountPath, sources }),
    buildSlashCommandIndexSnippet(mountPath, slashCommandIndex),
  ]
    .filter(Boolean)
    .join('\n')
}

export function buildClaudePluginInitContainer(
  sources: ClaudePluginSourcePlan[],
  mountPath: string,
  volumeName: string,
  scriptVolumeName: string,
): PluginK8sInitContainer {
  return {
    name: 'claude-plugin-import',
    image: CLAUDE_PLUGIN_IMAGE,
    imagePullPolicy: 'IfNotPresent',
    command: ['/bin/sh', `${CLAUDE_PLUGIN_SCRIPT_MOUNT_PATH}/init.sh`],
    volumeMounts: [
      { name: volumeName, mountPath },
      { name: scriptVolumeName, mountPath: CLAUDE_PLUGIN_SCRIPT_MOUNT_PATH, readOnly: true },
    ],
    resources: {
      requests: { cpu: '50m', memory: '96Mi' },
      limits: { cpu: '500m', memory: '512Mi' },
    },
    securityContext: CLAUDE_PLUGIN_HELPER_SECURITY_CONTEXT,
  }
}

export function buildClaudePluginSyncSidecar(opts: {
  sources: ClaudePluginSourcePlan[]
  mountPath: string
  volumeName: string
  scriptVolumeName: string
  intervalSec: number
}): PluginK8sSidecar | undefined {
  if (!opts.intervalSec || opts.intervalSec <= 0) return undefined

  return {
    name: 'claude-plugin-sync',
    image: CLAUDE_PLUGIN_IMAGE,
    imagePullPolicy: 'IfNotPresent',
    command: ['/bin/sh', `${CLAUDE_PLUGIN_SCRIPT_MOUNT_PATH}/sync.sh`],
    volumeMounts: [
      { name: opts.volumeName, mountPath: opts.mountPath },
      { name: opts.scriptVolumeName, mountPath: CLAUDE_PLUGIN_SCRIPT_MOUNT_PATH, readOnly: true },
    ],
    resources: {
      requests: { cpu: '50m', memory: '96Mi' },
      limits: { cpu: '500m', memory: '512Mi' },
    },
    securityContext: CLAUDE_PLUGIN_HELPER_SECURITY_CONTEXT,
  }
}

export function buildClaudePluginInitScript(
  sources: ClaudePluginSourcePlan[],
  mountPath: string,
  slashCommandIndex?: ClaudePluginSlashCommandIndexOptions,
): string {
  return buildImportScript(sources, mountPath, slashCommandIndex)
}

export function buildClaudePluginSyncScript(opts: {
  sources: ClaudePluginSourcePlan[]
  mountPath: string
  intervalSec: number
  slashCommandIndex?: ClaudePluginSlashCommandIndexOptions
}): string {
  const runScript = buildImportScript(opts.sources, opts.mountPath, opts.slashCommandIndex)
  return `
set -e
RUN_SCRIPT() {
${runScript}
}
while true; do
  RUN_SCRIPT || echo "[claude-plugin-sync] iteration failed, will retry"
  date -u +%FT%TZ > "${opts.mountPath}/.claude-plugin-synced-at" || true
  sleep ${opts.intervalSec}
done
`.trim()
}
