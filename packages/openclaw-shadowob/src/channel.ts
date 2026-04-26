/**
 * Shadow channel plugin for OpenClaw.
 *
 * Built using the official SDK helpers:
 *   - createChannelPluginBase  — id + setup adapter
 *   - createChatChannelPlugin  — full channel plugin with all adapters
 *
 * See: https://docs.openclaw.ai/plugins/sdk-channel-plugins
 */

import { ShadowClient } from '@shadowob/sdk'
import type { ChannelGatewayContext, ChannelMessageActionContext } from 'openclaw/plugin-sdk'
import { createChatChannelPlugin, type OpenClawConfig } from 'openclaw/plugin-sdk/core'
import { DEFAULT_ACCOUNT_ID, getAccountConfig, listAccountIds } from './config.js'
import { parseTarget, shadowOutbound } from './outbound.js'
import type { ShadowAccountConfig } from './types.js'

// ─── Account Resolution ─────────────────────────────────────────────────────

function resolveAccount(cfg: OpenClawConfig, accountId?: string | null): ShadowAccountConfig {
  const account = getAccountConfig(cfg, accountId ?? DEFAULT_ACCOUNT_ID)
  if (!account) {
    return { token: '', serverUrl: 'https://shadowob.com', enabled: false }
  }
  return account
}

function inspectAccount(
  cfg: OpenClawConfig,
  accountId?: string | null,
): { enabled: boolean; configured: boolean; tokenStatus: string } {
  const account = getAccountConfig(cfg, accountId ?? DEFAULT_ACCOUNT_ID)
  return {
    enabled: account?.enabled !== false,
    configured: !!account?.token?.trim(),
    tokenStatus: account?.token?.trim() ? 'available' : 'missing',
  }
}

// ─── Message Tool Schema Helpers ───────────────────────────────────────────

type TypeBoxCompatibleSchema = Record<PropertyKey, unknown>

const TYPEBOX_KIND = Symbol.for('TypeBox.Kind')
const TYPEBOX_OPTIONAL = Symbol.for('TypeBox.Optional')

function typeboxSchema(kind: string, schema: Record<string, unknown>): TypeBoxCompatibleSchema {
  return Object.assign(schema, { [TYPEBOX_KIND]: kind })
}

function optionalSchema(schema: TypeBoxCompatibleSchema): TypeBoxCompatibleSchema {
  return Object.assign(schema, { [TYPEBOX_OPTIONAL]: 'Optional' })
}

function stringSchema(description?: string): TypeBoxCompatibleSchema {
  return typeboxSchema('String', {
    type: 'string',
    ...(description ? { description } : {}),
  })
}

function numberSchema(description?: string): TypeBoxCompatibleSchema {
  return typeboxSchema('Number', {
    type: 'number',
    ...(description ? { description } : {}),
  })
}

function booleanSchema(description?: string): TypeBoxCompatibleSchema {
  return typeboxSchema('Boolean', {
    type: 'boolean',
    ...(description ? { description } : {}),
  })
}

function literalSchema(value: string): TypeBoxCompatibleSchema {
  return typeboxSchema('Literal', { const: value, type: 'string' })
}

function enumSchema(values: readonly string[], description?: string): TypeBoxCompatibleSchema {
  return typeboxSchema('Union', {
    anyOf: values.map((value) => literalSchema(value)),
    ...(description ? { description } : {}),
  })
}

function arraySchema(
  items: TypeBoxCompatibleSchema,
  options: Record<string, unknown> = {},
): TypeBoxCompatibleSchema {
  return typeboxSchema('Array', { type: 'array', items, ...options })
}

function objectSchema(
  properties: Record<string, TypeBoxCompatibleSchema>,
  options: Record<string, unknown> = {},
): TypeBoxCompatibleSchema {
  const required = Object.entries(properties)
    .filter(([, schema]) => schema[TYPEBOX_OPTIONAL] !== 'Optional')
    .map(([key]) => key)

  return typeboxSchema('Object', {
    type: 'object',
    properties,
    required,
    ...options,
  })
}

const shadowInteractiveButtonSchema = objectSchema({
  id: stringSchema('Stable button id returned in the interaction response.'),
  label: stringSchema('Button text shown to the user.'),
  value: optionalSchema(stringSchema('Optional value returned when selected.')),
  style: optionalSchema(enumSchema(['primary', 'secondary', 'destructive'])),
})

const shadowInteractiveSelectOptionSchema = objectSchema({
  id: stringSchema('Stable option id returned in the interaction response.'),
  label: stringSchema('Option text shown to the user.'),
  value: stringSchema('Value returned when selected.'),
})

