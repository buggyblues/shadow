/**
 * OpenClaw Runner — container entrypoint.
 *
 * 1. Read agent config from ConfigMap (/etc/openclaw/config.json)
 * 2. Resolve ${env:VAR} references from environment
 * 3. Write OpenClaw config to ~/.openclaw/openclaw.json
 * 4. Verify extensions are loaded
 * 5. Start OpenClaw gateway
 * 6. Forward signals for graceful shutdown
 */

import { spawn, spawnSync } from 'node:child_process'
import {
  cpSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:http'
import { basename, join } from 'node:path'

const OPENCLAW_STATE_DIR = '/home/openclaw/.openclaw'
const SLASH_COMMANDS_INDEX_PATH = join(OPENCLAW_STATE_DIR, 'shadow', 'slash-commands.json')
const CONFIG_MOUNT = '/etc/openclaw'
const EXTENSIONS_DIR = '/app/extensions'
const RUNTIME_EXTENSIONS_PATH = join(CONFIG_MOUNT, 'runtime-extensions.json')
const GATEWAY_PORT = parseInt(process.env.OPENCLAW_GATEWAY_PORT ?? '3100', 10)
const OPENCLAW_HTTP_PORT = GATEWAY_PORT + 1
const LOG_DIR = '/var/log/openclaw'
const SHARED_WORKSPACE_PATH = process.env.SHARED_WORKSPACE_PATH ?? ''
const SKILLS_DIR = process.env.SKILLS_DIR ?? ''
const RUNTIME_DEPS_WARM_SCRIPT = '/app/warm-runtime-deps.mjs'
const DEFAULT_PLUGIN_STAGE_DIR = '/opt/openclaw-runtime-deps'
let runtimeDepsStageDir = process.env.OPENCLAW_PLUGIN_STAGE_DIR || DEFAULT_PLUGIN_STAGE_DIR

function installFileLogging() {
  try {
    mkdirSync(LOG_DIR, { recursive: true })
    const stream = createWriteStream(join(LOG_DIR, 'entrypoint.log'), { flags: 'a' })
    const mirror = (original) => {
      return (chunk, encoding, callback) => {
        try {
          stream.write(chunk)
        } catch {
          // Keep stdout/stderr healthy even if file logging fails.
        }
        return original(chunk, encoding, callback)
      }
    }
    process.stdout.write = mirror(process.stdout.write.bind(process.stdout))
    process.stderr.write = mirror(process.stderr.write.bind(process.stderr))
    process.on('uncaughtException', (err) => {
      console.error('[entrypoint] Uncaught exception:', err)
    })
    process.on('unhandledRejection', (reason) => {
      console.error('[entrypoint] Unhandled rejection:', reason)
    })
  } catch (err) {
    console.error('[entrypoint] Failed to install file logging:', err)
  }
}

installFileLogging()

// ─── Config Loading ─────────────────────────────────────────────────────────

function loadMountedConfig() {
  const configPath = join(CONFIG_MOUNT, 'config.json')
  if (!existsSync(configPath)) {
    console.log('[entrypoint] No mounted config found, using defaults')
    return {}
  }

  try {
    const raw = readFileSync(configPath, 'utf-8')
    const config = JSON.parse(raw)
    console.log('[entrypoint] Loaded config from ConfigMap')
    return config
  } catch (err) {
    console.error('[entrypoint] Failed to parse mounted config:', err.message)
    return {}
  }
}

function loadRuntimeExtensions() {
  if (!existsSync(RUNTIME_EXTENSIONS_PATH)) {
    return {}
  }

  try {
    const raw = readFileSync(RUNTIME_EXTENSIONS_PATH, 'utf-8')
    const extensions = JSON.parse(raw)
    if (!extensions || typeof extensions !== 'object' || Array.isArray(extensions)) {
      console.warn('[entrypoint] Ignoring invalid runtime extensions payload')
      return {}
    }
    console.log('[entrypoint] Loaded runtime extensions from ConfigMap')
    return extensions
  } catch (err) {
    console.warn(`[entrypoint] Failed to parse runtime extensions: ${err.message}`)
    return {}
  }
}

function resolveEnvVars(obj) {
  if (typeof obj === 'string') {
    return obj.replace(/\$\{env:([^}]+)\}/g, (_, key) => {
      return process.env[key] ?? ''
    })
  }
  if (Array.isArray(obj)) {
    return obj.map(resolveEnvVars)
  }
  if (obj !== null && typeof obj === 'object') {
    const result = {}
    for (const [key, value] of Object.entries(obj)) {
      result[key] = resolveEnvVars(value)
    }
    return result
  }
  return obj
}

// ─── OpenClaw Config Generation ─────────────────────────────────────────────

function generateOpenClawConfig(mountedConfig) {
  const config = resolveEnvVars(mountedConfig)

  // Set gateway port. The runner health server uses GATEWAY_PORT, so OpenClaw
  // itself must bind to the adjacent port in both CLI args and persisted config.
  if (!config.gateway) {
    config.gateway = {}
  }
  config.gateway.port = OPENCLAW_HTTP_PORT
  // Use "lan" bind (0.0.0.0) so the gateway is reachable from outside the container.
  config.gateway.bind = 'lan'
  // Ensure gateway.mode is set — required by OpenClaw to start without cloud setup
  if (!config.gateway.mode) {
    config.gateway.mode = 'local'
  }
  // LAN binding requires authentication — use token mode with auto-generated token.
  if (!config.gateway.auth) {
    config.gateway.auth = {}
  }
  if (!config.gateway.auth.mode || config.gateway.auth.mode === 'none') {
    config.gateway.auth.mode = 'token'
  }

  // Set up shared workspace path — makes the PVC mount discoverable by OpenClaw
  if (SHARED_WORKSPACE_PATH) {
    if (!config.agents) config.agents = {}
    if (!config.agents.defaults) config.agents.defaults = {}
    if (!config.agents.defaults.workspace) {
      config.agents.defaults.workspace = SHARED_WORKSPACE_PATH
    }
    console.log(`[entrypoint] Shared workspace: ${SHARED_WORKSPACE_PATH}`)
  }

  // Set up skills extra directories — lets OpenClaw discover cloud-installed skills
  if (SKILLS_DIR) {
    if (!config.skills) config.skills = {}
    if (!config.skills.load) config.skills.load = {}
    const extraDirs = new Set(config.skills.load.extraDirs ?? [])
    extraDirs.add(SKILLS_DIR)
    config.skills.load.extraDirs = [...extraDirs]
    console.log(`[entrypoint] Skills directory: ${SKILLS_DIR}`)
  }

  return config
}

