import type {
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
  permission: string
  action: string
  dataClass: string
}

export interface ShadowServerAppCommandEnvelope<T = unknown> {
  input: T
  context: ShadowServerAppCommandContext
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
  requestBody: string
  shadowBaseUrl?: string
  fetchImpl?: ShadowServerAppFetch
}

export interface ShadowServerAppCommandRuntimeRequest {
  authorizationHeader?: string | null
  serverIdHeader?: string | null
  appKeyHeader?: string | null
  requestBody: string
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
  body: { ok: true; result: TResult }
}

export interface ShadowServerAppExecutionFailure {
  ok: false
  status: number
  body: { ok: false; error: string; issues?: ShadowServerAppValidationIssue[] | unknown }
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
  return {
    ...manifest,
    iconUrl: joinBasePath(publicBaseUrl, iconPath),
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

  let body: { input?: T }
  try {
    body = JSON.parse(input.requestBody) as { input?: T }
  } catch {
    return { ok: false, status: 400, error: 'invalid_json' }
  }

  return {
    ok: true,
    envelope: {
      input: (body.input ?? {}) as T,
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
