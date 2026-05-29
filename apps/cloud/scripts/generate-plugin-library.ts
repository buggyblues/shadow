import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import type { PluginManifest } from '../src/plugins/types.js'
import { parseJsonc } from '../src/utils/jsonc.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const packageRoot = resolve(__dirname, '..')
const pluginsDir = join(packageRoot, 'src/plugins')
const templatesDir = join(packageRoot, 'templates')
const pluginOutput = join(packageRoot, 'src/application/plugin-library.generated.ts')
const templateOutput = join(packageRoot, 'src/application/template-library.generated.ts')

type PluginLibraryEntry = {
  id: string
  name: string
  description: string
  version: string
  category: PluginManifest['category']
  capabilities: PluginManifest['capabilities']
  tags: string[]
  authType: PluginManifest['auth']['type']
  website?: string
  docs?: string
  popularity?: number
  manifest: PluginManifest
  requiredFields: Array<{
    key: string
    label: string
    description?: string
    sensitive: boolean
  }>
  readme: {
    title: string
    excerpt: string
    headings: string[]
  }
  searchText: string
}

type TemplateLibraryEntry = {
  slug: string
  title: string
  description: string
  category: string
  plugins: string[]
  channels: string[]
  buddyNames: string[]
  agentCount: number
  systemPromptExcerpt: string
  valid: boolean
  validation: {
    valid: boolean
    agents: number
    configurations: number
    violations: Array<{ path: string; prefix: string }>
    extendsErrors: string[]
    templateRefs: { env: number; secret: number; file: number }
  }
  searchText: string
}

function toTs(value: unknown) {
  return JSON.stringify(value, null, 2)
}