// ─── Pack Wiring (agent-pack env vars) ──────────────────────────────────────

/**
 * Read SHADOW_PACK_*_DIRS env vars produced by the cloud agent-pack plugin
 * (apps/cloud/src/plugins/agent-pack/index.ts) and merge their contents into
 * the OpenClaw config so the runtime actually consumes:
 *
 *   - agents/        → subagents (registered as additional agents.list[] entries
 *                       and added to every primary agent's subagents.allowAgents)
 *   - mcp/           → mcp.servers map (each *.json merged in)
 *   - hooks/         → hooks.scripts list (paths only — runtime invocation
 *                       semantics intentionally minimal until we standardize)
 *   - instructions/  → appended to the primary agent's `instructions` field
 *   - commands/      → local slash command index consumed by openclaw-shadowob
 *
 * Other kinds (scripts/, files/) stay as env vars for direct use.
 */
function splitDirs(value) {
  if (!value) return []
  return value
    .split(':')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((p) => existsSync(p))
}

function listChildDirs(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => join(dir, d.name))
  } catch {
    return []
  }
}

function listFiles(dir, suffix) {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isFile() && d.name.endsWith(suffix))
      .map((d) => join(dir, d.name))
  } catch {
    return []
  }
}

function readMaybe(path) {
  try {
    return readFileSync(path, 'utf-8')
  } catch {
    return ''
  }
}

function safeJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch (err) {
    console.warn(`[entrypoint] Failed to parse pack JSON ${path}:`, err.message)
    return null
  }
}

function deriveSubagentId(dir) {
  // Use the immediate parent's name (= pack id) + child folder name
  // → "<pack>-<child>" so collisions across packs are unlikely.
  const parts = dir.split('/').filter(Boolean)
  const child = parts[parts.length - 1] ?? 'subagent'
  const pack = parts[parts.length - 3] ?? 'pack' // .../<pack>/agents/<child>
  return `${pack}-${child}`.replace(/[^a-zA-Z0-9_-]/g, '-')
}

function loadSubagentDef(dir) {
  // Look for AGENT.md, SKILL.md, or SOUL.md (all valid Claude-style descriptors).
  const candidates = ['AGENT.md', 'SKILL.md', 'SOUL.md']
  for (const f of candidates) {
    const p = join(dir, f)
    if (existsSync(p)) return readMaybe(p)
  }
  return ''
}

function normalizeSlashCommandName(value) {
  if (typeof value !== 'string') return null
  const name = value.trim().replace(/^\/+/, '')
  return /^[a-zA-Z][a-zA-Z0-9._-]{0,63}$/.test(name) ? name : null
}

function parseFrontmatterList(value) {
  if (typeof value !== 'string') return []
  const trimmed = value.trim()
  const unwrapped =
    trimmed.startsWith('[') && trimmed.endsWith(']') ? trimmed.slice(1, -1) : trimmed
  return unwrapped
    .split(',')
    .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean)
}

