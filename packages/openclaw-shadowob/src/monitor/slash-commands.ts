import fsPromises from 'node:fs/promises'
import type { ShadowClient } from '@shadowob/sdk'
import type { ShadowRuntimeLogger, ShadowSlashCommand } from '../types.js'

const SLASH_COMMAND_RE = /^\/([a-zA-Z][a-zA-Z0-9._-]{0,63})(?:\s+([\s\S]*))?$/
const DEFAULT_SLASH_COMMANDS_PATH = '/etc/shadowob/slash-commands.json'

export type ShadowSlashCommandMatch = {
  command: ShadowSlashCommand
  invokedName: string
  args: string
}

function normalizeSlashCommandName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const name = value.trim().replace(/^\/+/, '')
  return /^[a-zA-Z][a-zA-Z0-9._-]{0,63}$/.test(name) ? name : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readString(value: unknown, max = 2000): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined
}

function normalizeInteractionItems(
  value: unknown,
  max: number,
):
  | Array<{
      id: string
      label: string
      value?: string
      style?: 'primary' | 'secondary' | 'destructive'
    }>
  | undefined {
  if (!Array.isArray(value)) return undefined
  const items = value
    .filter(isRecord)
    .map((item, index) => {
      const label =
        readString(item.label, 120) ?? readString(item.value, 120) ?? `Option ${index + 1}`
      const id = readString(item.id, 80) ?? readString(item.value, 80) ?? label
      const itemValue = readString(item.value, 2048)
      const rawStyle = readString(item.style, 40)
      const style: 'primary' | 'secondary' | 'destructive' | undefined =
        rawStyle === 'primary' || rawStyle === 'secondary' || rawStyle === 'destructive'
          ? rawStyle
          : undefined
      return {
        id,
        label,
        ...(itemValue ? { value: itemValue } : {}),
        ...(style ? { style } : {}),
      }
    })
    .filter((item) => item.id && item.label)
  return items.length > 0 ? items.slice(0, max) : undefined
}

function normalizeSlashInteraction(value: unknown): ShadowSlashCommand['interaction'] | undefined {
  if (!isRecord(value)) return undefined
  const kind = readString(value.kind, 20)
  if (kind !== 'buttons' && kind !== 'select' && kind !== 'form' && kind !== 'approval') {
    return undefined
  }

  const interaction: NonNullable<ShadowSlashCommand['interaction']> = { kind }
  const id = readString(value.id, 120)
  const prompt = readString(value.prompt)
  const submitLabel = readString(value.submitLabel, 40)
  const responsePrompt = readString(value.responsePrompt)
  const approvalCommentLabel = readString(value.approvalCommentLabel, 120)
  if (id) interaction.id = id
  if (prompt) interaction.prompt = prompt
  if (submitLabel) interaction.submitLabel = submitLabel
  if (responsePrompt) interaction.responsePrompt = responsePrompt
  if (approvalCommentLabel) interaction.approvalCommentLabel = approvalCommentLabel
  if (typeof value.oneShot === 'boolean') interaction.oneShot = value.oneShot
  const buttons = normalizeInteractionItems(value.buttons, 8)
  const options = normalizeInteractionItems(value.options, 20)?.map((option) => ({
    id: option.id,
    label: option.label,
    value: option.value ?? option.id,
  }))
  if (buttons) interaction.buttons = buttons
  if (options) interaction.options = options

  if (Array.isArray(value.fields)) {
    const fields = value.fields.filter(isRecord).flatMap((field, index) => {
      const fieldKind = readString(field.kind, 20) ?? readString(field.type, 20) ?? 'text'
      if (!['text', 'textarea', 'number', 'checkbox', 'select'].includes(fieldKind)) return []
      const normalizedField = {
        id: readString(field.id, 80) ?? readString(field.name, 80) ?? `field_${index + 1}`,
        kind: fieldKind as 'text' | 'textarea' | 'number' | 'checkbox' | 'select',
        label: readString(field.label, 120) ?? readString(field.name, 120) ?? `Field ${index + 1}`,
        ...(readString(field.placeholder, 200)
          ? { placeholder: readString(field.placeholder, 200) }
          : {}),
        ...(readString(field.defaultValue, 2048)
          ? { defaultValue: readString(field.defaultValue, 2048) }
          : {}),
        ...(typeof field.required === 'boolean' ? { required: field.required } : {}),
        ...(typeof field.maxLength === 'number' ? { maxLength: field.maxLength } : {}),
        ...(typeof field.min === 'number' ? { min: field.min } : {}),
        ...(typeof field.max === 'number' ? { max: field.max } : {}),
      }
      const fieldOptions = normalizeInteractionItems(field.options, 20)?.map((option) => ({
        id: option.id,
        label: option.label,
        value: option.value ?? option.id,
      }))
      return [{ ...normalizedField, ...(fieldOptions ? { options: fieldOptions } : {}) }]
    })
    if (fields.length > 0) interaction.fields = fields.slice(0, 12)
  }

  return interaction
}