function toRawString(value: unknown) {
  return toTs(value).replace(/`/g, '\\u0060').replace(/\$\{/g, '\\u0024{')
}

function normalizeText(input: string, maxLength = 1800) {
  return input
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLength)
}

function stripMarkdown(input: string) {
  return normalizeText(
    input
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/[*_>#|~-]+/g, ' '),
  )
}

function extractReadmeMeta(raw: string) {
  const headings = [...raw.matchAll(/^#{1,3}\s+(.+)$/gm)]
    .map((match) => normalizeText(match[1] ?? '', 80))
    .filter(Boolean)
    .slice(0, 12)
  const title = headings[0] ?? 'README'
  const excerpt = stripMarkdown(raw).slice(0, 1600)
  return { title, excerpt, headings }
}

async function pathExists(path: string) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function readOptional(path: string) {
  try {
    return await readFile(path, 'utf-8')
  } catch {
    return ''
  }
}

function evalExpression(node: ts.Expression, constants = new Map<string, unknown>()): unknown {
  if (ts.isAsExpression(node) || ts.isParenthesizedExpression(node))
    return evalExpression(node.expression, constants)
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (ts.isNumericLiteral(node)) return Number(node.text)
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false
  if (ts.isIdentifier(node)) return constants.get(node.text)
  if (ts.isPropertyAccessExpression(node)) {
    const target = evalExpression(node.expression, constants)
    if (target && typeof target === 'object') {
      return (target as Record<string, unknown>)[node.name.text]
    }
    return undefined
  }
  if (ts.isArrayLiteralExpression(node))
    return node.elements.map((element) => evalExpression(element as ts.Expression, constants))
  if (ts.isObjectLiteralExpression(node)) {
    const output: Record<string, unknown> = {}
    for (const property of node.properties) {
      if (!ts.isPropertyAssignment(property)) continue
      const name = property.name
      const key = ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : undefined
      if (!key) continue
      output[key] = evalExpression(property.initializer, constants)
    }
    return output
  }
  if (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'connectorField'
  ) {
    const [keyNode, labelNode, optionsNode] = node.arguments
    const key = keyNode ? evalExpression(keyNode, constants) : ''
    const label = labelNode ? evalExpression(labelNode, constants) : ''
    const options = optionsNode
      ? ((evalExpression(optionsNode, constants) as Record<string, unknown>) ?? {})
      : {}
    return {
      key,
      label,
      description: typeof options.description === 'string' ? options.description : undefined,
      required: typeof options.required === 'boolean' ? options.required : true,
      sensitive: typeof options.sensitive === 'boolean' ? options.sensitive : true,
      placeholder: typeof options.placeholder === 'string' ? options.placeholder : undefined,
      helpUrl: typeof options.helpUrl === 'string' ? options.helpUrl : undefined,
    }
  }
  return undefined
}

function collectTopLevelConstants(source: ts.SourceFile): Map<string, unknown> {
  const constants = new Map<string, unknown>()

  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue
    if (!(statement.declarationList.flags & ts.NodeFlags.Const)) continue

    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue
      const value = evalExpression(declaration.initializer, constants)
      if (value !== undefined) constants.set(declaration.name.text, value)
    }
  }

  return constants
}

function findConnectorManifest(source: ts.SourceFile): Record<string, unknown> | null {
  let found: Record<string, unknown> | null = null
  const constants = collectTopLevelConstants(source)
  const visit = (node: ts.Node) => {
    if (found) return
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'connectorManifest'
    ) {
      const [arg] = node.arguments
      if (arg && ts.isObjectLiteralExpression(arg)) {
        found = evalExpression(arg, constants) as Record<string, unknown>
        return
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}

function manifestFromConnectorOptions(options: Record<string, unknown>): PluginManifest | null {
  if (
    typeof options.id !== 'string' ||
    typeof options.name !== 'string' ||
    typeof options.description !== 'string' ||
    typeof options.category !== 'string' ||
    typeof options.icon !== 'string' ||
    typeof options.website !== 'string' ||
    typeof options.docs !== 'string' ||
    !Array.isArray(options.fields) ||
    !Array.isArray(options.tags)
  ) {
    return null
  }
  const rawCapabilities = Array.isArray(options.capabilities)
    ? options.capabilities.filter((item): item is string => typeof item === 'string')
    : ['tool', 'data-source', 'action']
  const capabilities = rawCapabilities.includes('skill')
    ? rawCapabilities
    : [...rawCapabilities, 'skill']
  return {
    id: options.id,
    name: options.name,
    description: options.description,
    version: '1.0.0',
    category: options.category as PluginManifest['category'],
    icon: options.icon,
    website: options.website,
    docs: options.docs,
    auth: {
      type:
        typeof options.authType === 'string'
          ? (options.authType as PluginManifest['auth']['type'])
          : 'api-key',
      fields: options.fields as PluginManifest['auth']['fields'],
    },
    capabilities: capabilities as PluginManifest['capabilities'],
    tags: options.tags.filter((item): item is string => typeof item === 'string'),
    popularity: typeof options.popularity === 'number' ? options.popularity : undefined,
  }
}

async function readPluginManifest(pluginId: string): Promise<PluginManifest | null> {
  const manifestPath = join(pluginsDir, pluginId, 'manifest.json')
  if (await pathExists(manifestPath)) {
    return parseJsonc<PluginManifest>(await readFile(manifestPath, 'utf-8'), manifestPath)
  }
  const indexPath = join(pluginsDir, pluginId, 'index.ts')
  if (!(await pathExists(indexPath))) return null
  const source = ts.createSourceFile(
    indexPath,
    await readFile(indexPath, 'utf-8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const connectorOptions = findConnectorManifest(source)
  return connectorOptions ? manifestFromConnectorOptions(connectorOptions) : null
}

async function generatePluginLibrary() {
  const pluginDirs = (await readdir(pluginsDir))
    .filter((name) => !name.startsWith('.') && name !== 'business-connectors')
    .sort()

  const entries: PluginLibraryEntry[] = []
  for (const pluginId of pluginDirs) {
    const pluginPath = join(pluginsDir, pluginId)
    if (!(await stat(pluginPath)).isDirectory()) continue
    const manifest = await readPluginManifest(pluginId)
    if (!manifest) continue
    const readmePath = join(pluginsDir, manifest.id, 'README.md')
    const readmeRaw = await readOptional(readmePath)
    const readme = extractReadmeMeta(readmeRaw || manifest.description)
    const requiredFields = manifest.auth.fields
      .filter((field) => field.required)
      .map((field) => ({
        key: field.key,
        label: field.label,
        description: field.description,
        sensitive: field.sensitive,
      }))
    entries.push({
      id: manifest.id,
      name: manifest.name,
      description: manifest.description,
      version: manifest.version,
      category: manifest.category,
      capabilities: manifest.capabilities,
      tags: manifest.tags,
      authType: manifest.auth.type,
      website: manifest.website,
      docs: manifest.docs,
      popularity: manifest.popularity,
      manifest,
      requiredFields,
      readme,
      searchText: normalizeText(
        [
          manifest.id,
          manifest.name,
          manifest.description,
          manifest.category,
          manifest.capabilities.join(' '),
          manifest.tags.join(' '),
          manifest.auth.fields
            .map((field) => `${field.key} ${field.label} ${field.description ?? ''}`)
            .join(' '),
          readme.title,
          readme.headings.join(' '),
          readme.excerpt,
        ].join('\n'),
        8000,
      ).toLowerCase(),
    })
  }

  entries.sort(
    (a, b) =>
      (b.popularity ?? 0) - (a.popularity ?? 0) ||
      a.category.localeCompare(b.category) ||
      a.id.localeCompare(b.id),
  )

  const source = `/* This file is generated by scripts/generate-plugin-library.ts. Do not edit by hand. */

import type { PluginLibraryEntry } from './plugin-library.js'

const RAW_PLUGIN_LIBRARY = String.raw\`${toRawString(entries)}\`

export const GENERATED_PLUGIN_LIBRARY = JSON.parse(RAW_PLUGIN_LIBRARY) as PluginLibraryEntry[]
  `
  await mkdir(dirname(pluginOutput), { recursive: true })
  await writeFile(pluginOutput, `${source.trimEnd()}\n`)
  console.log(`Generated plugin library: ${entries.length} entries`)
}

function resolveI18n(raw: Record<string, unknown>, key: string) {
  const value = raw[key]
  if (typeof value !== 'string') return undefined
  const match = /^\$\{i18n:([^}]+)\}$/.exec(value)
  if (!match) return value
  const i18n = raw.i18n as Record<string, Record<string, string>> | undefined
  return i18n?.['zh-CN']?.[match[1] ?? ''] ?? i18n?.en?.[match[1] ?? ''] ?? value
}