function parseFrontmatter(text) {
  if (!text.startsWith('---')) return { data: {}, body: text }
  const end = text.indexOf('\n---', 3)
  if (end === -1) return { data: {}, body: text }
  const raw = text.slice(3, end).trim()
  const data = {}
  const lines = raw.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const match = line.match(/^([a-zA-Z0-9_.-]+):\s*(.*)$/)
    if (!match) continue
    const key = match[1]
    const value = match[2].trim().replace(/^['"]|['"]$/g, '')
    if (value === '|') {
      const block = []
      while (i + 1 < lines.length) {
        const next = lines[i + 1]
        if (next && !/^\s/.test(next)) break
        block.push(next.replace(/^\s{2}/, ''))
        i++
      }
      data[key] = block.join('\n').trim()
      continue
    }
    if (value) {
      data[key] = value
      continue
    }

    const items = []
    while (i + 1 < lines.length) {
      const itemMatch = lines[i + 1].match(/^\s*-\s*(.+)$/)
      if (!itemMatch) break
      items.push(itemMatch[1].trim().replace(/^['"]|['"]$/g, ''))
      i++
    }
    data[key] = items.length > 0 ? items.join(',') : value
  }
  return { data, body: text.slice(end + 4).trimStart() }
}

function parseFrontmatterJson(value) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return undefined
  try {
    return JSON.parse(trimmed)
  } catch {
    return undefined
  }
}

function normalizeSlashInteraction(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const kind = typeof value.kind === 'string' ? value.kind.trim().toLowerCase() : ''
  if (!['buttons', 'select', 'form', 'approval'].includes(kind)) return undefined
  const out = { kind }
  for (const key of ['id', 'prompt', 'submitLabel', 'responsePrompt', 'approvalCommentLabel']) {
    if (typeof value[key] === 'string' && value[key].trim()) out[key] = value[key].trim()
  }
  if (typeof value.oneShot === 'boolean') out.oneShot = value.oneShot
  if (Array.isArray(value.fields)) {
    out.fields = value.fields
      .filter((field) => field && typeof field === 'object' && !Array.isArray(field))
      .map((field, index) => ({
        id:
          typeof field.id === 'string' && field.id.trim() ? field.id.trim() : `field_${index + 1}`,
        kind:
          typeof field.kind === 'string' &&
          ['text', 'textarea', 'number', 'checkbox', 'select'].includes(field.kind)
            ? field.kind
            : 'text',
        label:
          typeof field.label === 'string' && field.label.trim()
            ? field.label.trim()
            : `Field ${index + 1}`,
        ...(typeof field.placeholder === 'string' && field.placeholder.trim()
          ? { placeholder: field.placeholder.trim() }
          : {}),
        ...(typeof field.defaultValue === 'string' ? { defaultValue: field.defaultValue } : {}),
        ...(typeof field.required === 'boolean' ? { required: field.required } : {}),
        ...(typeof field.maxLength === 'number' ? { maxLength: field.maxLength } : {}),
      }))
      .slice(0, 12)
  }
  return out
}

function frontmatterInteraction(data) {
  const direct = normalizeSlashInteraction(
    parseFrontmatterJson(data.interaction) ?? parseFrontmatterJson(data.interactive),
  )
  if (direct) return direct

  const kind = data['interaction.kind'] ?? data['interactive.kind']
  if (!kind) return undefined
  const oneShotRaw = data['interaction.oneShot'] ?? data['interactive.oneShot']
  return normalizeSlashInteraction({
    kind,
    id: data['interaction.id'] ?? data['interactive.id'],
    prompt: data['interaction.prompt'] ?? data['interactive.prompt'],
    submitLabel: data['interaction.submitLabel'] ?? data['interactive.submitLabel'],
    responsePrompt: data['interaction.responsePrompt'] ?? data['interactive.responsePrompt'],
    ...(oneShotRaw !== undefined ? { oneShot: oneShotRaw === 'true' } : {}),
    fields: parseFrontmatterJson(data['interaction.fields'] ?? data['interactive.fields']),
  })
}

function derivePackId(path) {
  const parts = path.split('/').filter(Boolean)
  const idx = parts.lastIndexOf('agent-packs')
  if (idx >= 0 && parts[idx + 1]) return parts[idx + 1]
  return undefined
}

function deriveSlashDescription(body, frontmatter) {
  const fmDescription =
    typeof frontmatter.description === 'string' ? frontmatter.description.trim() : ''
  if (fmDescription) return fmDescription.slice(0, 240)

  for (const line of body.split('\n')) {
    const text = line.replace(/^#+\s*/, '').trim()
    if (text) return text.slice(0, 240)
  }
  return undefined
}

function runtimeSlashRules(runtimeExtensions) {
  const rules = runtimeExtensions?.slashCommands?.rules
  return Array.isArray(rules) ? rules.filter((rule) => rule && typeof rule === 'object') : []
}

function asStringArray(value) {
  if (typeof value === 'string') return [value]
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : []
}

function matchesSlashCommandRule(rule, command, context) {
  const match = rule.match
  if (!match || typeof match !== 'object') return true

  if (typeof match.packId === 'string' && match.packId !== context.packId) {
    return false
  }

  const names = [...asStringArray(match.name), ...asStringArray(match.names)]
  if (
    names.length > 0 &&
    !names.some((name) => name.toLowerCase() === command.name.toLowerCase())
  ) {
    return false
  }

  if (typeof match.namePattern === 'string' && match.namePattern.trim()) {
    try {
      if (!new RegExp(match.namePattern).test(command.name)) return false
    } catch (err) {
      console.warn(`[entrypoint] Ignoring invalid slash command rule pattern: ${err.message}`)
      return false
    }
  }

  const pathIncludes = asStringArray(match.sourcePathIncludes)
  if (pathIncludes.length > 0 && !pathIncludes.some((needle) => context.path.includes(needle))) {
    return false
  }

  return true
}

function applySlashCommandRules(command, context, runtimeExtensions) {
  const rules = runtimeSlashRules(runtimeExtensions)
  if (rules.length === 0) return command

  for (const rule of rules) {
    if (!matchesSlashCommandRule(rule, command, context)) continue

    const aliases = asStringArray(rule.aliases)
      .map(normalizeSlashCommandName)
      .filter(Boolean)
      .filter((alias) => alias.toLowerCase() !== command.name.toLowerCase())
    if (aliases.length > 0) {
      command.aliases = [...new Set([...(command.aliases ?? []), ...aliases])]
    }

    const interaction = normalizeSlashInteraction(rule.interaction)
    if (interaction && !command.interaction) {
      command.interaction = interaction
    }
  }

  return command
}

function readSlashCommand(path, fallbackName, runtimeExtensions) {
  const text = readMaybe(path).trim()
  if (!text) return null
  const { data, body } = parseFrontmatter(text)
  const name = normalizeSlashCommandName(data.name ?? fallbackName)
  if (!name) return null
  const packId = derivePackId(path)
  const aliases = parseFrontmatterList(data.aliases)
    .map(normalizeSlashCommandName)
    .filter(Boolean)
    .filter((alias) => alias.toLowerCase() !== name.toLowerCase())
  const description = deriveSlashDescription(body, data)
  const interaction = frontmatterInteraction(data)

  return applySlashCommandRules(
    {
      name,
      ...(description ? { description } : {}),
      ...(aliases.length > 0 ? { aliases: [...new Set(aliases)] } : {}),
      ...(packId ? { packId } : {}),
      ...(interaction ? { interaction } : {}),
      sourcePath: path,
      body: text.slice(0, 20_000),
    },
    { path, packId, body, frontmatter: data },
    runtimeExtensions,
  )
}

function discoverSlashCommands(commandsDirs, runtimeExtensions) {
  const commands = []
  const seen = new Set()
  for (const dir of commandsDirs) {
    for (const file of listFiles(dir, '.md')) {
      const fallbackName = file.split('/').pop().replace(/\.md$/, '')
      const command = readSlashCommand(file, fallbackName, runtimeExtensions)
      if (!command) continue
      const key = command.name.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      commands.push(command)
    }

    for (const childDir of listChildDirs(dir)) {
      const fallbackName = childDir.split('/').pop()
      const candidates = ['SKILL.md', 'COMMAND.md', 'README.md']
      for (const candidate of candidates) {
        const path = join(childDir, candidate)
        if (!existsSync(path)) continue
        const command = readSlashCommand(path, fallbackName, runtimeExtensions)
        if (!command) break
        const key = command.name.toLowerCase()
        if (!seen.has(key)) {
          seen.add(key)
          commands.push(command)
        }
        break
      }
    }
  }
  return commands.slice(0, 200)
}

function writeSlashCommandIndex(commands) {
  mkdirSync(join(OPENCLAW_STATE_DIR, 'shadow'), { recursive: true })
  writeFileSync(SLASH_COMMANDS_INDEX_PATH, JSON.stringify(commands, null, 2), 'utf-8')
  process.env.SHADOW_SLASH_COMMANDS_PATH = SLASH_COMMANDS_INDEX_PATH
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function mergePlainObjects(target, source) {
  const out = { ...(isPlainObject(target) ? target : {}) }
  if (!isPlainObject(source)) return out

  for (const [key, value] of Object.entries(source)) {
    if (isPlainObject(value) && isPlainObject(out[key])) {
      out[key] = mergePlainObjects(out[key], value)
    } else {
      out[key] = value
    }
  }
  return out
}

function resolveManifestPatchPath(patch) {
  if (typeof patch.manifestPath === 'string' && patch.manifestPath.trim()) {
    const manifestPath = patch.manifestPath.trim()
    return manifestPath.startsWith('/') ? manifestPath : join('/app', manifestPath)
  }

  if (typeof patch.extensionId === 'string' && /^[A-Za-z0-9._-]+$/.test(patch.extensionId)) {
    return join(EXTENSIONS_DIR, patch.extensionId, 'openclaw.plugin.json')
  }

  return null
}

function runtimeManifestPatches(runtimeExtensions) {
  const patches = runtimeExtensions?.openclaw?.manifestPatches
  return Array.isArray(patches) ? patches.filter((patch) => isPlainObject(patch)) : []
}

function applyRuntimeManifestPatches(runtimeExtensions) {
  for (const patch of runtimeManifestPatches(runtimeExtensions)) {
    const manifestPath = resolveManifestPatchPath(patch)
    if (!manifestPath || !existsSync(manifestPath)) continue

    try {
      let manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
      if (!isPlainObject(manifest)) continue

      if (isPlainObject(patch.merge)) {
        manifest = mergePlainObjects(manifest, patch.merge)
      }
      if (isPlainObject(patch.channelEnvVars)) {
        manifest.channelEnvVars = mergePlainObjects(manifest.channelEnvVars, patch.channelEnvVars)
      }
      if (isPlainObject(patch.channelConfigs)) {
        manifest.channelConfigs = mergePlainObjects(manifest.channelConfigs, patch.channelConfigs)
      }

      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8')
      console.log(`[entrypoint] Applied runtime manifest patch: ${manifestPath}`)
    } catch (err) {
      console.warn(`[entrypoint] Failed to apply manifest patch ${manifestPath}: ${err.message}`)
    }
  }
}

function mergeShadowPacks(config, runtimeExtensions) {
  const agentsDirs = splitDirs(process.env.SHADOW_PACK_AGENTS_DIRS)
  const mcpDirs = splitDirs(process.env.SHADOW_PACK_MCP_DIRS)
  const hooksDirs = splitDirs(process.env.SHADOW_PACK_HOOKS_DIRS)
  const instructionsDirs = splitDirs(process.env.SHADOW_PACK_INSTRUCTIONS_DIRS)
  const skillsDirs = splitDirs(process.env.SHADOW_PACK_SKILLS_DIRS)
  const commandsDirs = splitDirs(process.env.SHADOW_PACK_COMMANDS_DIRS)

  if (
    agentsDirs.length === 0 &&
    mcpDirs.length === 0 &&
    hooksDirs.length === 0 &&
    instructionsDirs.length === 0 &&
    skillsDirs.length === 0 &&
    commandsDirs.length === 0
  ) {
    return config
  }

  // ── Subagents ──────────────────────────────────────────────────────────────
  const newSubagents = []
  const subagentIds = []
  for (const dir of agentsDirs) {
    for (const childDir of listChildDirs(dir)) {
      const def = loadSubagentDef(childDir)
      if (!def) continue
      const id = deriveSubagentId(childDir)
      newSubagents.push({
        id,
        runtime: { type: 'subagent' },
        identity: { name: id },
        instructions: def,
      })
      subagentIds.push(id)
    }
  }
  if (newSubagents.length > 0) {
    if (!config.agents) config.agents = {}
    if (!Array.isArray(config.agents.list)) config.agents.list = []
    // Avoid double-registration if entrypoint is invoked twice.
    const existingIds = new Set(config.agents.list.map((a) => a.id))
    for (const sa of newSubagents) {
      if (!existingIds.has(sa.id)) config.agents.list.push(sa)
    }
    // Every primary (non-subagent) agent gets these subagents allowed.
    for (const a of config.agents.list) {
      if (a.runtime?.type === 'subagent') continue
      if (!a.subagents) a.subagents = {}
      const allow = new Set(a.subagents.allowAgents ?? [])
      for (const id of subagentIds) allow.add(id)
      a.subagents.allowAgents = [...allow]
    }
    console.log(`[entrypoint] Registered ${subagentIds.length} pack subagent(s)`)
  }

  // ── MCP servers ────────────────────────────────────────────────────────────
  const mcpServers = {}
  for (const dir of mcpDirs) {
    for (const file of listFiles(dir, '.json')) {
      const parsed = safeJson(file)
      if (!parsed || typeof parsed !== 'object') continue
      // Two accepted shapes:
      //   1. Claude Desktop / mcp.json:  { mcpServers: { name: { command, args, env } } }
      //   2. Single-server file:         { command, args, env, transport? } (name = filename)
      if (parsed.mcpServers && typeof parsed.mcpServers === 'object') {
        for (const [name, def] of Object.entries(parsed.mcpServers)) {
          if (def && typeof def === 'object') mcpServers[name] = def
        }
      } else if (parsed.command) {
        const name = file
          .split('/')
          .pop()
          .replace(/\.json$/, '')
        mcpServers[name] = parsed
      }
    }
  }
  if (Object.keys(mcpServers).length > 0) {
    if (!config.mcp) config.mcp = {}
    config.mcp.servers = { ...(config.mcp.servers ?? {}), ...mcpServers }
    console.log(`[entrypoint] Merged ${Object.keys(mcpServers).length} MCP server(s) from packs`)
  }

  // ── Hooks ──────────────────────────────────────────────────────────────────
  const hookScripts = []
  for (const dir of hooksDirs) {
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isFile()) continue
        const p = join(dir, entry.name)
        try {
          // Only treat executable files as hooks
          const mode = statSync(p).mode
          if (mode & 0o111) hookScripts.push(p)
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }
  }
  if (hookScripts.length > 0) {
    if (!config.hooks) config.hooks = {}
    config.hooks.scripts = [...(config.hooks.scripts ?? []), ...hookScripts]
    console.log(`[entrypoint] Registered ${hookScripts.length} pack hook script(s)`)
  }

  // ── Instructions append ────────────────────────────────────────────────────
  const instructionChunks = []
  for (const dir of instructionsDirs) {
    for (const file of listFiles(dir, '.md')) {
      const text = readMaybe(file).trim()
      if (text) instructionChunks.push(`<!-- ${file} -->\n${text}`)
    }
    // Also look for direct files at the dir root (instructions plugin already
    // copied the curated set into the parent; this catches the dir-level case).
    for (const sub of listChildDirs(dir)) {
      for (const file of listFiles(sub, '.md')) {
        const text = readMaybe(file).trim()
        if (text) instructionChunks.push(`<!-- ${file} -->\n${text}`)
      }
    }
  }
  if (instructionChunks.length > 0) {
    // Store chunks under a temp key; main() will write them to the workspace
    // file PACK_INSTRUCTIONS.md instead of embedding them in openclaw.json.
    // Embedding large instruction files (can be 100KB+) directly into the JSON
    // config causes the openclaw gateway to crash on startup.
    config.__packInstructionChunks = instructionChunks
    console.log(
      `[entrypoint] Collected ${instructionChunks.length} pack instruction file(s) for workspace`,
    )
  }

  // ── Slash commands ────────────────────────────────────────────────────────
  const slashCommandDirs = [...new Set([...commandsDirs, ...skillsDirs])]
  if (slashCommandDirs.length > 0) {
    const slashCommands = discoverSlashCommands(slashCommandDirs, runtimeExtensions)
    writeSlashCommandIndex(slashCommands)
    console.log(`[entrypoint] Indexed ${slashCommands.length} pack slash command(s)`)
  }

  return config
}

function verifyExtensions() {
  if (!existsSync(EXTENSIONS_DIR)) {
    console.log('[entrypoint] No extensions directory')
    return
  }

  const extensions = readdirSync(EXTENSIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)

  console.log(`[entrypoint] Found ${extensions.length} extension(s): ${extensions.join(', ')}`)

  for (const extensionId of extensions) {
    const extensionDir = join(EXTENSIONS_DIR, extensionId)
    const hasEntry =
      existsSync(join(extensionDir, 'index.mjs')) ||
      existsSync(join(extensionDir, 'dist', 'index.js')) ||
      existsSync(join(extensionDir, 'openclaw.plugin.json'))
    if (hasEntry) {
      console.log(`[entrypoint] ✓ extension verified: ${extensionId}`)
    } else {
      console.warn(`[entrypoint] ⚠ extension missing entry point: ${extensionId}`)
    }
  }
}

// ─── Health Check Server ────────────────────────────────────────────────────

let gatewayHealthy = false
let gatewayReady = false
let shadowChannelReady = false
let healthRequiresShadowChannel = true
let gatewayProcess = null
let gatewayGraceTimer = null
let gatewayRestarts = 0
const MAX_GATEWAY_RESTARTS = 5
const RESTART_DELAY_MS = 5000

// ─── Log Redaction ──────────────────────────────────────────────────────────

const KEY_PATTERNS = [
  /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g,
  /\bsk-proj-[A-Za-z0-9_-]{20,}\b/g,
  /\bsk-[A-Za-z0-9]{20,}\b/g,
  /\bgsk_[A-Za-z0-9]{20,}\b/g,
  /\bxai-[A-Za-z0-9]{20,}\b/g,
  /\bkey-[A-Za-z0-9]{20,}\b/g,
  /\bghp_[A-Za-z0-9]{20,}\b/g,
  /Bearer\s+[A-Za-z0-9._-]{20,}/g,
]

function redact(line) {
  let result = line
  for (const pattern of KEY_PATTERNS) {
    pattern.lastIndex = 0
    result = result.replace(pattern, '[REDACTED]')
  }
  return result
}

function startHealthServer() {
  const server = createServer((req, res) => {
    if (req.url === '/live') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          status: 'live',
          pid: gatewayProcess?.pid,
          gatewayReady,
          shadowChannelReady,
        }),
      )
      return
    }

    if (req.url === '/ready' || req.url === '/health') {
      const ready = healthRequiresShadowChannel ? shadowChannelReady : gatewayReady
      res.writeHead(ready ? 200 : 503, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          status: ready ? 'ready' : 'starting',
          pid: gatewayProcess?.pid,
          gatewayReady,
          shadowChannelReady,
        }),
      )
    } else {
      res.writeHead(404)
      res.end()
    }
  })

  server.listen(GATEWAY_PORT, '0.0.0.0', () => {
    console.log(`[entrypoint] Health server listening on :${GATEWAY_PORT}`)
  })

  return server
}

