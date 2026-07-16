import type {
  ShadowBuddyInboxSummary,
  ShadowInboxTaskInput,
  ShadowSpaceAppActorProfile,
  ShadowSpaceAppManifest,
  ShadowSpaceAppResourceContext,
  ShadowSpaceAppTokenIntrospection,
} from './types'

export {
  BUDDY_INBOX_DELIVERY_PERMISSION,
  type BuddyInboxPlatformPermission,
} from '@shadowob/shared'

export type ShadowSpaceAppFetch = typeof fetch

const SHADOW_LAUNCH_INTROSPECTION_CACHE_TTL_MS = 5_000
const SHADOW_LAUNCH_INTROSPECTION_TIMEOUT_MS = 2_500
const SHADOW_LAUNCH_INTROSPECTION_CACHE_LIMIT = 256

interface ShadowLaunchIntrospectionCacheEntry {
  expiresAt: number
  value: ShadowSpaceAppLaunchIntrospection
}

const shadowLaunchIntrospectionCache = new Map<string, ShadowLaunchIntrospectionCacheEntry>()
const shadowLaunchIntrospectionRequests = new Map<
  string,
  Promise<ShadowSpaceAppLaunchIntrospection | null>
>()
const shadowLaunchFetchIds = new WeakMap<ShadowSpaceAppFetch, number>()
let nextShadowLaunchFetchId = 1

export interface ShadowSpaceAppCommandContext {
  protocol: 'shadow.space-app/1'
  serverId: string
  spaceAppId: string
  appKey: string
  command: string
  actor: {
    kind: string
    userId: string | null
    buddyAgentId?: string | null
    ownerId?: string | null
    profile?: ShadowSpaceAppActorProfile | null
  }
  channelId?: string | null
  resources?: ShadowSpaceAppResourceContext | null
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

export interface ShadowSpaceAppCommandEnvelope<T = unknown> {
  input: T
  context: ShadowSpaceAppCommandContext
}

export const SHADOW_SPACE_APP_PROTOCOL = 'shadow.space-app/1' as const
export const SHADOW_SPACE_APP_COMMAND_COMPLETED_EVENT = 'space_app.command.completed' as const
export const SHADOW_SPACE_APP_COMMAND_FAILED_EVENT = 'space_app.command.failed' as const
export const SHADOW_SPACE_APP_COMMAND_EVENTS = [
  SHADOW_SPACE_APP_COMMAND_COMPLETED_EVENT,
  SHADOW_SPACE_APP_COMMAND_FAILED_EVENT,
] as const

export type ShadowSpaceAppCommandEventType = (typeof SHADOW_SPACE_APP_COMMAND_EVENTS)[number]

export interface ShadowSpaceAppLaunchTokenHint {
  serverId: string
  appKey: string
}

export interface ShadowSpaceAppLaunchFetchOptions {
  launchToken?: string | null
  shadowApiBaseUrl?: string
  fetch?: ShadowSpaceAppFetch
}

export interface ShadowSpaceAppLaunchMember {
  id?: string
  userId?: string
  username?: string | null
  displayName?: string | null
  avatarUrl?: string | null
  role?: string
  kind?: string
  isBot?: boolean
}

export interface ShadowSpaceAppLaunchEnsureChannelInput {
  dedupeKey: string
  name: string
  topic?: string
  isPrivate?: boolean
  memberUserIds?: string[]
  syncMembers?: boolean
}

export interface ShadowSpaceAppLaunchEnsureChannelResult {
  channelId: string
  created: boolean
  name: string
}

export interface ShadowSpaceAppLaunchChannel {
  id: string
  name: string
  type?: string
  topic?: string | null
  isPrivate?: boolean
  isArchived?: boolean
}

export interface ShadowSpaceAppLaunchCreatePollInput {
  channelId: string
  question: string
  answers: Array<string | { text: string; emoji?: string }>
  allowMultiselect?: boolean
  durationHours?: number
}

export interface ShadowSpaceAppLaunchCreatePollResult {
  channelId: string
  messageId: string
}

export interface ShadowSpaceAppLaunchEnsureBuddyTaskGrantInput {
  buddyAgentId: string
  permissions?: string[]
  reason: string
}

export interface ShadowSpaceAppLaunchEnsureBuddyTaskGrantResult {
  granted: boolean
  skipped?: boolean
}

export interface ShadowSpaceAppLaunchIntrospection {
  active: boolean
  exp?: number
  error?: string
  reason?: string
  error_description?: string
  shadow?: Partial<ShadowSpaceAppCommandContext> & {
    serverId: string
    spaceAppId?: string
    appKey: string
    actor: ShadowSpaceAppCommandContext['actor']
  }
}

export interface ShadowSpaceAppLaunchCommandContextOptions
  extends ShadowSpaceAppLaunchFetchOptions {
  commandName: string
  manifest: Pick<ShadowSpaceAppManifest, 'appKey' | 'commands'>
}

export interface ShadowSpaceAppLaunchCommandContextResolution {
  context: ShadowSpaceAppCommandContext | null
  introspection: ShadowSpaceAppLaunchIntrospection | null
  error: string | null
}

export interface ShadowSpaceAppLaunchOutboxDeliveryOptions
  extends ShadowSpaceAppLaunchFetchOptions {
  commandName: string
  result: unknown
}

export interface ShadowSpaceAppNotificationPublishInput {
  topicKey: string
  recipientUserIds: string[]
  title: string
  body?: string | null
  idempotencyKey: string
  actionPath?: string | null
  metadata?: Record<string, unknown>
  expiresAt?: string | null
}

export interface ShadowSpaceAppNotificationPublishOptions extends ShadowSpaceAppLaunchFetchOptions {
  notification: ShadowSpaceAppNotificationPublishInput
}

export type ShadowSpaceAppInboxTaskPriority = 'low' | 'normal' | 'medium' | 'high'

export interface ShadowSpaceAppInboxTaskResource {
  kind: string
  id: string
  label?: string
  url?: string
  [key: string]: unknown
}

export interface ShadowSpaceAppInboxTaskOutbox {
  title: string
  body?: string
  priority?: ShadowSpaceAppInboxTaskPriority
  tags?: ShadowInboxTaskInput['tags']
  channelId?: string
  agentId?: string
  agentUserId?: string
  assigneeLabel?: string
  idempotencyKey?: string
  resource?: ShadowSpaceAppInboxTaskResource
  requirements?: ShadowInboxTaskInput['requirements']
  outputContract?: ShadowInboxTaskInput['outputContract']
  privacy?: ShadowInboxTaskInput['privacy']
  data?: Record<string, unknown>
  required?: boolean
}

export interface ShadowSpaceAppInboxDelivery {
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

export interface ShadowSpaceAppInboxDeliveryError {
  agentId?: string
  agentUserId?: string
  assigneeLabel?: string
  title?: string
  error: string
}

export interface ShadowSpaceAppChannelMessageOutbox {
  content: string
  channelId?: string
  channelName?: string
  metadata?: Record<string, unknown>
  idempotencyKey?: string
}

export interface ShadowSpaceAppChannelMessageDelivery {
  channelId: string
  messageId: string
  idempotencyKey?: string
}

export interface ShadowSpaceAppChannelMessageDeliveryError {
  channelId?: string
  channelName?: string
  idempotencyKey?: string
  error: string
}

export type ShadowSpaceAppInboxTarget =
  | {
      agentId: string
      channelId?: string
    }
  | {
      channelId: string
      agentId?: string
    }

export interface ShadowSpaceAppOutboxPayload {
  inboxTasks?: ShadowSpaceAppInboxTaskOutbox[]
  channelMessages?: ShadowSpaceAppChannelMessageOutbox[]
  deliveries?: ShadowSpaceAppInboxDelivery[]
  errors?: ShadowSpaceAppInboxDeliveryError[]
  channelMessageDeliveries?: ShadowSpaceAppChannelMessageDelivery[]
  channelMessageErrors?: ShadowSpaceAppChannelMessageDeliveryError[]
}

export interface ShadowSpaceAppResultShadow {
  protocol: typeof SHADOW_SPACE_APP_PROTOCOL
  outbox?: ShadowSpaceAppOutboxPayload
}

export type ShadowSpaceAppResultWithShadow<TResult extends Record<string, unknown>> = TResult & {
  shadow?: ShadowSpaceAppResultShadow
}

export interface ShadowSpaceAppCommandSuccessResponse<TResult = unknown> {
  ok: true
  result: TResult
  shadow?: ShadowSpaceAppResultShadow
}

export interface ShadowSpaceAppCommandFailureResponse {
  ok: false
  error: string
  issues?: ShadowSpaceAppValidationIssue[] | unknown
}

export type ShadowSpaceAppCommandResponse<TResult = unknown> =
  | ShadowSpaceAppCommandSuccessResponse<TResult>
  | ShadowSpaceAppCommandFailureResponse

export class ShadowSpaceAppHttpError extends Error {
  readonly status: number
  readonly payload: unknown