function collectTemplatePlugins(raw: Record<string, unknown>) {
  const plugins = new Set<string>()
  const addUse = (items: unknown) => {
    if (!Array.isArray(items)) return
    for (const item of items) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue
      const plugin = (item as Record<string, unknown>).plugin
      if (typeof plugin === 'string' && plugin) plugins.add(plugin)
    }
  }
  addUse(raw.use)
  const agents = (raw.deployments as Record<string, unknown> | undefined)?.agents
  if (Array.isArray(agents)) {
    for (const agent of agents) {
      if (agent && typeof agent === 'object' && !Array.isArray(agent))
        addUse((agent as Record<string, unknown>).use)
    }
  }
  return [...plugins].sort()
}

function collectShadowChannels(raw: Record<string, unknown>) {
  const channels: string[] = []
  const use = Array.isArray(raw.use) ? raw.use : []
  for (const entry of use) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
    const record = entry as Record<string, unknown>
    if (record.plugin !== 'shadowob') continue
    const options = record.options as Record<string, unknown> | undefined
    const servers = Array.isArray(options?.servers) ? options.servers : []
    for (const server of servers) {
      if (!server || typeof server !== 'object' || Array.isArray(server)) continue
      const serverChannels = (server as Record<string, unknown>).channels
      if (!Array.isArray(serverChannels)) continue
      for (const channel of serverChannels) {
        if (!channel || typeof channel !== 'object' || Array.isArray(channel)) continue
        const title = (channel as Record<string, unknown>).title
        const id = (channel as Record<string, unknown>).id
        if (typeof title === 'string') channels.push(title)
        else if (typeof id === 'string') channels.push(id)
      }
    }
  }
  return [...new Set(channels)].slice(0, 8)
}

function collectBuddyNames(raw: Record<string, unknown>) {
  const names: string[] = []
  const use = Array.isArray(raw.use) ? raw.use : []
  for (const entry of use) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
    const record = entry as Record<string, unknown>
    if (record.plugin !== 'shadowob') continue
    const buddies = ((record.options as Record<string, unknown> | undefined)?.buddies ??
      []) as unknown
    if (!Array.isArray(buddies)) continue
    for (const buddy of buddies) {
      if (!buddy || typeof buddy !== 'object' || Array.isArray(buddy)) continue
      const name = (buddy as Record<string, unknown>).name
      if (typeof name === 'string') names.push(name)
    }
  }
  return [...new Set(names)].slice(0, 6)
}

function collectSystemPrompt(raw: Record<string, unknown>) {
  const agents = (raw.deployments as Record<string, unknown> | undefined)?.agents
  if (!Array.isArray(agents)) return ''
  const prompts = agents
    .map((agent) => {
      if (!agent || typeof agent !== 'object' || Array.isArray(agent)) return ''
      const identity = (agent as Record<string, unknown>).identity
      if (!identity || typeof identity !== 'object' || Array.isArray(identity)) return ''
      const prompt = (identity as Record<string, unknown>).systemPrompt
      return typeof prompt === 'string' ? prompt : ''
    })
    .filter(Boolean)
  return normalizeText(prompts.join('\n\n'), 1200)
}