// ─── Gateway Process ────────────────────────────────────────────────────────

function clearStaleRuntimeDependencyLocks() {
  const depsRoots = [runtimeDepsStageDir, join(OPENCLAW_STATE_DIR, 'plugin-runtime-deps')].filter(
    (entry, index, values) => entry && values.indexOf(entry) === index,
  )

  for (const depsRoot of depsRoots) {
    if (!existsSync(depsRoot)) continue

    for (const runtimeDir of listChildDirs(depsRoot)) {
      const lockDir = join(runtimeDir, '.openclaw-runtime-deps.lock')
      if (!existsSync(lockDir)) continue

      let ownerPid = null
      try {
        const owner = JSON.parse(readFileSync(join(lockDir, 'owner.json'), 'utf-8'))
        if (typeof owner.pid === 'number') ownerPid = owner.pid
      } catch {
        // Treat unreadable lock metadata as stale; the gateway will recreate it.
      }

      const ownerAlive = ownerPid !== null && existsSync(`/proc/${ownerPid}`)
      if (!ownerAlive) {
        rmSync(lockDir, { recursive: true, force: true })
        console.log(`[entrypoint] Removed stale OpenClaw runtime dependency lock: ${lockDir}`)
      }
    }
  }
}

function prepareWritableRuntimeDepsStage() {
  const imageStageDir = DEFAULT_PLUGIN_STAGE_DIR
  const writableStageDir = join(OPENCLAW_STATE_DIR, 'plugin-runtime-deps')
  const explicitStageDir = process.env.OPENCLAW_PLUGIN_STAGE_DIR

  if (explicitStageDir && explicitStageDir !== imageStageDir) {
    runtimeDepsStageDir = explicitStageDir
    return
  }

  mkdirSync(writableStageDir, { recursive: true })
  if (existsSync(imageStageDir)) {
    for (const runtimeDir of listChildDirs(imageStageDir)) {
      const dest = join(writableStageDir, basename(runtimeDir))
      if (existsSync(dest)) continue
      try {
        cpSync(runtimeDir, dest, { recursive: true, dereference: false })
        console.log(`[entrypoint] Seeded OpenClaw runtime deps from image: ${dest}`)
      } catch (err) {
        console.warn(`[entrypoint] Failed to seed runtime deps ${dest}: ${err.message}`)
      }
    }
  }
  runtimeDepsStageDir = writableStageDir
}