  constructor(status: number, message: string, payload: unknown) {
    super(message)
    this.name = 'ShadowSpaceAppHttpError'
    this.status = status
    this.payload = payload
  }
}

export interface ShadowSpaceAppBridgeOpenCopilotRequest {
  type: 'shadow.space-app.copilot.open.request'
  requestId: string
  appKey?: string
  delivery: ShadowSpaceAppInboxDelivery
}

export interface ShadowSpaceAppBridgeOpenWorkspaceResourceRequest {
  type: 'shadow.space-app.workspace.open.request'
  requestId: string
  appKey?: string
  resource: {
    uri?: string
    workspaceFileId?: string
    workspaceNodeId?: string
    path?: string
    name?: string
    title?: string
  }
}

export interface ShadowSpaceAppBridgeAuthorizeOAuthRequest {
  type: 'shadow.space-app.oauth.authorize.request'
  requestId: string
  appKey?: string
  authorizeUrl: string
}

export interface ShadowSpaceAppBridgeRouteChangedEvent {
  type: 'shadow.space-app.route.changed'
  appKey?: string
  path: string
}

export interface ShadowSpaceAppBridgeRouteNavigateRequest {
  type: 'shadow.space-app.navigate'
  requestId: string
  appKey?: string
  path: string
}

export interface ShadowSpaceAppBridgeRouteNavigateAck {
  type: 'shadow.space-app.navigate.ack'
  requestId: string
  appKey?: string
}

export interface ShadowSpaceAppBridgeShareRequest {
  type: 'shadow.space-app.share.request'
  requestId: string
  appKey?: string
  path?: string
  title?: string
  description?: string
  label?: string
  data?: Record<string, unknown>
}

export type ShadowSpaceAppBridgeRequest =
  | ShadowSpaceAppBridgeCapabilitiesRequest
  | ShadowSpaceAppBridgeOpenCopilotRequest
  | ShadowSpaceAppBridgeOpenWorkspaceResourceRequest
  | ShadowSpaceAppBridgeAuthorizeOAuthRequest
  | ShadowSpaceAppBridgeShareRequest

export interface ShadowSpaceAppHostRef {
  id?: string | null
  appId?: string | null
  appKey: string
  serverId?: string | null
  name?: string | null
  label?: string | null
  iconUrl?: string | null
}

export interface ShadowSpaceAppHostInboxTaskRequestInput {
  serverIdOrSlug: string
  target: ShadowSpaceAppInboxTarget
  task: ShadowSpaceAppInboxTaskOutbox
  app: ShadowSpaceAppHostRef
  commandName?: string
}

export interface ShadowSpaceAppResolvedInboxTaskRequest {
  endpoint: string
  body: ShadowInboxTaskInput
}

export interface ShadowSpaceAppInboxDeliveryFromMessageInput {
  target: ShadowSpaceAppInboxTarget
  message: unknown
  idempotencyKey?: string
}

export type ShadowSpaceAppBridgeResponseType =
  | 'shadow.space-app.capabilities.response'
  | 'shadow.space-app.copilot.open.response'
  | 'shadow.space-app.workspace.open.response'
  | 'shadow.space-app.buddy.create.response'
  | 'shadow.space-app.oauth.authorize.response'
  | 'shadow.space-app.share.response'

export interface ShadowSpaceAppBridgeCapabilitiesRequest {
  type: 'shadow.space-app.capabilities.request'
  requestId: string
  appKey?: string
}

export interface ShadowSpaceAppBridgeSuccessResponse<TResult = unknown> {
  type: ShadowSpaceAppBridgeResponseType
  requestId: string
  ok: true
  result: TResult
}

export interface ShadowSpaceAppBridgeFailureResponse {
  type: ShadowSpaceAppBridgeResponseType
  requestId: string
  ok: false
  error: string
}

export type ShadowSpaceAppBridgeResponse<TResult = unknown> =
  | ShadowSpaceAppBridgeSuccessResponse<TResult>
  | ShadowSpaceAppBridgeFailureResponse

function isProtocolRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function optionalProtocolString(value: unknown) {
  return typeof value === 'string' && value ? value : undefined
}

function protocolPathSegment(value: string) {
  return encodeURIComponent(value)
}

export function shadowSpaceAppInboxTaskEndpoint(
  serverIdOrSlug: string,
  target: ShadowSpaceAppInboxTarget,
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

export function buildShadowSpaceAppInboxTaskRequest(
  input: ShadowSpaceAppHostInboxTaskRequestInput,
): ShadowSpaceAppResolvedInboxTaskRequest {
  const appId = input.app.id ?? input.app.appId ?? input.app.appKey
  const spaceAppData = isProtocolRecord(input.task.data?.spaceApp) ? input.task.data.spaceApp : {}
  return {
    endpoint: shadowSpaceAppInboxTaskEndpoint(input.serverIdOrSlug, input.target),
    body: {
      title: input.task.title,
      body: input.task.body,
      priority: input.task.priority,
      tags: input.task.tags,
      idempotencyKey: input.task.idempotencyKey,
      requirements: input.task.requirements,
      outputContract: input.task.outputContract,
      privacy: input.task.privacy,
      app: {
        id: appId,
        appId,
        appKey: input.app.appKey,
        name: input.app.name ?? input.app.label ?? input.app.appKey,
        label: input.app.label ?? input.app.name ?? input.app.appKey,
        ...(input.app.iconUrl ? { iconUrl: input.app.iconUrl } : {}),
      },
      source: {
        kind: 'space_app',
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
        spaceApp: {
          ...spaceAppData,
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

export function getShadowSpaceAppTaskCardId(message: unknown): string | null {
  const metadata = isProtocolRecord(message) ? message.metadata : null
  const cards = isProtocolRecord(metadata) && Array.isArray(metadata.cards) ? metadata.cards : []
  for (const item of cards) {
    if (!isProtocolRecord(item)) continue
    if (item.kind === 'task' && typeof item.id === 'string' && item.id) return item.id
  }
  return null
}

export function buildShadowSpaceAppInboxDelivery(
  input: ShadowSpaceAppInboxDeliveryFromMessageInput,
): ShadowSpaceAppInboxDelivery {
  const message = isProtocolRecord(input.message) ? input.message : {}
  return {
    ...('agentId' in input.target && input.target.agentId ? { agentId: input.target.agentId } : {}),
    channelId: optionalProtocolString(message.channelId),
    messageId: optionalProtocolString(message.id),
    cardId: getShadowSpaceAppTaskCardId(message),
    idempotencyKey: input.idempotencyKey,
  }
}

function shadowFromPayload(payload: Record<string, unknown>): ShadowSpaceAppResultShadow | null {
  if (payload.protocol === SHADOW_SPACE_APP_PROTOCOL) {
    return payload as unknown as ShadowSpaceAppResultShadow
  }
  const shadow = isProtocolRecord(payload.shadow) ? payload.shadow : null
  if (shadow?.protocol === SHADOW_SPACE_APP_PROTOCOL) {
    return shadow as unknown as ShadowSpaceAppResultShadow
  }
  return null
}

function mergeShadowResult(
  value: Record<string, unknown>,
  shadow: ShadowSpaceAppResultShadow | null,
): Record<string, unknown> {
  if (!shadow) return value
  const existing = shadowFromPayload(value)
  if (!existing) return { ...value, shadow }
  return {
    ...value,
    shadow: {
      protocol: SHADOW_SPACE_APP_PROTOCOL,
      outbox: {
        ...(existing.outbox ?? {}),
        ...(shadow.outbox ?? {}),
      },
    },
  }
}

export function getShadowSpaceAppInboxDeliveries(payload: unknown): ShadowSpaceAppInboxDelivery[] {
  if (!isProtocolRecord(payload)) return []
  const shadow = shadowFromPayload(payload)
  return shadow?.outbox?.deliveries ?? []
}

export function getShadowSpaceAppInboxErrors(payload: unknown): ShadowSpaceAppInboxDeliveryError[] {
  if (!isProtocolRecord(payload)) return []
  const shadow = shadowFromPayload(payload)
  return shadow?.outbox?.errors ?? []
}

export function getShadowSpaceAppPendingInboxTasks(
  payload: unknown,
  depth = 0,
): ShadowSpaceAppInboxTaskOutbox[] {
  if (!isProtocolRecord(payload) || depth > 4) return []
  const shadow = shadowFromPayload(payload)
  const tasks = shadow?.outbox?.inboxTasks ?? []
  return 'result' in payload && payload.result !== undefined
    ? [...tasks, ...getShadowSpaceAppPendingInboxTasks(payload.result, depth + 1)]
    : tasks
}

export function getShadowSpaceAppChannelMessageDeliveries(
  payload: unknown,
): ShadowSpaceAppChannelMessageDelivery[] {
  if (!isProtocolRecord(payload)) return []
  const shadow = shadowFromPayload(payload)
  return shadow?.outbox?.channelMessageDeliveries ?? []
}

export function getShadowSpaceAppChannelMessageErrors(
  payload: unknown,
): ShadowSpaceAppChannelMessageDeliveryError[] {
  if (!isProtocolRecord(payload)) return []
  const shadow = shadowFromPayload(payload)
  return shadow?.outbox?.channelMessageErrors ?? []
}

export function getShadowSpaceAppPendingChannelMessages(
  payload: unknown,
  depth = 0,
): ShadowSpaceAppChannelMessageOutbox[] {
  if (!isProtocolRecord(payload) || depth > 4) return []
  const shadow = shadowFromPayload(payload)
  const messages = shadow?.outbox?.channelMessages ?? []
  return 'result' in payload && payload.result !== undefined
    ? [...messages, ...getShadowSpaceAppPendingChannelMessages(payload.result, depth + 1)]
    : messages
}

export function hasShadowSpaceAppPendingOutbox(payload: unknown): boolean {
  return (
    getShadowSpaceAppPendingInboxTasks(payload).length > 0 ||
    getShadowSpaceAppPendingChannelMessages(payload).length > 0
  )
}

function isDomainResultWithEvents(payload: Record<string, unknown>): boolean {
  return Array.isArray(payload.events) && ('cursor' in payload || 'result' in payload)
}

function isCommandPayloadEnvelope(payload: Record<string, unknown>): boolean {
  if (isDomainResultWithEvents(payload)) return false
  return payload.ok === true || payload.ok === false || shadowFromPayload(payload) !== null
}

export function unwrapShadowSpaceAppCommandPayload<TResult = unknown>(payload: unknown): TResult {
  if (isProtocolRecord(payload) && payload.ok === false) {
    throw new Error(typeof payload.error === 'string' ? payload.error : 'Command failed')
  }
  if (
    isProtocolRecord(payload) &&
    'result' in payload &&
    payload.result !== undefined &&
    isCommandPayloadEnvelope(payload)
  ) {
    const nested = unwrapShadowSpaceAppCommandPayload<unknown>(payload.result)
    const shadow = shadowFromPayload(payload)
    if (isProtocolRecord(nested)) return mergeShadowResult(nested, shadow) as TResult
    return nested as TResult
  }
  return payload as TResult
}

async function readShadowSpaceAppResponsePayload(response: Response) {
  const text = await response.text().catch(() => '')
  if (!text.trim()) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    if (!response.ok) return { ok: false, error: text }
    throw new ShadowSpaceAppHttpError(response.status, 'Command returned invalid JSON', text)
  }
}

function shadowSpaceAppResponseErrorMessage(
  status: number,
  payload: unknown,
  fallback = 'Command failed',
) {
  if (isProtocolRecord(payload) && typeof payload.error === 'string' && payload.error) {
    return payload.error
  }
  if (typeof payload === 'string' && payload.trim()) return payload
  return status ? `${fallback} (${status})` : fallback
}

export async function readShadowSpaceAppCommandResponse<TResult = unknown>(
  response: Response,
): Promise<TResult> {
  const payload = await readShadowSpaceAppResponsePayload(response)
  if (!response.ok || (isProtocolRecord(payload) && payload.ok === false)) {
    throw new ShadowSpaceAppHttpError(
      response.status,
      shadowSpaceAppResponseErrorMessage(response.status, payload),
      payload,
    )
  }
  return unwrapShadowSpaceAppCommandPayload<TResult>(payload)
}

export class ShadowSpaceAppOutbox {
  private readonly inboxTasks: ShadowSpaceAppInboxTaskOutbox[] = []
  private readonly channelMessages: ShadowSpaceAppChannelMessageOutbox[] = []

  enqueueInboxTask(task: ShadowSpaceAppInboxTaskOutbox): this {
    this.inboxTasks.push(task)
    return this
  }

  enqueueInboxTasks(tasks: ShadowSpaceAppInboxTaskOutbox[]): this {
    for (const task of tasks) this.enqueueInboxTask(task)
    return this
  }

  sendChannelMessage(message: ShadowSpaceAppChannelMessageOutbox): this {
    this.channelMessages.push(message)
    return this
  }

  sendChannelMessages(messages: ShadowSpaceAppChannelMessageOutbox[]): this {
    for (const message of messages) this.sendChannelMessage(message)
    return this
  }

  toShadow(): ShadowSpaceAppResultShadow {
    return {
      protocol: SHADOW_SPACE_APP_PROTOCOL,
      outbox: {
        ...(this.inboxTasks.length > 0 ? { inboxTasks: [...this.inboxTasks] } : {}),
        ...(this.channelMessages.length > 0 ? { channelMessages: [...this.channelMessages] } : {}),
      },
    }
  }

  attachTo<TResult extends Record<string, unknown>>(
    result: TResult,
  ): ShadowSpaceAppResultWithShadow<TResult> {
    return { ...result, shadow: this.toShadow() }
  }
}

export interface ShadowSpaceAppActorRef {
  kind: string
  id: string
  userId: string | null
  buddyAgentId: string | null
  ownerId: string | null
  displayName: string
  avatarUrl: string | null
}

export type ShadowSpaceAppIdentitySubjectKind =
  | 'user'
  | 'buddy'
  | 'agent'
  | 'system'
  | 'local'
  | 'unknown'

export interface ShadowSpaceAppIdentitySnapshot extends ShadowSpaceAppActorRef {
  subjectKind: ShadowSpaceAppIdentitySubjectKind
  stableKey: string
}

export interface ShadowSpaceAppCollaborationResource {
  appKey: string
  serverId: string
  kind: string
  id: string
  label?: string | null
  projectId?: string | null
  boardId?: string | null
}

export interface ShadowSpaceAppCollaborationMutation {
  clientMutationId?: string | null
  baseCursor?: string | null
}

export interface ShadowSpaceAppCollaborationEvent<TPayload = unknown>
  extends ShadowSpaceAppCollaborationMutation {
  protocol: typeof SHADOW_SPACE_APP_PROTOCOL
  type: string
  cursor: string
  occurredAt: string
  resource: ShadowSpaceAppCollaborationResource
  actor: ShadowSpaceAppIdentitySnapshot
  payload: TPayload
}

export interface ShadowSpaceAppCommandParseError {
  ok: false
  status: 400 | 401 | 403 | 502
  error: string
  issues?: ShadowSpaceAppValidationIssue[]
}

export interface ShadowSpaceAppCommandParseSuccess<T = unknown> {
  ok: true
  envelope: ShadowSpaceAppCommandEnvelope<T>
}

export type ShadowSpaceAppCommandParseResult<T = unknown> =
  | ShadowSpaceAppCommandParseSuccess<T>
  | ShadowSpaceAppCommandParseError

export interface ShadowSpaceAppManifestOptions {
  publicBaseUrl?: string
  apiBaseUrl?: string
  port?: number
  iframePath?: string
  iconPath?: string
  allowedOrigins?: string[]
}

export interface ShadowSpaceAppIntrospectionInput {
  token: string
  shadowBaseUrl?: string
  fetchImpl?: ShadowSpaceAppFetch
}

export interface ShadowSpaceAppCommandRequestInput {
  authorizationHeader?: string | null
  expectedCommand: string
  requestBody?: string
  requestInput?: unknown
  shadowBaseUrl?: string
  fetchImpl?: ShadowSpaceAppFetch
}

export interface ShadowSpaceAppCommandRuntimeRequest {
  authorizationHeader?: string | null
  requestBody?: string
  requestInput?: unknown
}

export interface ShadowSpaceAppRuntimeOptions {
  shadowBaseUrl?: string
  fetchImpl?: ShadowSpaceAppFetch
}

export interface ShadowSpaceAppCommandHandlerContext {
  context: ShadowSpaceAppCommandContext
  actor: ShadowSpaceAppActorRef
}

export type ShadowSpaceAppCommandHandler<TInput = unknown, TResult = unknown> = (
  input: TInput,
  context: ShadowSpaceAppCommandHandlerContext,
) => TResult | Promise<TResult>

export type ShadowSpaceAppCommandHandlers<TManifest extends ShadowSpaceAppManifest> = {
  [TCommand in TManifest['commands'][number] as TCommand['name']]: ShadowSpaceAppCommandHandler<
    ShadowSpaceAppCommandInput<TManifest, TCommand['name']>
  >
}

export interface ShadowSpaceAppExecutionSuccess<TResult = unknown> {
  ok: true
  status: 200
  body: ShadowSpaceAppCommandSuccessResponse<TResult>
}

export interface ShadowSpaceAppExecutionFailure {
  ok: false
  status: number
  body: ShadowSpaceAppCommandFailureResponse
}

export type ShadowSpaceAppExecutionResult<TResult = unknown> =
  | ShadowSpaceAppExecutionSuccess<TResult>
  | ShadowSpaceAppExecutionFailure

export interface ShadowSpaceAppValidationIssue {
  path: string
  message: string
}

export type ShadowSpaceAppCommandName<TManifest extends ShadowSpaceAppManifest> =
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

type ExtractShadowSpaceAppCommand<
  TManifest extends ShadowSpaceAppManifest,
  TCommandName extends ShadowSpaceAppCommandName<TManifest>,
> = Extract<TManifest['commands'][number], { name: TCommandName }>

export type ShadowSpaceAppCommandInput<
  TManifest extends ShadowSpaceAppManifest,
  TCommandName extends ShadowSpaceAppCommandName<TManifest>,
> =
  ExtractShadowSpaceAppCommand<TManifest, TCommandName> extends { inputSchema: infer TSchema }
    ? JsonSchemaToType<TSchema>
    : Record<string, never>

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '')
}

function joinBasePath(baseUrl: string, path: string) {
  const cleanBase = trimTrailingSlash(baseUrl)
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  return `${cleanBase}${cleanPath}`
}

export type ShadowSpaceAppEnvironment = Record<string, string | undefined>

export const SHADOW_SPACE_APP_PUBLIC_AVATAR_CACHE_CONTROL = 'public, max-age=31536000, immutable'

function firstEnvironmentValue(
  env: ShadowSpaceAppEnvironment,
  keys: readonly string[],
  fallback: string,
) {
  for (const key of keys) {
    const value = env[key]?.trim()
    if (value) return value
  }
  return fallback
}

export function shadowSpaceAppApiBaseUrl(env: ShadowSpaceAppEnvironment = {}) {
  return trimTrailingSlash(
    firstEnvironmentValue(
      env,
      ['SHADOWOB_INTERNAL_SERVER_URL', 'SHADOWOB_SERVER_URL'],
      'http://localhost:3002',
    ),
  )
}

export function shadowSpaceAppPublicBaseUrl(env: ShadowSpaceAppEnvironment = {}) {
  return trimTrailingSlash(
    firstEnvironmentValue(
      env,
      [
        'SHADOWOB_PUBLIC_BASE_URL',
        'SHADOWOB_WEB_BASE_URL',
        'SHADOWOB_OAUTH_AUTHORIZE_BASE_URL',
        'OAUTH_BASE_URL',
        'SHADOWOB_SERVER_URL',
      ],
      'http://localhost:3000',
    ),
  )
}

export function shadowSpaceAppPublicUrl(pathOrUrl: string, env: ShadowSpaceAppEnvironment = {}) {
  if (!pathOrUrl.startsWith('/')) return pathOrUrl
  return joinBasePath(shadowSpaceAppPublicBaseUrl(env), pathOrUrl)
}

export function isShadowSpaceAppSignedMediaUrl(value: string, env: ShadowSpaceAppEnvironment = {}) {
  const mediaUrl = value.trim()
  if (mediaUrl.startsWith('/api/media/signed/')) return true
  try {
    return new URL(mediaUrl, shadowSpaceAppPublicBaseUrl(env)).pathname.startsWith(
      '/api/media/signed/',
    )
  } catch {
    return false
  }
}

export function normalizeShadowSpaceAppAvatarUrl(
  value: unknown,
  env: ShadowSpaceAppEnvironment = {},
) {
  if (typeof value !== 'string') return null
  const avatarUrl = value.trim()
  if (!avatarUrl || avatarUrl.length > 500) return null
  if (isShadowSpaceAppSignedMediaUrl(avatarUrl, env)) return null
  return shadowSpaceAppPublicUrl(avatarUrl, env)
}

export function shadowSpaceAppAvatarRedirectUrl(
  requestUrl: string,
  env: ShadowSpaceAppEnvironment = {},
) {
  return shadowSpaceAppPublicUrl(new URL(requestUrl).pathname, env)
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

export function extractShadowSpaceAppBearerToken(value?: string | null) {
  if (!value) return null
  return value.toLowerCase().startsWith('bearer ') ? value.slice(7).trim() : null
}

function decodeBase64UrlJson<T>(value: string): T | null {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    const binary = globalThis.atob(padded)
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes)) as T
  } catch {
    return null
  }
}

function decodeShadowSpaceAppLaunchTokenPayload(token?: string | null) {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== 'sat_v1') return null
  return decodeBase64UrlJson<{
    serverId?: unknown
    appKey?: unknown
    exp?: unknown
  }>(parts[1]!)
}

export function decodeShadowSpaceAppLaunchTokenHint(
  token?: string | null,
): ShadowSpaceAppLaunchTokenHint | null {
  const payload = decodeShadowSpaceAppLaunchTokenPayload(token)
  if (typeof payload?.serverId !== 'string' || typeof payload.appKey !== 'string') return null
  return { serverId: payload.serverId, appKey: payload.appKey }
}

function shadowLaunchFetchId(fetchFn: ShadowSpaceAppFetch) {
  const existing = shadowLaunchFetchIds.get(fetchFn)
  if (existing) return existing
  const id = nextShadowLaunchFetchId++
  shadowLaunchFetchIds.set(fetchFn, id)
  return id
}

function shadowLaunchIntrospectionCacheKey(
  fetchFn: ShadowSpaceAppFetch,
  baseUrl: string,
  launchToken: string,
) {
  return `${shadowLaunchFetchId(fetchFn)}:${baseUrl}:${launchToken}`
}

function pruneShadowLaunchIntrospectionCache(now: number) {
  for (const [key, entry] of shadowLaunchIntrospectionCache) {
    if (entry.expiresAt <= now) shadowLaunchIntrospectionCache.delete(key)
  }
  while (shadowLaunchIntrospectionCache.size >= SHADOW_LAUNCH_INTROSPECTION_CACHE_LIMIT) {
    const oldestKey = shadowLaunchIntrospectionCache.keys().next().value
    if (typeof oldestKey !== 'string') break
    shadowLaunchIntrospectionCache.delete(oldestKey)
  }
}

function shadowLaunchIntrospectionExpiry(launchToken: string, now: number) {
  const payload = decodeShadowSpaceAppLaunchTokenPayload(launchToken)
  const tokenExpiresAt =
    typeof payload?.exp === 'number' && Number.isFinite(payload.exp)
      ? payload.exp * 1_000
      : Number.POSITIVE_INFINITY
  return Math.min(now + SHADOW_LAUNCH_INTROSPECTION_CACHE_TTL_MS, tokenExpiresAt)
}

export async function fetchShadowSpaceAppLaunchInboxes(
  options: ShadowSpaceAppLaunchFetchOptions,
): Promise<{ inboxes: ShadowBuddyInboxSummary[] }> {
  const hint = decodeShadowSpaceAppLaunchTokenHint(options.launchToken)
  if (!hint || !options.launchToken) return { inboxes: [] }
  const fetchFn = options.fetch ?? fetch
  const baseUrl = trimTrailingSlash(options.shadowApiBaseUrl ?? 'http://localhost:3002')
  const response = await fetchFn(
    `${baseUrl}/api/servers/${encodeURIComponent(hint.serverId)}/space-apps/${encodeURIComponent(
      hint.appKey,
    )}/launch/inboxes`,
    { headers: { Authorization: `Bearer ${options.launchToken}` } },
  )
  if (!response.ok) {
    const message = await response.text().catch(() => '')
    throw new Error(`Shadow launch inbox lookup failed (${response.status}): ${message}`)
  }
  return (await response.json()) as { inboxes: ShadowBuddyInboxSummary[] }
}

export async function fetchShadowSpaceAppLaunchMembers(
  options: ShadowSpaceAppLaunchFetchOptions,
): Promise<{ members: ShadowSpaceAppLaunchMember[] }> {
  const hint = decodeShadowSpaceAppLaunchTokenHint(options.launchToken)
  if (!hint || !options.launchToken) return { members: [] }
  const fetchFn = options.fetch ?? fetch
  const baseUrl = trimTrailingSlash(options.shadowApiBaseUrl ?? 'http://localhost:3002')
  const response = await fetchFn(
    `${baseUrl}/api/servers/${encodeURIComponent(hint.serverId)}/space-apps/${encodeURIComponent(
      hint.appKey,
    )}/launch/members`,
    {
      headers: { Authorization: `Bearer ${options.launchToken}` },
      signal: AbortSignal.timeout(SHADOW_LAUNCH_INTROSPECTION_TIMEOUT_MS),
    },
  )
  if (!response.ok) {
    const message = await response.text().catch(() => '')
    throw new Error(`Shadow launch member lookup failed (${response.status}): ${message}`)
  }
  return (await response.json()) as { members: ShadowSpaceAppLaunchMember[] }
}

export async function fetchShadowSpaceAppLaunchChannels(
  options: ShadowSpaceAppLaunchFetchOptions,
): Promise<{ channels: ShadowSpaceAppLaunchChannel[] }> {
  const hint = decodeShadowSpaceAppLaunchTokenHint(options.launchToken)
  if (!hint || !options.launchToken) return { channels: [] }
  const fetchFn = options.fetch ?? fetch
  const baseUrl = trimTrailingSlash(options.shadowApiBaseUrl ?? 'http://localhost:3002')
  const response = await fetchFn(
    `${baseUrl}/api/servers/${encodeURIComponent(hint.serverId)}/space-apps/${encodeURIComponent(
      hint.appKey,
    )}/launch/channels`,
    {
      headers: { Authorization: `Bearer ${options.launchToken}` },
      signal: AbortSignal.timeout(SHADOW_LAUNCH_INTROSPECTION_TIMEOUT_MS),
    },
  )
  if (!response.ok) {
    const message = await response.text().catch(() => '')
    throw new Error(`Shadow launch channel lookup failed (${response.status}): ${message}`)
  }
  return (await response.json()) as { channels: ShadowSpaceAppLaunchChannel[] }
}

export async function fetchShadowSpaceAppLaunchMessage(
  options: ShadowSpaceAppLaunchFetchOptions & { messageId: string },
): Promise<Record<string, unknown>> {
  const hint = decodeShadowSpaceAppLaunchTokenHint(options.launchToken)
  if (!hint || !options.launchToken) throw new Error('Shadow launch token is required')
  const fetchFn = options.fetch ?? fetch
  const baseUrl = trimTrailingSlash(options.shadowApiBaseUrl ?? 'http://localhost:3002')
  const response = await fetchFn(
    `${baseUrl}/api/servers/${encodeURIComponent(hint.serverId)}/space-apps/${encodeURIComponent(
      hint.appKey,
    )}/launch/messages/${encodeURIComponent(options.messageId)}`,
    {
      headers: { Authorization: `Bearer ${options.launchToken}` },
      signal: AbortSignal.timeout(SHADOW_LAUNCH_INTROSPECTION_TIMEOUT_MS),
    },
  )
  if (!response.ok) {
    const message = await response.text().catch(() => '')
    throw new Error(`Shadow launch message lookup failed (${response.status}): ${message}`)
  }
  return (await response.json()) as Record<string, unknown>
}

export async function ensureShadowSpaceAppLaunchChannel(
  options: ShadowSpaceAppLaunchFetchOptions & {
    input: ShadowSpaceAppLaunchEnsureChannelInput
  },
): Promise<ShadowSpaceAppLaunchEnsureChannelResult> {
  const hint = decodeShadowSpaceAppLaunchTokenHint(options.launchToken)
  if (!hint || !options.launchToken) throw new Error('Shadow launch token is required')
  const fetchFn = options.fetch ?? fetch
  const baseUrl = trimTrailingSlash(options.shadowApiBaseUrl ?? 'http://localhost:3002')
  const response = await fetchFn(
    `${baseUrl}/api/servers/${encodeURIComponent(hint.serverId)}/space-apps/${encodeURIComponent(
      hint.appKey,
    )}/launch/channels/ensure`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.launchToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(options.input),
      signal: AbortSignal.timeout(SHADOW_LAUNCH_INTROSPECTION_TIMEOUT_MS),
    },
  )
  if (!response.ok) {
    const message = await response.text().catch(() => '')
    throw new Error(`Shadow launch channel ensure failed (${response.status}): ${message}`)
  }
  return (await response.json()) as ShadowSpaceAppLaunchEnsureChannelResult
}

export async function createShadowSpaceAppLaunchPoll(
  options: ShadowSpaceAppLaunchFetchOptions & {
    input: ShadowSpaceAppLaunchCreatePollInput
  },
): Promise<ShadowSpaceAppLaunchCreatePollResult> {
  const hint = decodeShadowSpaceAppLaunchTokenHint(options.launchToken)
  if (!hint || !options.launchToken) throw new Error('Shadow launch token is required')
  const fetchFn = options.fetch ?? fetch
  const baseUrl = trimTrailingSlash(options.shadowApiBaseUrl ?? 'http://localhost:3002')
  const response = await fetchFn(
    `${baseUrl}/api/servers/${encodeURIComponent(hint.serverId)}/space-apps/${encodeURIComponent(
      hint.appKey,
    )}/launch/polls`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.launchToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...options.input,
        answers: options.input.answers.map((answer) =>
          typeof answer === 'string' ? { text: answer } : answer,
        ),
      }),
      signal: AbortSignal.timeout(SHADOW_LAUNCH_INTROSPECTION_TIMEOUT_MS),
    },
  )
  if (!response.ok) {
    const message = await response.text().catch(() => '')
    throw new Error(`Shadow launch poll creation failed (${response.status}): ${message}`)
  }
  return (await response.json()) as ShadowSpaceAppLaunchCreatePollResult
}

