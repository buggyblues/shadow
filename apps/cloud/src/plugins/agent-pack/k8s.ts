/**
 * agent-pack K8s adapter — generates init container + optional sync sidecar
 * that clone N agent packs into separate subdirectories under a shared
 * EmptyDir volume.
 *
 * Layout written into `<mountPath>/`:
 *   <pack-id>/
 *     skills/        — wired to OpenClaw skills.load.extraDirs
 *     commands/      — also wired as skills (each with SKILL.md inside)
 *     instructions/  — CLAUDE.md / AGENTS.md / SOUL.md / RULES.md / …
 *     hooks/         — hook scripts
 *     mcp/           — collected mcp.json fragments
 *     scripts/       — bin/ helper executables
 *     agents/        — sub-agent definitions
 *     files/         — generic mount, no special wiring
 *     repo/          — full clone (only when `kinds: ['files']` requested)
 */

import type { PluginK8sInitContainer, PluginK8sSidecar } from '../types.js'
import { AGENT_PACK_SLASH_INDEXER_SCRIPT } from './indexer-script.js'

const AGENT_PACK_IMAGE = 'node:22-bookworm'
const SLASH_INDEXER_PATH = '/tmp/agent-pack-slash-indexer.mjs'
export const AGENT_PACK_SCRIPT_MOUNT_PATH = '/opt/shadow-agent-pack'
const AGENT_PACK_HELPER_SECURITY_CONTEXT = {
  runAsNonRoot: true,
  runAsUser: 1000,
  runAsGroup: 1000,
  allowPrivilegeEscalation: false,
  capabilities: { drop: ['ALL'] },
}
const AGENT_PACK_TOOL_CHECKS = [
  'command -v git >/dev/null 2>&1 || { echo "[agent-pack] git is missing from helper image" >&2; exit 127; }',
  'command -v node >/dev/null 2>&1 || { echo "[agent-pack] node is missing from helper image" >&2; exit 127; }',
]

/** Kinds of artifact a pack can contribute to an agent. */
export type PackKind =
  | 'skills' // SKILL.md folders → wired to OpenClaw skills.load.extraDirs
  | 'commands' // Claude-style slash commands (.md w/ frontmatter) → also wired as skills
  | 'instructions' // CLAUDE.md / AGENTS.md / SOUL.md / RULES.md / ETHOS.md / INSTRUCTIONS.md
  | 'hooks' // bootstrap.md / teardown.md / hooks.yaml
  | 'mcp' // .mcp.json / mcp.json — MCP server configs
  | 'scripts' // bin/ or scripts/ helper executables
  | 'agents' // sub-agent definitions (Claude-Code subagents)
  | 'files' // generic mount, no special wiring

/**
 * Default curated set of root-level instruction filenames. A template can
 * override per pack via the `instructionFiles` option.
 */
export const DEFAULT_INSTRUCTION_FILES = [
  'CLAUDE.md',
  'AGENTS.md',
  'GEMINI.md',
  'SOUL.md',
  'RULES.md',
  'rules.md',
  'ETHOS.md',
  'INSTRUCTIONS.md',
  'PERSONALITY.md',
  'ARCHITECTURE.md',
  'BROWSER.md',
  'DESIGN.md',
  '.cursorrules',
  '.windsurfrules',
  '.clinerules',
  'README.md',
  'README.mdx',
  'CONTEXT.md',
  'MEMORY.md',
  'PLAYBOOK.md',
  'SPEC.md',
  'SYSTEM.md',
  'AGENT.md',
]

/** A per-pack mount declaration after preset/option resolution. */
export interface ResolvedMount {
  kind: PackKind
  /** Source path inside the cloned repo (relative). May be `.` for repo root. */
  from: string
  /** Optional whitelist of immediate child names to copy. */
  include?: string[]
}

/** A single pack to clone — already resolved (preset expanded). */
export interface ResolvedPack {
  id: string
  url: string
  ref: string
  depth: number
  /**
   * True when the plugin supplied common-layout mounts automatically.
   * Used for prompt summaries and runtime metadata only.
   */
  autoDetect?: boolean
  /** One entry per kind to mount. */
  mounts: ResolvedMount[]
  /** Root-level instruction filenames to also collect into `instructions/`. */
  instructionFiles: string[]
}

export interface SlashCommandIndexOptions {
  enabled: boolean
  outputPath: string
  inferInteractions?: boolean
  rules?: unknown[]
}

/**
 * Parse a duration string like "30s", "5m", "1h" into seconds.
 */
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

/**
 * Sanitize a string for use as a K8s label or path segment.
 */
export function sanitizeId(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 63)
}

