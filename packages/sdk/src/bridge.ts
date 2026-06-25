import {
  BUDDY_INBOX_DELIVERY_PERMISSION,
  decodeShadowServerAppLaunchTokenHint,
  deliverShadowServerAppLaunchOutbox,
  getShadowServerAppChannelMessageDeliveries,
  getShadowServerAppChannelMessageErrors,
  getShadowServerAppInboxDeliveries,
  getShadowServerAppInboxErrors,
  hasShadowServerAppPendingOutbox,
  readShadowServerAppCommandResponse,
  type ShadowServerAppChannelMessageDelivery,
  type ShadowServerAppChannelMessageDeliveryError,
  type ShadowServerAppInboxDelivery,
  type ShadowServerAppInboxDeliveryError,
  unwrapShadowServerAppCommandPayload,
} from './server-app'
import type { ShadowBuddyInboxSummary } from './types'

export type {
  ShadowServerAppChannelMessageDelivery,
  ShadowServerAppChannelMessageDeliveryError,
  ShadowServerAppChannelMessageOutbox,
  ShadowServerAppCommandEventType,
  ShadowServerAppHostAppRef,
  ShadowServerAppHostInboxTaskRequestInput,
  ShadowServerAppInboxDelivery,
  ShadowServerAppInboxDeliveryError,
  ShadowServerAppInboxDeliveryFromMessageInput,
  ShadowServerAppInboxTarget,
  ShadowServerAppInboxTaskOutbox,
  ShadowServerAppResolvedInboxTaskRequest,
  ShadowServerAppResultShadow,
} from './server-app'
export {
  buildShadowServerAppInboxDelivery,
  buildShadowServerAppInboxTaskRequest,
  getShadowServerAppChannelMessageDeliveries,
  getShadowServerAppChannelMessageErrors,
  getShadowServerAppTaskCardId,
  readShadowServerAppCommandResponse,
  SHADOW_SERVER_APP_COMMAND_COMPLETED_EVENT,
  SHADOW_SERVER_APP_COMMAND_EVENTS,
  SHADOW_SERVER_APP_COMMAND_FAILED_EVENT,
  shadowServerAppInboxTaskEndpoint,
} from './server-app'
export type { ShadowBuddyInboxSummary }

export interface ShadowBridgeOpenCopilotInput {
  delivery: ShadowServerAppInboxDelivery
}

export interface ShadowBridgeOpenWorkspaceResourceInput {
  resource: {
    uri?: string
    workspaceFileId?: string
    workspaceNodeId?: string
    path?: string
    name?: string
    title?: string
    mimeType?: string
    sizeBytes?: number
  }
}

export interface ShadowBridgeOpenBuddyCreatorInput {
  landing?: {
    title?: string
    description?: string
    source?: string
  }
}

export interface ShadowBridgeListBuddyInboxesInput {
  refresh?: boolean
}

export interface ShadowBridgeEnsureBuddyGrantInput {
  buddyAgentId: string
  permissions: string[]
  reason?: string
}

export interface ShadowBridgeAuthorizeOAuthInput {
  authorizeUrl: string
}

export interface ShadowBridgeAuthorizeOAuthResult {
  opened: boolean
  redirectUrl?: string
}

export interface ShadowBridgeShareAppInput {
  path?: string
  title?: string
  description?: string
  label?: string
  data?: Record<string, unknown>
}

export interface ShadowBridgeShareAppResult {
  opened: boolean
  url?: string
  channel?: 'clipboard' | 'native' | 'channel'
  channelId?: string
}

export interface ShadowBridgeRefreshLaunchInput {
  reason?: string
}

export interface ShadowBridgeLaunchContext {
  iframeEntry?: string | null
  launchToken: string | null
  eventStreamUrl?: string | null
  eventStreamPath?: string | null
  expiresIn?: number | null
}

export interface ShadowBridgeLaunchUpdateInput {
  launchToken: string
  eventStreamUrl?: string | null
  eventStreamPath?: string | null
  expiresIn?: number | null
}

export interface ShadowBridgeRouteNavigateEvent {
  path: string
  requestId: string
}

export type ShadowBridgeRouteNavigateHandler = (
  path: string,
  event: ShadowBridgeRouteNavigateEvent,
) => void | Promise<void>

export type ShadowBridgeLaunchUpdateHandler = (
  context: ShadowBridgeLaunchUpdateInput,
) => void | Promise<void>
export const SHADOW_BRIDGE_CAPABILITIES = [
  'copilot.open',
  'workspace.open',
  'buddy.create.open',
  'buddy.inboxes.list',
  'buddy.grant.ensure',
  'oauth.authorize',
  'launch.refresh',
  'route.navigate',
  'route.report',
  'app.share.open',
] as const

export type ShadowBridgeCapability = (typeof SHADOW_BRIDGE_CAPABILITIES)[number]

