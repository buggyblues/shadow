import { readdir } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { PluginDefinition, PluginK8sResult } from '../src/plugins/types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const appRoot = resolve(__dirname, '..')
const pluginsRoot = join(appRoot, 'src/plugins')

const args = process.argv.slice(2)
const listOnly = args.includes('--list')
const json = args.includes('--json')
const pluginIds = args.filter((arg) => !arg.startsWith('--'))

function assertPluginId(pluginId: string) {
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(pluginId)) {
    console.error(`Invalid plugin id: ${pluginId}`)
    process.exit(2)
  }
}

async function listPluginIds() {
  const entries = await readdir(pluginsRoot, { withFileTypes: true })
  return entries
    .filter(
      (entry) =>
        entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'business-connectors',
    )
    .map((entry) => entry.name)
    .sort()
}

async function loadPlugin(pluginId: string): Promise<PluginDefinition> {
  assertPluginId(pluginId)
  try {
    const mod = await import(`../src/plugins/${pluginId}/index.js`)
    return mod.default as PluginDefinition
  } catch (error) {
    console.error(`Unknown plugin: ${pluginId}`)
    if (process.env.DEBUG_PLUGIN_TEST_SCRIPT === '1') console.error(error)
    process.exit(1)
  }
}

function pluginTestOptions(pluginId: string): Record<string, unknown> | undefined {
  const specificKey = `SHADOWOB_PLUGIN_TEST_OPTIONS_${pluginId
    .replace(/[^A-Za-z0-9]/gu, '_')
    .toUpperCase()}`
  const raw = process.env[specificKey] ?? process.env.SHADOWOB_PLUGIN_TEST_OPTIONS
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch (error) {
    console.error(`Invalid JSON in ${specificKey}/SHADOWOB_PLUGIN_TEST_OPTIONS`)
    if (process.env.DEBUG_PLUGIN_TEST_SCRIPT === '1') console.error(error)
    process.exit(2)
  }
  return undefined
}

function buildK8s(plugin: PluginDefinition, pluginId: string): PluginK8sResult | undefined {
  const options = pluginTestOptions(pluginId)
  const agent = {
    id: 'plugin-test-agent',
    name: 'Plugin Test Agent',
    runtime: 'openclaw',
    use: [{ plugin: pluginId, ...(options ? { options } : {}) }],
    configuration: {},
  } as const
  return plugin.k8s?.buildK8s(agent, {
    agent,
    config: {
      version: '1',
      namespace: 'plugin-test',
      use: [],
      deployments: { agents: [agent] },
    },
    namespace: 'plugin-test',
  })
}

function installCommand(pluginId: string, result: PluginK8sResult | undefined) {
  const initContainer = result?.initContainers?.[0]
  const command = initContainer?.command
  if (!Array.isArray(command)) return ''

  const shell = String(command[0] ?? '')
  if ((shell === 'sh' || shell === '/bin/sh') && command[1] === '-lc') {
    return String(command[2] ?? '')
  }

  if (shell !== 'sh' && shell !== '/bin/sh') return ''
  const scriptPath = typeof command[1] === 'string' ? command[1] : ''
  if (!scriptPath) return ''
  const scriptName = basename(scriptPath)
  const configMap = result?.configMaps?.find((item) => item.data?.[scriptName])
  return configMap?.data?.[scriptName] ?? ''
}

function copyMappings(result: PluginK8sResult | undefined) {
  const initMounts = result?.initContainers?.flatMap((container) => container.volumeMounts) ?? []
  const runtimeMounts = result?.volumeMounts ?? []
  const mappings: Array<{ from: string; to: string; volume: string }> = []
  for (const mount of runtimeMounts) {
    const initMount = initMounts.find((candidate) => candidate.name === mount.name)
    if (!initMount || initMount.mountPath === mount.mountPath) continue
    mappings.push({ from: initMount.mountPath, to: mount.mountPath, volume: mount.name })
  }
  return mappings
}

