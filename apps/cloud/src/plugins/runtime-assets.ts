/**
 * Runtime asset helpers for connector-style plugins.
 *
 * A connector usually has the same moving parts: install one or more CLI
 * binaries, mount agent skills/subagents, expose env vars, and publish runtime
 * metadata. This helper keeps that wiring out of individual plugin bodies.
 */

import type { AgentDeployment, CloudConfig } from '../config/schema.js'
import type {
  PluginK8sEnvVar,
  PluginK8sProvider,
  PluginK8sResult,
  PluginRuntimeDependency,
  PluginRuntimeSource,
} from './types.js'

const RUNTIME_ASSET_IMAGE = 'node:22-alpine'
const DEFAULT_CONTAINER_PATH = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
export const PLUGIN_RUNTIME_DEPS_ROOT = '/opt/shadow-plugin-deps'
export const PLUGIN_SKILLS_ROOT = '/workspace/.agents/plugin-skills'
export const PLUGIN_SUBAGENTS_ROOT = '/workspace/.agents/plugin-subagents'
export const PLUGIN_SKILLS_STAGING_ROOT = '/plugin-skills'
export const PLUGIN_SUBAGENTS_STAGING_ROOT = '/plugin-subagents'

interface RuntimeAssetK8sOptions {
  pluginId: string
  isEnabled(agent: AgentDeployment, config: CloudConfig): boolean
  runtimeMountPath?: string
  initRuntimeMountPath?: string
  skillsMountPath?: string
  subagentsMountPath?: string
  runtimeVolumeName?: string
  skillsVolumeName?: string
  subagentsVolumeName?: string
  runtimeDependencies?: PluginRuntimeDependency[]
  skillSources?: PluginRuntimeSource[]
  subagentSources?: PluginRuntimeSource[]
  envVars?: PluginK8sEnvVar[]
  labels?: Record<string, string>
  sanityCommands?: string[]
}

function shQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}

function sanitizeId(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 63)
}

function copyGitSourceSnippet(source: PluginRuntimeSource, destRoot: string): string {
  const safeId = sanitizeId(source.id)
  const clonePath = `/tmp/runtime-asset-src-${safeId}`
  const ref = source.ref ?? 'main'
  const from = source.from ?? '.'
  const sourcePath = from === '.' || from === '' ? clonePath : `${clonePath}/${from}`
  const commands = [
    `rm -rf ${shQuote(clonePath)}`,
    `git clone --depth 1 --branch ${shQuote(ref)} ${shQuote(source.url ?? '')} ${shQuote(clonePath)}`,
    `mkdir -p ${shQuote(destRoot)}`,
  ]

  if (source.include?.length) {
    for (const item of source.include) {
      commands.push(
        `if [ -e ${shQuote(`${sourcePath}/${item}`)} ]; then cp -R ${shQuote(`${sourcePath}/${item}`)} ${shQuote(destRoot)}/; fi`,
      )
    }
  } else if (source.includePattern) {
    commands.push(
      `if [ -d ${shQuote(sourcePath)} ]; then find ${shQuote(sourcePath)} -maxdepth 1 -type d -name ${shQuote(source.includePattern)} -exec cp -R {} ${shQuote(destRoot)}/ \\;; fi`,
    )
  } else {
    commands.push(
      `if [ -d ${shQuote(sourcePath)} ]; then cp -R ${shQuote(sourcePath)}/. ${shQuote(destRoot)}/; elif [ -f ${shQuote(sourcePath)} ]; then cp ${shQuote(sourcePath)} ${shQuote(destRoot)}/; fi`,
    )
  }

  return commands.join('\n')
}

function runtimeDependencySnippet(dep: PluginRuntimeDependency, runtimeRoot: string): string {
  switch (dep.kind) {
    case 'npm-global': {
      const packages = dep.packages?.filter(Boolean) ?? []
      if (packages.length === 0) return ''
      return `npm install -g --prefix ${shQuote(dep.targetPath ?? runtimeRoot)} ${packages.map(shQuote).join(' ')}`
    }
    case 'system-package': {
      const packages = dep.packages?.filter(Boolean) ?? []
      if (packages.length === 0) return ''
      return `install_system_packages ${packages.map(shQuote).join(' ')}`
    }
    case 'shell':
      return dep.command?.length ? dep.command.join(' ') : ''
    case 'binary':
      return dep.command?.length ? dep.command.join(' ') : ''
    default:
      return ''
  }
}

function systemPackageInstallerSnippet(): string {
  return [
    'install_system_packages() {',
    '  if [ "$#" -eq 0 ]; then return 0; fi',
    '  pm=""',
    '  if command -v apk >/dev/null 2>&1; then',
    '    pm="apk"',
    '  elif command -v apt-get >/dev/null 2>&1; then',
    '    pm="apt"',
    '  else',
    '    echo "[runtime-assets] no supported package manager found for: $*" >&2',
    '    return 127',
    '  fi',
    '  normalized=""',
    '  for pkg in "$@"; do',
    '    case "$pm:$pkg" in',
    '      apt:py3-pip) pkg="python3-pip" ;;',
    '      apt:py3-virtualenv) pkg="python3-venv" ;;',
    '      apt:github-cli) pkg="gh" ;;',
    '    esac',
    '    normalized="$normalized ${pkg}"',
    '  done',
    '  if [ "$pm" = "apk" ]; then',
    '    apk add --no-cache $normalized',
    '  else',
    '    export DEBIAN_FRONTEND=noninteractive',
    '    apt-get update >/dev/null',
    '    apt-get install -y --no-install-recommends $normalized',
    '    rm -rf /var/lib/apt/lists/*',
    '  fi',
    '}',
  ].join('\n')
}