export interface ShadowBridgeOptions {
  appKey?: string
  targetOrigin?: string
  timeoutMs?: number
  windowRef?: Window
}

export interface ShadowServerAppBrowserClientOptions extends ShadowBridgeOptions {
  commandBasePath?: string
  inboxesPath?: string
  shadowApiBaseUrl?: string
  fetch?: typeof fetch
  /**
   * Browser outbox delivery is an opt-in fallback for standalone demos.
   * Embedded Server Apps should let the App Backend or Shadow proxy deliver
   * launch outbox on the server side to avoid cross-origin failures and duplicate deliveries.
   */
  deliverLaunchOutboxFromBrowser?: boolean
}

export interface ShadowServerAppEnsureBuddyTaskGrantInput {
  agentId?: string | null
  permissions?: string[]
  reason: string
  timeoutMs?: number
}

export interface ShadowServerAppListBuddyInboxesOptions {
  refresh?: boolean
  emptyOnError?: boolean
  timeoutMs?: number
}

export interface ShadowServerAppLaunchHeadersOptions {
  launchTokenParam?: string
}

export interface ShadowServerAppFetchWithLaunchOptions {
  refresh?: boolean | ShadowBridgeRefreshLaunchInput
}

function commandPath(basePath: string, commandName: string) {
  return `${basePath.replace(/\/+$/u, '')}/${encodeURIComponent(commandName)}`
}

export function shadowServerAppMountedPathPrefix(windowRef?: Window | null) {
  const win = windowRef ?? (typeof window === 'undefined' ? null : window)
  const pathname = win?.location?.pathname ?? ''
  const segments = pathname.split('/').filter(Boolean)
  const shadowIndex = segments.indexOf('shadow')
  if (shadowIndex <= 0 || segments[shadowIndex + 1] !== 'server') return ''
  return `/${segments.slice(0, shadowIndex).join('/')}`
}

export function shadowServerAppMountedPath(path: string, windowRef?: Window | null) {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${shadowServerAppMountedPathPrefix(windowRef)}${normalized}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function withoutUndefined(value: unknown): unknown {
  if (value === undefined) return {}
  if (Array.isArray(value)) return value.map(withoutUndefined)
  if (!isRecord(value)) return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [key, withoutUndefined(entry)]),
  )
}

// Bridge is an embedded-host UX enhancement. Independent integrations must keep
// App API + Shadow REST paths for auth, durable data, media snapshots, and Buddy dispatch.
type BridgeResponseType =
  | 'shadow.app.capabilities.response'
  | 'shadow.app.copilot.open.response'
  | 'shadow.app.workspace.open.response'
  | 'shadow.app.buddy.create.response'
  | 'shadow.app.buddy.inboxes.response'
  | 'shadow.app.buddy.grant.response'
  | 'shadow.app.oauth.authorize.response'
  | 'shadow.app.share.response'
  | 'shadow.app.launch.refresh.response'

type ReactNativeBridgeWindow = Window & {
  __shadowBridgeLaunchContexts?: Record<string, true>
  __shadowBridgeLaunchTokens?: Record<string, string>
  ReactNativeWebView?: {
    postMessage(message: string): void
  }
}

export class ShadowServerAppBrowserClient {
  readonly bridge: ShadowBridge
  private readonly commandBasePath: string
  private readonly inboxesPath: string
  private readonly shadowApiBaseUrl: string | undefined
  private readonly fetchFn: ShadowServerAppBrowserClientOptions['fetch']
  private readonly deliverLaunchOutboxFromBrowser: boolean
  private readonly win: Window | null
  private launchTokenValue: string | null
  private launchEventStreamUrlValue: string | null
  private launchExpiresInValue: number | undefined
  private readonly launchContextHandlers = new Set<
    (context: ShadowBridgeLaunchContext) => void | Promise<void>
  >()
  private readonly unsubscribeLaunchUpdate: () => void

  constructor(options: ShadowServerAppBrowserClientOptions = {}) {
    this.bridge = new ShadowBridge(options)
    const windowRef = options.windowRef ?? (typeof window === 'undefined' ? null : window)
    this.commandBasePath =
      options.commandBasePath ?? shadowServerAppMountedPath('/api/commands', windowRef)
    this.inboxesPath = options.inboxesPath ?? shadowServerAppMountedPath('/api/inboxes', windowRef)
    this.shadowApiBaseUrl = options.shadowApiBaseUrl
    this.fetchFn = options.fetch
    this.deliverLaunchOutboxFromBrowser = options.deliverLaunchOutboxFromBrowser ?? false
    this.win = windowRef
    this.launchTokenValue = this.launchTokenFromLocation()
    this.launchEventStreamUrlValue = this.launchEventStreamUrlFromLocation()
    this.unsubscribeLaunchUpdate = this.bridge.onLaunchUpdate((context) => {
      this.applyLaunchUpdate(context)
      const snapshot = this.launchContext()
      for (const handler of this.launchContextHandlers) {
        void Promise.resolve(handler(snapshot)).catch(() => undefined)
      }
    })
  }

