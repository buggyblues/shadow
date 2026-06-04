import type {
  ShadowInboxTaskInput,
  ShadowServerAppActorProfile,
  ShadowServerAppManifest,
  ShadowServerAppTokenIntrospection,
} from './types'

export type ShadowServerAppFetch = typeof fetch

export interface ShadowServerAppCommandContext {
  protocol: 'shadow.app/1'
  serverId: string
  serverAppId: string
  appKey: string
  command: string
  actor: {
    kind: string
    userId: string | null
    buddyAgentId?: string | null
    ownerId?: string | null
    profile?: ShadowServerAppActorProfile | null
  }
  channelId?: string | null
  task?: {
    messageId: string
    cardId: string
    claimId?: string | null
    channelId?: string | null
    workspaceId?: string | null
    scopes?: string[]
  }
  permission: string
  action: string
  dataClass: string
}

export interface ShadowServerAppCommandEnvelope<T = unknown> {
  input: T
  context: ShadowServerAppCommandContext
}

export const SHADOW_SERVER_APP_PROTOCOL = 'shadow.app/1' as const
export const SHADOW_SERVER_APP_COMMAND_COMPLETED_EVENT = 'server_app.command.completed' as const
export const SHADOW_SERVER_APP_COMMAND_FAILED_EVENT = 'server_app.command.failed' as const
export const SHADOW_SERVER_APP_COMMAND_EVENTS = [
  SHADOW_SERVER_APP_COMMAND_COMPLETED_EVENT,
  SHADOW_SERVER_APP_COMMAND_FAILED_EVENT,
] as const

export type ShadowServerAppCommandEventType = (typeof SHADOW_SERVER_APP_COMMAND_EVENTS)[number]

export type ShadowServerAppInboxTaskPriority = 'low' | 'normal' | 'high' | 'urgent'

export interface ShadowServerAppInboxTaskResource {
  kind: string
  id: string
  label?: string
  url?: string
  [key: string]: unknown
}

export interface ShadowServerAppInboxTaskOutbox {
  title: string
  body?: string
  priority?: ShadowServerAppInboxTaskPriority
  tags?: ShadowInboxTaskInput['tags']
  agentId?: string
  agentUserId?: string
  assigneeLabel?: string
  idempotencyKey?: string
  resource?: ShadowServerAppInboxTaskResource
  data?: Record<string, unknown>
  required?: boolean
}

export interface ShadowServerAppInboxDelivery {
  agentId?: string
  agentUserId?: string
  channelId?: string
  messageId?: string
  cardId?: string | null
  taskId?: string | null
  pendingId?: string | null
  idempotencyKey?: string
  error?: string
}

export interface ShadowServerAppInboxDeliveryError {
  agentId?: string
  agentUserId?: string
  assigneeLabel?: string
  title?: string
  error: string
}

export interface ShadowServerAppChannelMessageOutbox {
  content: string
  channelId?: string
  channelName?: string
  metadata?: Record<string, unknown>
  idempotencyKey?: string
}

export interface ShadowServerAppChannelMessageDelivery {
  channelId: string
  messageId: string
  idempotencyKey?: string
}

export interface ShadowServerAppChannelMessageDeliveryError {
  channelId?: string
  channelName?: string
  idempotencyKey?: string
  error: string
}

export type ShadowServerAppInboxTarget =
  | {
      agentId: string
      channelId?: string
    }
  | {
      channelId: string
      agentId?: string
    }

export interface ShadowServerAppOutboxPayload {
  inboxTasks?: ShadowServerAppInboxTaskOutbox[]
  channelMessages?: ShadowServerAppChannelMessageOutbox[]
  deliveries?: ShadowServerAppInboxDelivery[]
  errors?: ShadowServerAppInboxDeliveryError[]
  channelMessageDeliveries?: ShadowServerAppChannelMessageDelivery[]
  channelMessageErrors?: ShadowServerAppChannelMessageDeliveryError[]
}

export interface ShadowServerAppResultShadow {
  protocol: typeof SHADOW_SERVER_APP_PROTOCOL
  outbox?: ShadowServerAppOutboxPayload
}

export type ShadowServerAppResultWithShadow<TResult extends Record<string, unknown>> = TResult & {
  shadow?: ShadowServerAppResultShadow
}

export interface ShadowServerAppCommandSuccessResponse<TResult = unknown> {
  ok: true
  result: TResult
  shadow?: ShadowServerAppResultShadow
}

export interface ShadowServerAppCommandFailureResponse {
  ok: false
  error: string
  issues?: ShadowServerAppValidationIssue[] | unknown
}

export type ShadowServerAppCommandResponse<TResult = unknown> =
  | ShadowServerAppCommandSuccessResponse<TResult>
  | ShadowServerAppCommandFailureResponse

