import type { AgentDeployment, CloudConfig } from '../../config/schema.js'
import {
  attachConnectorRuntimeAssets,
  installedCheck,
  npmGlobalDependency,
  pluginSkillsMountPath,
} from '../connector-kit.js'
import { definePlugin } from '../helpers.js'
import type {
  PluginConfigFragment,
  PluginManifest,
  PluginRuntimeExtension,
  PluginRuntimeSource,
  PluginValidationError,
  PluginVerificationCheck,
} from '../types.js'
import manifestJson from './manifest.json' with { type: 'json' }

const PLUGIN_ID = 'skills'
const SKILLS_MOUNT = pluginSkillsMountPath(PLUGIN_ID)
const manifest = manifestJson as PluginManifest

type SkillsInstallSpec = {
  id?: string
  package?: string
  url?: string
  ref?: string
  from?: string
  skills?: string[]
  include?: string[]
  description?: string
}

const runtimeDependencies = [
  npmGlobalDependency('skills', ['skills'], 'Skills CLI for agent skill workflows'),
]

const baseVerificationChecks: PluginVerificationCheck[] = [
  installedCheck('skills-cli-installed', 'Skills CLI installed', ['skills', '--version']),
]

function sanitizeId(value: string) {
  return value
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
}

function unique(items: string[]) {
  return [...new Set(items)]
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
}

function packageWithoutSkill(rawPackage: string): string {
  const slash = rawPackage.indexOf('/')
  const at = rawPackage.lastIndexOf('@')
  if (slash < 0 || at <= slash) return rawPackage
  return rawPackage.slice(0, at)
}

function skillNameFromPackage(rawPackage: string): string | null {
  const slash = rawPackage.indexOf('/')
  const at = rawPackage.lastIndexOf('@')
  if (slash < 0 || at <= slash) return null
  const skill = rawPackage.slice(at + 1).trim()
  return skill || null
}

function packageToGitUrl(rawPackage: string): string | null {
  const pkg = packageWithoutSkill(rawPackage).trim()
  if (!pkg) return null
  if (pkg.startsWith('https://github.com/')) return pkg.endsWith('.git') ? pkg : `${pkg}.git`
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(pkg)) {
    return `https://github.com/${pkg}.git`
  }
  return null
}

function parseInstallSpec(raw: unknown): SkillsInstallSpec | null {
  if (typeof raw === 'string') return { package: raw }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  return raw as SkillsInstallSpec
}

function sourceFromInstallSpec(raw: unknown): PluginRuntimeSource | null {
  const spec = parseInstallSpec(raw)
  if (!spec) return null

  const rawPackage = typeof spec.package === 'string' ? spec.package.trim() : ''
  const rawUrl = typeof spec.url === 'string' ? spec.url.trim() : ''
  const url = rawUrl || (rawPackage ? packageToGitUrl(rawPackage) : null)
  if (!url) return null

  const packageSkill = rawPackage ? skillNameFromPackage(rawPackage) : null
  const include = unique([
    ...normalizeStringList(spec.skills),
    ...normalizeStringList(spec.include),
    ...(packageSkill ? [packageSkill] : []),
  ])
  if (include.length === 0) return null

  const sourceKey = rawPackage || rawUrl
  const id =
    typeof spec.id === 'string' && spec.id.trim()
      ? spec.id.trim()
      : `skills-${sanitizeId(`${sourceKey}-${include.join('-')}`)}`

  return {
    id,
    kind: 'git',
    url,
    ref: typeof spec.ref === 'string' && spec.ref.trim() ? spec.ref.trim() : 'main',
    from: typeof spec.from === 'string' && spec.from.trim() ? spec.from.trim() : 'skills',
    targetPath: SKILLS_MOUNT,
    include,
    ...(typeof spec.description === 'string' && spec.description.trim()
      ? { description: spec.description.trim() }
      : {}),
  }
}

function agentSkillsEntries(agent: AgentDeployment) {
  return (Array.isArray(agent.use) ? agent.use : []).filter((entry) => entry?.plugin === PLUGIN_ID)
}

function isEnabledForAgent(agent: AgentDeployment) {
  return agentSkillsEntries(agent).length > 0
}

function installSpecsFromAgent(agent: AgentDeployment): unknown[] {
  return agentSkillsEntries(agent).flatMap((entry) => {
    const options = entry.options
    if (!options || typeof options !== 'object') return []
    const install = (options as Record<string, unknown>).install
    if (Array.isArray(install)) return install
    const packages = (options as Record<string, unknown>).packages
    if (Array.isArray(packages)) return packages
    return []
  })
}

function skillSourcesForAgent(agent: AgentDeployment): PluginRuntimeSource[] {
  const byId = new Map<string, PluginRuntimeSource>()
  for (const spec of installSpecsFromAgent(agent)) {
    const source = sourceFromInstallSpec(spec)
    if (source) byId.set(source.id, source)
  }
  return [...byId.values()]
}

function verificationChecksForSources(sources: PluginRuntimeSource[]): PluginVerificationCheck[] {
  return sources.flatMap((source) =>
    (source.include ?? []).map((skill) => ({
      id: `skill-mounted-${sanitizeId(skill)}`,
      label: `Skill mounted: ${skill}`,
      kind: 'command' as const,
      command: ['test', '-f', `${SKILLS_MOUNT}/${skill}/SKILL.md`],
      timeoutMs: 5_000,
      risk: 'safe' as const,
    })),
  )
}

function isConfiguredGlobally(config: CloudConfig) {
  return Boolean(config.use?.some((entry) => entry?.plugin === PLUGIN_ID))
}

const plugin = definePlugin(manifest, (api) => {
  api.addCLI([
    {
      name: 'skills',
      command: 'skills',
      description: 'Skills CLI for searching, installing, listing, and updating agent skills',
    },
  ])

  api.onBuildConfig((ctx): PluginConfigFragment | void => {
    if (!isEnabledForAgent(ctx.agent)) return undefined
    const sources = skillSourcesForAgent(ctx.agent)
    if (sources.length === 0) return undefined
    return {
      skills: {
        load: { extraDirs: [SKILLS_MOUNT] },
        entries: {
          [PLUGIN_ID]: { enabled: true },
        },
      },
    }
  })

  api.onBuildRuntime((ctx): PluginRuntimeExtension | void => {
    if (!isEnabledForAgent(ctx.agent)) return undefined
    const sources = skillSourcesForAgent(ctx.agent)
    return {
      runtimeDependencies,
      ...(sources.length > 0 ? { skillSources: sources } : {}),
      verificationChecks: [...baseVerificationChecks, ...verificationChecksForSources(sources)],
    }
  })

  api.onValidate((ctx) => {
    const errors: PluginValidationError[] = []
    if (isConfiguredGlobally(ctx.config)) {
      errors.push({
        path: 'use',
        message: 'The skills plugin must be configured per agent with deployments.agents[].use.',
        severity: 'error',
      })
    }
    return { valid: errors.length === 0, errors }
  })
})

export default attachConnectorRuntimeAssets(plugin, {
  runtimeDependencies,
  skillSources: skillSourcesForAgent,
  skillsMountPath: SKILLS_MOUNT,
  executionUnitScope: 'agent-runtime',
  isEnabled: isEnabledForAgent,
})