function requiredEnv(
  plugin: PluginDefinition,
  result: PluginK8sResult | undefined,
  generatedEnvKeys: Set<string>,
) {
  const secretFields = new Map((plugin.secretFields ?? []).map((field) => [field.key, field]))
  const env = new Map<
    string,
    { label?: string; required: boolean; sensitive: boolean; runtime?: boolean }
  >()
  for (const field of plugin.manifest.auth.fields) {
    const secretField = secretFields.get(field.key)
    env.set(field.key, {
      label: field.label,
      required: field.required,
      sensitive: field.sensitive,
      runtime: secretField?.runtime,
    })
  }
  for (const check of plugin.runtime?.verificationChecks ?? []) {
    for (const key of check.requiredEnv ?? []) {
      if (generatedEnvKeys.has(key)) continue
      const current = env.get(key)
      env.set(key, { ...current, required: true, sensitive: current?.sensitive ?? true })
    }
    for (const key of check.requiredEnvAny ?? []) {
      if (generatedEnvKeys.has(key)) continue
      if (!env.has(key)) env.set(key, { required: false, sensitive: true })
    }
  }
  for (const item of result?.envVars ?? []) {
    if (item.name !== 'PATH' && item.value) {
      env.set(item.name, { required: false, sensitive: false })
    }
  }
  return [...env.entries()].map(([key, value]) => ({ key, ...value }))
}

function buildEnvAliases(plugin: PluginDefinition) {
  const markerPrefix = '__SHADOW_PLUGIN_ENV_REF__:'
  const secrets = Object.fromEntries(
    plugin.manifest.auth.fields.map((field) => [field.key, `${markerPrefix}${field.key}`]),
  )
  const aliases: Array<{ key: string; fromKey: string }> = []
  const literal: Record<string, string> = {}
  const templates: Record<string, string> = {}

  for (const fn of plugin._hooks.buildEnv) {
    const vars =
      fn({
        agent: {
          id: 'plugin-test-agent',
          name: 'Plugin Test Agent',
          runtime: 'openclaw',
          configuration: {},
        },
        config: {
          version: '1',
          namespace: 'plugin-test',
          use: [],
          deployments: { agents: [] },
        },
        secrets,
        namespace: 'plugin-test',
        agentConfig: {},
        pluginRegistry: {
          size: 0,
          register: () => undefined,
          get: () => undefined,
          getAll: () => [],
          getByCategory: () => [],
          getByCapability: () => [],
          search: () => [],
        },
        cwd: appRoot,
      }) ?? {}
    for (const [key, value] of Object.entries(vars)) {
      const aliasField = plugin.manifest.auth.fields.find(
        (field) => value === `${markerPrefix}${field.key}`,
      )
      if (aliasField) {
        aliases.push({ key, fromKey: aliasField.key })
      } else if (value.includes(markerPrefix)) {
        let template = value
        for (const field of plugin.manifest.auth.fields) {
          template = template.split(`${markerPrefix}${field.key}`).join(`\${${field.key}}`)
        }
        templates[key] = template
      } else {
        literal[key] = value
      }
    }
  }

  return { aliases, literal, templates }
}

if (listOnly) {
  process.stdout.write((await listPluginIds()).join('\n'))
  process.exit(0)
}

if (pluginIds.length === 0) {
  console.error('Usage: plugin-runtime-metadata.ts [--json] <plugin-id...>')
  process.exit(2)
}

const records = []
for (const pluginId of pluginIds) {
  const plugin = await loadPlugin(pluginId)
  const k8s = buildK8s(plugin, pluginId)
  const buildEnv = buildEnvAliases(plugin)
  const generatedEnvKeys = new Set([
    ...buildEnv.aliases.map((alias) => alias.key),
    ...Object.keys(buildEnv.literal),
    ...Object.keys(buildEnv.templates),
  ])
  records.push({
    id: pluginId,
    name: plugin.manifest.name,
    hasRuntimeAssets: Boolean(plugin.k8s),
    installCommand: installCommand(pluginId, k8s),
    copyMappings: copyMappings(k8s),
    env: requiredEnv(plugin, k8s, generatedEnvKeys),
    buildEnv,
    envVars: k8s?.envVars ?? [],
  })
}

if (json) {
  process.stdout.write(JSON.stringify(records, null, 2))
} else {
  process.stdout.write(
    records
      .map((record) => record.installCommand)
      .filter(Boolean)
      .join('\n'),
  )
}