const shadowInteractiveFormFieldSchema = objectSchema({
  id: stringSchema('Stable field id returned in submitted values.'),
  kind: optionalSchema(enumSchema(['text', 'textarea', 'number', 'checkbox', 'select'])),
  type: optionalSchema(
    enumSchema(['text', 'textarea', 'number', 'checkbox', 'select'], 'Alias for kind.'),
  ),
  label: stringSchema('Field label shown to the user.'),
  placeholder: optionalSchema(stringSchema()),
  defaultValue: optionalSchema(stringSchema()),
  required: optionalSchema(booleanSchema()),
  options: optionalSchema(arraySchema(shadowInteractiveSelectOptionSchema, { maxItems: 20 })),
  maxLength: optionalSchema(numberSchema()),
  min: optionalSchema(numberSchema()),
  max: optionalSchema(numberSchema()),
})

const shadowMessageToolSchemaProperties = {
  prompt: optionalSchema(
    stringSchema('Prompt rendered inside a Shadow interactive block; usually match message.'),
  ),
  blockId: optionalSchema(stringSchema('Optional stable interactive block id.')),
  buttons: optionalSchema(arraySchema(shadowInteractiveButtonSchema, { maxItems: 8 })),
  options: optionalSchema(arraySchema(shadowInteractiveSelectOptionSchema, { maxItems: 20 })),
  fields: optionalSchema(arraySchema(shadowInteractiveFormFieldSchema, { maxItems: 12 })),
  submitLabel: optionalSchema(stringSchema('Submit button label for form dialogs.')),
  responsePrompt: optionalSchema(
    stringSchema('Instruction sent back to the Buddy when this form is submitted.'),
  ),
  approvalCommentLabel: optionalSchema(
    stringSchema('Optional comment label for approval dialogs.'),
  ),
  oneShot: optionalSchema(booleanSchema('Disable the dialog after one response.')),
  serverId: optionalSchema(
    stringSchema('Shadow server UUID or slug for server management actions.'),
  ),
  server_id: optionalSchema(stringSchema('snake_case alias for serverId.')),
  server: optionalSchema(stringSchema('Alias for serverId.')),
  html: optionalSchema(
    stringSchema('Homepage HTML for update-homepage; null resets via direct calls.'),
  ),
  homepageHtml: optionalSchema(stringSchema('Alias for html.')),
  homepage_html: optionalSchema(stringSchema('snake_case alias for html.')),
} satisfies Record<string, TypeBoxCompatibleSchema>

// ─── Interactive Message Helpers ───────────────────────────────────────────

const SHADOW_INTERACTIVE_KINDS = ['buttons', 'select', 'form', 'approval'] as const
type ShadowInteractiveKind = (typeof SHADOW_INTERACTIVE_KINDS)[number]

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readStringLike(value: unknown, trim = true): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'string') return trim ? value.trim() : value
  if (typeof value === 'number' || typeof value === 'boolean') {
    const stringValue = String(value)
    return trim ? stringValue.trim() : stringValue
  }
  return undefined
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    const stringValue = readStringLike(value)
    if (stringValue) return stringValue
  }
  return undefined
}

function readMessageTarget(params: Record<string, unknown>): string {
  return firstString(params.to, params.target, params.recipient, params.channelId) ?? ''
}

function normalizeInteractiveKind(value: unknown): ShadowInteractiveKind | undefined {
  const raw = readStringLike(value)?.toLowerCase()
  if (!raw) return undefined
  return SHADOW_INTERACTIVE_KINDS.includes(raw as ShadowInteractiveKind)
    ? (raw as ShadowInteractiveKind)
    : undefined
}

function normalizeButtonStyle(value: unknown): 'primary' | 'secondary' | 'destructive' | undefined {
  const raw = readStringLike(value)?.toLowerCase()
  if (raw === 'primary' || raw === 'secondary' || raw === 'destructive') return raw
  if (raw === 'danger') return 'destructive'
  return undefined
}

function normalizeButtonItems(value: unknown): Record<string, unknown>[] | undefined {
  if (!Array.isArray(value)) return undefined
  const items = value
    .filter(isRecord)
    .map((button, index) => {
      const label = firstString(
        button.label,
        button.text,
        button.title,
        button.value,
        `Option ${index + 1}`,
      )
      const id = firstString(button.id, button.actionId, button.value, label, `button_${index + 1}`)
      const normalized: Record<string, unknown> = { id, label }
      const value = readStringLike(button.value, false)
      const style = normalizeButtonStyle(button.style)
      if (value !== undefined) normalized.value = value
      if (style) normalized.style = style
      return normalized
    })
    .filter((button) => button.id && button.label)
  return items.length > 0 ? items : undefined
}