export interface ShadowServerAppBridgeCommandRequest {
  type: 'shadow.app.command.request'
  requestId: string
  appKey?: string
  commandName: string
  input?: unknown
  channelId?: string
  task?: {
    messageId: string
    cardId: string
    claimId?: string
  }
}

export interface ShadowServerAppBridgeInboxesRequest {
  type: 'shadow.app.inboxes.request'
  requestId: string
  appKey?: string
}

export interface ShadowServerAppBridgeEnqueueInboxTaskRequest {
  type: 'shadow.app.inbox.enqueue.request'
  requestId: string
  appKey?: string
  target: ShadowServerAppInboxTarget
  task: ShadowServerAppInboxTaskOutbox
}

export type ShadowServerAppBridgeRequest =
  | ShadowServerAppBridgeCommandRequest
  | ShadowServerAppBridgeInboxesRequest
  | ShadowServerAppBridgeEnqueueInboxTaskRequest

export interface ShadowServerAppHostAppRef {
  id?: string | null
  appId?: string | null
  appKey: string
  serverId?: string | null
  name?: string | null
  label?: string | null
  iconUrl?: string | null
}

export interface ShadowServerAppHostInboxTaskRequestInput {
  serverIdOrSlug: string
  target: ShadowServerAppInboxTarget
  task: ShadowServerAppInboxTaskOutbox
  app: ShadowServerAppHostAppRef
  commandName?: string
}

export interface ShadowServerAppResolvedInboxTaskRequest {
  endpoint: string
  body: ShadowInboxTaskInput
}

export interface ShadowServerAppInboxDeliveryFromMessageInput {
  target: ShadowServerAppInboxTarget
  message: unknown
  idempotencyKey?: string
}

export type ShadowServerAppBridgeResponseType =
  | 'shadow.app.command.response'
  | 'shadow.app.inboxes.response'
  | 'shadow.app.inbox.enqueue.response'

export interface ShadowServerAppBridgeSuccessResponse<TResult = unknown> {
  type: ShadowServerAppBridgeResponseType
  requestId: string
  ok: true
  result: TResult
}

export interface ShadowServerAppBridgeFailureResponse {
  type: ShadowServerAppBridgeResponseType
  requestId: string
  ok: false
  error: string
}

export type ShadowServerAppBridgeResponse<TResult = unknown> =
  | ShadowServerAppBridgeSuccessResponse<TResult>
  | ShadowServerAppBridgeFailureResponse

function isProtocolRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function optionalProtocolString(value: unknown) {
  return typeof value === 'string' && value ? value : undefined
}

function protocolPathSegment(value: string) {
  return encodeURIComponent(value)
}

export function shadowServerAppInboxTaskEndpoint(
  serverIdOrSlug: string,
  target: ShadowServerAppInboxTarget,
) {
  if ('channelId' in target && target.channelId) {
    return `/api/channels/${protocolPathSegment(target.channelId)}/inbox/tasks`
  }
  if ('agentId' in target && target.agentId) {
    return `/api/servers/${protocolPathSegment(serverIdOrSlug)}/inboxes/${protocolPathSegment(
      target.agentId,
    )}/tasks`
  }
  throw new Error('Missing Inbox task target')
}

export function buildShadowServerAppInboxTaskRequest(
  input: ShadowServerAppHostInboxTaskRequestInput,
): ShadowServerAppResolvedInboxTaskRequest {
  const appId = input.app.id ?? input.app.appId ?? input.app.appKey
  const serverAppData = isProtocolRecord(input.task.data?.serverApp)
    ? input.task.data.serverApp
    : {}
  return {
    endpoint: shadowServerAppInboxTaskEndpoint(input.serverIdOrSlug, input.target),
    body: {
      title: input.task.title,
      body: input.task.body,
      priority: input.task.priority,
      tags: input.task.tags,
      idempotencyKey: input.task.idempotencyKey,
      app: {
        id: appId,
        appId,
        appKey: input.app.appKey,
        name: input.app.name ?? input.app.label ?? input.app.appKey,
        label: input.app.label ?? input.app.name ?? input.app.appKey,
        ...(input.app.iconUrl ? { iconUrl: input.app.iconUrl } : {}),
      },
      source: {
        kind: 'server_app',
        id: appId,
        appId,
        appKey: input.app.appKey,
        ...(input.app.name ? { appName: input.app.name } : {}),
        ...(input.app.iconUrl ? { iconUrl: input.app.iconUrl } : {}),
        ...(input.app.serverId ? { serverId: input.app.serverId } : {}),
        ...(input.commandName ? { command: input.commandName } : {}),
        label: input.app.label ?? input.app.name ?? input.app.appKey,
        ...(input.task.resource ? { resource: input.task.resource } : {}),
      },
      data: {
        ...(input.task.data ?? {}),
        serverApp: {
          ...serverAppData,
          appKey: input.app.appKey,
          name: input.app.name ?? input.app.label ?? input.app.appKey,
          label: input.app.label ?? input.app.name ?? input.app.appKey,
          ...(input.app.iconUrl ? { iconUrl: input.app.iconUrl } : {}),
          ...(input.commandName ? { command: input.commandName } : {}),
        },
      },
    },
  }
}