export function normalizeShadowSlashCommands(input: unknown): ShadowSlashCommand[] {
  if (!Array.isArray(input)) return []
  const seen = new Set<string>()
  const commands: ShadowSlashCommand[] = []

  for (const item of input) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const record = item as Record<string, unknown>
    const name = normalizeSlashCommandName(record.name)
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)

    const aliases = Array.isArray(record.aliases)
      ? [
          ...new Set(
            record.aliases
              .map(normalizeSlashCommandName)
              .filter((alias): alias is string => Boolean(alias)),
          ),
        ].filter((alias) => alias.toLowerCase() !== key)
      : undefined
    const interaction = normalizeSlashInteraction(record.interaction)
    const dispatch = readString(record.dispatch, 40)

    commands.push({
      name,
      ...(typeof record.description === 'string' && record.description.trim()
        ? { description: record.description.trim().slice(0, 240) }
        : {}),
      ...(aliases && aliases.length > 0 ? { aliases } : {}),
      ...(typeof record.packId === 'string' && record.packId.trim()
        ? { packId: record.packId.trim().slice(0, 80) }
        : {}),
      ...(typeof record.sourcePath === 'string' && record.sourcePath.trim()
        ? { sourcePath: record.sourcePath.trim().slice(0, 500) }
        : {}),
      ...(typeof record.body === 'string' && record.body.trim()
        ? { body: record.body.trim().slice(0, 20_000) }
        : {}),
      ...(dispatch === 'agent' || dispatch === 'passthrough' ? { dispatch } : {}),
      ...(interaction ? { interaction } : {}),
    })
  }

  return commands.slice(0, 200)
}

function toPublicSlashCommands(commands: ShadowSlashCommand[]): ShadowSlashCommand[] {
  return commands.map(({ body: _body, dispatch: _dispatch, ...command }) => command)
}

async function fileExists(path: string) {
  try {
    await fsPromises.access(path)
    return true
  } catch {
    return false
  }
}

async function loadSlashCommandFile(indexPath: string, runtime: ShadowRuntimeLogger) {
  if (!indexPath) return []
  try {
    const raw = await fsPromises.readFile(indexPath, 'utf-8')
    const commands = normalizeShadowSlashCommands(JSON.parse(raw))
    runtime.log?.(`[slash] Loaded ${commands.length} command(s) from ${indexPath}`)
    return commands
  } catch (err) {
    runtime.error?.(`[slash] Failed to load command index: ${String(err)}`)
    return []
  }
}

function logDuplicateSlashCommands(
  sources: Array<{ path: string; commands: ShadowSlashCommand[] }>,
  runtime: ShadowRuntimeLogger,
) {
  const owners = new Map<string, string>()
  for (const source of sources) {
    for (const command of source.commands) {
      const key = command.name.toLowerCase()
      const existingPath = owners.get(key)
      if (existingPath) {
        runtime.log?.(
          `[slash] Ignoring duplicate command /${command.name} from ${source.path}; already defined by ${existingPath}`,
        )
        continue
      }
      owners.set(key, source.path)
    }
  }
}

async function runtimeExtensionSlashCommandPaths(runtime: ShadowRuntimeLogger) {
  const candidates = [
    process.env.SHADOW_RUNTIME_EXTENSIONS_PATH,
    process.env.OPENCLAW_RUNTIME_EXTENSIONS_PATH,
    '/etc/shadowob/runtime-extensions.json',
    '/etc/openclaw/runtime-extensions.json',
  ].filter((path): path is string => Boolean(path))
  const paths: string[] = []

  for (const manifestPath of [...new Set(candidates)]) {
    if (!(await fileExists(manifestPath))) continue
    try {
      const raw = await fsPromises.readFile(manifestPath, 'utf-8')
      const manifest = JSON.parse(raw) as { artifacts?: unknown }
      const artifacts = Array.isArray(manifest.artifacts) ? manifest.artifacts : []
      for (const artifact of artifacts) {
        if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) continue
        const record = artifact as Record<string, unknown>
        if (record.kind === 'shadow.slashCommands' && typeof record.path === 'string') {
          paths.push(record.path)
        }
      }
    } catch (err) {
      runtime.error?.(`[slash] Failed to read runtime extensions ${manifestPath}: ${String(err)}`)
    }
  }

  return paths
}