function runRuntimeDepsWarmup(configPath, stageDir) {
  if (!existsSync(RUNTIME_DEPS_WARM_SCRIPT)) {
    return { ok: false, reason: 'Bundled runtime dependency warmup script is missing' }
  }

  const timeout = Number.parseInt(process.env.OPENCLAW_RUNTIME_DEPS_WARM_TIMEOUT_MS ?? '240000', 10)
  const env = {
    ...process.env,
    OPENCLAW_CONFIG_PATH: configPath,
    OPENCLAW_STATE_DIR,
    OPENCLAW_PLUGIN_STAGE_DIR: stageDir,
    HOME: '/home/openclaw',
    NODE_ENV: 'production',
    npm_config_cache: '/tmp/npm-cache',
  }

  console.log(`[entrypoint] Warming OpenClaw bundled runtime dependencies in ${stageDir}...`)
  const result = spawnSync('node', [RUNTIME_DEPS_WARM_SCRIPT, configPath], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout,
  })

  const stdout = result.stdout?.toString().trim()
  if (stdout) {
    for (const line of stdout.split('\n')) process.stdout.write(`${redact(line)}\n`)
  }
  const stderr = result.stderr?.toString().trim()
  if (stderr) {
    for (const line of stderr.split('\n')) process.stderr.write(`${redact(line)}\n`)
  }

  if (result.error) {
    return { ok: false, reason: result.error.message }
  }
  if (result.status !== 0) {
    return { ok: false, reason: `exited ${result.status}` }
  }
  return { ok: true }
}