export function getShadowServerAppTaskCardId(message: unknown): string | null {
  const metadata = isProtocolRecord(message) ? message.metadata : null
  const cards = isProtocolRecord(metadata) && Array.isArray(metadata.cards) ? metadata.cards : []
  for (const item of cards) {
    if (!isProtocolRecord(item)) continue
    if (item.kind === 'task' && typeof item.id === 'string' && item.id) return item.id
  }
  return null
}

export function buildShadowServerAppInboxDelivery(
  input: ShadowServerAppInboxDeliveryFromMessageInput,
): ShadowServerAppInboxDelivery {
  const message = isProtocolRecord(input.message) ? input.message : {}
  return {
    ...('agentId' in input.target && input.target.agentId ? { agentId: input.target.agentId } : {}),
    channelId: optionalProtocolString(message.channelId),
    messageId: optionalProtocolString(message.id),
    cardId: getShadowServerAppTaskCardId(message),
    idempotencyKey: input.idempotencyKey,
  }
}

function shadowFromPayload(payload: Record<string, unknown>): ShadowServerAppResultShadow | null {
  if (payload.protocol === SHADOW_SERVER_APP_PROTOCOL) {
    return payload as unknown as ShadowServerAppResultShadow
  }
  const shadow = isProtocolRecord(payload.shadow) ? payload.shadow : null
  if (shadow?.protocol === SHADOW_SERVER_APP_PROTOCOL) {
    return shadow as unknown as ShadowServerAppResultShadow
  }
  return null
}

function mergeShadowResult(
  value: Record<string, unknown>,
  shadow: ShadowServerAppResultShadow | null,
): Record<string, unknown> {
  if (!shadow) return value
  const existing = shadowFromPayload(value)
  if (!existing) return { ...value, shadow }
  return {
    ...value,
    shadow: {
      protocol: SHADOW_SERVER_APP_PROTOCOL,
      outbox: {
        ...(existing.outbox ?? {}),
        ...(shadow.outbox ?? {}),
      },
    },
  }
}

export function getShadowServerAppInboxDeliveries(
  payload: unknown,
): ShadowServerAppInboxDelivery[] {
  if (!isProtocolRecord(payload)) return []
  const shadow = shadowFromPayload(payload)
  return shadow?.outbox?.deliveries ?? []
}

export function getShadowServerAppInboxErrors(
  payload: unknown,
): ShadowServerAppInboxDeliveryError[] {
  if (!isProtocolRecord(payload)) return []
  const shadow = shadowFromPayload(payload)
  return shadow?.outbox?.errors ?? []
}

export function getShadowServerAppChannelMessageDeliveries(
  payload: unknown,
): ShadowServerAppChannelMessageDelivery[] {
  if (!isProtocolRecord(payload)) return []
  const shadow = shadowFromPayload(payload)
  return shadow?.outbox?.channelMessageDeliveries ?? []
}

export function getShadowServerAppChannelMessageErrors(
  payload: unknown,
): ShadowServerAppChannelMessageDeliveryError[] {
  if (!isProtocolRecord(payload)) return []
  const shadow = shadowFromPayload(payload)
  return shadow?.outbox?.channelMessageErrors ?? []
}

function isDomainResultWithEvents(payload: Record<string, unknown>): boolean {
  return Array.isArray(payload.events) && ('cursor' in payload || 'result' in payload)
}

function isCommandPayloadEnvelope(payload: Record<string, unknown>): boolean {
  if (isDomainResultWithEvents(payload)) return false
  return payload.ok === true || payload.ok === false || shadowFromPayload(payload) !== null
}

export function unwrapShadowServerAppCommandPayload<TResult = unknown>(payload: unknown): TResult {
  if (isProtocolRecord(payload) && payload.ok === false) {
    throw new Error(typeof payload.error === 'string' ? payload.error : 'Command failed')
  }
  if (
    isProtocolRecord(payload) &&
    'result' in payload &&
    payload.result !== undefined &&
    isCommandPayloadEnvelope(payload)
  ) {
    const nested = unwrapShadowServerAppCommandPayload<unknown>(payload.result)
    const shadow = shadowFromPayload(payload)
    if (isProtocolRecord(nested)) return mergeShadowResult(nested, shadow) as TResult
    return nested as TResult
  }
  return payload as TResult
}