  bridgeAvailable() {
    return this.bridge.isAvailable()
  }

  launchToken(param = 'shadow_launch') {
    return this.launchTokenValue ?? this.launchTokenFromLocation(param)
  }

  launchEventStreamUrl(param = 'shadow_event_stream') {
    return this.launchEventStreamUrlValue ?? this.launchEventStreamUrlFromLocation(param)
  }

  launchContext(): ShadowBridgeLaunchContext {
    return {
      launchToken: this.launchToken(),
      eventStreamUrl: this.launchEventStreamUrl(),
      eventStreamPath: this.launchEventStreamUrl(),
      ...(typeof this.launchExpiresInValue === 'number'
        ? { expiresIn: this.launchExpiresInValue }
        : {}),
    }
  }

  onLaunchContextChange(handler: (context: ShadowBridgeLaunchContext) => void | Promise<void>) {
    this.launchContextHandlers.add(handler)
    return () => {
      this.launchContextHandlers.delete(handler)
    }
  }

  launchHeaders(
    headers: Record<string, string> = {},
    options: ShadowServerAppLaunchHeadersOptions = {},
  ) {
    const token = this.launchToken(options.launchTokenParam)
    return token ? { ...headers, 'X-Shadow-Launch-Token': token } : headers
  }

  async command<TResult = unknown>(commandName: string, input: unknown = {}): Promise<TResult> {
    if (!this.launchToken()) {
      await this.refreshLaunch({ reason: 'command_missing_launch' })
    }
    const path = commandPath(this.commandBasePath, commandName)
    const init = {
      method: 'POST',
      headers: this.launchHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ input: withoutUndefined(input) }),
    }
    let response = await this.fetch(path, init)
    if (response.status === 401 && (await this.refreshLaunch({ reason: 'command_unauthorized' }))) {
      response = await this.fetch(path, {
        ...init,
        headers: this.launchHeaders({ 'Content-Type': 'application/json' }),
      })
    }
    const result = await readShadowServerAppCommandResponse<TResult>(response)
    return this.deliverLaunchOutbox(commandName, result)
  }

  async commandForm<TResult = unknown>(commandName: string, formData: FormData): Promise<TResult> {
    if (!this.launchToken()) {
      await this.refreshLaunch({ reason: 'command_missing_launch' })
    }
    const path = commandPath(this.commandBasePath, commandName)
    const init: RequestInit = {
      method: 'POST',
      headers: this.launchHeaders(),
      body: formData,
    }
    let response = await this.fetch(path, init)
    if (response.status === 401 && (await this.refreshLaunch({ reason: 'command_unauthorized' }))) {
      response = await this.fetch(path, {
        ...init,
        headers: this.launchHeaders(),
      })
    }
    const result = await readShadowServerAppCommandResponse<TResult>(response)
    return this.deliverLaunchOutbox(commandName, result)
  }

  async refreshLaunch(input: ShadowBridgeRefreshLaunchInput = {}) {
    if (!this.bridge.isAvailable()) return null
    try {
      const context = await this.bridge.refreshLaunch(input)
      if (context?.launchToken) {
        this.applyLaunchUpdate({
          launchToken: context.launchToken,
          eventStreamUrl: context.eventStreamUrl,
          eventStreamPath: context.eventStreamPath,
          expiresIn: context.expiresIn,
        })
        const snapshot = this.launchContext()
        for (const handler of this.launchContextHandlers) {
          void Promise.resolve(handler(snapshot)).catch(() => undefined)
        }
      }
      return context
    } catch {
      return null
    }
  }

  async fetchWithLaunch(
    input: RequestInfo | URL,
    init: RequestInit = {},
    options: ShadowServerAppFetchWithLaunchOptions = {},
  ) {
    if (options.refresh) {
      const refreshInput = options.refresh === true ? { reason: 'fetch' } : options.refresh
      await this.refreshLaunch(refreshInput)
    } else if (!this.launchToken()) {
      await this.refreshLaunch({ reason: 'missing_launch' })
    }
    let response = await this.fetch(input, this.withLaunchHeaders(init))
    if (response.status !== 401 || !(await this.refreshLaunch({ reason: 'fetch_unauthorized' }))) {
      return response
    }
    return this.fetch(input, this.withLaunchHeaders(init))
  }

  async listBuddyInboxes<TInbox = ShadowBuddyInboxSummary>(
    options: ShadowServerAppListBuddyInboxesOptions = {},
  ): Promise<{ inboxes: TInbox[] }> {
    if (this.bridge.isAvailable()) {
      try {
        return (await this.bridge.listBuddyInboxes(
          { refresh: options.refresh },
          { timeoutMs: options.timeoutMs ?? 4_000 },
        )) as {
          inboxes: TInbox[]
        }
      } catch {
        // Fall back to the App launch endpoint. Embedded hosts should normally
        // answer the bridge path fastest, but direct browser launches still need
        // the launch-scoped endpoint.
      }
    }

    if (options.refresh || !this.launchToken()) {
      await this.refreshLaunch({
        reason: options.refresh ? 'inboxes_refresh' : 'inboxes_missing_launch',
      })
    }

    if (this.launchToken()) {
      return this.fetchLaunchBuddyInboxes<TInbox>(options)
    }

    return this.fetchLaunchBuddyInboxes<TInbox>(options)
  }

  private async fetchLaunchBuddyInboxes<TInbox = ShadowBuddyInboxSummary>(
    options: ShadowServerAppListBuddyInboxesOptions,
  ): Promise<{ inboxes: TInbox[] }> {
    let response = await this.fetch(this.inboxesPath, { headers: this.launchHeaders() })
    if (response.status === 401 && (await this.refreshLaunch({ reason: 'inboxes_unauthorized' }))) {
      response = await this.fetch(this.inboxesPath, { headers: this.launchHeaders() })
    }
    if (!response.ok) {
      if (options.emptyOnError) return { inboxes: [] }
      const message = await response.text().catch(() => '')
      throw new Error(message || `Buddy inbox lookup failed (${response.status})`)
    }
    return (await response.json()) as { inboxes: TInbox[] }
  }

  async ensureBuddyTaskGrant(input: ShadowServerAppEnsureBuddyTaskGrantInput) {
    const buddyAgentId = input.agentId?.trim()
    if (!buddyAgentId || !this.bridge.isAvailable()) return { granted: false, skipped: true }
    return this.bridge.ensureBuddyGrant(
      {
        buddyAgentId,
        permissions: input.permissions ?? [BUDDY_INBOX_DELIVERY_PERMISSION],
        reason: input.reason,
      },
      { timeoutMs: input.timeoutMs ?? 6_000 },
    )
  }

  openBuddyCreator(
    input: ShadowBridgeOpenBuddyCreatorInput = {},
    options: { timeoutMs?: number } = {},
  ) {
    if (!this.bridge.isAvailable()) return Promise.resolve({ opened: false, agent: null })
    return this.bridge.openBuddyCreator(input, options)
  }

  openCopilot(delivery: ShadowServerAppInboxDelivery, options: { timeoutMs?: number } = {}) {
    return this.bridge.openCopilot(delivery, options)
  }

  openWorkspaceResource(
    input: ShadowBridgeOpenWorkspaceResourceInput,
    options: { timeoutMs?: number } = {},
  ) {
    return this.bridge.openWorkspaceResource(input, options)
  }

  authorizeOAuth(
    input: ShadowBridgeAuthorizeOAuthInput | string,
    options: { timeoutMs?: number } = {},
  ) {
    if (!this.bridge.isAvailable()) return Promise.resolve({ opened: false })
    return this.bridge.authorizeOAuth(input, options)
  }

  routeChanged(path: string) {
    return this.bridge.routeChanged(path)
  }

  onRouteNavigate(handler: ShadowBridgeRouteNavigateHandler) {
    return this.bridge.onRouteNavigate(handler)
  }

  shareApp(input: ShadowBridgeShareAppInput = {}, options: { timeoutMs?: number } = {}) {
    if (!this.bridge.isAvailable()) return Promise.resolve({ opened: false })
    return this.bridge.shareApp(input, options)
  }

  inboxDeliveries(payload: unknown): ShadowServerAppInboxDelivery[] {
    return this.bridge.inboxDeliveries(payload)
  }

  inboxErrors(payload: unknown): ShadowServerAppInboxDeliveryError[] {
    return this.bridge.inboxErrors(payload)
  }

  channelMessageDeliveries(payload: unknown): ShadowServerAppChannelMessageDelivery[] {
    return this.bridge.channelMessageDeliveries(payload)
  }

  channelMessageErrors(payload: unknown): ShadowServerAppChannelMessageDeliveryError[] {
    return this.bridge.channelMessageErrors(payload)
  }

  private async deliverLaunchOutbox<TResult>(
    commandName: string,
    result: TResult,
  ): Promise<TResult> {
    if (!this.deliverLaunchOutboxFromBrowser || !hasShadowServerAppPendingOutbox(result)) {
      return result
    }
    const launchToken = this.launchToken()
    if (!decodeShadowServerAppLaunchTokenHint(launchToken)) return result
    return (await deliverShadowServerAppLaunchOutbox({
      commandName,
      result,
      launchToken,
      shadowApiBaseUrl: this.shadowApiBaseUrl,
      fetch: this.fetch.bind(this),
    })) as TResult
  }

  private fetch(input: RequestInfo | URL, init?: RequestInit) {
    if (this.fetchFn) return this.fetchFn(input, init)
    return globalThis.fetch(input, init)
  }

  dispose() {
    this.unsubscribeLaunchUpdate()
    this.launchContextHandlers.clear()
    this.bridge.dispose()
  }

  private launchTokenFromLocation(param = 'shadow_launch') {
    if (!this.win) return null
    return new URLSearchParams(this.win.location.search).get(param)
  }

  private launchEventStreamUrlFromLocation(param = 'shadow_event_stream') {
    if (!this.win) return null
    return new URLSearchParams(this.win.location.search).get(param)
  }

  private applyLaunchUpdate(context: ShadowBridgeLaunchUpdateInput) {
    this.launchTokenValue = context.launchToken
    this.launchEventStreamUrlValue = context.eventStreamUrl ?? context.eventStreamPath ?? null
    this.launchExpiresInValue =
      typeof context.expiresIn === 'number' ? context.expiresIn : undefined
  }

  private withLaunchHeaders(init: RequestInit): RequestInit {
    const headers = new Headers(init.headers)
    const token = this.launchToken()
    if (token) headers.set('X-Shadow-Launch-Token', token)
    return { ...init, headers }
  }
}

