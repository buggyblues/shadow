/**
 * agent-pack plugin — pull arbitrary AI-agent customisation packs from any
 * git repo and mount them into the agent container at
 * `/agent-packs/<pack-id>/<kind>/`.
 *
 * Pure mechanism. No bundled registry / presets — template authors can either
 * rely on common-layout auto-detection or declare exact mounts for unusual
 * repositories. Supports any combination of:
 *   - skills      → wired to OpenClaw `skills.load.extraDirs`
 *   - commands    → also wired as skills (Claude-style slash commands)
 *   - instructions → CLAUDE.md / AGENTS.md / SOUL.md / RULES.md / …
 *                    (env var SHADOW_PACK_INSTRUCTIONS_DIRS lists paths)
 *   - hooks       → bootstrap.md / teardown.md
 *                   (env var SHADOW_PACK_HOOKS_DIRS lists paths)
 *   - mcp         → .mcp.json / mcp.json fragments
 *                   (env var SHADOW_PACK_MCP_DIRS lists paths)
 *   - scripts     → bin/ helper executables
 *                   (env var SHADOW_PACK_SCRIPTS_DIRS lists paths)
 *   - agents      → sub-agent definitions (Claude-Code subagents)
 *   - files       → generic mount, no special wiring
 *
 * Minimal usage in a template:
 *
 *   "use": [
 *     { "plugin": "agent-pack",
 *       "options": {
 *         "packs": [
 *           {
 *             "id": "marketingskills",
 *             "url": "https://github.com/coreyhaines31/marketingskills",
 *             "ref": "main"
 *           }
 *         ],
 *         "poll": "10m"
 *       }
 *     }
 *   ]
 */

import typia from 'typia'
import { definePlugin } from '../helpers.js'
import type {
  PluginBuildContext,
  PluginConfigFragment,
  PluginK8sEnvVar,
  PluginK8sProvider,
  PluginK8sResult,
  PluginManifest,
  PluginSlashCommandRule,
  PluginValidationResult,
} from '../types.js'
import {
  buildAgentPackInitContainer,
  buildAgentPackSyncSidecar,
  DEFAULT_INSTRUCTION_FILES,
  type PackKind,
  parsePollInterval,
  type ResolvedMount,
  type ResolvedPack,
  sanitizeId,
} from './k8s.js'
import manifest from './manifest.json' with { type: 'json' }

const VOLUME_NAME = 'agent-packs'
const DEFAULT_MOUNT = '/agent-packs'

/** Kinds wired into OpenClaw `skills.load.extraDirs`. */
const SKILL_LIKE_KINDS: ReadonlySet<PackKind> = new Set(['skills', 'commands', 'agents'])

// ─── Options shape (matches manifest.config) ──────────────────────────────

export interface PackMountOption {
  kind: PackKind
  from: string
  include?: string[]
}

export interface PackOption {
  /** Stable id within the agent (used for mount subdir). Auto-derived from url. */
  id?: string
  /** Repository URL (HTTPS or SSH). Required. */
  url?: string
  /** Branch / tag / SHA. Defaults to 'main'. */
  ref?: string
  /** Shallow clone depth. Defaults to 1. */
  depth?: number
  /**
   * Auto-detect common agent-pack layouts. Defaults to true when mounts are
   * omitted, and false when explicit mounts are supplied.
   */
  autoDetect?: boolean
  /** Per-kind mount declarations. Optional when autoDetect is enabled. */
  mounts?: PackMountOption[]
  /** Override the curated root-level instruction filenames. */
  instructionFiles?: string[]
}

export interface AgentPackOptions {
  packs?: PackOption[]
  mountPath?: string
  poll?: string | number
  slashCommands?: {
    rules?: PluginSlashCommandRule[]
  }
}

export const validateAgentPackOptions: (input: unknown) => typia.IValidation<AgentPackOptions> =
  typia.createValidate<AgentPackOptions>()