export class ShadowServerAppOutbox {
  private readonly inboxTasks: ShadowServerAppInboxTaskOutbox[] = []
  private readonly channelMessages: ShadowServerAppChannelMessageOutbox[] = []

  enqueueInboxTask(task: ShadowServerAppInboxTaskOutbox): this {
    this.inboxTasks.push(task)
    return this
  }

  enqueueInboxTasks(tasks: ShadowServerAppInboxTaskOutbox[]): this {
    for (const task of tasks) this.enqueueInboxTask(task)
    return this
  }

  sendChannelMessage(message: ShadowServerAppChannelMessageOutbox): this {
    this.channelMessages.push(message)
    return this
  }

  sendChannelMessages(messages: ShadowServerAppChannelMessageOutbox[]): this {
    for (const message of messages) this.sendChannelMessage(message)
    return this
  }

  toShadow(): ShadowServerAppResultShadow {
    return {
      protocol: SHADOW_SERVER_APP_PROTOCOL,
      outbox: {
        ...(this.inboxTasks.length > 0 ? { inboxTasks: [...this.inboxTasks] } : {}),
        ...(this.channelMessages.length > 0 ? { channelMessages: [...this.channelMessages] } : {}),
      },
    }
  }

  attachTo<TResult extends Record<string, unknown>>(
    result: TResult,
  ): ShadowServerAppResultWithShadow<TResult> {
    return { ...result, shadow: this.toShadow() }
  }
}

export interface ShadowServerAppActorRef {
  kind: string
  id: string
  userId: string | null
  buddyAgentId: string | null
  ownerId: string | null
  displayName: string
  avatarUrl: string | null
}

export interface ShadowServerAppCommandParseError {
  ok: false
  status: 400 | 401 | 403 | 502
  error: string
  issues?: ShadowServerAppValidationIssue[]
}

export interface ShadowServerAppCommandParseSuccess<T = unknown> {
  ok: true
  envelope: ShadowServerAppCommandEnvelope<T>
}

export type ShadowServerAppCommandParseResult<T = unknown> =
  | ShadowServerAppCommandParseSuccess<T>
  | ShadowServerAppCommandParseError

export interface ShadowServerAppManifestOptions {
  publicBaseUrl?: string
  apiBaseUrl?: string
  port?: number
  iframePath?: string
  iconPath?: string
  allowedOrigins?: string[]
}

export interface ShadowServerAppIntrospectionInput {
  token: string
  serverId: string
  appKey: string
  shadowBaseUrl?: string
  fetchImpl?: ShadowServerAppFetch
}

export interface ShadowServerAppCommandRequestInput {
  authorizationHeader?: string | null
  serverIdHeader?: string | null
  appKeyHeader?: string | null
  expectedCommand: string
  requestBody?: string
  requestInput?: unknown
  shadowBaseUrl?: string
  fetchImpl?: ShadowServerAppFetch
}

export interface ShadowServerAppCommandRuntimeRequest {
  authorizationHeader?: string | null
  serverIdHeader?: string | null
  appKeyHeader?: string | null
  requestBody?: string
  requestInput?: unknown
}

export interface ShadowServerAppRuntimeOptions {
  shadowBaseUrl?: string
  fetchImpl?: ShadowServerAppFetch
}

export interface ShadowServerAppCommandHandlerContext {
  context: ShadowServerAppCommandContext
  actor: ShadowServerAppActorRef
}

export type ShadowServerAppCommandHandler<TInput = unknown, TResult = unknown> = (
  input: TInput,
  context: ShadowServerAppCommandHandlerContext,
) => TResult | Promise<TResult>

export type ShadowServerAppCommandHandlers<TManifest extends ShadowServerAppManifest> = {
  [TCommand in TManifest['commands'][number] as TCommand['name']]: ShadowServerAppCommandHandler<
    ShadowServerAppCommandInput<TManifest, TCommand['name']>
  >
}

export interface ShadowServerAppExecutionSuccess<TResult = unknown> {
  ok: true
  status: 200
  body: ShadowServerAppCommandSuccessResponse<TResult>
}

export interface ShadowServerAppExecutionFailure {
  ok: false
  status: number
  body: ShadowServerAppCommandFailureResponse
}

export type ShadowServerAppExecutionResult<TResult = unknown> =
  | ShadowServerAppExecutionSuccess<TResult>
  | ShadowServerAppExecutionFailure

export interface ShadowServerAppValidationIssue {
  path: string
  message: string
}

export type ShadowServerAppCommandName<TManifest extends ShadowServerAppManifest> =
  TManifest['commands'][number]['name']

type JsonSchemaEnum<TSchema> = TSchema extends { enum: readonly (infer TValue)[] } ? TValue : never
type JsonSchemaProperties<TSchema> = TSchema extends { properties: infer TProperties }
  ? TProperties
  : Record<string, never>