export function createShadowServerAppClient(options: ShadowServerAppBrowserClientOptions = {}) {
  return new ShadowServerAppBrowserClient(options)
}

export const createShadowServerAppBrowserClient = createShadowServerAppClient

export class ShadowBridge {
  static readonly capabilitiesRequestType = 'shadow.app.capabilities.request'
  static readonly capabilitiesResponseType = 'shadow.app.capabilities.response'
  static readonly openCopilotRequestType = 'shadow.app.copilot.open.request'
  static readonly openCopilotResponseType = 'shadow.app.copilot.open.response'
  static readonly openWorkspaceResourceRequestType = 'shadow.app.workspace.open.request'
  static readonly openWorkspaceResourceResponseType = 'shadow.app.workspace.open.response'
  static readonly openBuddyCreatorRequestType = 'shadow.app.buddy.create.request'
  static readonly openBuddyCreatorResponseType = 'shadow.app.buddy.create.response'
  static readonly listBuddyInboxesRequestType = 'shadow.app.buddy.inboxes.request'
  static readonly listBuddyInboxesResponseType = 'shadow.app.buddy.inboxes.response'
  static readonly ensureBuddyGrantRequestType = 'shadow.app.buddy.grant.request'
  static readonly ensureBuddyGrantResponseType = 'shadow.app.buddy.grant.response'
  static readonly authorizeOAuthRequestType = 'shadow.app.oauth.authorize.request'
  static readonly authorizeOAuthResponseType = 'shadow.app.oauth.authorize.response'
  static readonly launchUpdateType = 'shadow.app.launch.update'
  static readonly routeNavigateType = 'shadow.app.navigate'
  static readonly routeNavigateAckType = 'shadow.app.navigate.ack'
  static readonly routeChangedType = 'shadow.app.route.changed'
  static readonly shareAppRequestType = 'shadow.app.share.request'
  static readonly shareAppResponseType = 'shadow.app.share.response'
  static readonly refreshLaunchRequestType = 'shadow.app.launch.refresh.request'
  static readonly refreshLaunchResponseType = 'shadow.app.launch.refresh.response'
  static readonly launchUpdatedEventType = 'shadow.app.launch.updated'

