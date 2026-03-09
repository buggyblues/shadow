/**
 * Shadow OpenClaw Plugin — Type Definitions
 *
 * These types mirror the OpenClaw plugin SDK interfaces needed by the Shadow
 * channel plugin. They are extracted from the OpenClaw ChannelPlugin spec so
 * the plugin can be developed independently and loaded at runtime by OpenClaw.
 */

// ─── OpenClaw Config ────────────────────────────────────────────────────────

/** OpenClaw root configuration object (opaque for external plugins). */
export type OpenClawConfig = Record<string, unknown> & {
  channels?: Record<string, unknown>
  session?: { store?: unknown }
}

// ─── Channel Plugin ─────────────────────────────────────────────────────────

export type ChannelId = string

export type ChannelMeta = {
  id: ChannelId
  label: string
  selectionLabel: string
  docsPath: string
  docsLabel?: string
  blurb: string
  order?: number
  aliases?: string[]
}

export type ChatType = 'direct' | 'channel' | 'group' | 'thread'

export type ChannelCapabilities = {
  chatTypes: Array<ChatType | 'thread'>
  polls?: boolean
  reactions?: boolean
  edit?: boolean
  unsend?: boolean
  reply?: boolean
  effects?: boolean
  groupManagement?: boolean
  threads?: boolean
  media?: boolean
  nativeCommands?: boolean
  blockStreaming?: boolean
}

export type ChannelAccountSnapshot = {
  accountId: string
  enabled?: boolean
  configured?: boolean
  running?: boolean
  lastStartAt?: number | null
  lastStopAt?: number | null
  lastError?: string | null
  probe?: unknown
  lastProbeAt?: number | null
}

export type ChannelLogSink = {
  info: (msg: string) => void
  warn: (msg: string) => void
  error: (msg: string) => void
  debug: (msg: string) => void
}

// ─── Adapter Types ──────────────────────────────────────────────────────────

export type ChannelConfigAdapter<ResolvedAccount> = {
  listAccountIds: (cfg: OpenClawConfig) => string[]
  resolveAccount: (cfg: OpenClawConfig, accountId?: string | null) => ResolvedAccount
  defaultAccountId?: (cfg: OpenClawConfig) => string
  isEnabled?: (account: ResolvedAccount, cfg: OpenClawConfig) => boolean
  isConfigured?: (account: ResolvedAccount, cfg: OpenClawConfig) => boolean | Promise<boolean>
  describeAccount?: (account: ResolvedAccount, cfg: OpenClawConfig) => ChannelAccountSnapshot
}

export type OutboundDeliveryResult = {
  ok: boolean
  error?: string
  messageId?: string
}

export type ChannelOutboundContext = {
  cfg: OpenClawConfig
  to: string
  text?: string
  mediaUrl?: string
  mediaUrls?: string[]
  accountId?: string
  replyToMessageId?: string
  threadId?: string
  [key: string]: unknown
}

export type ChannelOutboundAdapter = {
  deliveryMode: 'direct' | 'gateway' | 'hybrid'
  chunker?: ((text: string, limit: number) => string[]) | null
  chunkerMode?: 'text' | 'markdown'
  textChunkLimit?: number
  sendText?: (ctx: ChannelOutboundContext) => Promise<OutboundDeliveryResult>
  sendMedia?: (ctx: ChannelOutboundContext) => Promise<OutboundDeliveryResult>
}

export type RuntimeEnv = {
  log: (msg: string) => void
  error: (msg: string) => void
  [key: string]: unknown
}

export type ChannelGatewayContext<ResolvedAccount = unknown> = {
  cfg: OpenClawConfig
  accountId: string
  account: ResolvedAccount
  runtime: RuntimeEnv
  abortSignal: AbortSignal
  log?: ChannelLogSink
  getStatus: () => ChannelAccountSnapshot
  setStatus: (next: Partial<ChannelAccountSnapshot>) => void
  channelRuntime?: PluginRuntimeChannel
}

export type ChannelGatewayAdapter<ResolvedAccount = unknown> = {
  startAccount?: (ctx: ChannelGatewayContext<ResolvedAccount>) => Promise<unknown>
  stopAccount?: (ctx: ChannelGatewayContext<ResolvedAccount>) => Promise<void>
}