type JsonSchemaRequiredKeys<TSchema, TProperties> = TSchema extends {
  required: readonly (infer TKey)[]
}
  ? string extends TKey
    ? never
    : Extract<TKey, keyof TProperties>
  : never
type Simplify<T> = { [TKey in keyof T]: T[TKey] } & {}
type JsonSchemaAdditionalProperties<TSchema> = TSchema extends {
  additionalProperties: infer TAdditionalProperties
}
  ? TAdditionalProperties extends false
    ? unknown
    : TAdditionalProperties extends true
      ? Record<string, unknown>
      : TAdditionalProperties extends Record<string, unknown>
        ? Record<string, JsonSchemaToType<TAdditionalProperties>>
        : unknown
  : unknown

export type JsonSchemaToType<TSchema> = TSchema extends { oneOf: readonly (infer TOption)[] }
  ? JsonSchemaToType<TOption>
  : [JsonSchemaEnum<TSchema>] extends [never]
    ? TSchema extends { type: 'string' }
      ? string
      : TSchema extends { type: 'number' | 'integer' }
        ? number
        : TSchema extends { type: 'boolean' }
          ? boolean
          : TSchema extends { type: 'array'; items: infer TItems }
            ? JsonSchemaToType<TItems>[]
            : TSchema extends { type: 'object' }
              ? JsonSchemaObjectToType<TSchema>
              : unknown
    : JsonSchemaEnum<TSchema>

type JsonSchemaObjectToType<TSchema> =
  JsonSchemaProperties<TSchema> extends infer TProperties
    ? Simplify<
        {
          [TKey in JsonSchemaRequiredKeys<TSchema, TProperties>]: JsonSchemaToType<
            TProperties[TKey]
          >
        } & {
          [TKey in Exclude<
            keyof TProperties,
            JsonSchemaRequiredKeys<TSchema, TProperties>
          >]?: JsonSchemaToType<TProperties[TKey]>
        }
      > &
        JsonSchemaAdditionalProperties<TSchema>
    : Record<string, unknown>

type ExtractShadowServerAppCommand<
  TManifest extends ShadowServerAppManifest,
  TCommandName extends ShadowServerAppCommandName<TManifest>,
> = Extract<TManifest['commands'][number], { name: TCommandName }>

export type ShadowServerAppCommandInput<
  TManifest extends ShadowServerAppManifest,
  TCommandName extends ShadowServerAppCommandName<TManifest>,
> =
  ExtractShadowServerAppCommand<TManifest, TCommandName> extends { inputSchema: infer TSchema }
    ? JsonSchemaToType<TSchema>
    : Record<string, never>

function trimTrailingSlash(value: string) {
  return value.replace(/\/$/, '')
}

function joinBasePath(baseUrl: string, path: string) {
  const cleanBase = trimTrailingSlash(baseUrl)
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  return `${cleanBase}${cleanPath}`
}

function urlOrigin(value: string) {
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

function rebasePublicAssetUrl(value: string, sourceOrigin: string | null, publicBaseUrl: string) {
  if (!sourceOrigin) return value
  try {
    const url = new URL(value)
    if (url.origin !== sourceOrigin) return value
    return joinBasePath(publicBaseUrl, `${url.pathname}${url.search}${url.hash}`)
  } catch {
    return value
  }
}

export function extractShadowServerAppBearerToken(value?: string | null) {
  if (!value) return null
  return value.toLowerCase().startsWith('bearer ') ? value.slice(7).trim() : null
}

export function normalizeShadowServerAppCommandInput(value: unknown) {
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    'input' in value &&
    Object.keys(value).every((key) => key === 'input' || key === 'channelId')
  ) {
    return (value as { input?: unknown }).input ?? {}
  }
  return value
}

export function createShadowServerAppManifest<TManifest extends ShadowServerAppManifest>(
  manifest: TManifest,
  options: ShadowServerAppManifestOptions = {},
): TManifest {
  const publicBaseUrl = trimTrailingSlash(
    options.publicBaseUrl ?? `http://localhost:${options.port ?? 4201}`,
  )
  const apiBaseUrl = trimTrailingSlash(options.apiBaseUrl ?? publicBaseUrl)
  const iframePath = options.iframePath ?? '/shadow/server'
  const iconPath = options.iconPath ?? '/assets/icon.svg'
  const sourceAssetOrigin = urlOrigin(manifest.iconUrl)
  return {
    ...manifest,
    iconUrl: joinBasePath(publicBaseUrl, iconPath),
    marketplace: manifest.marketplace
      ? {
          ...manifest.marketplace,
          coverImageUrl: manifest.marketplace.coverImageUrl
            ? rebasePublicAssetUrl(
                manifest.marketplace.coverImageUrl,
                sourceAssetOrigin,
                publicBaseUrl,
              )
            : manifest.marketplace.coverImageUrl,
          gallery: manifest.marketplace.gallery?.map((item) => ({
            ...item,
            url: rebasePublicAssetUrl(item.url, sourceAssetOrigin, publicBaseUrl),
          })),
        }
      : manifest.marketplace,
    iframe: manifest.iframe
      ? {
          ...manifest.iframe,
          entry: joinBasePath(publicBaseUrl, iframePath),
          allowedOrigins: options.allowedOrigins ?? [publicBaseUrl],
        }
      : manifest.iframe,
    api: {
      ...manifest.api,
      baseUrl: apiBaseUrl,
    },
  }
}