function warmBundledPluginRuntimeDeps(configPath) {
  if (process.env.OPENCLAW_SKIP_RUNTIME_DEPS_WARMUP === '1') {
    console.log('[entrypoint] Skipping bundled runtime dependency warmup')
    return
  }

  const preferredStageDir = runtimeDepsStageDir
  const first = runRuntimeDepsWarmup(configPath, preferredStageDir)
  if (first.ok) {
    runtimeDepsStageDir = preferredStageDir
    console.log('[entrypoint] ✓ bundled runtime dependencies warmed')
    return
  }

  const fallbackStageDir = join(OPENCLAW_STATE_DIR, 'plugin-runtime-deps')
  console.warn(
    `[entrypoint] Runtime dependency warmup in ${preferredStageDir} failed: ${first.reason}`,
  )
  if (preferredStageDir === fallbackStageDir) return

  const fallback = runRuntimeDepsWarmup(configPath, fallbackStageDir)
  if (fallback.ok) {
    runtimeDepsStageDir = fallbackStageDir
    console.log('[entrypoint] ✓ bundled runtime dependencies warmed in writable state dir')
    return
  }
  console.warn(`[entrypoint] Runtime dependency fallback warmup failed: ${fallback.reason}`)
}

function findGatewayEntry() {
  const candidates = [
    '/app/node_modules/openclaw/dist/cli/index.js',
    '/app/node_modules/openclaw/openclaw.mjs',
    '/app/node_modules/.bin/openclaw',
  ]

  for (const path of candidates) {
    if (existsSync(path)) return path
  }
  return 'openclaw' // Fallback to PATH
}