export function agentPackSlashCommandsIndexPath(mountPath: string): string {
  return `${mountPath}/.shadow/slash-commands.json`
}

function shQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}

function buildSlashCommandIndexSnippet(
  mountPath: string,
  options?: SlashCommandIndexOptions,
): string {
  if (!options?.enabled) return ''

  const rulesJson = JSON.stringify(options.rules ?? [])
  return [
    `cat > ${SLASH_INDEXER_PATH} <<'SHADOW_AGENT_PACK_SLASH_INDEXER'`,
    AGENT_PACK_SLASH_INDEXER_SCRIPT,
    'SHADOW_AGENT_PACK_SLASH_INDEXER',
    [
      `node ${SLASH_INDEXER_PATH}`,
      `--mount-path ${shQuote(mountPath)}`,
      `--output ${shQuote(options.outputPath)}`,
      `--infer-interactions ${options.inferInteractions === false ? 'false' : 'true'}`,
      `--rules-json ${shQuote(rulesJson)}`,
    ].join(' '),
  ].join('\n')
}

/**
 * Build the shell snippet that copies a single mount of `kind` from the
 * cloned repo into `<destBase>/<kind>/`. The behaviour depends on kind:
 *   - skills/commands/agents → copy each child dir of `from` that has SKILL.md
 *     (or any .md, for commands/agents), and convert top-level command/agent
 *     markdown files into OpenClaw-readable directories.
 *   - instructions → copy a curated set of root-level markdown files plus
 *     anything under the `from` dir.
 *   - hooks/scripts/files → copy the `from` dir as-is (filtered by include).
 *   - mcp → if `from` is a file, copy it as `mcp/mcp.json`; if a dir, copy
 *     `*.json` inside.
 */