export function defineShadowServerApp<const TManifest extends ShadowServerAppManifest>(
  manifest: TManifest,
  options: ShadowServerAppRuntimeOptions = {},
) {
  return new ShadowServerAppRuntime(manifest, options)
}

export class ShadowServerAppCommandError extends Error {
  readonly status: number
  readonly issues?: ShadowServerAppValidationIssue[] | unknown

  constructor(status: number, error: string, issues?: ShadowServerAppValidationIssue[] | unknown) {
    super(error)
    this.name = 'ShadowServerAppCommandError'
    this.status = status
    this.issues = issues
  }
}

export function shadowServerAppError(
  status: number,
  error: string,
  issues?: ShadowServerAppValidationIssue[] | unknown,
) {
  return new ShadowServerAppCommandError(status, error, issues)
}

export class ShadowServerAppRuntime<const TManifest extends ShadowServerAppManifest> {
  constructor(
    readonly sourceManifest: TManifest,
    private readonly options: ShadowServerAppRuntimeOptions = {},
  ) {}

  manifest(options: ShadowServerAppManifestOptions = {}) {
    return createShadowServerAppManifest(this.sourceManifest, options)
  }

  defineCommands(handlers: ShadowServerAppCommandHandlers<TManifest>) {
    return handlers
  }

  actor(envelopeOrContext: ShadowServerAppCommandEnvelope | ShadowServerAppCommandContext) {
    return shadowServerAppActorRef(envelopeOrContext)
  }

  error(status: number, error: string, issues?: ShadowServerAppValidationIssue[] | unknown) {
    return shadowServerAppError(status, error, issues)
  }

  async parseCommand<TCommandName extends ShadowServerAppCommandName<TManifest>>(
    commandName: TCommandName,
    request: ShadowServerAppCommandRuntimeRequest,
  ) {
    return parseShadowServerAppCommandRequest<ShadowServerAppCommandInput<TManifest, TCommandName>>(
      {
        ...request,
        expectedCommand: commandName,
        shadowBaseUrl: this.options.shadowBaseUrl,
        fetchImpl: this.options.fetchImpl,
      },
    )
  }

  async executeCommand<TCommandName extends ShadowServerAppCommandName<TManifest>>(
    commandName: TCommandName,
    request: ShadowServerAppCommandRuntimeRequest,
    handlers: ShadowServerAppCommandHandlers<TManifest>,
  ): Promise<ShadowServerAppExecutionResult> {
    const parsed = await this.parseCommand(commandName, request)
    if (!parsed.ok) return parseErrorResult(parsed)
    return this.executeEnvelope(commandName, parsed.envelope, handlers)
  }

  async executeLocal<TCommandName extends ShadowServerAppCommandName<TManifest>>(
    commandName: TCommandName,
    input: unknown,
    context: ShadowServerAppCommandContext,
    handlers: ShadowServerAppCommandHandlers<TManifest>,
  ): Promise<ShadowServerAppExecutionResult> {
    return this.executeEnvelope(
      commandName,
      {
        input: input as ShadowServerAppCommandInput<TManifest, TCommandName>,
        context: {
          ...context,
          command: commandName,
        },
      },
      handlers,
    )
  }

  private async executeEnvelope<TCommandName extends ShadowServerAppCommandName<TManifest>>(
    commandName: TCommandName,
    envelope: ShadowServerAppCommandEnvelope<ShadowServerAppCommandInput<TManifest, TCommandName>>,
    handlers: ShadowServerAppCommandHandlers<TManifest>,
  ): Promise<ShadowServerAppExecutionResult> {
    const command = this.sourceManifest.commands.find((item) => item.name === commandName)
    if (!command) return failureResult(404, 'command_not_found')
    const validation = validateShadowServerAppJsonSchema(command.inputSchema, envelope.input)
    if (!validation.ok) return failureResult(422, 'invalid_input', validation.issues)
    const handler = handlers[commandName] as
      | ShadowServerAppCommandHandler<ShadowServerAppCommandInput<TManifest, TCommandName>>
      | undefined
    if (!handler) return failureResult(404, 'command_not_found')
    try {
      const result = await handler(envelope.input, {
        context: envelope.context,
        actor: this.actor(envelope),
      })
      return { ok: true, status: 200, body: { ok: true, result } }
    } catch (error) {
      if (error instanceof ShadowServerAppCommandError) {
        return failureResult(error.status, error.message, error.issues)
      }
      throw error
    }
  }
}