export function buildRuntimeAssetInstallScript(options: {
  runtimeDependencies?: PluginRuntimeDependency[]
  skillSources?: PluginRuntimeSource[]
  subagentSources?: PluginRuntimeSource[]
  runtimeRoot?: string
  skillsRoot?: string
  subagentsRoot?: string
  sanityCommands?: string[]
}): string {
  const runtimeRoot = options.runtimeRoot ?? '/runtime-deps'
  const skillsRoot = options.skillsRoot ?? '/plugin-skills'
  const subagentsRoot = options.subagentsRoot ?? '/plugin-subagents'
  const hasGitSources = Boolean(options.skillSources?.length || options.subagentSources?.length)
  const needsSystemInstaller = Boolean(
    hasGitSources || options.runtimeDependencies?.some((dep) => dep.kind === 'system-package'),
  )
  const lines = [
    'set -eu',
    ...(needsSystemInstaller ? [systemPackageInstallerSnippet()] : []),
    `mkdir -p ${shQuote(runtimeRoot)}`,
  ]

  if (options.skillSources?.length) lines.push(`mkdir -p ${shQuote(skillsRoot)}`)
  if (options.subagentSources?.length) lines.push(`mkdir -p ${shQuote(subagentsRoot)}`)
  if (hasGitSources) {
    lines.push('command -v git >/dev/null 2>&1 || install_system_packages git >/dev/null')
  }

  for (const dep of options.runtimeDependencies ?? []) {
    const snippet = runtimeDependencySnippet(dep, runtimeRoot)
    if (snippet) lines.push(snippet)
  }
  for (const source of options.skillSources ?? []) {
    if (source.kind === 'git' && source.url) lines.push(copyGitSourceSnippet(source, skillsRoot))
  }
  for (const source of options.subagentSources ?? []) {
    if (source.kind === 'git' && source.url) lines.push(copyGitSourceSnippet(source, subagentsRoot))
  }
  lines.push(...(options.sanityCommands ?? []))
  lines.push('echo "[runtime-assets] ready"')

  return lines.filter(Boolean).join('\n')
}

export function buildRuntimeAssetK8sProvider(options: RuntimeAssetK8sOptions): PluginK8sProvider {
  return {
    buildK8s(agent, ctx): PluginK8sResult | undefined {
      if (!options.isEnabled(agent, ctx.config)) return undefined

      const runtimeVolumeName = options.runtimeVolumeName ?? `${options.pluginId}-runtime`
      const skillsVolumeName = options.skillsVolumeName ?? `${options.pluginId}-skills`
      const subagentsVolumeName = options.subagentsVolumeName ?? `${options.pluginId}-subagents`
      const runtimeMountPath =
        options.runtimeMountPath ?? `${PLUGIN_RUNTIME_DEPS_ROOT}/${options.pluginId}`
      const initRuntimeMountPath = options.initRuntimeMountPath ?? '/runtime-deps'
      const skillsMountPath = options.skillsMountPath
      const subagentsMountPath = options.subagentsMountPath
      const hasSkillSources = Boolean(options.skillSources?.length && skillsMountPath)
      const hasSubagentSources = Boolean(options.subagentSources?.length && subagentsMountPath)

      const volumeMounts = [{ name: runtimeVolumeName, mountPath: initRuntimeMountPath }]
      const volumes = [{ name: runtimeVolumeName, spec: { emptyDir: {} } }]
      const mainVolumeMounts = [
        { name: runtimeVolumeName, mountPath: runtimeMountPath, readOnly: true },
      ]
      if (hasSkillSources) {
        volumeMounts.push({ name: skillsVolumeName, mountPath: PLUGIN_SKILLS_STAGING_ROOT })
        volumes.push({ name: skillsVolumeName, spec: { emptyDir: {} } })
        mainVolumeMounts.push({
          name: skillsVolumeName,
          mountPath: skillsMountPath!,
          readOnly: true,
        })
      }
      if (hasSubagentSources) {
        volumeMounts.push({ name: subagentsVolumeName, mountPath: PLUGIN_SUBAGENTS_STAGING_ROOT })
        volumes.push({ name: subagentsVolumeName, spec: { emptyDir: {} } })
        mainVolumeMounts.push({
          name: subagentsVolumeName,
          mountPath: subagentsMountPath!,
          readOnly: true,
        })
      }

      return {
        initContainers: [
          {
            name: `${options.pluginId}-assets`,
            image: RUNTIME_ASSET_IMAGE,
            imagePullPolicy: 'IfNotPresent',
            command: [
              'sh',
              '-lc',
              buildRuntimeAssetInstallScript({
                runtimeDependencies: options.runtimeDependencies,
                skillSources: options.skillSources,
                subagentSources: options.subagentSources,
                runtimeRoot: initRuntimeMountPath,
                sanityCommands: options.sanityCommands,
              }),
            ],
            volumeMounts,
            resources: {
              requests: { cpu: '100m', memory: '128Mi' },
              limits: { cpu: '1000m', memory: '512Mi' },
            },
            securityContext: {
              allowPrivilegeEscalation: false,
              runAsNonRoot: false,
              runAsUser: 0,
              runAsGroup: 0,
              capabilities: { drop: ['ALL'] },
            },
          },
        ],
        volumes,
        volumeMounts: mainVolumeMounts,
        envVars: [
          { name: 'PATH', value: `${runtimeMountPath}/bin:${DEFAULT_CONTAINER_PATH}` },
          ...(options.envVars ?? []),
        ],
        labels: {
          [`plugin.${options.pluginId}/enabled`]: 'true',
          ...(options.labels ?? {}),
        },
      }
    },
  }
}