function countTemplateRefs(rawText: string, type: 'env' | 'secret' | 'file') {
  const pattern = new RegExp(`\\$\\{${type}:`, 'g')
  return rawText.match(pattern)?.length ?? 0
}

function summarizeTemplate(raw: Record<string, unknown>, rawText: string) {
  const agents = (raw.deployments as Record<string, unknown> | undefined)?.agents
  const configurations = (raw.registry as Record<string, unknown> | undefined)?.configurations
  const violations: Array<{ path: string; prefix: string }> = []
  if (raw.version !== '1.0.0') violations.push({ path: 'version', prefix: '1.0.0' })
  if (!raw.name || typeof raw.name !== 'string') violations.push({ path: 'name', prefix: 'string' })
  if (!raw.deployments || typeof raw.deployments !== 'object') {
    violations.push({ path: 'deployments', prefix: 'object' })
  }
  if (!Array.isArray(agents) || agents.length === 0) {
    violations.push({ path: 'deployments.agents', prefix: 'array' })
  }
  return {
    valid: violations.length === 0,
    agents: Array.isArray(agents) ? agents.length : 0,
    configurations: Array.isArray(configurations) ? configurations.length : 0,
    violations,
    extendsErrors: [],
    templateRefs: {
      env: countTemplateRefs(rawText, 'env'),
      secret: countTemplateRefs(rawText, 'secret'),
      file: countTemplateRefs(rawText, 'file'),
    },
  }
}

async function generateTemplateLibrary() {
  const entries: TemplateLibraryEntry[] = []
  const files = await readdir(templatesDir)
  for (const file of files) {
    if (!file.endsWith('.template.json')) continue
    const path = join(templatesDir, file)
    const rawText = await readFile(path, 'utf-8')
    const raw = parseJsonc<Record<string, unknown>>(rawText, path)
    const slug = file.replace(/\.template\.json$/, '')
    const validation = summarizeTemplate(raw, rawText)
    const title = resolveI18n(raw, 'title') ?? resolveI18n(raw, 'name') ?? slug
    const description = resolveI18n(raw, 'description') ?? ''
    const plugins = collectTemplatePlugins(raw)
    const channels = collectShadowChannels(raw)
    const buddyNames = collectBuddyNames(raw)
    const agents = (raw.deployments as Record<string, unknown> | undefined)?.agents
    const agentCount = Array.isArray(agents) ? agents.length : 0
    const systemPromptExcerpt = collectSystemPrompt(raw)
    const category = plugins.includes('agent-pack')
      ? 'agent-pack'
      : plugins.includes('seo-suite')
        ? 'growth'
        : plugins.includes('google-workspace')
          ? 'productivity'
          : 'general'
    entries.push({
      slug,
      title,
      description,
      category,
      plugins,
      channels,
      buddyNames,
      agentCount,
      systemPromptExcerpt,
      valid: validation.valid,
      validation,
      searchText: normalizeText(
        [
          slug,
          title,
          description,
          category,
          plugins.join(' '),
          channels.join(' '),
          buddyNames.join(' '),
          systemPromptExcerpt,
        ].join('\n'),
        8000,
      ).toLowerCase(),
    })
  }

  entries.sort((a, b) => {
    if (a.valid !== b.valid) return a.valid ? -1 : 1
    return a.slug.localeCompare(b.slug)
  })

  const source = `/* This file is generated by scripts/generate-plugin-library.ts. Do not edit by hand. */

import type { TemplateLibraryEntry } from './template-library.js'

const RAW_TEMPLATE_LIBRARY = String.raw\`${toRawString(entries)}\`

export const GENERATED_TEMPLATE_LIBRARY = JSON.parse(RAW_TEMPLATE_LIBRARY) as TemplateLibraryEntry[]
  `
  await mkdir(dirname(templateOutput), { recursive: true })
  await writeFile(templateOutput, `${source.trimEnd()}\n`)
  console.log(`Generated template library: ${entries.length} entries`)
}

async function main() {
  if (!(await pathExists(pluginsDir))) throw new Error(`Missing plugins directory: ${pluginsDir}`)
  if (!(await pathExists(templatesDir)))
    throw new Error(`Missing templates directory: ${templatesDir}`)
  await generatePluginLibrary()
  await generateTemplateLibrary()
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