const AUTO_MOUNTS: readonly ResolvedMount[] = [
  // Standard Agent Skills / Claude Code plugin layouts.
  { kind: 'skills', from: 'skills' },
  { kind: 'skills', from: '.agents/skills' },
  { kind: 'skills', from: '.codex/skills' },
  { kind: 'skills', from: '.claude/skills' },
  { kind: 'skills', from: '.claude/plugins' },
  { kind: 'skills', from: '.cursor/skills' },
  { kind: 'skills', from: '.gemini/skills' },
  { kind: 'skills', from: '.windsurf/skills' },
  { kind: 'skills', from: 'openclaw/skills' },
  { kind: 'skills', from: 'agent-skills' },
  { kind: 'skills', from: 'agent_skills' },
  { kind: 'skills', from: 'claude-skills' },
  { kind: 'skills', from: 'claude/skills' },
  { kind: 'skills', from: 'scientific-skills' },
  { kind: 'skills', from: 'plugins' },
  { kind: 'skills', from: 'extensions' },
  { kind: 'skills', from: '.' },

  // Slash-command and subagent workspaces.
  { kind: 'commands', from: 'commands' },
  { kind: 'commands', from: 'slash-commands' },
  { kind: 'commands', from: '.agents/commands' },
  { kind: 'commands', from: '.codex/commands' },
  { kind: 'commands', from: '.claude/commands' },
  { kind: 'commands', from: '.cursor/commands' },
  { kind: 'commands', from: '.gemini/commands' },
  { kind: 'commands', from: '.windsurf/commands' },
  { kind: 'commands', from: 'plugins' },
  { kind: 'commands', from: 'extensions' },
  { kind: 'agents', from: 'agents' },
  { kind: 'agents', from: '.agents' },
  { kind: 'agents', from: '.agents/agents' },
  { kind: 'agents', from: '.codex/agents' },
  { kind: 'agents', from: '.claude/agents' },
  { kind: 'agents', from: '.claude/subagents' },
  { kind: 'agents', from: '.cursor/agents' },
  { kind: 'agents', from: '.gemini/agents' },
  { kind: 'agents', from: '.windsurf/agents' },
  { kind: 'agents', from: 'subagents' },
  { kind: 'agents', from: 'plugins' },
  { kind: 'agents', from: 'extensions' },

  // Human-readable methodology and project context.
  { kind: 'instructions', from: '.' },
  { kind: 'instructions', from: 'context' },
  { kind: 'instructions', from: 'docs' },
  { kind: 'instructions', from: 'openclaw' },
  { kind: 'instructions', from: '.agents' },
  { kind: 'instructions', from: '.codex' },
  { kind: 'instructions', from: '.claude' },
  { kind: 'instructions', from: '.github/copilot-instructions.md' },
  { kind: 'instructions', from: '.github/instructions' },
  { kind: 'instructions', from: '.github/prompts' },
  { kind: 'instructions', from: '.github/chatmodes' },
  { kind: 'instructions', from: '.cursor/rules' },
  { kind: 'instructions', from: '.cursorrules' },
  { kind: 'instructions', from: '.windsurf/rules' },
  { kind: 'instructions', from: '.windsurfrules' },
  { kind: 'instructions', from: '.clinerules' },
  { kind: 'instructions', from: 'rules' },
  { kind: 'instructions', from: 'rules.md' },
  { kind: 'instructions', from: 'instructions' },
  { kind: 'instructions', from: 'prompts' },
  { kind: 'instructions', from: 'playbooks' },
  { kind: 'instructions', from: 'specs' },
  { kind: 'instructions', from: 'workflow' },
  { kind: 'instructions', from: 'workflows' },
  { kind: 'instructions', from: 'knowledge' },
  { kind: 'instructions', from: 'knowledge-base' },
  { kind: 'instructions', from: 'memory-bank' },
  { kind: 'instructions', from: 'memory' },
  { kind: 'instructions', from: 'second-brain' },
  { kind: 'instructions', from: 'strategy' },
  { kind: 'instructions', from: 'ops' },
  { kind: 'instructions', from: '.claude/commands' },
  { kind: 'instructions', from: '.claude/agents' },

  // Hooks, MCP, helper binaries, and heavier repo assets.
  { kind: 'hooks', from: 'hooks' },
  { kind: 'hooks', from: '.agents/hooks' },
  { kind: 'hooks', from: '.codex/hooks' },
  { kind: 'hooks', from: '.claude/hooks' },
  { kind: 'hooks', from: '.claude/settings.json' },
  { kind: 'hooks', from: '.claude/settings.local.json' },
  { kind: 'hooks', from: '.cursor/hooks' },
  { kind: 'hooks', from: '.cursor/hooks.json' },
  { kind: 'mcp', from: '.mcp.json' },
  { kind: 'mcp', from: '.mcp' },
  { kind: 'mcp', from: '.claude/mcp.json' },
  { kind: 'mcp', from: '.cursor/mcp.json' },
  { kind: 'mcp', from: '.vscode/mcp.json' },
  { kind: 'mcp', from: 'mcp.json' },
  { kind: 'mcp', from: 'mcp' },
  { kind: 'scripts', from: 'bin' },
  { kind: 'scripts', from: 'scripts' },
  { kind: 'files', from: 'data_sources' },
  { kind: 'files', from: 'data-sources' },
  { kind: 'files', from: 'data' },
  { kind: 'files', from: 'examples' },
  { kind: 'files', from: 'templates' },
  { kind: 'files', from: 'notebooks' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────

function deriveIdFromUrl(url: string): string {
  // https://github.com/owner/repo(.git) -> owner-repo
  const m = url.match(/[/:]([^/:]+)\/([^/]+?)(\.git)?\/?$/)
  if (m) return sanitizeId(`${m[1]}-${m[2]}`)
  return sanitizeId(url)
}

function readOptions(agent: PluginBuildContext['agent']): AgentPackOptions | null {
  const entry = agent.use?.find((u) => u.plugin === 'agent-pack')
  if (!entry?.options) return null
  return entry.options as AgentPackOptions
}

function shouldAutoDetect(pack: PackOption): boolean {
  return pack.autoDetect ?? !pack.mounts?.length
}

function dedupeMounts(mounts: ResolvedMount[]): ResolvedMount[] {
  const seen = new Set<string>()
  const out: ResolvedMount[] = []
  for (const mount of mounts) {
    const key = `${mount.kind}:${mount.from}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(mount)
  }
  return out
}

export function buildAgentPackPrompt(packs: ResolvedPack[], mountPath: string): string {
  const lines: string[] = [
    '## Mounted Agent Packs',
    '',
    'Treat the following mounted packs as source-of-truth context whenever they are relevant to the user request:',
    '',
  ]

  for (const pack of packs) {
    if (pack.autoDetect) {
      lines.push(
        `- **${pack.id}** — auto-detected common layouts under \`${mountPath}/${pack.id}/{skills,commands,agents,instructions,hooks,mcp,scripts,files}\``,
      )
      continue
    }

    const mountDirs = new Map<PackKind, Set<string>>()
    for (const mount of pack.mounts) {
      const dirs = mountDirs.get(mount.kind) ?? new Set<string>()
      dirs.add(`${mountPath}/${pack.id}/${mount.kind}`)
      mountDirs.set(mount.kind, dirs)
    }
    const mountSummary = [...mountDirs.entries()]
      .flatMap(([kind, dirs]) => [...dirs].map((dir) => `${kind}: \`${dir}\``))
      .join('; ')
    lines.push(`- **${pack.id}** — ${mountSummary}`)
  }

  lines.push(
    '',
    'When one of these packs is relevant:',
    "1. Read the most relevant markdown files under that pack's `instructions/` directory before answering, when present.",
    '2. If direct pack paths are unavailable in the model sandbox, read the consolidated workspace file `PACK_INSTRUCTIONS.md`.',
    '3. Use the mounted pack skills, commands, or sub-agents instead of improvising from memory.',
    '4. If the pack exposes `hooks/bootstrap.md` or `hooks/teardown.md`, follow those procedures when applicable.',
    '5. Run helper scripts from the mounted `scripts/` directory using absolute paths when they are useful.',
    '6. Cite the pack id and the exact skill, instruction file, or procedure you relied on.',
  )

  return lines.join('\n')
}