export type ChannelMentionAdapter = {
  stripPatterns?: (params: { ctx: unknown; cfg: OpenClawConfig; agentId?: string }) => string[]
  stripMentions?: (params: {
    text: string
    ctx: unknown
    cfg: OpenClawConfig
    agentId?: string
  }) => string
}

export type ChannelThreadingAdapter = {
  resolveReplyToMode?: (params: {
    cfg: OpenClawConfig
    accountId?: string
    chatType?: string
  }) => 'off' | 'first' | 'all'
  allowExplicitReplyTagsWhenOff?: boolean
}

export type ChannelStreamingAdapter = {
  blockStreamingCoalesceDefaults?: { minChars: number; idleMs: number }
}

export type ChannelMessagingAdapter = {
  normalizeTarget?: (raw: string) => string | undefined
  targetResolver?: { looksLikeId?: (raw: string) => boolean; hint?: string }
  formatTargetDisplay?: (params: { to: string; chatType: string }) => string
}

export type ChannelStatusAdapter<ResolvedAccount = unknown, Probe = unknown, Audit = unknown> = {
  defaultRuntime?: ChannelAccountSnapshot
  probeAccount?: (params: { account: ResolvedAccount; timeoutMs: number }) => Promise<Probe>
  buildAccountSnapshot?: (params: {
    account: ResolvedAccount
    cfg: OpenClawConfig
    runtime?: ChannelAccountSnapshot
    probe?: Probe
  }) => ChannelAccountSnapshot
  buildChannelSummary?: (params: { snapshot: ChannelAccountSnapshot }) => Record<string, unknown>
  collectStatusIssues?: (params: {
    cfg: OpenClawConfig
    accountId: string
  }) => Array<{ level: string; message: string }>
  auditAccount?: (params: { account: ResolvedAccount; cfg: OpenClawConfig }) => Promise<Audit>
}

export type ChannelConfigUiHint = {
  label?: string
  sensitive?: boolean
  placeholder?: string
  itemTemplate?: unknown
}

export type ChannelConfigSchema = {
  schema: Record<string, unknown>
  uiHints?: Record<string, ChannelConfigUiHint>
}

// ─── Plugin Interface ───────────────────────────────────────────────────────

export type ChannelPlugin<ResolvedAccount = unknown, Probe = unknown, Audit = unknown> = {
  id: ChannelId
  meta: ChannelMeta
  capabilities: ChannelCapabilities
  defaults?: { queue?: { debounceMs?: number } }
  reload?: { configPrefixes: string[]; noopPrefixes?: string[] }
  config: ChannelConfigAdapter<ResolvedAccount>
  configSchema?: ChannelConfigSchema
  outbound?: ChannelOutboundAdapter
  gateway?: ChannelGatewayAdapter<ResolvedAccount>
  mentions?: ChannelMentionAdapter
  threading?: ChannelThreadingAdapter
  streaming?: ChannelStreamingAdapter
  messaging?: ChannelMessagingAdapter
  status?: ChannelStatusAdapter<ResolvedAccount, Probe, Audit>
  [key: string]: unknown
}

// ─── Plugin API ─────────────────────────────────────────────────────────────

export type PluginRuntimeChannel = {
  text: {
    resolveMarkdownTableMode: (params: {
      cfg: OpenClawConfig
      channel: string
      accountId: string
    }) => string
    [key: string]: unknown
  }
  reply: {
    dispatchReplyWithBufferedBlockDispatcher: (params: {
      ctx: MsgContext
      cfg: OpenClawConfig
      dispatcherOptions: {
        deliver: (payload: ReplyPayload) => Promise<void>
        [key: string]: unknown
      }
      replyOptions?: Record<string, unknown>
    }) => Promise<unknown>
    finalizeInboundContext: (ctx: Partial<MsgContext>) => MsgContext
    formatAgentEnvelope: (params: {
      channel: string
      from: string
      timestamp?: number
      envelope: unknown
      body: string
    }) => string
    resolveEnvelopeFormatOptions: (cfg: OpenClawConfig) => unknown
    [key: string]: unknown
  }
  routing: {
    resolveAgentRoute: (params: {
      cfg: OpenClawConfig
      channel: string
      accountId: string
      peer: { kind: string; id: string }
    }) => { sessionKey: string; accountId: string; agentId: string; [key: string]: unknown }
    [key: string]: unknown
  }
  session: {
    resolveStorePath: (store: unknown, params: { agentId: string }) => string
    recordInboundSession: (params: {
      storePath: string
      sessionKey: string
      ctx: MsgContext
      onRecordError?: (err: unknown) => void
    }) => Promise<void>
    [key: string]: unknown
  }
  mentions: {
    buildMentionRegexes: (params: unknown) => RegExp[]
    matchesMentionPatterns: (params: unknown) => boolean
    [key: string]: unknown
  }
  debounce: {
    createInboundDebouncer: (params: unknown) => unknown
    resolveInboundDebounceMs: (params: unknown) => number
    [key: string]: unknown
  }
  [key: string]: unknown
}

