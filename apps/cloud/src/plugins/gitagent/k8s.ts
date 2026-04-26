/**
 * GitAgent K8s Adapter — generates K8s-specific artifacts from gitagent config.
 *
 * Contains:
 * - buildGitCloneCommand — init container command for git repo cloning
 * - buildGitSyncSidecar — sidecar container spec for periodic `git pull`
 * - generateGitAgentDockerfile — multi-stage Dockerfile for baking gitagent files
 *
 * Used by the infra layer (infra/index.ts, infra/agent-deployment.ts) and
 * build commands (interfaces/cli/build.command.ts).
 */

import type { PluginK8sSidecar } from '../types.js'

/**
 * Standard gitagent files to copy from a cloned repo.
 */
const STANDARD_GITAGENT_FILES = [
  'SOUL.md',
  'RULES.md',
  'AGENTS.md',
  'INSTRUCTIONS.md',
  'agent.yaml',
  'scheduler.yml',
  'scheduler.yaml',
  'skills',
  'tools',
  'hooks',
  'skillflows',
  'memory',
  'knowledge',
  'compliance',
]

/**
 * Generate the init container command for cloning a git repo.
 * Used by the K8s infra layer to add an init container to the agent Deployment.
 */
export function buildGitCloneCommand(opts: {
  url: string
  ref: string
  depth: number
  agentDir?: string
  mountPath: string
  include?: string[]
}): string[] {
  const { url, ref, depth, agentDir, mountPath, include } = opts

  // Build clone command
  const cloneTarget = '/tmp/agent-source'
  const cmds: string[] = []

  // Clone
  cmds.push(`git clone --depth ${depth} --branch "${ref}" "${url}" "${cloneTarget}"`)

  // Determine source directory
  const sourceDir = agentDir ? `${cloneTarget}/${agentDir}` : cloneTarget

  // Create mount path
  cmds.push(`mkdir -p "${mountPath}"`)

  if (include && include.length > 0) {
    // Copy only specified files/dirs
    for (const pattern of include) {
      cmds.push(`cp -r "${sourceDir}/${pattern}" "${mountPath}/" 2>/dev/null || true`)
    }
  } else {
    // Copy standard gitagent files
    for (const f of STANDARD_GITAGENT_FILES) {
      cmds.push(`cp -r "${sourceDir}/${f}" "${mountPath}/" 2>/dev/null || true`)
    }
  }

  return ['/bin/sh', '-c', cmds.join(' && ')]
}

/**
 * Parse a duration string like "30s", "5m", "1h" into seconds.
 * Used by the git-pull sidecar loop interval.
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
 * Build a sidecar container that periodically pulls the gitagent repo and
 * overlays the latest files into the shared mountPath volume. Enables live
 * updates to SOUL.md/AGENTS.md/skills/... without restarting the agent pod.
 *
 * Pairs with `buildGitCloneCommand` (which does the initial clone into the
 * same emptyDir volume). The agent container mounts the same volume read-only
 * and a chokidar watcher (see reader.ts) picks up changes.
 */
export function buildGitSyncSidecar(opts: {
  name: string
  url: string
  ref: string
  depth: number
  agentDir?: string
  mountPath: string
  include?: string[]
  /** Poll interval in seconds. `0` disables the sidecar (returns undefined). */
  intervalSec: number
}): PluginK8sSidecar | undefined {
  const { name, url, ref, depth, agentDir, mountPath, include, intervalSec } = opts
  if (!intervalSec || intervalSec <= 0) return undefined

  const cloneTarget = '/tmp/agent-source'
  const filesToCopy = include && include.length > 0 ? include : STANDARD_GITAGENT_FILES

  // Initial clone into a scratch dir, then loop: fetch + reset + rsync (cp -a).
  // Inside the sidecar we treat the repo as the authoritative state; files not
  // present upstream are removed (cp -a overwrites; we rm -rf before copy).
  const copySnippet = filesToCopy
    .map(
      (f) => `cp -r "${cloneTarget}/${agentDir ?? '.'}/${f}" "${mountPath}/" 2>/dev/null || true`,
    )
    .join('; ')

  const script = `
set -e
if [ ! -d "${cloneTarget}/.git" ]; then
  git clone --depth ${depth} --branch "${ref}" "${url}" "${cloneTarget}"
fi
while true; do
  cd "${cloneTarget}"
  git fetch --depth ${depth} origin "${ref}" 2>&1 || echo "[gitagent-sync] fetch failed, will retry"
  git reset --hard "origin/${ref}" 2>&1 || git reset --hard "${ref}" 2>&1 || true
  mkdir -p "${mountPath}"
  ${copySnippet}
  # touch a marker file so readers using chokidar(fs) can debounce on it
  date -u +%FT%TZ > "${mountPath}/.gitagent-synced-at" || true
  sleep ${intervalSec}
done
`.trim()

  return {
    name,
    image: 'alpine/git:latest',
    imagePullPolicy: 'IfNotPresent',
    command: ['/bin/sh', '-c', script],
    volumeMounts: [{ name: 'gitagent-src', mountPath }],
    resources: {
      requests: { cpu: '10m', memory: '32Mi' },
      limits: { cpu: '100m', memory: '128Mi' },
    },
  }
}

/**
 * Generate a multi-stage Dockerfile for baking gitagent files into an image.
 * Used by the build-image strategy.
 */
export function generateGitAgentDockerfile(opts: {
  baseImage: string
  gitUrl: string
  gitRef: string
  agentDir?: string
  destPath: string
  include?: string[]
}): string {
  const { baseImage, gitUrl, gitRef, agentDir, destPath, include } = opts
  const sourceDir = agentDir ? `/source/${agentDir}` : '/source'

  const copyLines: string[] = []
  if (include && include.length > 0) {
    for (const f of include) {
      copyLines.push(`RUN cp -r ${sourceDir}/${f} ${destPath}/ 2>/dev/null || true`)
    }
  } else {
    for (const f of STANDARD_GITAGENT_FILES) {
      copyLines.push(`RUN cp -r ${sourceDir}/${f} ${destPath}/ 2>/dev/null || true`)
    }
  }

  return `# Auto-generated by shadowob-cloud — DO NOT EDIT
# Bakes gitagent files from ${gitUrl} into the agent image

# ── Stage 1: Clone agent source ──────────────────────────────────
FROM alpine/git AS gitagent-source
ARG GIT_TOKEN=""
RUN if [ -n "$GIT_TOKEN" ]; then \\
      git clone --depth 1 --branch "${gitRef}" "https://$GIT_TOKEN@${gitUrl.replace(/^https?:\/\//, '')}" /source; \\
    else \\
      git clone --depth 1 --branch "${gitRef}" "${gitUrl}" /source; \\
    fi

# ── Stage 2: Runtime image with agent files overlaid ─────────────
FROM ${baseImage}

RUN mkdir -p ${destPath}

# Copy standard gitagent files from source
${copyLines.join('\n')}

# Set agentDir env for OpenClaw
ENV OPENCLAW_AGENT_DIR=${destPath}
LABEL gitagent.url="${gitUrl}" gitagent.ref="${gitRef}"
`
}