function startGateway(_healthServer) {
  clearStaleRuntimeDependencyLocks()

  const entry = findGatewayEntry()
  const configPath = join(OPENCLAW_STATE_DIR, 'openclaw.json')
  const gatewayPort = OPENCLAW_HTTP_PORT

  console.log(`[entrypoint] Starting OpenClaw gateway: ${entry}`)
  console.log(`[entrypoint] Config: ${configPath}`)
  console.log(`[entrypoint] Gateway port: ${gatewayPort}`)

  const env = {
    ...process.env,
    // OPENCLAW_CONFIG_PATH is what OpenClaw actually reads (not OPENCLAW_CONFIG).
    // Matches the desktop app's env setup in paths.ts buildGatewayEnv().
    OPENCLAW_CONFIG_PATH: configPath,
    OPENCLAW_STATE_DIR: OPENCLAW_STATE_DIR,
    OPENCLAW_GATEWAY_PORT: String(gatewayPort),
    OPENCLAW_PLUGIN_STAGE_DIR: runtimeDepsStageDir,
    OPENCLAW_LOG_DIR: LOG_DIR,
    NODE_ENV: 'production',
    // Disable OpenClaw's self-respawn mechanism — the original process would exit
    // after spawning a child, causing our entrypoint to think the gateway crashed.
    OPENCLAW_NO_RESPAWN: '1',
    // Avoid overhead from compile-cache setup in containers
    NODE_COMPILE_CACHE: '/tmp/openclaw-compile-cache',
    // npm/npx writes cache to $HOME/.npm by default; HOME is read-only in containers,
    // so redirect to /tmp to allow ACPX backend probes (e.g. npx @zed-industries/codex-acp)
    npm_config_cache: '/tmp/npm-cache',
  }

  const proc = spawn(
    'node',
    [entry, 'gateway', '--port', String(gatewayPort), '--allow-unconfigured'],
    {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: OPENCLAW_STATE_DIR,
    },
  )

  gatewayProcess = proc

  // Keep the container unready until the gateway has actually started the
  // Shadow channel. A fixed grace period marks pods ready while OpenClaw is
  // still installing plugin runtime deps, which causes rolling updates to drop
  // channel messages during handoff.
  gatewayGraceTimer = setTimeout(() => {
    if (!proc.killed && proc.exitCode === null) {
      console.log('[entrypoint] Gateway still starting — waiting for channel readiness')
    }
  }, 120000)

  proc.stdout.on('data', (data) => {
    const line = data.toString().trim()
    process.stdout.write(`[openclaw] ${redact(line)}\n`)

    if (line.includes('[gateway] ready') || line.includes('Gateway ready')) {
      gatewayReady = true
      console.log('[entrypoint] Gateway HTTP server is ready')
      if (!healthRequiresShadowChannel && !gatewayHealthy) {
        gatewayHealthy = true
        console.log('[entrypoint] Gateway is ready')
      }
    }

    if (healthRequiresShadowChannel && line.includes('[ws] ✓ Joined channel room')) {
      shadowChannelReady = true
      clearTimeout(gatewayGraceTimer)
      if (!gatewayHealthy) {
        gatewayHealthy = true
        // Keep health server running — it now returns 200 since gatewayHealthy=true
        console.log('[entrypoint] Shadow channel is ready')
      }
    }
  })

  proc.stderr.on('data', (data) => {
    process.stderr.write(`[openclaw:err] ${redact(data.toString().trim())}\n`)
  })

  proc.on('exit', (code, signal) => {
    console.log(`[entrypoint] Gateway exited: code=${code} signal=${signal}`)
    clearTimeout(gatewayGraceTimer)
    gatewayHealthy = false
    gatewayReady = false
    shadowChannelReady = false

    if (signal === 'SIGTERM' || signal === 'SIGINT') {
      return // Normal shutdown, signal handlers will handle process.exit
    }

    // Graceful degradation: restart the gateway instead of crashing the container
    gatewayRestarts++
    if (gatewayRestarts <= MAX_GATEWAY_RESTARTS) {
      console.log(
        `[entrypoint] Gateway crashed (${gatewayRestarts}/${MAX_GATEWAY_RESTARTS}), restarting in ${RESTART_DELAY_MS}ms...`,
      )
      setTimeout(() => {
        startGateway(_healthServer)
      }, RESTART_DELAY_MS)
    } else {
      console.log('[entrypoint] Gateway exceeded max restarts, shutting down container')
      process.exit(code ?? 1)
    }
  })

  return proc
}

// ─── Signal Handling ────────────────────────────────────────────────────────

