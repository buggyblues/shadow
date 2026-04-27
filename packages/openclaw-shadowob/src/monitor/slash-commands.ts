import fsPromises from 'node:fs/promises'
import type { ShadowClient } from '@shadowob/sdk'
import type { AgentChainMetadata, ShadowRuntimeLogger, ShadowSlashCommand } from '../types.js'

const SLASH_COMMAND_RE = /^\/([a-zA-Z][a-zA-Z0-9._-]{0,63})(?:\s+([\s\S]*))?$/

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
      ...(interaction ? { interaction } : {}),
    })
  }

  return commands.slice(0, 200)
}

function toPublicSlashCommands(commands: ShadowSlashCommand[]): ShadowSlashCommand[] {
  return commands.map(({ body: _body, ...command }) => command)
}

export async function loadLocalSlashCommands(runtime: ShadowRuntimeLogger) {
  const indexPath = process.env.SHADOW_SLASH_COMMANDS_PATH
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

function buildAgentChainMetadata(params: {
  agentId: string | null
  botUserId: string
  rootMessageId?: string
  prior?: AgentChainMetadata
}): AgentChainMetadata | undefined {
  if (!params.agentId) return undefined
  return {
    agentId: params.agentId,
    depth: (params.prior?.depth ?? 0) + 1,
    participants: [...(params.prior?.participants ?? []), params.botUserId].filter(Boolean),
    startedAt: params.prior?.startedAt ?? Date.now(),
    rootMessageId: params.prior?.rootMessageId ?? params.rootMessageId,
  }
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
  botUserId: string
  agentChain?: AgentChainMetadata
}) {
  const block = buildSlashCommandInteractiveBlock(params.match, params.messageId)
  if (!block) return false
  const content =
    block.prompt ?? `/${params.match.command.name} needs input before the Buddy can continue.`
  const agentChain = buildAgentChainMetadata({
    agentId: params.agentId,
    botUserId: params.botUserId,
    rootMessageId: params.messageId,
    prior: params.agentChain,
  })
  await params.client.sendMessage(params.channelId, content, {
    replyToId: params.messageId,
    threadId: params.threadId,
    metadata: {
      ...(agentChain ? { agentChain } : {}),
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