export async function ensureShadowSpaceAppLaunchBuddyTaskGrant(
  options: ShadowSpaceAppLaunchFetchOptions & {
    input: ShadowSpaceAppLaunchEnsureBuddyTaskGrantInput
  },
): Promise<ShadowSpaceAppLaunchEnsureBuddyTaskGrantResult> {
  const hint = decodeShadowSpaceAppLaunchTokenHint(options.launchToken)
  if (!hint || !options.launchToken) throw new Error('Shadow launch token is required')
  const fetchFn = options.fetch ?? fetch
  const baseUrl = trimTrailingSlash(options.shadowApiBaseUrl ?? 'http://localhost:3002')
  const response = await fetchFn(
    `${baseUrl}/api/servers/${encodeURIComponent(hint.serverId)}/space-apps/${encodeURIComponent(
      hint.appKey,
    )}/launch/buddy-grants/ensure`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.launchToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(options.input),
      signal: AbortSignal.timeout(SHADOW_LAUNCH_INTROSPECTION_TIMEOUT_MS),
    },
  )
  if (!response.ok) {
    const message = await response.text().catch(() => '')
    throw new Error(`Shadow launch Buddy grant failed (${response.status}): ${message}`)
  }
  return (await response.json()) as ShadowSpaceAppLaunchEnsureBuddyTaskGrantResult
}