function normalizeSelectItems(value: unknown): Record<string, unknown>[] | undefined {
  if (!Array.isArray(value)) return undefined
  const items = value
    .filter(isRecord)
    .map((option, index) => {
      const label = firstString(
        option.label,
        option.text,
        option.title,
        option.value,
        `Option ${index + 1}`,
      )
      const value = firstString(option.value, option.id, label, `option_${index + 1}`)
      const id = firstString(option.id, value, `option_${index + 1}`)
      return { id, label, value }
    })
    .filter((option) => option.id && option.label && option.value)
  return items.length > 0 ? items : undefined
}

function normalizeFormFieldKind(value: unknown): string | undefined {
  const raw = readStringLike(value)?.toLowerCase()
  if (['text', 'textarea', 'number', 'checkbox', 'select'].includes(raw ?? '')) return raw
  return undefined
}

function normalizeFormFields(value: unknown): Record<string, unknown>[] | undefined {
  if (!Array.isArray(value)) return undefined
  const fields = value
    .filter(isRecord)
    .map((field, index) => {
      const label = firstString(field.label, field.name, field.id, `Field ${index + 1}`)
      const id = firstString(field.id, field.name, label, `field_${index + 1}`)
      const kind =
        normalizeFormFieldKind(field.kind) ?? normalizeFormFieldKind(field.type) ?? 'text'
      const normalized: Record<string, unknown> = { id, kind, label }

      for (const key of ['placeholder', 'defaultValue']) {
        const value = readStringLike(field[key], false)
        if (value !== undefined) normalized[key] = value
      }
      if (typeof field.required === 'boolean') normalized.required = field.required
      if (typeof field.maxLength === 'number') normalized.maxLength = field.maxLength
      if (typeof field.min === 'number') normalized.min = field.min
      if (typeof field.max === 'number') normalized.max = field.max
      const options = normalizeSelectItems(field.options)
      if (options) normalized.options = options
      return normalized
    })
    .filter((field) => field.id && field.kind && field.label)
  return fields.length > 0 ? fields : undefined
}

function resolveShadowInteractiveBlock(
  params: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const rawInteractive = isRecord(params.interactive) ? params.interactive : undefined
  const source =
    rawInteractive && normalizeInteractiveKind(rawInteractive.kind) ? rawInteractive : params

  let kind = normalizeInteractiveKind(source.kind)
  const buttons = normalizeButtonItems(source.buttons)
  const options = normalizeSelectItems(source.options)
  const fields = normalizeFormFields(source.fields)

  if (!kind) {
    if (fields) kind = 'form'
    else if (options) kind = 'select'
    else if (buttons) kind = 'buttons'
  }
  if (!kind) return undefined

  const prompt = firstString(source.prompt, source.message, source.content, source.text)
  const block: Record<string, unknown> = {
    id: firstString(source.blockId, source.id) ?? `ia_${Date.now().toString(36)}`,
    kind,
    ...(prompt ? { prompt } : {}),
  }

  if (buttons) block.buttons = buttons
  if (options) block.options = options
  if (fields) block.fields = fields

  const submitLabel = readStringLike(source.submitLabel)
  const responsePrompt = readStringLike(source.responsePrompt)
  const approvalCommentLabel = readStringLike(source.approvalCommentLabel)
  if (submitLabel) block.submitLabel = submitLabel
  if (responsePrompt) block.responsePrompt = responsePrompt
  if (approvalCommentLabel) block.approvalCommentLabel = approvalCommentLabel
  if (typeof source.oneShot === 'boolean') block.oneShot = source.oneShot

  return block
}

function validateApprovalMessageContent(
  content: string,
  interactiveBlock?: Record<string, unknown>,
): string | null {
  if (interactiveBlock?.kind !== 'approval') return null
  const trimmed = content.trim()
  const prompt = readStringLike(interactiveBlock.prompt)
  const normalized = trimmed.replace(/\s+/g, ' ')
  const normalizedPrompt = prompt?.replace(/\s+/g, ' ')
  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length >= 4 || trimmed.length >= 240) return null
  if (trimmed.length >= 180 && normalized !== normalizedPrompt) return null

  return [
    'approval dialogs must be attached to a visible proposal in the same message',
    'include the concrete roadmap, MVP scope, plan, or decision before asking for approval',
  ].join('; ')
}