function buildMountCopySnippet(
  pack: ResolvedPack,
  mount: ResolvedMount,
  scratch: string,
  destBase: string,
): string {
  const from = mount.from === '.' || mount.from === '' ? scratch : `${scratch}/${mount.from}`
  const dest = `${destBase}/${mount.kind}`
  const cmds: string[] = [`mkdir -p "${dest}"`]

  switch (mount.kind) {
    case 'skills':
    case 'commands':
    case 'agents': {
      // For skills+commands+agents, copy each direct child dir that has a
      // SKILL.md (or markdown descriptors for commands/agents). Honor include
      // whitelist, and normalize top-level markdown files into directories so
      // OpenClaw can discover them via skills.load.extraDirs.
      const descriptorName = mount.kind === 'agents' ? 'AGENT.md' : 'SKILL.md'
      const rootSkillSlug = sanitizeId(pack.id)
      const descriptorCopies =
        mount.kind === 'agents'
          ? `cp "$f" "${dest}/$slug/${descriptorName}"; cp "$f" "${dest}/$slug/SKILL.md"`
          : `cp "$f" "${dest}/$slug/${descriptorName}"`
      const stripSkillSuffix =
        mount.kind === 'skills' ? `slug="$(printf '%s' "$slug" | sed 's/-SKILL$//')"; ` : ''
      const normalizeTopLevelFile = `base="$(basename "$f" .md)"; if [ "$base" = "SKILL" ]; then slug="${rootSkillSlug}"; else slug="$base"; fi; ${stripSkillSuffix}slug="$(printf '%s' "$slug" | tr -cs 'A-Za-z0-9._-' '-' | sed 's/^-//;s/-$//')"; [ -n "$slug" ] || slug="item"; mkdir -p "${dest}/$slug"; ${descriptorCopies}`
      const normalizeNestedSkillDir = `d="$(dirname "$f")"; rel="$d"; case "$rel" in "${from}"/*) rel="\${rel#${from}/}" ;; *) rel="$(basename "$d")" ;; esac; slug="$(basename "$d")"; slug="$(printf '%s' "$slug" | sed 's/-SKILL$//' | tr -cs 'A-Za-z0-9._-' '-' | sed 's/^-//;s/-$//')"; [ -n "$slug" ] || slug="${rootSkillSlug}"; if [ -e "${dest}/$slug" ]; then slug="$(printf '%s' "$rel" | sed 's/-SKILL$//' | tr '/ ' '--' | tr -cs 'A-Za-z0-9._-' '-' | sed 's/^-//;s/-$//')"; fi; [ -n "$slug" ] || slug="${rootSkillSlug}"; mkdir -p "${dest}/$slug"; cp -r "$d/." "${dest}/$slug/"`
      if (mount.include && mount.include.length > 0) {
        for (const name of mount.include) {
          cmds.push(
            `if [ -d "${from}/${name}" ]; then cp -r "${from}/${name}" "${dest}/"; elif [ -f "${from}/${name}" ]; then f="${from}/${name}"; ${normalizeTopLevelFile}; else echo "[agent-pack] missing ${mount.kind} ${name} in ${pack.id}"; fi`,
          )
        }
      } else {
        const hasDescriptor =
          mount.kind === 'skills'
            ? `[ -f "$d/SKILL.md" ]`
            : `[ -n "$(find "$d" -maxdepth 1 -type f -name '*.md' -print -quit 2>/dev/null)" ]`
        cmds.push(
          `find "${from}" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | while read -r d; do if ${hasDescriptor}; then cp -r "$d" "${dest}/"; fi; done`,
        )
        if (mount.kind === 'skills') {
          cmds.push(
            `if [ -f "${from}/SKILL.md" ]; then mkdir -p "${dest}/${rootSkillSlug}"; cp "${from}/SKILL.md" "${dest}/${rootSkillSlug}/SKILL.md"; fi`,
          )
          cmds.push(
            `find "${from}" -mindepth 1 -maxdepth 1 -type f \\( -name 'SKILL.md' -o -name '*-SKILL.md' \\) 2>/dev/null | while read -r f; do ${normalizeTopLevelFile}; done`,
          )
          cmds.push(
            `find "${from}" -path '*/.git/*' -prune -o -mindepth 2 -maxdepth 6 -type f -name 'SKILL.md' -print 2>/dev/null | while read -r f; do ${normalizeNestedSkillDir}; done`,
          )
        }
        if (mount.kind === 'commands' || mount.kind === 'agents') {
          const pathSegment = mount.kind
          cmds.push(
            `find "${from}" -mindepth 1 -maxdepth 1 -type f -name '*.md' 2>/dev/null | while read -r f; do ${normalizeTopLevelFile}; done`,
          )
          cmds.push(
            `find "${from}" -path '*/.git/*' -prune -o -path "*/${pathSegment}/*.md" -type f -print 2>/dev/null | while read -r f; do ${normalizeTopLevelFile}; done`,
          )
        }
      }
      break
    }
    case 'instructions': {
      // Curated root-level files + anything inside the `from` dir.
      for (const f of pack.instructionFiles) {
        cmds.push(`cp "${scratch}/${f}" "${dest}/" 2>/dev/null || true`)
      }
      if (mount.from !== '.' && mount.from !== '') {
        // Copy common instruction file types from a file or directory.
        cmds.push(
          `if [ -f "${from}" ]; then cp "${from}" "${dest}/" 2>/dev/null || true; elif [ -d "${from}" ]; then find "${from}" -mindepth 1 -maxdepth 3 -type f \\( -name '*.md' -o -name '*.mdc' -o -name '*.txt' \\) -exec cp {} "${dest}/" \\; 2>/dev/null || true; fi`,
        )
      }
      break
    }
    case 'mcp': {
      // `from` may be a file (e.g. ".mcp.json") or a dir.
      cmds.push(
        `if [ -f "${from}" ]; then cp "${from}" "${dest}/$(basename "${from}")"; elif [ -d "${from}" ]; then find "${from}" -mindepth 1 -maxdepth 1 -name '*.json' -exec cp {} "${dest}/" \\; ; fi`,
      )
      break
    }
    case 'hooks':
    case 'scripts':
    case 'files': {
      if (mount.include && mount.include.length > 0) {
        for (const name of mount.include) {
          cmds.push(`cp -r "${from}/${name}" "${dest}/" 2>/dev/null || true`)
        }
      } else {
        // Copy everything under `from` into dest.
        cmds.push(
          `if [ -d "${from}" ]; then cp -r "${from}/." "${dest}/" 2>/dev/null || true; elif [ -f "${from}" ]; then cp "${from}" "${dest}/" 2>/dev/null || true; fi`,
        )
      }
      // Make sure scripts are executable.
      if (mount.kind === 'scripts') {
        cmds.push(`find "${dest}" -type f -exec chmod +x {} \\; 2>/dev/null || true`)
      }
      break
    }
  }

  return cmds.join(' && ')
}

/**
 * Build the shell snippet that clones one pack and applies all of its
 * configured mounts. Each mount writes into `<mountPath>/<pack-id>/<kind>/`.
 */