export async function introspectShadowSpaceAppLaunchToken(
  options: ShadowSpaceAppLaunchFetchOptions,
): Promise<ShadowSpaceAppLaunchIntrospection | null> {
  const hint = decodeShadowSpaceAppLaunchTokenHint(options.launchToken)
  if (!hint || !options.launchToken) return null
  const fetchFn = options.fetch ?? fetch
  const baseUrl = trimTrailingSlash(options.shadowApiBaseUrl ?? 'http://localhost:3002')
  const cacheKey = shadowLaunchIntrospectionCacheKey(fetchFn, baseUrl, options.launchToken)
  const now = Date.now()
  const cached = shadowLaunchIntrospectionCache.get(cacheKey)
  if (cached && cached.expiresAt > now) return cached.value
  shadowLaunchIntrospectionCache.delete(cacheKey)

  const inFlight = shadowLaunchIntrospectionRequests.get(cacheKey)
  if (inFlight) return inFlight

  const request = (async () => {
    const response = await fetchFn(
      `${baseUrl}/api/servers/${encodeURIComponent(hint.serverId)}/space-apps/${encodeURIComponent(
        hint.appKey,
      )}/launch/introspect`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${options.launchToken}` },
        signal: AbortSignal.timeout(SHADOW_LAUNCH_INTROSPECTION_TIMEOUT_MS),
      },
    )
    if (!response.ok) {
      const payload = await readShadowSpaceAppResponsePayload(response).catch(() => null)
      return {
        active: false,
        error: shadowSpaceAppResponseErrorMessage(response.status, payload, 'invalid_launch_token'),
      }
    }
    const payload = (await response
      .json()
      .catch(() => null)) as ShadowSpaceAppLaunchIntrospection | null
    const introspection = typeof payload?.active === 'boolean' ? payload : null
    if (introspection?.active) {
      const cachedAt = Date.now()
      const expiresAt = shadowLaunchIntrospectionExpiry(options.launchToken!, cachedAt)
      if (expiresAt > cachedAt) {
        pruneShadowLaunchIntrospectionCache(cachedAt)
        shadowLaunchIntrospectionCache.set(cacheKey, { expiresAt, value: introspection })
      }
    }
    return introspection
  })().finally(() => shadowLaunchIntrospectionRequests.delete(cacheKey))
  shadowLaunchIntrospectionRequests.set(cacheKey, request)
  return request
}

export function shadowSpaceAppLaunchIntrospectionError(
  introspection: ShadowSpaceAppLaunchIntrospection | null,
) {
  return (
    introspection?.error ??
    introspection?.reason ??
    introspection?.error_description ??
    'invalid_launch_token'
  )
}

export function shadowSpaceAppLaunchCommandContextFromIntrospection(
  options: ShadowSpaceAppLaunchCommandContextOptions,
  introspection: ShadowSpaceAppLaunchIntrospection,
): ShadowSpaceAppCommandContext | null {
  const shadow = introspection.active ? introspection.shadow : null
  if (!shadow) return null
  const command = options.manifest.commands.find((item) => item.name === options.commandName)
  return {
    protocol: SHADOW_SPACE_APP_PROTOCOL,
    serverId: shadow.serverId,
    spaceAppId: shadow.spaceAppId ?? 'launch',
    appKey: shadow.appKey || options.manifest.appKey,
    command: options.commandName,
    actor: shadow.actor,
    channelId: shadow.channelId ?? null,
    resources: shadow.resources ?? null,
    task: shadow.task,
    permission: command?.permission ?? shadow.permission ?? 'space_app.runtime',
    action: command?.action ?? shadow.action ?? 'read',
    dataClass: command?.dataClass ?? shadow.dataClass ?? 'server-private',
  }
}

export async function resolveShadowSpaceAppLaunchCommandContextResolution(
  options: ShadowSpaceAppLaunchCommandContextOptions,
): Promise<ShadowSpaceAppLaunchCommandContextResolution> {
  const introspection = await introspectShadowSpaceAppLaunchToken(options)
  if (!introspection?.active) {
    return {
      context: null,
      introspection,
      error: shadowSpaceAppLaunchIntrospectionError(introspection),
    }
  }
  const context = shadowSpaceAppLaunchCommandContextFromIntrospection(options, introspection)
  return {
    context,
    introspection,
    error: context ? null : shadowSpaceAppLaunchIntrospectionError(introspection),
  }
}

export async function resolveShadowSpaceAppLaunchCommandContext(
  options: ShadowSpaceAppLaunchCommandContextOptions,
): Promise<ShadowSpaceAppCommandContext | null> {
  const resolution = await resolveShadowSpaceAppLaunchCommandContextResolution(options)
  return resolution.context
}

export async function deliverShadowSpaceAppLaunchOutbox(
  options: ShadowSpaceAppLaunchOutboxDeliveryOptions,
): Promise<unknown> {
  const hint = decodeShadowSpaceAppLaunchTokenHint(options.launchToken)
  if (!hint || !options.launchToken) return options.result
  const fetchFn = options.fetch ?? fetch
  const baseUrl = trimTrailingSlash(options.shadowApiBaseUrl ?? 'http://localhost:3002')
  const response = await fetchFn(
    `${baseUrl}/api/servers/${encodeURIComponent(hint.serverId)}/space-apps/${encodeURIComponent(
      hint.appKey,
    )}/launch/outbox`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.launchToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        commandName: options.commandName,
        result: options.result,
      }),
    },
  )
  if (!response.ok) {
    const payload = await readShadowSpaceAppResponsePayload(response)
    throw new ShadowSpaceAppHttpError(
      response.status,
      shadowSpaceAppResponseErrorMessage(
        response.status,
        payload,
        'Shadow launch outbox delivery failed',
      ),
      payload,
    )
  }
  return readShadowSpaceAppResponsePayload(response)
}

export async function publishShadowSpaceAppNotification(
  options: ShadowSpaceAppNotificationPublishOptions,
): Promise<unknown> {
  const hint = decodeShadowSpaceAppLaunchTokenHint(options.launchToken)
  if (!hint || !options.launchToken) {
    throw new Error('A Shadow launch token is required to publish a Space App notification')
  }
  const fetchFn = options.fetch ?? fetch
  const baseUrl = trimTrailingSlash(options.shadowApiBaseUrl ?? 'http://localhost:3002')
  const response = await fetchFn(
    `${baseUrl}/api/servers/${encodeURIComponent(hint.serverId)}/space-apps/${encodeURIComponent(
      hint.appKey,
    )}/notifications`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.launchToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(options.notification),
    },
  )
  if (!response.ok) {
    const payload = await readShadowSpaceAppResponsePayload(response)
    throw new ShadowSpaceAppHttpError(
      response.status,
      shadowSpaceAppResponseErrorMessage(
        response.status,
        payload,
        'Space App notification publish failed',
      ),
      payload,
    )
  }
  return readShadowSpaceAppResponsePayload(response)
}

export function normalizeShadowSpaceAppCommandInput(value: unknown) {
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

export function createShadowSpaceAppManifest<TManifest extends ShadowSpaceAppManifest>(
  manifest: TManifest,
  options: ShadowSpaceAppManifestOptions = {},
): TManifest {
  const publicBaseUrl = trimTrailingSlash(
    options.publicBaseUrl ?? `http://localhost:${options.port ?? 4201}`,
  )
  const apiBaseUrl = trimTrailingSlash(options.apiBaseUrl ?? publicBaseUrl)
  const iframeAllowedOrigins = (options.allowedOrigins ?? [publicBaseUrl]).map((origin) =>
    urlOrigin(origin),
  )
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
          links: manifest.marketplace.links?.map((item) => ({
            ...item,
            url: rebasePublicAssetUrl(item.url, sourceAssetOrigin, publicBaseUrl),
          })),
        }
      : manifest.marketplace,
    iframe: manifest.iframe
      ? {
          ...manifest.iframe,
          entry: joinBasePath(publicBaseUrl, iframePath),
          allowedOrigins: iframeAllowedOrigins,
        }
      : manifest.iframe,
    api: {
      ...manifest.api,
      baseUrl: apiBaseUrl,
    },
  }
}