async function sendShadowMessage(params: {
  client: ShadowClient
  to: string
  content: string
  threadId?: string
  replyToId?: string
  metadata?: Record<string, unknown>
}) {
  const { channelId, threadId: parsedThreadId } = parseTarget(params.to)
  const threadId = params.threadId ?? parsedThreadId

  if (threadId && params.metadata && !channelId) {
    throw new Error(
      'Interactive metadata requires a channel target; thread-only target is unsupported',
    )
  }

  if (threadId && channelId) {
    return params.client.sendMessage(channelId, params.content, {
      threadId,
      replyToId: params.replyToId,
      metadata: params.metadata,
    })
  }

  if (threadId) return params.client.sendToThread(threadId, params.content)

  if (channelId) {
    return params.client.sendMessage(channelId, params.content, {
      replyToId: params.replyToId,
      metadata: params.metadata,
    })
  }

  throw new Error('Could not resolve target channel or thread')
}

// ─── Channel Plugin ─────────────────────────────────────────────────────────

export const shadowPlugin = createChatChannelPlugin<ShadowAccountConfig>({
  base: {
    id: 'shadowob',

    meta: {
      id: 'shadowob',
      label: 'ShadowOwnBuddy',
      selectionLabel: 'ShadowOwnBuddy (Server)',
      docsPath: '/channels/shadowob',
      blurb: 'Shadow server channel integration — chat with AI agents in Shadow channels',
      aliases: ['shadow-server', 'openclaw-shadowob'],
    },

    capabilities: {
      chatTypes: ['channel', 'thread'],
      reactions: true,
      threads: true,
      media: true,
      reply: true,
      edit: true,
      unsend: true,
    },

    config: {
      listAccountIds: (cfg: OpenClawConfig): string[] => listAccountIds(cfg),

      inspectAccount,

      resolveAccount: (cfg: OpenClawConfig, accountId?: string | null): ShadowAccountConfig => {
        return resolveAccount(cfg, accountId)
      },

      defaultAccountId: (): string => DEFAULT_ACCOUNT_ID,

      isConfigured: (account: ShadowAccountConfig): boolean => {
        return !!account?.token?.trim()
      },

      isEnabled: (account: ShadowAccountConfig): boolean => {
        return account?.enabled !== false
      },

      describeAccount: (account: ShadowAccountConfig) => ({
        accountId: DEFAULT_ACCOUNT_ID,
        enabled: account?.enabled !== false,
        configured: !!account?.token?.trim(),
      }),
    },

    setup: {
      resolveAccountId: ({ accountId }) => accountId ?? DEFAULT_ACCOUNT_ID,
      applyAccountConfig: ({ cfg }) => cfg,
    },
  },

  // DM security: define allowlist-based DM policy
  security: {
    dm: {
      channelKey: 'shadowob',
      resolvePolicy: (account) => {
        // No DM policy field on ShadowAccountConfig currently — default to allowlist
        return undefined
      },
      resolveAllowFrom: (_account) => [],
      defaultPolicy: 'allowlist',
    },
  },

  // Threading: how replies are delivered (config-driven with fallback)
  threading: {
    topLevelReplyToMode: 'reply',
    resolveReplyToMode: ({ cfg }: { cfg: OpenClawConfig }) => {
      const shadow = (cfg.channels?.shadowob ?? cfg.channels?.['openclaw-shadowob']) as
        | Record<string, unknown>
        | undefined
      const mode = shadow?.replyToMode
      if (mode === 'first' || mode === 'all' || mode === 'off') return mode
      return 'first'
    },
  },

  // Outbound: send messages to the platform
  outbound: shadowOutbound,

  // ── Additional adapters (set directly on the plugin object) ──────────────

  // The createChatChannelPlugin helper builds the standard ChannelPlugin.
  // We extend it below with adapters that the helper doesn't cover.
})

// ── Extend with adapters not covered by createChatChannelPlugin ─────────────

/** Plugin metadata */
shadowPlugin.meta = {
  id: 'shadowob',
  label: 'ShadowOwnBuddy',
  selectionLabel: 'ShadowOwnBuddy (Server)',
  docsPath: '/channels/shadowob',
  blurb: 'Shadow server channel integration — chat with AI agents in Shadow channels',
  aliases: ['shadow-server', 'openclaw-shadowob'],
}

/** Supported chat capabilities */
shadowPlugin.capabilities = {
  chatTypes: ['channel', 'thread'],
  reactions: true,
  threads: true,
  media: true,
  reply: true,
  edit: true,
  unsend: true,
}

/** Auto-reload when shadow config changes */
shadowPlugin.reload = {
  configPrefixes: ['channels.shadowob'],
}