/**
 * Apply defaults and dedupe. Returns only entries that have a usable url
 * and either explicit mounts or common-layout auto-detection enabled.
 */
export function resolvePacks(opts: AgentPackOptions): ResolvedPack[] {
  const packs = opts.packs ?? []
  const resolved: ResolvedPack[] = []
  const seen = new Set<string>()
  for (const p of packs) {
    if (!p.url) continue
    const id = sanitizeId(p.id ?? deriveIdFromUrl(p.url))
    if (seen.has(id)) continue
    seen.add(id)

    const autoDetect = shouldAutoDetect(p)
    const mounts = dedupeMounts([
      ...(p.mounts ?? []).map((m) => ({
        kind: m.kind,
        from: m.from,
        include: m.include,
      })),
      ...(autoDetect ? AUTO_MOUNTS.map((m) => ({ ...m })) : []),
    ])
    if (mounts.length === 0) continue

    resolved.push({
      id,
      url: p.url,
      ref: p.ref ?? 'main',
      depth: p.depth ?? 1,
      autoDetect,
      mounts,
      instructionFiles: p.instructionFiles ?? DEFAULT_INSTRUCTION_FILES,
    })
  }
  return resolved
}

// ─── K8s provider ────────────────────────────────────────────────────────

const agentPackK8sProvider: PluginK8sProvider = {
  buildK8s(agent, _ctx): PluginK8sResult | undefined {
    const entry = agent.use?.find((u) => u.plugin === 'agent-pack')
    if (!entry?.options) return undefined

    const opts = entry.options as AgentPackOptions
    const packs = resolvePacks(opts)
    if (packs.length === 0) return undefined

    const mountPath = opts.mountPath ?? DEFAULT_MOUNT
    const initContainer = buildAgentPackInitContainer(packs, mountPath, VOLUME_NAME)

    // Aggregate per-kind directory lists so the agent runtime can consume
    // them via env vars (no schema change required in OpenClaw today).
    const byKind = new Map<PackKind, string[]>()
    for (const p of packs) {
      for (const m of p.mounts) {
        const list = byKind.get(m.kind) ?? []
        list.push(`${mountPath}/${p.id}/${m.kind}`)
        byKind.set(m.kind, list)
      }
    }

    const envVars: PluginK8sEnvVar[] = []
    const envForKind: Partial<Record<PackKind, string>> = {
      skills: 'SHADOW_PACK_SKILLS_DIRS',
      instructions: 'SHADOW_PACK_INSTRUCTIONS_DIRS',
      commands: 'SHADOW_PACK_COMMANDS_DIRS',
      hooks: 'SHADOW_PACK_HOOKS_DIRS',
      mcp: 'SHADOW_PACK_MCP_DIRS',
      scripts: 'SHADOW_PACK_SCRIPTS_DIRS',
      files: 'SHADOW_PACK_FILES_DIRS',
      agents: 'SHADOW_PACK_AGENTS_DIRS',
    }
    for (const [kind, dirs] of byKind) {
      const name = envForKind[kind]
      if (name) envVars.push({ name, value: dirs.join(':') })
    }
    envVars.push({ name: 'SHADOW_PACK_MOUNT_ROOT', value: mountPath })

    const result: PluginK8sResult = {
      initContainers: [initContainer],
      volumes: [{ name: VOLUME_NAME, spec: { emptyDir: {} } }],
      volumeMounts: [{ name: VOLUME_NAME, mountPath, readOnly: false }],
      envVars,
      labels: {
        'agent-pack.packs': packs
          .map((p) => p.id)
          .join('_')
          .slice(0, 63),
      },
    }

    const sidecar = buildAgentPackSyncSidecar({
      packs,
      mountPath,
      volumeName: VOLUME_NAME,
      intervalSec: parsePollInterval(opts.poll),
    })
    if (sidecar) result.sidecars = [sidecar]

    return result
  },
}