function setupSignalHandlers(proc) {
  const shutdown = (signal) => {
    console.log(`[entrypoint] Received ${signal}, shutting down...`)
    gatewayHealthy = false

    if (proc && !proc.killed) {
      proc.kill('SIGTERM')

      // Force kill after 10s
      setTimeout(() => {
        if (!proc.killed) {
          console.log('[entrypoint] Force killing gateway...')
          proc.kill('SIGKILL')
        }
        process.exit(0)
      }, 10_000)
    } else {
      process.exit(0)
    }
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('[entrypoint] Shadow Cloud OpenClaw Runner starting...')
  console.log(`[entrypoint] Agent: ${process.env.AGENT_ID ?? 'default'}`)
  console.log(`[entrypoint] Node: ${process.version}`)

  // 1. Load config
  const mountedConfig = loadMountedConfig()
  const runtimeExtensions = loadRuntimeExtensions()
  const baseConfig = generateOpenClawConfig(mountedConfig)
  const openclawConfig = mergeShadowPacks(baseConfig, runtimeExtensions)
  healthRequiresShadowChannel =
    isPlainObject(openclawConfig.channels?.shadowob) &&
    openclawConfig.channels.shadowob.enabled !== false
  const packInstructionChunks = Array.isArray(openclawConfig.__packInstructionChunks)
    ? openclawConfig.__packInstructionChunks
    : []
  delete openclawConfig.__packInstructionChunks

  // 2. Write config
  mkdirSync(OPENCLAW_STATE_DIR, { recursive: true })
  const configPath = join(OPENCLAW_STATE_DIR, 'openclaw.json')
  writeFileSync(configPath, JSON.stringify(openclawConfig, null, 2), 'utf-8')
  console.log(`[entrypoint] Config written to ${configPath}`)

  // 2b. Start live health server early. Readiness remains false until the
  // gateway has joined Shadow channel rooms.
  const healthServer = startHealthServer()

  // 2c. Ensure shared workspace directory exists
  if (SHARED_WORKSPACE_PATH) {
    mkdirSync(SHARED_WORKSPACE_PATH, { recursive: true })
    console.log(`[entrypoint] Shared workspace ready: ${SHARED_WORKSPACE_PATH}`)
  }

  // 2d. Run `openclaw setup` to initialize workspace with bootstrap files.
  // This seeds AGENTS.md, SOUL.md, IDENTITY.md, etc. from OpenClaw's internal templates.
  const workspaceDir =
    openclawConfig.agents?.defaults?.workspace ||
    SHARED_WORKSPACE_PATH ||
    join(OPENCLAW_STATE_DIR, 'workspace')
  mkdirSync(workspaceDir, { recursive: true })
  console.log(`[entrypoint] Initializing workspace: ${workspaceDir}`)
  const setupResult = spawnSync('openclaw', ['setup', '--workspace', workspaceDir], {
    env: { ...process.env, OPENCLAW_CONFIG_PATH: configPath, HOME: '/home/openclaw' },
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30000,
  })
  if (setupResult.status === 0) {
    console.log('[entrypoint] ✓ openclaw setup completed')
  } else {
    const stderr = setupResult.stderr?.toString().trim()
    console.warn(
      `[entrypoint] ⚠ openclaw setup exited ${setupResult.status}: ${stderr || '(no output)'}`,
    )
  }

  // 2e. Overlay workspace files from ConfigMap (SOUL.md, AGENTS.md, etc.)
  // These are agent-specific files generated by the cloud config builder that
  // override the default bootstrap files created by `openclaw setup`.
  const WORKSPACE_BOOTSTRAP_FILES = [
    'SOUL.md',
    'IDENTITY.md',
    'TOOLS.md',
    'AGENTS.md',
    'USER.md',
    'HEARTBEAT.md',
    'BOOTSTRAP.md',
  ]
  for (const filename of WORKSPACE_BOOTSTRAP_FILES) {
    const srcPath = join(CONFIG_MOUNT, filename)
    if (existsSync(srcPath)) {
      const destPath = join(workspaceDir, filename)
      try {
        writeFileSync(destPath, readFileSync(srcPath, 'utf-8'), 'utf-8')
        console.log(`[entrypoint] Wrote ${filename} to workspace`)
      } catch (err) {
        console.warn(`[entrypoint] Failed to write ${filename}: ${err.message}`)
      }
    }
  }

  // 2f. Write collected pack instructions to workspace file instead of embedding
  // them in openclaw.json (large files cause the gateway to crash on startup).
  if (packInstructionChunks.length > 0) {
    const packInstructionsPath = join(workspaceDir, 'PACK_INSTRUCTIONS.md')
    try {
      writeFileSync(packInstructionsPath, packInstructionChunks.join('\n\n'), 'utf-8')
      console.log(
        `[entrypoint] Wrote ${packInstructionChunks.length} pack instruction file(s) to PACK_INSTRUCTIONS.md`,
      )
    } catch (err) {
      console.warn(`[entrypoint] Failed to write PACK_INSTRUCTIONS.md: ${err.message}`)
    }
  }

  // 2g. Ensure skills directory exists
  if (SKILLS_DIR) {
    mkdirSync(SKILLS_DIR, { recursive: true })
    console.log(`[entrypoint] Skills directory ready: ${SKILLS_DIR}`)
  }

  // 3. Apply plugin-provided runtime metadata, then pre-stage plugin runtime deps
  // before chat traffic.
  applyRuntimeManifestPatches(runtimeExtensions)
  verifyExtensions()
  prepareWritableRuntimeDepsStage()
  warmBundledPluginRuntimeDeps(configPath)

  // 4. Start gateway
  const proc = startGateway(healthServer)

  // 5. Setup signal handlers
  setupSignalHandlers(proc)
}

main().catch((err) => {
  console.error('[entrypoint] Fatal error:', err)
  process.exit(1)
})