/** Default debounce */
shadowPlugin.defaults = {
  queue: { debounceMs: 500 },
}

/** Config schema */
shadowPlugin.configSchema = {
  schema: {
    type: 'object',
    properties: {
      token: { type: 'string', description: 'Agent JWT token' },
      serverUrl: { type: 'string', description: 'Shadow server URL' },
      enabled: { type: 'boolean' },
      accounts: {
        type: 'object',
        additionalProperties: {
          type: 'object',
          properties: {
            token: { type: 'string' },
            serverUrl: { type: 'string' },
            enabled: { type: 'boolean' },
          },
          required: ['token', 'serverUrl'],
        },
      },
    },
  },
  uiHints: {
    token: {
      label: 'Agent Token',
      sensitive: true,
      placeholder: 'Paste the JWT token generated in Shadow → Agents',
    },
    serverUrl: {
      label: 'Server URL',
      placeholder: 'https://shadowob.com',
    },
    enabled: {
      label: 'Enabled',
    },
  },
}

/** Agent prompt hints — injected into the AI's system prompt for the message tool */
shadowPlugin.agentPrompt = {
  messageToolHints: () => [
    '- When a Shadow user asks for buttons, choices, a select menu, a form, or approval, prefer sending a Shadow interactive dialog instead of plain text options.',
    '- Shadow interactive dialogs use the shared message tool with `action: "send"` plus `target`, `message`, `kind`, `prompt`, and shape fields. `message` is required by the shared tool; set `message` and `prompt` to the same user-visible text unless there is a specific reason not to. Supported `kind` values are `buttons`, `select`, `form`, and `approval`; Shadow stores these as `metadata.interactive` so the user can answer in-channel.',
    '- Example buttons dialog: `action: "send"`, `target: "shadowob:channel:<ChannelId>"`, `message: "Choose the next step"`, `kind: "buttons"`, `prompt: "Choose the next step"`, `buttons: [{"id":"icp","label":"ICP / JTBD","value":"icp"}]`.',
    '- Example form dialog: `action: "send"`, `target: "shadowob:channel:<ChannelId>"`, `message: "Fill the decision inputs"`, `kind: "form"`, `fields: [{"id":"decision","label":"Decision","kind":"textarea","required":true}]`.',
    '- Never use an `approval` dialog as a substitute for the proposal. Put the concrete roadmap, MVP scope, plan, or decision in `message` first; the approval block only locks that visible proposal.',
    '- Shadow server management: use `action: "get-server"` with `serverId` (slug or UUID) to fetch server info including homepage HTML.',
    '- Shadow homepage decoration: use `action: "update-homepage"` with `serverId` (slug or UUID) and `html` (full HTML string) to update the server\'s homepage. Set `html` to null to reset to default.',
    '- The server slug or ID is provided in the message context as ServerSlug/ServerId when the message originates from a Shadow channel.',
    '- When a user asks to customize/decorate the server homepage, first use `get-server` to see current state, then generate beautiful HTML and use `update-homepage` to apply it.',
  ],
}

/** Mention handling — strips @username patterns from incoming messages */
shadowPlugin.mentions = {
  stripPatterns: () => ['@[\\w-]+'],
}

/** Streaming defaults */
shadowPlugin.streaming = {
  blockStreamingCoalesceDefaults: { minChars: 1500, idleMs: 1000 },
}

/** Target normalization */
shadowPlugin.messaging = {
  normalizeTarget: (raw: string): string | undefined => {
    if (/^(shadowob|openclaw-shadowob):(channel|thread):.+$/i.test(raw)) return raw
    // UUID pattern
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) {
      return `shadowob:channel:${raw}`
    }
    return undefined
  },
  targetResolver: {
    looksLikeId: (raw: string): boolean =>
      /^(shadowob|openclaw-shadowob):(channel|thread):.+$/i.test(raw) ||
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw),
    hint: 'Provide a Shadow channel UUID or shadowob:channel:<uuid>',
  },
}