function buildPackCloneSnippet(pack: ResolvedPack, mountPath: string): string {
  const safeId = sanitizeId(pack.id)
  const scratch = `/tmp/agent-pack-src-${safeId}`
  const destBase = `${mountPath}/${safeId}`
  const summary = pack.mounts.map((m) => m.kind).join(',') || 'none'
  const lines: string[] = [
    `echo "[agent-pack] cloning ${pack.url}@${pack.ref} (mounts: ${summary}) -> ${destBase}"`,
    `rm -rf "${scratch}"`,
    `git clone --depth ${pack.depth} --branch "${pack.ref}" "${pack.url}" "${scratch}"`,
    `mkdir -p "${destBase}"`,
  ]
  for (const m of pack.mounts) {
    lines.push(buildMountCopySnippet(pack, m, scratch, destBase))
  }
  // Drop a manifest so the runtime can inspect what got mounted.
  const manifest = JSON.stringify({
    id: pack.id,
    url: pack.url,
    ref: pack.ref,
    autoDetect: pack.autoDetect ?? false,
    kinds: pack.mounts.map((m) => m.kind),
  })
  lines.push(`echo '${manifest.replace(/'/g, "'\\''")}' > "${destBase}/.pack.json"`)
  lines.push(`echo "[agent-pack] ${pack.id} ready"`)
  return lines.join(' && ')
}

/**
 * Build the init container that clones every pack at pod startup.
 */
export function buildAgentPackInitContainer(
  packs: ResolvedPack[],
  mountPath: string,
  volumeName: string,
  scriptVolumeName: string,
  slashCommandIndex?: SlashCommandIndexOptions,
): PluginK8sInitContainer {
  return {
    name: 'agent-pack-clone',
    image: AGENT_PACK_IMAGE,
    imagePullPolicy: 'IfNotPresent',
    command: ['/bin/sh', `${AGENT_PACK_SCRIPT_MOUNT_PATH}/init.sh`],
    volumeMounts: [
      { name: volumeName, mountPath },
      { name: scriptVolumeName, mountPath: AGENT_PACK_SCRIPT_MOUNT_PATH, readOnly: true },
    ],
    resources: {
      requests: { cpu: '25m', memory: '64Mi' },
      limits: { cpu: '250m', memory: '256Mi' },
    },
    securityContext: AGENT_PACK_HELPER_SECURITY_CONTEXT,
  }
}

/**
 * Build the periodic sync sidecar (optional).
 */
export function buildAgentPackSyncSidecar(opts: {
  packs: ResolvedPack[]
  mountPath: string
  volumeName: string
  scriptVolumeName: string
  intervalSec: number
  slashCommandIndex?: SlashCommandIndexOptions
}): PluginK8sSidecar | undefined {
  const { volumeName, scriptVolumeName, intervalSec } = opts
  if (!intervalSec || intervalSec <= 0) return undefined

  return {
    name: 'agent-pack-sync',
    image: AGENT_PACK_IMAGE,
    imagePullPolicy: 'IfNotPresent',
    command: ['/bin/sh', `${AGENT_PACK_SCRIPT_MOUNT_PATH}/sync.sh`],
    volumeMounts: [
      { name: volumeName, mountPath: opts.mountPath },
      { name: scriptVolumeName, mountPath: AGENT_PACK_SCRIPT_MOUNT_PATH, readOnly: true },
    ],
    resources: {
      requests: { cpu: '25m', memory: '64Mi' },
      limits: { cpu: '250m', memory: '256Mi' },
    },
    securityContext: AGENT_PACK_HELPER_SECURITY_CONTEXT,
  }
}

export function buildAgentPackInitScript(
  packs: ResolvedPack[],
  mountPath: string,
  slashCommandIndex?: SlashCommandIndexOptions,
): string {
  return [
    'set -e',
    ...AGENT_PACK_TOOL_CHECKS,
    ...packs.map((p) => buildPackCloneSnippet(p, mountPath)),
    buildSlashCommandIndexSnippet(mountPath, slashCommandIndex),
  ]
    .filter(Boolean)
    .join('\n')
}

export function buildAgentPackSyncScript(opts: {
  packs: ResolvedPack[]
  mountPath: string
  intervalSec: number
  slashCommandIndex?: SlashCommandIndexOptions
}): string {
  const { packs, mountPath, intervalSec, slashCommandIndex } = opts
  const cloneAll = packs.map((p) => buildPackCloneSnippet(p, mountPath)).join('\n')
  const indexCommands = buildSlashCommandIndexSnippet(mountPath, slashCommandIndex)

  return `
set -e
${AGENT_PACK_TOOL_CHECKS.join('\n')}
RUN_SCRIPT() {
${cloneAll}
${indexCommands}
}
while true; do
  RUN_SCRIPT || echo "[agent-pack-sync] iteration failed, will retry"
  date -u +%FT%TZ > "${mountPath}/.agent-pack-synced-at" || true
  sleep ${intervalSec}
done
`.trim()
}