export function defineShadowSpaceApp<const TManifest extends ShadowSpaceAppManifest>(
  manifest: TManifest,
  options: ShadowSpaceAppRuntimeOptions = {},
) {
  return new ShadowSpaceAppRuntime(manifest, options)
}

export const createShadowSpaceAppRuntime = defineShadowSpaceApp

export class ShadowSpaceAppCommandError extends Error {
  readonly status: number
  readonly issues?: ShadowSpaceAppValidationIssue[] | unknown

  constructor(status: number, error: string, issues?: ShadowSpaceAppValidationIssue[] | unknown) {
    super(error)
    this.name = 'ShadowSpaceAppCommandError'
    this.status = status
    this.issues = issues
  }
}

export function shadowSpaceAppError(
  status: number,
  error: string,
  issues?: ShadowSpaceAppValidationIssue[] | unknown,
) {
  return new ShadowSpaceAppCommandError(status, error, issues)
}

export class ShadowSpaceAppRuntime<const TManifest extends ShadowSpaceAppManifest> {
  constructor(
    readonly sourceManifest: TManifest,
    private readonly options: ShadowSpaceAppRuntimeOptions = {},
  ) {}

  manifest(options: ShadowSpaceAppManifestOptions = {}) {
    return createShadowSpaceAppManifest(this.sourceManifest, options)
  }