/** Status monitoring */
shadowPlugin.status = {
  defaultRuntime: {
    accountId: DEFAULT_ACCOUNT_ID,
    running: false,
    lastStartAt: null,
    lastStopAt: null,
    lastError: null,
  },

  probeAccount: async ({
    account,
    timeoutMs,
  }: {
    account: ShadowAccountConfig
    timeoutMs: number
  }): Promise<unknown> => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const client = new ShadowClient(account.serverUrl, account.token)
      const me = await client.getMe()
      return { ok: true, user: me }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    } finally {
      clearTimeout(timeout)
    }
  },

  buildAccountSnapshot: ({
    account,
    runtime,
    probe,
  }: {
    account: ShadowAccountConfig
    cfg: OpenClawConfig
    runtime?: {
      running?: boolean
      lastStartAt?: number | null
      lastStopAt?: number | null
      lastError?: string | null
    }
    probe?: unknown
  }) => ({
    accountId: DEFAULT_ACCOUNT_ID,
    enabled: account?.enabled !== false,
    configured: !!account?.token?.trim(),
    running: runtime?.running ?? false,
    lastStartAt: runtime?.lastStartAt ?? null,
    lastStopAt: runtime?.lastStopAt ?? null,
    lastError: runtime?.lastError ?? null,
    probe,
  }),

  buildChannelSummary: ({
    snapshot,
  }: {
    snapshot: {
      configured?: boolean
      running?: boolean
      lastStartAt?: number | null
      lastStopAt?: number | null
      lastError?: string | null
      probe?: unknown
    }
  }) => ({
    configured: snapshot.configured ?? false,
    running: snapshot.running ?? false,
    lastStartAt: snapshot.lastStartAt ?? null,
    lastStopAt: snapshot.lastStopAt ?? null,
    lastError: snapshot.lastError ?? null,
    probe: snapshot.probe,
  }),
}

/** Gateway adapter — manages Socket.IO connection lifecycle */
shadowPlugin.gateway = {
  startAccount: async (ctx: ChannelGatewayContext<ShadowAccountConfig>): Promise<void> => {
    const account = ctx.account
    const accountId = ctx.accountId

    ctx.setStatus({
      accountId,
      running: true,
      lastStartAt: Date.now(),
      lastError: null,
    })

    ctx.log?.info(`Starting Shadow connection for account ${accountId}`)

    const { monitorShadowProvider } = await import('./monitor.js')
    await monitorShadowProvider({
      account,
      accountId,
      config: ctx.cfg,
      runtime: {
        log: (msg: string) => ctx.log?.info(msg),
        error: (msg: string) => ctx.log?.error(msg),
      },
      abortSignal: ctx.abortSignal,
    })
  },

  stopAccount: async (ctx: ChannelGatewayContext<ShadowAccountConfig>): Promise<void> => {
    ctx.setStatus({
      accountId: ctx.accountId,
      running: false,
      lastStopAt: Date.now(),
    })

    ctx.log?.info(`Stopped Shadow connection for account ${ctx.accountId}`)
  },
}

// ── Actions adapter ─────────────────────────────────────────────────────────

/**
 * Supported message actions for the Shadow channel.
 * The shared OpenClaw message tool normalizes `target` for built-in actions.
 * Shadow interactive dialogs therefore ride on the built-in `send` action and
 * are translated here into `metadata.interactive` before delivery.
 */
const SHADOW_DISCOVERED_ACTIONS = [
  'send',
  'sendAttachment',
  'react',
  'edit',
  'delete',
  'update-homepage',
  'get-server',
] as const

const SHADOW_HANDLED_ACTIONS = [
  ...SHADOW_DISCOVERED_ACTIONS,
  'send-interactive',
  'get-connection-status',
] as const