export async function introspectShadowServerAppToken(
  input: ShadowServerAppIntrospectionInput,
): Promise<ShadowServerAppTokenIntrospection | null> {
  const baseUrl = trimTrailingSlash(input.shadowBaseUrl ?? 'http://localhost:3002')
  const fetchImpl = input.fetchImpl ?? fetch
  const response = await fetchImpl(
    `${baseUrl}/api/servers/${encodeURIComponent(input.serverId)}/apps/${encodeURIComponent(
      input.appKey,
    )}/oauth/introspect`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token: input.token }),
    },
  )
  if (!response.ok) return null
  const payload = (await response.json()) as ShadowServerAppTokenIntrospection
  return payload.active ? payload : null
}

export async function parseShadowServerAppCommandRequest<T = unknown>(
  input: ShadowServerAppCommandRequestInput,
): Promise<ShadowServerAppCommandParseResult<T>> {
  const token = extractShadowServerAppBearerToken(input.authorizationHeader)
  const serverId = input.serverIdHeader
  const appKey = input.appKeyHeader
  if (!token || !serverId || !appKey) {
    return { ok: false, status: 401, error: 'missing_oauth' }
  }

  const introspection = await introspectShadowServerAppToken({
    token,
    serverId,
    appKey,
    shadowBaseUrl: input.shadowBaseUrl,
    fetchImpl: input.fetchImpl,
  }).catch(() => null)
  const context = introspection?.shadow
  if (!context) return { ok: false, status: 401, error: 'invalid_token' }
  if (context.command !== input.expectedCommand) {
    return { ok: false, status: 403, error: 'wrong_command' }
  }

  let commandInput: T
  if (input.requestInput !== undefined) {
    commandInput = input.requestInput as T
  } else {
    let body: { input?: T }
    try {
      body = JSON.parse(input.requestBody ?? '{}') as { input?: T }
    } catch {
      return { ok: false, status: 400, error: 'invalid_json' }
    }
    commandInput = (body.input ?? {}) as T
  }

  return {
    ok: true,
    envelope: {
      input: commandInput,
      context: context as ShadowServerAppCommandContext,
    },
  }
}

export function validateShadowServerAppJsonSchema(
  schema: Readonly<Record<string, unknown>> | undefined,
  value: unknown,
): { ok: true } | { ok: false; issues: ShadowServerAppValidationIssue[] } {
  if (!schema) return { ok: true }
  const issues: ShadowServerAppValidationIssue[] = []
  validateJsonSchemaValue(schema, value, '', issues)
  return issues.length ? { ok: false, issues } : { ok: true }
}

export function shadowServerAppActorDisplayName(
  envelopeOrContext: ShadowServerAppCommandEnvelope | ShadowServerAppCommandContext,
) {
  const context = 'context' in envelopeOrContext ? envelopeOrContext.context : envelopeOrContext
  const actor = context.actor
  const profile = actor.profile
  return (
    profile?.displayName?.trim() ||
    profile?.username?.trim() ||
    (actor.buddyAgentId ? `Buddy ${actor.buddyAgentId.slice(0, 8)}` : null) ||
    (actor.userId ? `${actor.kind}:${actor.userId.slice(0, 8)}` : null) ||
    `${actor.kind}:unknown`
  )
}

export function shadowServerAppActorAvatarUrl(
  envelopeOrContext: ShadowServerAppCommandEnvelope | ShadowServerAppCommandContext,
) {
  const context = 'context' in envelopeOrContext ? envelopeOrContext.context : envelopeOrContext
  return context.actor.profile?.avatarUrl ?? null
}

export function shadowServerAppActorRef(
  envelopeOrContext: ShadowServerAppCommandEnvelope | ShadowServerAppCommandContext,
): ShadowServerAppActorRef {
  const context = 'context' in envelopeOrContext ? envelopeOrContext.context : envelopeOrContext
  const actor = context.actor
  return {
    kind: actor.kind,
    id: actor.buddyAgentId ?? actor.userId ?? actor.ownerId ?? 'unknown',
    userId: actor.userId ?? null,
    buddyAgentId: actor.buddyAgentId ?? null,
    ownerId: actor.ownerId ?? null,
    displayName: shadowServerAppActorDisplayName(context),
    avatarUrl: shadowServerAppActorAvatarUrl(context),
  }
}