  defineCommands(handlers: ShadowSpaceAppCommandHandlers<TManifest>) {
    return handlers
  }

  actor(envelopeOrContext: ShadowSpaceAppCommandEnvelope | ShadowSpaceAppCommandContext) {
    return shadowSpaceAppActorRef(envelopeOrContext)
  }

  error(status: number, error: string, issues?: ShadowSpaceAppValidationIssue[] | unknown) {
    return shadowSpaceAppError(status, error, issues)
  }

  async parseCommand<TCommandName extends ShadowSpaceAppCommandName<TManifest>>(
    commandName: TCommandName,
    request: ShadowSpaceAppCommandRuntimeRequest,
  ) {
    return parseShadowSpaceAppCommandRequest<ShadowSpaceAppCommandInput<TManifest, TCommandName>>({
      ...request,
      expectedCommand: commandName,
      shadowBaseUrl: this.options.shadowBaseUrl,
      fetchImpl: this.options.fetchImpl,
    })
  }

  async executeCommand<TCommandName extends ShadowSpaceAppCommandName<TManifest>>(
    commandName: TCommandName,
    request: ShadowSpaceAppCommandRuntimeRequest,
    handlers: ShadowSpaceAppCommandHandlers<TManifest>,
  ): Promise<ShadowSpaceAppExecutionResult> {
    const parsed = await this.parseCommand(commandName, request)
    if (!parsed.ok) return parseErrorResult(parsed)
    return this.executeEnvelope(commandName, parsed.envelope, handlers)
  }