shadowPlugin.actions = {
  describeMessageTool: () =>
    ({
      actions: [...SHADOW_DISCOVERED_ACTIONS],
      capabilities: ['interactive'],
      schema: {
        visibility: 'current-channel',
        properties: shadowMessageToolSchemaProperties,
      },
    }) as unknown as ReturnType<NonNullable<typeof shadowPlugin.actions>['describeMessageTool']>,

  messageActionTargetAliases: {
    'send-interactive': { aliases: ['recipient'] },
    'get-server': { aliases: ['serverId', 'server_id', 'server'] },
    'update-homepage': { aliases: ['serverId', 'server_id', 'server'] },
  } as Record<string, { aliases: string[] }>,

  supportsAction: ({ action }: { action: string }): boolean =>
    (SHADOW_HANDLED_ACTIONS as readonly string[]).includes(action),

  handleAction: async (ctx: ChannelMessageActionContext) => {
    const textResult = (value: Record<string, unknown>) => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(value),
        },
      ],
      details: value,
    })

    const account = getAccountConfig(ctx.cfg, ctx.accountId ?? DEFAULT_ACCOUNT_ID)
    if (!account) {
      return textResult({ ok: false, error: 'Shadow account not configured' })
    }

    const action = String(ctx.action)
    const { params } = ctx

    // send — normal Shadow messages, with optional top-level interactive fields.
    if (action === 'send') {
      try {
        const client = new ShadowClient(account.serverUrl, account.token)
        const to = readMessageTarget(params)
        if (!to) return textResult({ ok: false, error: 'target is required' })

        const interactiveBlock = resolveShadowInteractiveBlock(params)
        const content =
          firstString(params.message, params.content, params.text, params.caption, params.prompt) ??
          (interactiveBlock ? '[interactive]' : '')
        if (!content.trim() && !interactiveBlock) {
          return textResult({ ok: false, error: 'message is required' })
        }
        const approvalError = validateApprovalMessageContent(content, interactiveBlock)
        if (approvalError) return textResult({ ok: false, error: approvalError })

        const message = await sendShadowMessage({
          client,
          to,
          content: content.trim() ? content : '[interactive]',
          threadId: params.threadId as string | undefined,
          replyToId:
            (params.replyTo as string | undefined) ?? (params.replyToId as string | undefined),
          metadata: interactiveBlock ? { interactive: interactiveBlock } : undefined,
        })

        return textResult({
          ok: true,
          action: 'send',
          messageId: message.id,
          interactive: !!interactiveBlock,
          kind: interactiveBlock?.kind,
        })
      } catch (err) {
        return textResult({ ok: false, error: err instanceof Error ? err.message : String(err) })
      }
    }

    // sendAttachment — upload file with base64 buffer or URL fallback
    if (action === 'sendAttachment') {
      try {
        const client = new ShadowClient(account.serverUrl, account.token)
        const to = readMessageTarget(params)
        const text = (params.message as string) ?? (params.caption as string) ?? ''
        const filename = (params.filename as string) || 'file'
        const contentType =
          (params.contentType as string) ||
          (params.mimeType as string) ||
          'application/octet-stream'
        const base64Buffer = params.buffer as string | undefined
        const mediaUrl =
          (params.media as string) ?? (params.path as string) ?? (params.filePath as string) ?? ''

        const { channelId, threadId: parsedThreadId } = parseTarget(to)
        const threadId = (params.threadId as string) ?? parsedThreadId

        const content = text || '\u200B'
        let message: Awaited<ReturnType<typeof client.sendMessage>> | undefined
        if (threadId) {
          message = await client.sendToThread(threadId, content)
        } else if (channelId) {
          message = await client.sendMessage(channelId, content, {
            replyToId: params.replyTo as string | undefined,
          })
        } else {
          return textResult({
            ok: false,
            error: 'Could not resolve target channel or thread',
          })
        }

        if (base64Buffer) {
          const raw = base64Buffer.includes(',') ? (base64Buffer.split(',')[1] ?? '') : base64Buffer
          if (!raw) throw new Error('Invalid base64 attachment payload')
          const bytes = Buffer.from(raw, 'base64')
          const blob = new Blob([Uint8Array.from(bytes)], { type: contentType })
          await client.uploadMedia(blob, filename, contentType, message.id)
        } else if (mediaUrl) {
          await client.uploadMediaFromUrl(mediaUrl, message.id)
        } else {
          return textResult({
            ok: false,
            error: 'No buffer or media URL provided for attachment',
          })
        }

        return textResult({
          ok: true,
          action: 'sendAttachment',
          messageId: message.id,
          filename,
        })
      } catch (err) {
        return textResult({ ok: false, error: err instanceof Error ? err.message : String(err) })
      }
    }

    // send-interactive — post a message with metadata.interactive (buttons / select / form / approval)
    if (action === 'send-interactive') {
      try {
        const client = new ShadowClient(account.serverUrl, account.token)
        const to = readMessageTarget(params)
        const kind = (params.kind as string) ?? 'buttons'
        const prompt = (params.prompt as string) ?? (params.message as string) ?? ''
        if (!to) return textResult({ ok: false, error: 'target is required' })
        if (!['buttons', 'select', 'form', 'approval'].includes(kind)) {
          return textResult({ ok: false, error: `unsupported interactive kind: ${kind}` })
        }
        const block = resolveShadowInteractiveBlock({ ...params, kind, prompt })
        if (!block) return textResult({ ok: false, error: 'interactive block is required' })
        const blockId = String(block.id)
        const content = prompt && prompt.trim() ? prompt : '[interactive]'
        const approvalError = validateApprovalMessageContent(content, block)
        if (approvalError) return textResult({ ok: false, error: approvalError })
        const message = await sendShadowMessage({
          client,
          to,
          content,
          threadId: params.threadId as string | undefined,
          replyToId: params.replyTo as string | undefined,
          metadata: { interactive: block },
        })
        return textResult({
          ok: true,
          action: 'send-interactive',
          messageId: message.id,
          blockId,
          kind,
        })
      } catch (err) {
        return textResult({ ok: false, error: err instanceof Error ? err.message : String(err) })
      }
    }

    // react
    if (action === 'react') {
      const client = new ShadowClient(account.serverUrl, account.token)
      const messageId = (params.messageId as string) ?? (params.message_id as string) ?? ''
      const emoji = (params.emoji as string) ?? (params.reaction as string) ?? ''
      if (!messageId || !emoji) {
        return textResult({ ok: false, error: 'messageId and emoji are required' })
      }
      try {
        await client.addReaction(messageId, emoji)
        return textResult({ ok: true, action: 'react', messageId, emoji })
      } catch (err) {
        return textResult({ ok: false, error: String(err) })
      }
    }

    // edit
    if (action === 'edit') {
      const client = new ShadowClient(account.serverUrl, account.token)
      const messageId = (params.messageId as string) ?? (params.message_id as string) ?? ''
      const content = (params.message as string) ?? (params.content as string) ?? ''
      if (!messageId || !content) {
        return textResult({ ok: false, error: 'messageId and content are required' })
      }
      try {
        await client.editMessage(messageId, content)
        return textResult({ ok: true, action: 'edit', messageId })
      } catch (err) {
        return textResult({ ok: false, error: String(err) })
      }
    }

    // delete
    if (action === 'delete') {
      const client = new ShadowClient(account.serverUrl, account.token)
      const messageId = (params.messageId as string) ?? (params.message_id as string) ?? ''
      if (!messageId) {
        return textResult({ ok: false, error: 'messageId is required' })
      }
      try {
        await client.deleteMessage(messageId)
        return textResult({ ok: true, action: 'delete', messageId })
      } catch (err) {
        return textResult({ ok: false, error: String(err) })
      }
    }

    // pin / unpin — not yet supported
    if (action === 'pin' || action === 'unpin') {
      return textResult({ ok: false, error: `${action} is not yet supported for Shadow channels` })
    }

    // get-server — fetch server info
    if (action === 'get-server') {
      const serverId =
        (params.serverId as string) ??
        (params.server_id as string) ??
        (params.server as string) ??
        ''
      if (!serverId) {
        return textResult({ ok: false, error: 'serverId is required' })
      }
      try {
        const client = new ShadowClient(account.serverUrl, account.token)
        const server = await client.getServer(serverId)
        return textResult({ ok: true, action: 'get-server', server })
      } catch (err) {
        return textResult({ ok: false, error: String(err) })
      }
    }

    // update-homepage — update server homepage HTML
    if (action === 'update-homepage') {
      const serverId =
        (params.serverId as string) ??
        (params.server_id as string) ??
        (params.server as string) ??
        ''
      const html =
        (params.html as string) ??
        (params.homepageHtml as string) ??
        (params.homepage_html as string) ??
        null
      if (!serverId) {
        return textResult({ ok: false, error: 'serverId is required' })
      }
      try {
        const client = new ShadowClient(account.serverUrl, account.token)
        const result = await client.updateServerHomepage(serverId, html)
        return textResult({
          ok: true,
          action: 'update-homepage',
          serverId: result.id,
          slug: result.slug,
          homepageHtml: result.homepageHtml ? `(${result.homepageHtml.length} chars)` : null,
        })
      } catch (err) {
        return textResult({ ok: false, error: String(err) })
      }
    }

    // get-connection-status — probe all accounts
    if (action === 'get-connection-status') {
      const accountIds = listAccountIds(ctx.cfg)
      const results = await Promise.all(
        accountIds.map(async (id) => {
          const acc = getAccountConfig(ctx.cfg, id)
          if (!acc) return { accountId: id, configured: false, ok: false, error: 'not configured' }
          if (!acc.token?.trim())
            return { accountId: id, configured: false, ok: false, error: 'no token' }
          try {
            const client = new ShadowClient(acc.serverUrl, acc.token)
            const me = await client.getMe()
            return {
              accountId: id,
              configured: true,
              enabled: acc.enabled !== false,
              ok: true,
              serverUrl: acc.serverUrl,
              user: me,
            }
          } catch (err) {
            return {
              accountId: id,
              configured: true,
              enabled: acc.enabled !== false,
              ok: false,
              serverUrl: acc.serverUrl,
              error: err instanceof Error ? err.message : String(err),
            }
          }
        }),
      )
      return textResult({ ok: true, action: 'get-connection-status', accounts: results })
    }

    // Default: unsupported action
    return textResult({ ok: false, error: `Action ${action} not yet implemented` })
  },
}