  static inboxDeliveries(payload: unknown): ShadowServerAppInboxDelivery[] {
    return getShadowServerAppInboxDeliveries(payload)
  }

  static inboxErrors(payload: unknown): ShadowServerAppInboxDeliveryError[] {
    return getShadowServerAppInboxErrors(payload)
  }

  static channelMessageDeliveries(payload: unknown): ShadowServerAppChannelMessageDelivery[] {
    return getShadowServerAppChannelMessageDeliveries(payload)
  }

  static channelMessageErrors(payload: unknown): ShadowServerAppChannelMessageDeliveryError[] {
    return getShadowServerAppChannelMessageErrors(payload)
  }

  static unwrapCommandPayload<TResult = unknown>(payload: unknown): TResult {
    return unwrapShadowServerAppCommandPayload<TResult>(payload)
  }

  private appKey?: string
  private readonly targetOrigin: string
  private readonly timeoutMs: number
  private readonly win: ReactNativeBridgeWindow | null
  private hasLaunchContext: boolean
  private launchTokenValue: string | null = null
  private readonly pending = new Map<
    string,
    {
      responseType: BridgeResponseType
      resolve: (value: unknown) => void
      reject: (error: Error) => void
    }
  >()

  private readonly onMessage = (event: MessageEvent) => {
    let data = event.data
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data || '{}')
      } catch {
        return
      }
    }
    if (!data || typeof data !== 'object') return
    const record = data as {
      requestId?: unknown
      type?: unknown
      ok?: unknown
      result?: unknown
      error?: unknown
      launch?: unknown
    }
    if (record.type === ShadowBridge.launchUpdatedEventType) {
      this.applyLaunchContext(record.result ?? record.launch)
      return
    }
    if (typeof record.requestId !== 'string' || typeof record.type !== 'string') return
    const entry = this.pending.get(record.requestId)
    if (!entry || record.type !== entry.responseType) return
    this.pending.delete(record.requestId)
    if (record.ok) {
      if (record.type === ShadowBridge.refreshLaunchResponseType) {
        this.applyLaunchContext(record.result)
      }
      entry.resolve(record.result)
    } else
      entry.reject(
        new Error(typeof record.error === 'string' ? record.error : 'Bridge request failed'),
      )
  }

  constructor(options: ShadowBridgeOptions = {}) {
    this.win = options.windowRef ?? (typeof window === 'undefined' ? null : window)
    this.appKey = options.appKey ?? this.resolveLaunchAppKey()
    this.targetOrigin = options.targetOrigin ?? '*'
    this.timeoutMs = options.timeoutMs ?? 60000
    this.launchTokenValue = this.resolveLaunchToken()
    this.hasLaunchContext = this.resolveLaunchContext()
    this.win?.addEventListener('message', this.onMessage)
  }

  dispose() {
    this.win?.removeEventListener('message', this.onMessage)
    for (const entry of this.pending.values()) {
      entry.reject(new Error('ShadowBridge disposed'))
    }
    this.pending.clear()
  }

  isAvailable() {
    if (!this.win) return false
    return (
      (this.hasLaunchContext || !!this.appKey) &&
      (this.win.parent !== this.win || !!this.win.ReactNativeWebView)
    )
  }

  launchToken(param = 'shadow_launch') {
    if (!this.win) return null
    if (param !== 'shadow_launch') {
      return new URLSearchParams(this.win.location.search).get(param)
    }
    return this.launchTokenValue ?? this.resolveLaunchToken()
  }

  launchHeaders(
    headers: Record<string, string> = {},
    options: ShadowServerAppLaunchHeadersOptions = {},
  ) {
    const token = this.launchToken(options.launchTokenParam)
    return token ? { ...headers, 'X-Shadow-Launch-Token': token } : headers
  }

  capabilities(options: { timeoutMs?: number } = {}) {
    return this.request<{ capabilities: ShadowBridgeCapability[] }>(
      ShadowBridge.capabilitiesRequestType,
      ShadowBridge.capabilitiesResponseType,
      {},
      options.timeoutMs ?? 15000,
    )
  }

  openCopilot(
    deliveryOrInput: ShadowServerAppInboxDelivery | ShadowBridgeOpenCopilotInput,
    options: { timeoutMs?: number } = {},
  ) {
    const input = 'delivery' in deliveryOrInput ? deliveryOrInput : { delivery: deliveryOrInput }
    return this.request<{ opened: boolean }>(
      ShadowBridge.openCopilotRequestType,
      ShadowBridge.openCopilotResponseType,
      input,
      options.timeoutMs ?? 15000,
    )
  }

  openWorkspaceResource(
    input: ShadowBridgeOpenWorkspaceResourceInput,
    options: { timeoutMs?: number } = {},
  ) {
    return this.request<{ opened: boolean }>(
      ShadowBridge.openWorkspaceResourceRequestType,
      ShadowBridge.openWorkspaceResourceResponseType,
      input,
      options.timeoutMs ?? 15000,
    )
  }

  openBuddyCreator(
    input: ShadowBridgeOpenBuddyCreatorInput = {},
    options: { timeoutMs?: number } = {},
  ) {
    return this.request<{ opened: boolean; agent?: unknown }>(
      ShadowBridge.openBuddyCreatorRequestType,
      ShadowBridge.openBuddyCreatorResponseType,
      input,
      options.timeoutMs ?? 10 * 60 * 1000,
    )
  }

  listBuddyInboxes(
    input: ShadowBridgeListBuddyInboxesInput = {},
    options: { timeoutMs?: number } = {},
  ) {
    return this.request<{ inboxes: ShadowBuddyInboxSummary[] }>(
      ShadowBridge.listBuddyInboxesRequestType,
      ShadowBridge.listBuddyInboxesResponseType,
      input,
      options.timeoutMs ?? 15000,
    )
  }

  ensureBuddyGrant(input: ShadowBridgeEnsureBuddyGrantInput, options: { timeoutMs?: number } = {}) {
    return this.request<{ granted: boolean; grant?: unknown }>(
      ShadowBridge.ensureBuddyGrantRequestType,
      ShadowBridge.ensureBuddyGrantResponseType,
      input,
      options.timeoutMs ?? 30000,
    )
  }

  authorizeOAuth(
    input: ShadowBridgeAuthorizeOAuthInput | string,
    options: { timeoutMs?: number } = {},
  ) {
    const payload = typeof input === 'string' ? { authorizeUrl: input } : input
    return this.request<ShadowBridgeAuthorizeOAuthResult>(
      ShadowBridge.authorizeOAuthRequestType,
      ShadowBridge.authorizeOAuthResponseType,
      payload,
      options.timeoutMs ?? 10 * 60 * 1000,
    )
  }

  routeChanged(path: string) {
    if (!this.isAvailable()) return false
    this.postMessage({
      type: ShadowBridge.routeChangedType,
      ...(this.appKey ? { appKey: this.appKey } : {}),
      path,
    })
    return true
  }

  onRouteNavigate(handler: ShadowBridgeRouteNavigateHandler) {
    const win = this.win
    if (!win) return () => undefined
    const listener = (event: MessageEvent) => {
      let data = event.data
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data || '{}')
        } catch {
          return
        }
      }
      if (!data || typeof data !== 'object') return
      const record = data as {
        appKey?: unknown
        requestId?: unknown
        path?: unknown
        type?: unknown
      }
      if (record.type !== ShadowBridge.routeNavigateType) return
      if (this.appKey && typeof record.appKey === 'string' && record.appKey !== this.appKey) {
        return
      }
      if (typeof record.requestId !== 'string' || typeof record.path !== 'string') return
      const eventPayload = { path: record.path, requestId: record.requestId }
      void Promise.resolve(handler(record.path, eventPayload))
        .catch(() => undefined)
        .finally(() => {
          this.postMessage({
            type: ShadowBridge.routeNavigateAckType,
            requestId: record.requestId,
            ...(this.appKey ? { appKey: this.appKey } : {}),
          })
        })
    }
    win.addEventListener('message', listener)
    return () => win.removeEventListener('message', listener)
  }

  onLaunchUpdate(handler: ShadowBridgeLaunchUpdateHandler) {
    const win = this.win
    if (!win) return () => undefined
    const listener = (event: MessageEvent) => {
      let data = event.data
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data || '{}')
        } catch {
          return
        }
      }
      if (!data || typeof data !== 'object') return
      const record = data as {
        appKey?: unknown
        eventStreamPath?: unknown
        eventStreamUrl?: unknown
        expiresIn?: unknown
        launchToken?: unknown
        type?: unknown
      }
      if (
        record.type !== ShadowBridge.launchUpdateType &&
        record.type !== ShadowBridge.launchUpdatedEventType
      ) {
        return
      }
      if (this.appKey && typeof record.appKey === 'string' && record.appKey !== this.appKey) {
        return
      }
      if (typeof record.launchToken !== 'string' || !record.launchToken) return
      const eventStreamUrl =
        typeof record.eventStreamUrl === 'string' && record.eventStreamUrl
          ? record.eventStreamUrl
          : typeof record.eventStreamPath === 'string' && record.eventStreamPath
            ? record.eventStreamPath
            : null
      const eventStreamPath =
        typeof record.eventStreamPath === 'string' && record.eventStreamPath
          ? record.eventStreamPath
          : typeof record.eventStreamUrl === 'string' && record.eventStreamUrl
            ? record.eventStreamUrl
            : null
      void Promise.resolve(
        handler({
          launchToken: record.launchToken,
          eventStreamUrl,
          eventStreamPath,
          ...(typeof record.expiresIn === 'number' ? { expiresIn: record.expiresIn } : {}),
        }),
      ).catch(() => undefined)
    }
    win.addEventListener('message', listener)
    return () => win.removeEventListener('message', listener)
  }

  shareApp(input: ShadowBridgeShareAppInput = {}, options: { timeoutMs?: number } = {}) {
    return this.request<ShadowBridgeShareAppResult>(
      ShadowBridge.shareAppRequestType,
      ShadowBridge.shareAppResponseType,
      input,
      options.timeoutMs ?? 5 * 60 * 1000,
    )
  }

  refreshLaunch(input: ShadowBridgeRefreshLaunchInput = {}, options: { timeoutMs?: number } = {}) {
    return this.request<ShadowBridgeLaunchContext>(
      ShadowBridge.refreshLaunchRequestType,
      ShadowBridge.refreshLaunchResponseType,
      input,
      options.timeoutMs ?? 15000,
    )
  }

  unwrapCommandPayload<TResult = unknown>(payload: unknown): TResult {
    return unwrapShadowServerAppCommandPayload<TResult>(payload)
  }

  inboxDeliveries(payload: unknown): ShadowServerAppInboxDelivery[] {
    return getShadowServerAppInboxDeliveries(payload)
  }

  inboxErrors(payload: unknown): ShadowServerAppInboxDeliveryError[] {
    return getShadowServerAppInboxErrors(payload)
  }

  channelMessageDeliveries(payload: unknown): ShadowServerAppChannelMessageDelivery[] {
    return getShadowServerAppChannelMessageDeliveries(payload)
  }

  channelMessageErrors(payload: unknown): ShadowServerAppChannelMessageDeliveryError[] {
    return getShadowServerAppChannelMessageErrors(payload)
  }

  private request<TResult>(
    requestType: string,
    responseType: BridgeResponseType,
    payload: object,
    timeoutMs = this.timeoutMs,
  ): Promise<TResult> {
    if (!this.isAvailable()) {
      return Promise.reject(
        new Error('ShadowBridge is not available outside a Shadow launch frame'),
      )
    }
    const requestId = `req_${Math.random().toString(36).slice(2)}`
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, {
        responseType,
        resolve: resolve as (value: unknown) => void,
        reject,
      })
      this.postMessage({
        type: requestType,
        requestId,
        ...(this.appKey ? { appKey: this.appKey } : {}),
        ...payload,
      })
      this.win?.setTimeout(() => {
        if (!this.pending.has(requestId)) return
        this.pending.delete(requestId)
        reject(new Error('Bridge request timed out'))
      }, timeoutMs)
    })
  }

  private postMessage(message: unknown) {
    if (!this.win) return
    if (this.win.ReactNativeWebView) {
      this.win.ReactNativeWebView.postMessage(JSON.stringify(message))
      return
    }
    this.win.parent.postMessage(message, this.targetOrigin)
  }

  private launchContextStorageKey() {
    return this.appKey ? `shadow.bridge.launch:${this.appKey}` : null
  }

  private launchTokenStorageKey() {
    return this.appKey ? `shadow.bridge.launch-token:${this.appKey}` : null
  }

  private rememberLaunchToken(token: string) {
    if (!token) return
    const hint = decodeShadowServerAppLaunchTokenHint(token)
    if (!this.appKey && hint?.appKey) this.appKey = hint.appKey
    this.launchTokenValue = token
    this.hasLaunchContext = true
    if (this.appKey) {
      const memoryContexts = (this.win!.__shadowBridgeLaunchContexts ??= {})
      const memoryTokens = (this.win!.__shadowBridgeLaunchTokens ??= {})
      memoryContexts[this.appKey] = true
      memoryTokens[this.appKey] = token
    }
    try {
      const contextKey = this.launchContextStorageKey()
      const tokenKey = this.launchTokenStorageKey()
      if (contextKey) this.win?.sessionStorage?.setItem(contextKey, '1')
      if (tokenKey) this.win?.sessionStorage?.setItem(tokenKey, token)
    } catch {
      // Some embedded contexts restrict sessionStorage; in-memory state remains enough for this frame.
    }
  }

  private resolveLaunchToken() {
    if (!this.win) return null
    const urlToken = new URLSearchParams(this.win.location.search).get('shadow_launch')
    if (urlToken) {
      this.rememberLaunchToken(urlToken)
      return urlToken
    }
    const memoryToken = this.appKey ? this.win.__shadowBridgeLaunchTokens?.[this.appKey] : null
    if (memoryToken) return memoryToken
    try {
      const tokenKey = this.launchTokenStorageKey()
      return tokenKey ? (this.win.sessionStorage?.getItem(tokenKey) ?? null) : null
    } catch {
      return null
    }
  }

  private applyLaunchContext(value: unknown) {
    if (!isRecord(value) || typeof value.launchToken !== 'string') return false
    this.rememberLaunchToken(value.launchToken)
    return true
  }

  private resolveLaunchContext() {
    if (!this.win) return false
    const token = this.launchTokenValue ?? this.resolveLaunchToken()
    if (token) {
      this.rememberLaunchToken(token)
      return true
    }
    const storageKey = this.launchContextStorageKey()
    const memoryContexts = (this.win.__shadowBridgeLaunchContexts ??= {})
    const hasLaunchToken = new URLSearchParams(this.win.location.search).has('shadow_launch')
    if (hasLaunchToken) {
      if (this.appKey) memoryContexts[this.appKey] = true
      try {
        if (storageKey) this.win.sessionStorage?.setItem(storageKey, '1')
      } catch {
        // Some embedded contexts restrict sessionStorage; the launch URL is enough for this instance.
      }
      return true
    }
    if (this.appKey && memoryContexts[this.appKey]) return true
    try {
      return storageKey ? this.win.sessionStorage?.getItem(storageKey) === '1' : false
    } catch {
      return false
    }
  }

  private resolveLaunchAppKey() {
    if (!this.win) return undefined
    const token = new URLSearchParams(this.win.location.search).get('shadow_launch')
    return decodeShadowServerAppLaunchTokenHint(token)?.appKey
  }
}