export async function loadLocalSlashCommands(runtime: ShadowRuntimeLogger) {
  const indexPath = process.env.SHADOW_SLASH_COMMANDS_PATH
  return indexPath ? loadSlashCommandFile(indexPath, runtime) : []
}

export async function loadShadowSlashCommands(runtime: ShadowRuntimeLogger) {
  const defaultIndexPath =
    process.env.SHADOW_DEFAULT_SLASH_COMMANDS_PATH || DEFAULT_SLASH_COMMANDS_PATH
  const paths = [
    defaultIndexPath,
    process.env.SHADOW_SLASH_COMMANDS_PATH,
    ...(await runtimeExtensionSlashCommandPaths(runtime)),
  ].filter((path): path is string => Boolean(path))
  const seenPaths = [...new Set(paths)]
  const existingPaths = (
    await Promise.all(seenPaths.map(async (path) => ((await fileExists(path)) ? path : null)))
  ).filter((path): path is string => Boolean(path))
  const sources = await Promise.all(
    existingPaths.map(async (path) => ({
      path,
      commands: await loadSlashCommandFile(path, runtime),
    })),
  )
  logDuplicateSlashCommands(sources, runtime)
  const merged = normalizeShadowSlashCommands(sources.flatMap((source) => source.commands))
  if (existingPaths.length > 1) {
    runtime.log?.(
      `[slash] Merged ${merged.length} slash command(s) from ${existingPaths.length} source(s)`,
    )
  }
  return merged
}

export async function registerAgentSlashCommands(params: {
  account: { serverUrl: string; token: string }
  agentId: string
  commands: ShadowSlashCommand[]
}) {
  const baseUrl = params.account.serverUrl.replace(/\/api\/?$/, '').replace(/\/$/, '')
  const response = await fetch(`${baseUrl}/api/agents/${params.agentId}/slash-commands`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${params.account.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ commands: toPublicSlashCommands(params.commands) }),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(`Shadow slash command registry failed (${response.status}): ${errorText}`)
  }
}

export function matchShadowSlashCommand(
  content: string,
  commands: ShadowSlashCommand[],
): ShadowSlashCommandMatch | null {
  const match = content.trim().match(SLASH_COMMAND_RE)
  if (!match) return null
  const invokedName = match[1]!
  const args = match[2]?.trim() ?? ''
  const invokedKey = invokedName.toLowerCase()
  const command = commands.find((candidate) => {
    if (candidate.name.toLowerCase() === invokedKey) return true
    return (candidate.aliases ?? []).some((alias) => alias.toLowerCase() === invokedKey)
  })
  return command ? { command, invokedName, args } : null
}

export function formatSlashCommandPrompt(
  originalBody: string,
  match: ShadowSlashCommandMatch,
): string {
  const chunks = [
    `Slash command /${match.command.name} was invoked.`,
    match.command.description ? `Description: ${match.command.description}` : '',
    match.command.packId ? `Pack: ${match.command.packId}` : '',
    `Arguments:\n${match.args || '(none)'}`,
    match.command.body ? `Command definition:\n${match.command.body}` : '',
    `Original message:\n${originalBody}`,
  ].filter(Boolean)

  return chunks.join('\n\n')
}

function buildSlashCommandInteractiveBlock(match: ShadowSlashCommandMatch, messageId: string) {
  const interaction = match.command.interaction
  if (!interaction) return undefined
  return {
    ...interaction,
    id:
      interaction.id && interaction.id.trim()
        ? `${interaction.id}:${messageId}`
        : `slash:${match.command.packId ?? 'pack'}:${match.command.name}:${messageId}`,
  }
}

export async function sendSlashCommandInteractivePrompt(params: {
  match: ShadowSlashCommandMatch
  messageId: string
  channelId: string
  threadId?: string
  client: ShadowClient
  runtime: ShadowRuntimeLogger
  agentId: string | null
  buddyUserId: string
}) {
  const block = buildSlashCommandInteractiveBlock(params.match, params.messageId)
  if (!block) return false
  const content =
    block.prompt ?? `/${params.match.command.name} needs input before the Buddy can continue.`
  await params.client.sendMessage(params.channelId, content, {
    replyToId: params.messageId,
    threadId: params.threadId,
    metadata: {
      interactive: block,
      slashCommand: {
        name: params.match.command.name,
        invokedName: params.match.invokedName,
        args: params.match.args,
        packId: params.match.command.packId,
      },
    },
  })
  params.runtime.log?.(
    `[slash] Sent interactive prompt for /${params.match.command.name} (${block.kind})`,
  )
  return true
}