  async executeLocal<TCommandName extends ShadowSpaceAppCommandName<TManifest>>(
    commandName: TCommandName,
    input: unknown,
    context: ShadowSpaceAppCommandContext,
    handlers: ShadowSpaceAppCommandHandlers<TManifest>,
  ): Promise<ShadowSpaceAppExecutionResult> {
    return this.executeEnvelope(
      commandName,
      {
        input: input as ShadowSpaceAppCommandInput<TManifest, TCommandName>,
        context: {
          ...context,
          command: commandName,
        },
      },
      handlers,
    )
  }

  private async executeEnvelope<TCommandName extends ShadowSpaceAppCommandName<TManifest>>(
    commandName: TCommandName,
    envelope: ShadowSpaceAppCommandEnvelope<ShadowSpaceAppCommandInput<TManifest, TCommandName>>,
    handlers: ShadowSpaceAppCommandHandlers<TManifest>,
  ): Promise<ShadowSpaceAppExecutionResult> {
    const command = this.sourceManifest.commands.find((item) => item.name === commandName)
    if (!command) return failureResult(404, 'command_not_found')
    const validation = validateShadowSpaceAppJsonSchema(command.inputSchema, envelope.input)
    if (!validation.ok) return failureResult(422, 'invalid_input', validation.issues)
    const handler = handlers[commandName] as
      | ShadowSpaceAppCommandHandler<ShadowSpaceAppCommandInput<TManifest, TCommandName>>
      | undefined
    if (!handler) return failureResult(404, 'command_not_found')
    try {
      const result = await handler(envelope.input, {
        context: envelope.context,
        actor: this.actor(envelope),
      })
      return { ok: true, status: 200, body: { ok: true, result } }
    } catch (error) {
      if (error instanceof ShadowSpaceAppCommandError) {
        return failureResult(error.status, error.message, error.issues)
      }
      throw error
    }
  }
}