export type PluginRuntime = {
  channel: PluginRuntimeChannel
  logging: {
    getChildLogger: (meta: Record<string, string>) => ChannelLogSink
    shouldLogVerbose: () => boolean
  }
  [key: string]: unknown
}

export type OpenClawPluginApi = {
  id: string
  name: string
  version?: string
  description?: string
  source: string
  config: OpenClawConfig
  pluginConfig?: Record<string, unknown>
  runtime: PluginRuntime
  logger: ChannelLogSink
  registerChannel: (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registration: { plugin: ChannelPlugin<any> } | ChannelPlugin<any>,
  ) => void
  registerTool?: (tool: unknown, opts?: unknown) => void
  registerHook?: (events: string | string[], handler: unknown, opts?: unknown) => void
  [key: string]: unknown
}

export type OpenClawPluginDefinition = {
  id?: string
  name?: string
  description?: string
  version?: string
  configSchema?: {
    safeParse?: (v: unknown) => { success: boolean; data?: unknown; error?: unknown }
    jsonSchema?: Record<string, unknown>
    [key: string]: unknown
  }
  register?: (api: OpenClawPluginApi) => void | Promise<void>
}

// ─── Message Context ────────────────────────────────────────────────────────

export type MsgContext = {
  Body?: string
  BodyForAgent?: string
  RawBody?: string
  CommandBody?: string
  BodyForCommands?: string
  From?: string
  To?: string
  SessionKey?: string
  AccountId?: string
  MessageSid?: string
  ChatType?: string
  ConversationLabel?: string
  SenderName?: string
  SenderId?: string
  SenderUsername?: string
  Provider?: string
  Surface?: string
  WasMentioned?: boolean
  CommandAuthorized?: boolean
  OriginatingChannel?: string
  OriginatingTo?: string
  ThreadId?: string
  ReplyToId?: string
  [key: string]: unknown
}

export type ReplyPayload = {
  text?: string
  mediaUrl?: string
  mediaUrls?: string[]
  isError?: boolean
  isReasoning?: boolean
  channelData?: Record<string, unknown>
}

// ─── Shadow-Specific Types ──────────────────────────────────────────────────

export interface ShadowAccountConfig {
  /** Agent JWT token for authenticating with Shadow API */
  token: string
  /** Shadow server base URL (default: https://shadowob.com) */
  serverUrl: string
  /** Agent ID for heartbeat reporting (auto-resolved from /api/auth/me) */
  agentId?: string
  /** Whether this account is enabled */
  enabled?: boolean
}

/** Policy for a single channel (returned from the server) */
export interface ShadowChannelPolicy {
  listen: boolean
  reply: boolean
  mentionOnly: boolean
  config: Record<string, unknown>
}

/** Channel info with policy (from remote config) */
export interface ShadowRemoteChannel {
  id: string
  name: string
  type: string
  policy: ShadowChannelPolicy
}

/** Server info with channels (from remote config) */
export interface ShadowRemoteServer {
  id: string
  name: string
  slug?: string
  iconUrl?: string | null
  defaultPolicy: ShadowChannelPolicy
  channels: ShadowRemoteChannel[]
}

/** Full remote config returned by GET /api/agents/:id/config */
export interface ShadowRemoteConfig {
  agentId: string
  botUserId: string
  servers: ShadowRemoteServer[]
}

export interface ShadowMessage {
  id: string
  content: string
  channelId: string
  authorId: string
  threadId?: string | null
  replyToId?: string | null
  isPinned?: boolean
  createdAt: string
  updatedAt: string
  author?: {
    id: string
    username: string
    displayName?: string | null
    avatarUrl?: string | null
    isBot?: boolean
  }
  attachments?: {
    id: string
    filename: string
    url: string
    contentType: string
    size: number
    width?: number | null
    height?: number | null
  }[]
}

export interface ShadowChannel {
  id: string
  name: string
  type: string
  serverId: string
}
