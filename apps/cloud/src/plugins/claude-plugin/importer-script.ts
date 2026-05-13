/**
 * Runtime importer for Claude Code plugins.
 *
 * The script is injected into the init/sync helper container. It clones
 * configured Git sources, resolves Claude marketplace entries, and normalizes
 * plugin components into Shadow/OpenClaw-readable mount directories.
 */

export const CLAUDE_PLUGIN_IMPORTER_SCRIPT = String.raw`
import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, extname, join, normalize, relative } from 'node:path'
import { tmpdir } from 'node:os'

const DEFAULT_MARKETPLACE_PATH = '.claude-plugin/marketplace.json'
const DEFAULT_INSTRUCTION_FILES = [
  'README.md',
  'CLAUDE.md',
  'AGENTS.md',
  'LICENSE',
  'LICENSE.md',
  'CHANGELOG.md',
]
const EXCLUDED_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'vendor',
  'coverage',
  '__pycache__',
])

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function asStringArray(value) {
  if (typeof value === 'string' && value.trim()) return [value.trim()]
  if (!Array.isArray(value)) return []
  return value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim())
}

function asInlineJsonComponents(value) {
  if (isPlainObject(value)) return [value]
  if (!Array.isArray(value)) return []
  return value.some((item) => isPlainObject(item) || Array.isArray(item)) ? [value] : []
}

function sanitizeId(value, fallback = 'plugin') {
  const raw = String(value || fallback)
    .replace(/\.git$/i, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)
  return raw || fallback
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    return null
  }
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(value, null, 2), 'utf-8')
}

function safeRelativePath(root, input) {
  if (typeof input !== 'string' || !input.trim()) return null
  let rel = input.trim().replace(/\\/g, '/')
  if (rel.startsWith('./')) rel = rel.slice(2)
  if (rel === '.' || rel === '') return root
  if (rel.startsWith('/') || rel.split('/').includes('..')) return null
  const resolved = normalize(join(root, rel))
  const rootPrefix = normalize(root)
  return resolved === rootPrefix || resolved.startsWith(rootPrefix + '/') ? resolved : null
}

function statMaybe(path) {
  try {
    return lstatSync(path)
  } catch {
    return null
  }
}

function listChildDirs(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !EXCLUDED_DIRS.has(entry.name))
      .map((entry) => join(dir, entry.name))
  } catch {
    return []
  }
}

function listFilesRecursive(dir, maxDepth, depth = 0) {
  if (depth > maxDepth) return []
  let entries = []
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }

  const out = []
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.mcp.json' && entry.name !== '.lsp.json') {
      continue
    }
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue
      out.push(...listFilesRecursive(path, maxDepth, depth + 1))
    } else if (entry.isFile()) {
      out.push(path)
    }
  }
  return out
}

function copyTree(src, dest) {
  mkdirSync(dirname(dest), { recursive: true })
  rmSync(dest, { recursive: true, force: true })
  cpSync(src, dest, { recursive: true, force: true, dereference: false })
}

function copyFile(src, dest) {
  mkdirSync(dirname(dest), { recursive: true })
  cpSync(src, dest, { force: true, dereference: false })
}

function copyDirectoryContents(src, dest) {
  const stat = statMaybe(src)
  if (!stat) return 0
  mkdirSync(dest, { recursive: true })
  if (stat.isFile()) {
    copyFile(src, join(dest, basename(src)))
    return 1
  }
  if (!stat.isDirectory()) return 0
  copyTree(src, dest)
  return 1
}

function normalizeGitUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return ''
  const input = value.trim()
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(input)) {
    return 'https://github.com/' + input + '.git'
  }
  return input
}

function writeGithubNetrc() {
  const token = process.env.GITHUB_TOKEN
  if (!token) return

  const home = join(tmpdir(), 'shadow-claude-plugin-home')
  mkdirSync(home, { recursive: true })
  writeFileSync(
    join(home, '.netrc'),
    'machine github.com\nlogin x-access-token\npassword ' + token + '\n',
    { encoding: 'utf-8', mode: 0o600 },
  )
  process.env.HOME = home
}

function cloneGit(source, scratchRoot, cache) {
  const url = normalizeGitUrl(source.url)
  if (!url) throw new Error('Missing git URL for Claude plugin source ' + source.id)
  const ref = source.ref || ''
  const sha = source.sha || ''
  const cacheKey = [url, ref, sha].join('|')
  if (cache.has(cacheKey)) return cache.get(cacheKey)

  const dest = join(scratchRoot, sanitizeId(source.id || basename(url)) + '-' + cache.size)
  const args = ['clone', '--depth', String(Math.max(1, Number(source.depth || 1)))]
  if (ref) args.push('--branch', ref)
  args.push(url, dest)
  execFileSync('git', args, { stdio: 'inherit' })
  if (sha) execFileSync('git', ['-C', dest, 'checkout', '--detach', sha], { stdio: 'inherit' })
  cache.set(cacheKey, dest)
  return dest
}

function pluginManifest(pluginRoot) {
  const manifest = readJson(join(pluginRoot, '.claude-plugin', 'plugin.json'))
  return isPlainObject(manifest) ? manifest : {}
}

function looksLikeClaudePluginRoot(dir) {
  return (
    existsSync(join(dir, '.claude-plugin', 'plugin.json')) ||
    existsSync(join(dir, 'skills')) ||
    existsSync(join(dir, 'commands')) ||
    existsSync(join(dir, 'agents')) ||
    existsSync(join(dir, 'hooks')) ||
    existsSync(join(dir, 'monitors')) ||
    existsSync(join(dir, 'bin')) ||
    existsSync(join(dir, 'output-styles')) ||
    existsSync(join(dir, 'themes')) ||
    existsSync(join(dir, '.mcp.json')) ||
    existsSync(join(dir, '.lsp.json')) ||
    existsSync(join(dir, 'settings.json'))
  )
}

function selectedPlugin(root, include) {
  if (!include || include.length === 0) return true
  const manifest = pluginManifest(root)
  const names = new Set([basename(root), manifest.name, manifest.id].filter(Boolean))
  return include.some((item) => names.has(item))
}

function discoverPluginRoots(base, include) {
  const direct = statMaybe(base)
  if (!direct || !direct.isDirectory()) return []
  if (looksLikeClaudePluginRoot(base) && selectedPlugin(base, include)) {
    return [{ root: base, entry: {} }]
  }

  return listChildDirs(base)
    .filter((child) => looksLikeClaudePluginRoot(child) && selectedPlugin(child, include))
    .map((child) => ({ root: child, entry: {} }))
}

function componentPathValues(manifest, entry, field) {
  const values = []
  values.push(...asStringArray(manifest[field]))
  values.push(...asStringArray(entry[field]))
  return [...new Set(values)]
}

function componentValues(manifest, entry, field) {
  return [manifest[field], entry[field]].filter((value) => value !== undefined)
}

function experimentalValues(manifest, entry, field) {
  return [manifest.experimental?.[field], entry.experimental?.[field]].filter(
    (value) => value !== undefined,
  )
}

function componentAndExperimentalValues(manifest, entry, field) {
  return [...componentValues(manifest, entry, field), ...experimentalValues(manifest, entry, field)]
}

function componentStringValues(values) {
  const out = []
  for (const value of values) out.push(...asStringArray(value))
  return [...new Set(out)]
}

function parseFrontmatterName(text) {
  if (!text.startsWith('---')) return null
  const end = text.indexOf('\n---', 3)
  if (end === -1) return null
  const raw = text.slice(3, end).trim()
  const match = raw.match(/^name:\s*(.+)$/m)
  if (!match?.[1]) return null
  return match[1].trim().replace(/^['"]|['"]$/g, '')
}

function frontmatterNameFromFile(path) {
  try {
    return parseFrontmatterName(readFileSync(path, 'utf-8'))
  } catch {
    return null
  }
}

function skillSlugForDir(skillDir, fallback) {
  return sanitizeId(frontmatterNameFromFile(join(skillDir, 'SKILL.md')) || fallback, fallback)
}

function markdownSlug(path, fallback) {
  const ext = extname(path)
  const base = ext ? basename(path, ext) : basename(path)
  return sanitizeId(frontmatterNameFromFile(path) || base || fallback, fallback)
}

function copySkillDir(skillDir, slug, pluginId, perPluginSkills, globalSkills) {
  const safeSlug = skillSlugForDir(skillDir, slug || pluginId)
  copyTree(skillDir, join(perPluginSkills, safeSlug))
  copyTree(skillDir, join(globalSkills, sanitizeId(pluginId + '-' + safeSlug)))
}

function copySkillFile(skillFile, slug, pluginId, perPluginSkills, globalSkills) {
  const safeSlug = sanitizeId(frontmatterNameFromFile(skillFile) || slug, pluginId)
  const text = readFileSync(skillFile, 'utf-8')
  for (const root of [perPluginSkills, globalSkills]) {
    const actualSlug = root === globalSkills ? sanitizeId(pluginId + '-' + safeSlug) : safeSlug
    const skillPath = join(root, actualSlug, 'SKILL.md')
    mkdirSync(dirname(skillPath), { recursive: true })
    writeFileSync(skillPath, text, 'utf-8')
  }
}

function copySkillsFromPath(src, pluginId, perPluginSkills, globalSkills) {
  const stat = statMaybe(src)
  if (!stat) return 0

  let count = 0
  if (stat.isFile() && basename(src).endsWith('SKILL.md')) {
    copySkillFile(src, markdownSlug(src, pluginId).replace(/-?SKILL$/i, '') || pluginId, pluginId, perPluginSkills, globalSkills)
    return 1
  }

  if (!stat.isDirectory()) return 0
  if (existsSync(join(src, 'SKILL.md'))) {
    copySkillDir(src, basename(src) === '.' ? pluginId : basename(src), pluginId, perPluginSkills, globalSkills)
    count++
  }

  for (const child of listChildDirs(src)) {
    if (!existsSync(join(child, 'SKILL.md'))) continue
    copySkillDir(child, basename(child), pluginId, perPluginSkills, globalSkills)
    count++
  }

  const copiedParents = new Set()
  for (const file of listFilesRecursive(src, 6).filter((item) => basename(item) === 'SKILL.md')) {
    const parent = dirname(file)
    if (parent === src || copiedParents.has(parent)) continue
    copiedParents.add(parent)
    const rel = relative(src, parent)
    const slug = sanitizeId(rel.split('/').join('-'), basename(parent))
    copySkillDir(parent, slug, pluginId, perPluginSkills, globalSkills)
    count++
  }
  return count
}

function skillMarkdownFromCommandFile(path, pluginId, kind) {
  const text = readFileSync(path, 'utf-8')
  if (kind !== 'agents') return text
  if (text.startsWith('---')) return text
  return [
    '---',
    'name: ' + JSON.stringify(markdownSlug(path, pluginId)),
    'description: Claude plugin agent imported from ' + pluginId + '.',
    '---',
    '',
    text,
  ].join('\n')
}

function copyMarkdownCapability(path, pluginId, perPluginDir, globalSkills, kind) {
  const slug = markdownSlug(path, pluginId)
  const text = skillMarkdownFromCommandFile(path, pluginId, kind)
  const perDir = join(perPluginDir, slug)
  mkdirSync(perDir, { recursive: true })
  writeFileSync(join(perDir, 'SKILL.md'), text, 'utf-8')
  if (kind === 'agents') writeFileSync(join(perDir, 'AGENT.md'), text, 'utf-8')

  const globalDir = join(globalSkills, sanitizeId(pluginId + '-' + slug))
  mkdirSync(globalDir, { recursive: true })
  writeFileSync(join(globalDir, 'SKILL.md'), text, 'utf-8')
  if (kind === 'agents') writeFileSync(join(globalDir, 'AGENT.md'), text, 'utf-8')
  return 1
}

function copyMarkdownCapabilitiesFromPath(src, pluginId, perPluginDir, globalSkills, kind) {
  const stat = statMaybe(src)
  if (!stat) return 0
  if (stat.isFile()) {
    return extname(src).toLowerCase() === '.md'
      ? copyMarkdownCapability(src, pluginId, perPluginDir, globalSkills, kind)
      : 0
  }
  if (!stat.isDirectory()) return 0

  let count = 0
  for (const file of listFilesRecursive(src, 5).filter((item) => extname(item).toLowerCase() === '.md')) {
    count += copyMarkdownCapability(file, pluginId, perPluginDir, globalSkills, kind)
  }
  return count
}

function copyJsonLikePath(src, destDir, fallbackName) {
  const stat = statMaybe(src)
  if (!stat) return 0
  if (stat.isFile()) {
    copyFile(src, join(destDir, basename(src) || fallbackName))
    return 1
  }
  if (!stat.isDirectory()) return 0
  let count = 0
  for (const file of listFilesRecursive(src, 2).filter((item) => extname(item).toLowerCase() === '.json')) {
    copyFile(file, join(destDir, basename(file)))
    count++
  }
  return count
}

function copyMarkdownLikePath(src, destDir) {
  const stat = statMaybe(src)
  if (!stat) return 0
  if (stat.isFile()) {
    const ext = extname(src).toLowerCase()
    if (ext !== '.md' && ext !== '.mdx' && ext !== '.txt') return 0
    copyFile(src, join(destDir, basename(src)))
    return 1
  }
  if (!stat.isDirectory()) return 0

  let count = 0
  for (const file of listFilesRecursive(src, 4).filter((item) =>
    ['.md', '.mdx', '.txt'].includes(extname(item).toLowerCase()),
  )) {
    copyFile(file, join(destDir, relative(src, file)))
    count++
  }
  return count
}

function copyInlineJsonComponents(values, destDir, fallbackName, transform = (value) => value) {
  let count = 0
  for (const value of values) {
    for (const item of asInlineJsonComponents(value)) {
      const ext = extname(fallbackName)
      const base = ext ? fallbackName.slice(0, -ext.length) : fallbackName
      const name = count === 0 ? fallbackName : base + '-' + (count + 1) + ext
      writeJson(join(destDir, name), transform(item))
      count++
    }
  }
  return count
}

function copyManifestMetadata(pluginRoot, pluginDest, manifest, entry, pluginId) {
  let count = 0
  const manifestPath = join(pluginRoot, '.claude-plugin', 'plugin.json')
  if (existsSync(manifestPath)) {
    copyFile(manifestPath, join(pluginDest, '.claude-plugin', 'plugin.json'))
    count++
  } else {
    writeJson(join(pluginDest, '.claude-plugin', 'plugin.json'), {
      name: pluginId,
      ...(manifest.description || entry.description
        ? { description: manifest.description || entry.description }
        : {}),
    })
    count++
  }
  writeJson(join(pluginDest, '.claude-plugin', 'marketplace-entry.json'), entry)
  return count + 1
}

function wrapMcpInlineConfig(value) {
  return isPlainObject(value?.mcpServers) ? value : { mcpServers: value }
}

function copyExecutablePath(src, pluginId, perPluginBin, globalBin) {
  const stat = statMaybe(src)
  if (!stat) return 0
  const files = stat.isFile() ? [src] : listFilesRecursive(src, 4)
  let count = 0
  for (const file of files) {
    const fileStat = statMaybe(file)
    if (!fileStat?.isFile()) continue
    const rel = stat.isFile() ? basename(file) : relative(src, file)
    if (!rel || rel.split('/').some((part) => part.startsWith('.'))) continue
    const name = basename(file)
    if (
      !name ||
      ['package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock'].includes(name)
    ) {
      continue
    }

    const perPluginDest = join(perPluginBin, rel)
    copyFile(file, perPluginDest)
    chmodSync(perPluginDest, 0o755)

    const prefixedDest = join(globalBin, sanitizeId(pluginId + '-' + name))
    copyFile(file, prefixedDest)
    chmodSync(prefixedDest, 0o755)

    const bareDest = join(globalBin, name)
    if (!existsSync(bareDest)) {
      copyFile(file, bareDest)
      chmodSync(bareDest, 0o755)
    }
    count++
  }
  return count
}

function copyInstructions(pluginRoot, pluginId, destDir, manifest, entry) {
  mkdirSync(destDir, { recursive: true })
  let count = 0
  for (const file of DEFAULT_INSTRUCTION_FILES) {
    const src = join(pluginRoot, file)
    if (!existsSync(src)) continue
    copyFile(src, join(destDir, file))
    count++
  }

  const summary = [
    '# ' + pluginId,
    '',
    manifest.description || entry.description || '',
    '',
    '- Source plugin root: ' + pluginRoot,
  ].filter(Boolean)
  writeFileSync(join(destDir, pluginId + '.md'), summary.join('\n'), 'utf-8')
  return count + 1
}

function importPluginRoot(ctx, pluginRoot, entry) {
  const manifest = pluginManifest(pluginRoot)
  const pluginId = sanitizeId(manifest.name || entry.name || basename(pluginRoot))
  const pluginDest = join(ctx.mountPath, pluginId)
  const globalSkills = join(ctx.mountPath, '.shadow', 'skills')
  rmSync(pluginDest, { recursive: true, force: true })
  mkdirSync(pluginDest, { recursive: true })

  const perPluginSkills = join(pluginDest, 'skills')
  const perPluginCommands = join(pluginDest, 'commands')
  const perPluginAgents = join(pluginDest, 'agents')
  const perPluginHooks = join(pluginDest, 'hooks')
  const perPluginMcp = join(pluginDest, 'mcp')
  const perPluginLsp = join(pluginDest, 'lsp')
  const perPluginMonitors = join(pluginDest, 'monitors')
  const perPluginOutputStyles = join(pluginDest, 'output-styles')
  const perPluginThemes = join(pluginDest, 'themes')
  const perPluginBin = join(pluginDest, 'bin')
  const perPluginScripts = join(pluginDest, 'scripts')
  const perPluginSettings = join(pluginDest, 'settings')
  const perPluginInstructions = join(pluginDest, 'instructions')
  const globalBin = join(ctx.mountPath, '.shadow', 'bin')

  const counts = {
    skills: 0,
    commands: 0,
    agents: 0,
    hooks: 0,
    mcp: 0,
    lsp: 0,
    monitors: 0,
    outputStyles: 0,
    themes: 0,
    bin: 0,
    scripts: 0,
    settings: 0,
    instructions: 0,
    metadata: 0,
  }

  counts.metadata += copyManifestMetadata(pluginRoot, pluginDest, manifest, entry, pluginId)

  const defaultSkills = join(pluginRoot, 'skills')
  const skillPaths = [
    ...(existsSync(defaultSkills) ? ['./skills'] : []),
    ...componentPathValues(manifest, entry, 'skills'),
  ]
  for (const rel of [...new Set(skillPaths)]) {
    const src = safeRelativePath(pluginRoot, rel)
    if (src) counts.skills += copySkillsFromPath(src, pluginId, perPluginSkills, globalSkills)
  }

  const commandPaths = componentPathValues(manifest, entry, 'commands')
  if (commandPaths.length === 0 && existsSync(join(pluginRoot, 'commands'))) commandPaths.push('./commands')
  for (const rel of [...new Set(commandPaths)]) {
    const src = safeRelativePath(pluginRoot, rel)
    if (src) counts.commands += copyMarkdownCapabilitiesFromPath(src, pluginId, perPluginCommands, globalSkills, 'commands')
  }

  const agentPaths = componentPathValues(manifest, entry, 'agents')
  if (agentPaths.length === 0 && existsSync(join(pluginRoot, 'agents'))) agentPaths.push('./agents')
  for (const rel of [...new Set(agentPaths)]) {
    const src = safeRelativePath(pluginRoot, rel)
    if (src) counts.agents += copyMarkdownCapabilitiesFromPath(src, pluginId, perPluginAgents, globalSkills, 'agents')
  }

  const hookPaths = componentPathValues(manifest, entry, 'hooks')
  if (existsSync(join(pluginRoot, 'hooks'))) hookPaths.unshift('./hooks')
  for (const rel of [...new Set(hookPaths)]) {
    const src = safeRelativePath(pluginRoot, rel)
    if (src) counts.hooks += copyJsonLikePath(src, perPluginHooks, 'hooks.json')
  }
  counts.hooks += copyInlineJsonComponents(
    componentValues(manifest, entry, 'hooks'),
    perPluginHooks,
    'hooks-inline.json',
  )

  const mcpPaths = componentPathValues(manifest, entry, 'mcpServers')
  if (existsSync(join(pluginRoot, '.mcp.json'))) mcpPaths.unshift('./.mcp.json')
  for (const rel of [...new Set(mcpPaths)]) {
    const src = safeRelativePath(pluginRoot, rel)
    if (src) counts.mcp += copyJsonLikePath(src, perPluginMcp, 'mcp.json')
  }
  counts.mcp += copyInlineJsonComponents(
    componentValues(manifest, entry, 'mcpServers'),
    perPluginMcp,
    'mcp-inline.json',
    wrapMcpInlineConfig,
  )

  const lspPaths = componentPathValues(manifest, entry, 'lspServers')
  if (existsSync(join(pluginRoot, '.lsp.json'))) lspPaths.unshift('./.lsp.json')
  for (const rel of [...new Set(lspPaths)]) {
    const src = safeRelativePath(pluginRoot, rel)
    if (src) counts.lsp += copyJsonLikePath(src, perPluginLsp, 'lsp.json')
  }
  counts.lsp += copyInlineJsonComponents(
    componentValues(manifest, entry, 'lspServers'),
    perPluginLsp,
    'lsp-inline.json',
  )

  const monitorValues = componentAndExperimentalValues(manifest, entry, 'monitors')
  const monitorPaths = componentStringValues(monitorValues)
  if (monitorValues.length === 0 && existsSync(join(pluginRoot, 'monitors'))) {
    monitorPaths.push('./monitors')
  }
  for (const rel of [...new Set(monitorPaths)]) {
    const src = safeRelativePath(pluginRoot, rel)
    if (src) counts.monitors += copyJsonLikePath(src, perPluginMonitors, 'monitors.json')
  }
  counts.monitors += copyInlineJsonComponents(
    monitorValues,
    perPluginMonitors,
    'monitors-inline.json',
  )

  const outputStylePaths = componentPathValues(manifest, entry, 'outputStyles')
  if (outputStylePaths.length === 0 && existsSync(join(pluginRoot, 'output-styles'))) {
    outputStylePaths.push('./output-styles')
  }
  for (const rel of [...new Set(outputStylePaths)]) {
    const src = safeRelativePath(pluginRoot, rel)
    if (src) counts.outputStyles += copyMarkdownLikePath(src, perPluginOutputStyles)
  }

  const themeValues = componentAndExperimentalValues(manifest, entry, 'themes')
  const themePaths = componentStringValues(themeValues)
  if (themeValues.length === 0 && existsSync(join(pluginRoot, 'themes'))) {
    themePaths.push('./themes')
  }
  for (const rel of [...new Set(themePaths)]) {
    const src = safeRelativePath(pluginRoot, rel)
    if (src) counts.themes += copyJsonLikePath(src, perPluginThemes, 'theme.json')
  }
  counts.themes += copyInlineJsonComponents(themeValues, perPluginThemes, 'theme-inline.json')

  const binRoot = join(pluginRoot, 'bin')
  if (existsSync(binRoot)) counts.bin += copyExecutablePath(binRoot, pluginId, perPluginBin, globalBin)

  const scriptsRoot = join(pluginRoot, 'scripts')
  if (existsSync(scriptsRoot)) counts.scripts += copyDirectoryContents(scriptsRoot, perPluginScripts)

  const settingsPath = join(pluginRoot, 'settings.json')
  if (existsSync(settingsPath)) {
    copyFile(settingsPath, join(perPluginSettings, 'settings.json'))
    counts.settings++
  }
  counts.settings += copyInlineJsonComponents(
    componentValues(manifest, entry, 'settings'),
    perPluginSettings,
    'settings-inline.json',
  )

  counts.instructions += copyInstructions(pluginRoot, pluginId, perPluginInstructions, manifest, entry)
  writeJson(join(pluginDest, '.claude-plugin-import.json'), {
    id: pluginId,
    manifestName: manifest.name,
    entryName: entry.name,
    root: pluginRoot,
    counts,
  })

  ctx.imported.push({ id: pluginId, root: pluginRoot, counts })
  console.log('[claude-plugin] imported ' + pluginId + ' from ' + pluginRoot)
}

function marketplaceEntryPluginRoots(entry, marketplaceRoot, scratchRoot, cloneCache, inheritedDepth) {
  const source = entry.source
  if (typeof source === 'string') {
    const root = safeRelativePath(marketplaceRoot, source)
    return root ? [{ root, entry }] : []
  }

  if (!isPlainObject(source)) return []
  const kind = source.source
  if (kind === 'github' && typeof source.repo === 'string') {
    const cloneRoot = cloneGit(
      {
        id: entry.name || source.repo,
        url: 'https://github.com/' + source.repo + '.git',
        ref: source.ref,
        sha: source.sha,
        depth: inheritedDepth,
      },
      scratchRoot,
      cloneCache,
    )
    return [{ root: cloneRoot, entry }]
  }
  if (kind === 'url' && typeof source.url === 'string') {
    const cloneRoot = cloneGit(
      {
        id: entry.name || source.url,
        url: source.url,
        ref: source.ref,
        sha: source.sha,
        depth: inheritedDepth,
      },
      scratchRoot,
      cloneCache,
    )
    return [{ root: cloneRoot, entry }]
  }
  if (kind === 'git-subdir' && typeof source.url === 'string' && typeof source.path === 'string') {
    const cloneRoot = cloneGit(
      {
        id: entry.name || source.url,
        url: source.url,
        ref: source.ref,
        sha: source.sha,
        depth: inheritedDepth,
      },
      scratchRoot,
      cloneCache,
    )
    const root = safeRelativePath(cloneRoot, source.path)
    return root ? [{ root, entry }] : []
  }

  console.warn('[claude-plugin] skipping unsupported marketplace source for ' + (entry.name || 'unknown'))
  return []
}

function importMarketplaceSource(ctx, source, scratchRoot, cloneCache) {
  const cloneRoot = cloneGit(source, scratchRoot, cloneCache)
  const marketplaceRoot = safeRelativePath(cloneRoot, source.path || '.') || cloneRoot
  const marketplacePath =
    safeRelativePath(marketplaceRoot, source.marketplacePath || DEFAULT_MARKETPLACE_PATH) ||
    join(marketplaceRoot, DEFAULT_MARKETPLACE_PATH)
  const marketplace = readJson(marketplacePath)
  const plugins = Array.isArray(marketplace?.plugins) ? marketplace.plugins : []
  const include = new Set(source.include || [])

  for (const entry of plugins) {
    if (!isPlainObject(entry) || typeof entry.name !== 'string') continue
    if (include.size > 0 && !include.has(entry.name)) continue
    for (const item of marketplaceEntryPluginRoots(
      entry,
      marketplaceRoot,
      scratchRoot,
      cloneCache,
      source.depth,
    )) {
      if (existsSync(item.root)) importPluginRoot(ctx, item.root, item.entry)
    }
  }
}

function importDirectSource(ctx, source, scratchRoot, cloneCache) {
  const cloneRoot = cloneGit(source, scratchRoot, cloneCache)
  const base = safeRelativePath(cloneRoot, source.path || '.') || cloneRoot
  const roots = discoverPluginRoots(base, source.include || [])
  for (const item of roots) importPluginRoot(ctx, item.root, item.entry)
}

function main() {
  const planPath = process.argv[2]
  if (!planPath) throw new Error('Usage: claude-plugin-importer.mjs <plan.json>')
  const plan = readJson(planPath)
  if (!isPlainObject(plan)) throw new Error('Invalid Claude plugin import plan')
  const mountPath = plan.mountPath || '/claude-plugins'
  const sources = Array.isArray(plan.sources) ? plan.sources : []
  writeGithubNetrc()

  rmSync(mountPath, { recursive: true, force: true })
  mkdirSync(join(mountPath, '.shadow', 'skills'), { recursive: true })
  mkdirSync(join(mountPath, '.shadow', 'bin'), { recursive: true })
  const scratchRoot = mkdtempSync(join(tmpdir(), 'shadow-claude-plugin-'))
  const cloneCache = new Map()
  const ctx = { mountPath, imported: [] }

  for (const source of sources) {
    if (!isPlainObject(source)) continue
    if (source.kind === 'marketplace') {
      importMarketplaceSource(ctx, source, scratchRoot, cloneCache)
    } else if (source.kind === 'plugins') {
      importDirectSource(ctx, source, scratchRoot, cloneCache)
    }
  }

  writeJson(join(mountPath, '.shadow', 'plugins.json'), ctx.imported)
  console.log('[claude-plugin] imported ' + ctx.imported.length + ' plugin(s)')
}

main()
`