function parseErrorResult(
  error: ShadowServerAppCommandParseError,
): ShadowServerAppExecutionFailure {
  return failureResult(error.status, error.error, error.issues)
}

function failureResult(
  status: number,
  error: string,
  issues?: ShadowServerAppValidationIssue[] | unknown,
): ShadowServerAppExecutionFailure {
  return {
    ok: false,
    status,
    body: issues === undefined ? { ok: false, error } : { ok: false, error, issues },
  }
}

function validateJsonSchemaValue(
  schema: Readonly<Record<string, unknown>>,
  value: unknown,
  path: string,
  issues: ShadowServerAppValidationIssue[],
) {
  if (Array.isArray(schema.oneOf)) {
    const matches = schema.oneOf.some((option) => {
      const nestedIssues: ShadowServerAppValidationIssue[] = []
      if (option && typeof option === 'object' && !Array.isArray(option)) {
        validateJsonSchemaValue(
          option as Readonly<Record<string, unknown>>,
          value,
          path,
          nestedIssues,
        )
      }
      return nestedIssues.length === 0
    })
    if (!matches) issues.push({ path, message: 'Expected value matching one schema option' })
    return
  }

  const enumValues = schema.enum
  if (Array.isArray(enumValues) && !enumValues.includes(value)) {
    issues.push({ path, message: `Expected one of ${enumValues.map(String).join(', ')}` })
    return
  }

  const type = schema.type
  if (type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      issues.push({ path, message: 'Expected object' })
      return
    }
    const record = value as Record<string, unknown>
    const properties =
      schema.properties &&
      typeof schema.properties === 'object' &&
      !Array.isArray(schema.properties)
        ? (schema.properties as Record<string, Readonly<Record<string, unknown>>>)
        : {}
    const required = Array.isArray(schema.required) ? schema.required.map(String) : []
    for (const key of required) {
      if (!(key in record)) issues.push({ path: joinJsonPath(path, key), message: 'Required' })
    }
    for (const [key, propertySchema] of Object.entries(properties)) {
      if (record[key] !== undefined) {
        validateJsonSchemaValue(propertySchema, record[key], joinJsonPath(path, key), issues)
      }
    }
    const additionalProperties =
      schema.additionalProperties &&
      typeof schema.additionalProperties === 'object' &&
      !Array.isArray(schema.additionalProperties)
        ? (schema.additionalProperties as Record<string, unknown>)
        : null
    if (additionalProperties) {
      for (const [key, nestedValue] of Object.entries(record)) {
        if (!(key in properties)) {
          validateJsonSchemaValue(
            additionalProperties,
            nestedValue,
            joinJsonPath(path, key),
            issues,
          )
        }
      }
    } else if (schema.additionalProperties === false) {
      for (const key of Object.keys(record)) {
        if (!(key in properties)) {
          issues.push({ path: joinJsonPath(path, key), message: 'Unknown property' })
        }
      }
    }
    return
  }

  if (type === 'array') {
    if (!Array.isArray(value)) {
      issues.push({ path, message: 'Expected array' })
      return
    }
    const maxItems = typeof schema.maxItems === 'number' ? schema.maxItems : null
    if (maxItems !== null && value.length > maxItems) {
      issues.push({ path, message: `Expected at most ${maxItems} items` })
    }
    const itemSchema =
      schema.items && typeof schema.items === 'object' && !Array.isArray(schema.items)
        ? (schema.items as Record<string, unknown>)
        : null
    if (itemSchema) {
      value.forEach((item, index) =>
        validateJsonSchemaValue(itemSchema, item, `${path}[${index}]`, issues),
      )
    }
    return
  }

  if (type === 'string') {
    if (typeof value !== 'string') {
      issues.push({ path, message: 'Expected string' })
      return
    }
    const maxLength = typeof schema.maxLength === 'number' ? schema.maxLength : null
    const minLength = typeof schema.minLength === 'number' ? schema.minLength : null
    if (minLength !== null && value.length < minLength) {
      issues.push({ path, message: `Expected at least ${minLength} characters` })
    }
    if (maxLength !== null && value.length > maxLength) {
      issues.push({ path, message: `Expected at most ${maxLength} characters` })
    }
    return
  }

  if (type === 'number' || type === 'integer') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      issues.push({ path, message: 'Expected number' })
      return
    }
    if (type === 'integer' && !Number.isInteger(value)) {
      issues.push({ path, message: 'Expected integer' })
    }
    return
  }

  if (type === 'boolean' && typeof value !== 'boolean') {
    issues.push({ path, message: 'Expected boolean' })
  }
}

function joinJsonPath(parent: string, key: string) {
  return parent ? `${parent}.${key}` : key
}