export async function introspectShadowSpaceAppToken(
  input: ShadowSpaceAppIntrospectionInput,
): Promise<ShadowSpaceAppTokenIntrospection | null> {
  const baseUrl = trimTrailingSlash(input.shadowBaseUrl ?? 'http://localhost:3002')
  const fetchImpl = input.fetchImpl ?? fetch
  const response = await fetchImpl(`${baseUrl}/api/space-apps/commands/introspect`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${input.token}` },
  })
  if (!response.ok) return null
  const payload = (await response.json()) as ShadowSpaceAppTokenIntrospection
  return payload.active ? payload : null
}

export async function parseShadowSpaceAppCommandRequest<T = unknown>(
  input: ShadowSpaceAppCommandRequestInput,
): Promise<ShadowSpaceAppCommandParseResult<T>> {
  const token = extractShadowSpaceAppBearerToken(input.authorizationHeader)
  if (!token) {
    return { ok: false, status: 401, error: 'missing_command_token' }
  }

  const introspection = await introspectShadowSpaceAppToken({
    token,
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
      context: context as ShadowSpaceAppCommandContext,
    },
  }
}

export function validateShadowSpaceAppJsonSchema(
  schema: Readonly<Record<string, unknown>> | undefined,
  value: unknown,
): { ok: true } | { ok: false; issues: ShadowSpaceAppValidationIssue[] } {
  if (!schema) return { ok: true }
  const issues: ShadowSpaceAppValidationIssue[] = []
  validateJsonSchemaValue(schema, value, '', issues)
  return issues.length ? { ok: false, issues } : { ok: true }
}

export function shadowSpaceAppActorDisplayName(
  envelopeOrContext: ShadowSpaceAppCommandEnvelope | ShadowSpaceAppCommandContext,
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

export function shadowSpaceAppActorAvatarUrl(
  envelopeOrContext: ShadowSpaceAppCommandEnvelope | ShadowSpaceAppCommandContext,
) {
  const context = 'context' in envelopeOrContext ? envelopeOrContext.context : envelopeOrContext
  return context.actor.profile?.avatarUrl ?? null
}

export function shadowSpaceAppActorRef(
  envelopeOrContext: ShadowSpaceAppCommandEnvelope | ShadowSpaceAppCommandContext,
): ShadowSpaceAppActorRef {
  const context = 'context' in envelopeOrContext ? envelopeOrContext.context : envelopeOrContext
  const actor = context.actor
  return {
    kind: actor.kind,
    id: actor.buddyAgentId ?? actor.userId ?? actor.ownerId ?? 'unknown',
    userId: actor.userId ?? null,
    buddyAgentId: actor.buddyAgentId ?? null,
    ownerId: actor.ownerId ?? null,
    displayName: shadowSpaceAppActorDisplayName(context),
    avatarUrl: shadowSpaceAppActorAvatarUrl(context),
  }
}

function isShadowSpaceAppActorRef(value: unknown): value is ShadowSpaceAppActorRef {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof (value as ShadowSpaceAppActorRef).kind === 'string' &&
    typeof (value as ShadowSpaceAppActorRef).id === 'string' &&
    typeof (value as ShadowSpaceAppActorRef).displayName === 'string'
  )
}

function shadowSpaceAppIdentitySubjectKind(
  actor: Pick<ShadowSpaceAppActorRef, 'kind' | 'userId' | 'buddyAgentId'>,
): ShadowSpaceAppIdentitySubjectKind {
  if (actor.kind === 'system') return 'system'
  if (actor.kind === 'local') return 'local'
  if (actor.buddyAgentId) return 'buddy'
  if (actor.kind === 'agent') return 'agent'
  if (actor.userId) return 'user'
  return 'unknown'
}

export function shadowSpaceAppIdentityKey(
  actorOrIdentity:
    | ShadowSpaceAppActorRef
    | ShadowSpaceAppIdentitySnapshot
    | ShadowSpaceAppCommandEnvelope
    | ShadowSpaceAppCommandContext,
) {
  const actor = isShadowSpaceAppActorRef(actorOrIdentity)
    ? actorOrIdentity
    : shadowSpaceAppActorRef(actorOrIdentity)
  const subjectKind = shadowSpaceAppIdentitySubjectKind(actor)
  if (subjectKind === 'buddy' && actor.buddyAgentId) return `buddy:${actor.buddyAgentId}`
  if (actor.userId) return `user:${actor.userId}`
  if (actor.ownerId) return `owner:${actor.ownerId}`
  return `${subjectKind}:${actor.id || 'unknown'}`
}

export function shadowSpaceAppIdentitySnapshot(
  actorOrContext:
    | ShadowSpaceAppActorRef
    | ShadowSpaceAppCommandEnvelope
    | ShadowSpaceAppCommandContext,
): ShadowSpaceAppIdentitySnapshot {
  const actor = isShadowSpaceAppActorRef(actorOrContext)
    ? actorOrContext
    : shadowSpaceAppActorRef(actorOrContext)
  return {
    ...actor,
    subjectKind: shadowSpaceAppIdentitySubjectKind(actor),
    stableKey: shadowSpaceAppIdentityKey(actor),
  }
}

export const shadowSpaceAppDisplayIdentity = shadowSpaceAppIdentitySnapshot

export function normalizeShadowSpaceAppClientMutationId(value: unknown) {
  if (typeof value !== 'string') return null
  const clean = value.trim()
  if (!clean) return null
  return clean.slice(0, 160)
}

export function normalizeShadowSpaceAppBaseCursor(value: unknown) {
  if (typeof value !== 'string') return null
  const clean = value.trim()
  if (!clean) return null
  return clean.slice(0, 240)
}

export function createShadowSpaceAppCollaborationResource(
  context: ShadowSpaceAppCommandContext,
  resource: Omit<ShadowSpaceAppCollaborationResource, 'appKey' | 'serverId'> &
    Partial<Pick<ShadowSpaceAppCollaborationResource, 'appKey' | 'serverId'>>,
): ShadowSpaceAppCollaborationResource {
  return {
    appKey: resource.appKey ?? context.appKey,
    serverId: resource.serverId ?? context.serverId,
    kind: resource.kind,
    id: resource.id,
    ...(resource.label !== undefined ? { label: resource.label } : {}),
    ...(resource.projectId !== undefined ? { projectId: resource.projectId } : {}),
    ...(resource.boardId !== undefined ? { boardId: resource.boardId } : {}),
  }
}

export function createShadowSpaceAppCollaborationCursor(input: {
  resource: Pick<ShadowSpaceAppCollaborationResource, 'kind' | 'id'>
  sequence?: number | string | null
  occurredAt?: string | null
}) {
  const sequence = input.sequence ?? Date.now()
  const occurredAt = input.occurredAt ?? new Date().toISOString()
  return `${input.resource.kind}:${input.resource.id}:${sequence}:${occurredAt}`
}

export function createShadowSpaceAppCollaborationEvent<TPayload>(input: {
  type: string
  resource: ShadowSpaceAppCollaborationResource
  actor: ShadowSpaceAppActorRef | ShadowSpaceAppIdentitySnapshot
  payload: TPayload
  cursor?: string | null
  occurredAt?: string | null
  clientMutationId?: unknown
  baseCursor?: unknown
}): ShadowSpaceAppCollaborationEvent<TPayload> {
  const occurredAt = input.occurredAt ?? new Date().toISOString()
  const cursor =
    input.cursor ??
    createShadowSpaceAppCollaborationCursor({
      resource: input.resource,
      occurredAt,
    })
  return {
    protocol: SHADOW_SPACE_APP_PROTOCOL,
    type: input.type,
    cursor,
    occurredAt,
    resource: input.resource,
    actor: shadowSpaceAppIdentitySnapshot(input.actor),
    payload: input.payload,
    clientMutationId: normalizeShadowSpaceAppClientMutationId(input.clientMutationId),
    baseCursor: normalizeShadowSpaceAppBaseCursor(input.baseCursor),
  }
}

function parseErrorResult(error: ShadowSpaceAppCommandParseError): ShadowSpaceAppExecutionFailure {
  return failureResult(error.status, error.error, error.issues)
}

function failureResult(
  status: number,
  error: string,
  issues?: ShadowSpaceAppValidationIssue[] | unknown,
): ShadowSpaceAppExecutionFailure {
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
  issues: ShadowSpaceAppValidationIssue[],
) {
  if (Array.isArray(schema.oneOf)) {
    const matches = schema.oneOf.some((option) => {
      const nestedIssues: ShadowSpaceAppValidationIssue[] = []
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