// ─── Plugin definition ───────────────────────────────────────────────────

const plugin = definePlugin(manifest as PluginManifest, (api) => {
  // Wire skills + commands + agents into OpenClaw's skills.load.extraDirs.
  api.onBuildConfig((context: PluginBuildContext): PluginConfigFragment => {
    const opts = readOptions(context.agent)
    if (!opts) return {}
    const packs = resolvePacks(opts)
    if (packs.length === 0) return {}

    const mountPath = opts.mountPath ?? DEFAULT_MOUNT
    const extraDirs: string[] = []
    for (const p of packs) {
      for (const m of p.mounts) {
        if (SKILL_LIKE_KINDS.has(m.kind)) {
          extraDirs.push(`${mountPath}/${p.id}/${m.kind}`)
        }
      }
    }
    if (extraDirs.length === 0) return {}
    return {
      skills: {
        load: { extraDirs: [...new Set(extraDirs)] },
      } as Record<string, unknown>,
    }
  })

  api.onBuildPrompt((context: PluginBuildContext): string | void => {
    const opts = readOptions(context.agent)
    if (!opts) return

    const packs = resolvePacks(opts)
    if (packs.length === 0) return

    const mountPath = opts.mountPath ?? DEFAULT_MOUNT
    return buildAgentPackPrompt(packs, mountPath)
  })

  api.onBuildRuntime((context: PluginBuildContext) => {
    const opts = readOptions(context.agent)
    const rules = opts?.slashCommands?.rules?.filter((rule) => rule && typeof rule === 'object')
    if (!rules?.length) return
    return { slashCommands: { rules } }
  })

  api.onValidate((context: PluginBuildContext): PluginValidationResult | void => {
    const opts = readOptions(context.agent)
    if (!opts) return
    const shape = validateAgentPackOptions(opts)
    const packs = opts.packs ?? []
    const errors: PluginValidationResult['errors'] = []
    if (!shape.success) {
      errors.push(
        ...shape.errors.map((error) => ({
          path: `use.agent-pack.options${error.path}`,
          message: error.expected,
          severity: 'error' as const,
        })),
      )
    }
    packs.forEach((p, i) => {
      if (!p.url) {
        errors.push({
          path: `use.agent-pack.packs[${i}].url`,
          message: 'Each pack must specify a git "url".',
          severity: 'error',
        })
      }
      if ((!p.mounts || p.mounts.length === 0) && p.autoDetect === false) {
        errors.push({
          path: `use.agent-pack.packs[${i}].mounts`,
          message: 'Each pack must declare at least one mount when autoDetect is false.',
          severity: 'error',
        })
      } else if (p.mounts) {
        p.mounts.forEach((m, j) => {
          if (!m.kind || m.from == null) {
            errors.push({
              path: `use.agent-pack.packs[${i}].mounts[${j}]`,
              message: 'Each mount requires both "kind" and "from".',
              severity: 'error',
            })
          }
        })
      }
    })
    if (errors.length > 0) return { valid: false, errors }
  })
})

plugin.k8s = agentPackK8sProvider

export default plugin
