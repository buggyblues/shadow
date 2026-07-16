import {
  decodeShadowSpaceAppLaunchTokenHint,
  getShadowSpaceAppChannelMessageDeliveries,
  getShadowSpaceAppChannelMessageErrors,
  getShadowSpaceAppInboxDeliveries,
  getShadowSpaceAppInboxErrors,
  readShadowSpaceAppCommandResponse,
  type ShadowSpaceAppChannelMessageDelivery,
  type ShadowSpaceAppChannelMessageDeliveryError,
  type ShadowSpaceAppInboxDelivery,
  type ShadowSpaceAppInboxDeliveryError,
} from './space-app'
import type { ShadowBuddyInboxSummary } from './types'

export {
  defineShadowSpaceAppAuthorizeElement,
  type ShadowSpaceAppAuthorizeElementData,
} from './bridge-authorization-element'

export type {
  ShadowSpaceAppChannelMessageDelivery,
  ShadowSpaceAppChannelMessageDeliveryError,
  ShadowSpaceAppChannelMessageOutbox,
  ShadowSpaceAppCommandEventType,
  ShadowSpaceAppHostInboxTaskRequestInput,
  ShadowSpaceAppHostRef,
  ShadowSpaceAppInboxDelivery,
  ShadowSpaceAppInboxDeliveryError,
  ShadowSpaceAppInboxDeliveryFromMessageInput,
  ShadowSpaceAppInboxTarget,
  ShadowSpaceAppInboxTaskOutbox,
  ShadowSpaceAppResolvedInboxTaskRequest,
  ShadowSpaceAppResultShadow,
} from './space-app'
export {
  buildShadowSpaceAppInboxDelivery,
  buildShadowSpaceAppInboxTaskRequest,
  getShadowSpaceAppChannelMessageDeliveries,
  getShadowSpaceAppChannelMessageErrors,
  getShadowSpaceAppInboxDeliveries,
  getShadowSpaceAppInboxErrors,
  getShadowSpaceAppTaskCardId,
  readShadowSpaceAppCommandResponse,
  SHADOW_SPACE_APP_COMMAND_COMPLETED_EVENT,
  SHADOW_SPACE_APP_COMMAND_EVENTS,
  SHADOW_SPACE_APP_COMMAND_FAILED_EVENT,
  shadowSpaceAppInboxTaskEndpoint,
} from './space-app'
export type { ShadowBuddyInboxSummary }

export interface ShadowBridgeOpenCopilotInput {
  delivery: ShadowSpaceAppInboxDelivery
}

export interface ShadowBridgeOpenChannelInput {
  channelId: string
  messageId?: string
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

export interface ShadowBridgeAuthorizeOAuthInput {
  authorizeUrl: string
}

export interface ShadowBridgeAuthorizeOAuthResult {
  opened: boolean
  status?: 'opened' | 'redirected' | 'denied' | 'unsupported' | 'timeout' | 'unavailable'
  redirectUrl?: string
  error?: string
}

export interface ShadowBridgeShareSpaceAppInput {
  path?: string
  title?: string
  description?: string
  label?: string
  data?: Record<string, unknown>
}

export interface ShadowBridgeShareSpaceAppResult {
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
  expiresIn?: number | null
}

export interface ShadowBridgeLaunchUpdateInput {
  launchToken: string
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
  'channel.open',
  'workspace.open',
  'buddy.create.open',
  'oauth.authorize',
  'launch.refresh',
  'route.navigate',
  'route.report',
  'space-app.share.open',
] as const

export type ShadowBridgeCapability = (typeof SHADOW_BRIDGE_CAPABILITIES)[number]

export interface ShadowBridgeOptions {
  appKey?: string
  targetOrigin?: string
  timeoutMs?: number
  windowRef?: Window
}

export interface ShadowSpaceAppBrowserClientOptions extends ShadowBridgeOptions {
  commandBasePath?: string
  sessionPath?: string
  inboxesPath?: string
  buddyGrantPath?: string
  fetch?: typeof fetch
}

export interface ShadowSpaceAppEnsureBuddyTaskGrantInput {
  agentId?: string | null
  permissions?: string[]
  reason: string
  timeoutMs?: number
}

export interface ShadowSpaceAppListBuddyInboxesOptions {
  refresh?: boolean
  emptyOnError?: boolean
  timeoutMs?: number
}

export interface ShadowSpaceAppFetchWithSessionOptions {
  refresh?: boolean | ShadowBridgeRefreshLaunchInput
}

export interface ShadowSpaceAppAuthorizeOAuthOptions {
  fallback?: 'none' | 'redirect'
  timeoutMs?: number
}

function commandPath(basePath: string, commandName: string) {
  return `${basePath.replace(/\/+$/u, '')}/${encodeURIComponent(commandName)}`
}

export function shadowSpaceAppMountedPathPrefix(windowRef?: Window | null) {
  const win = windowRef ?? (typeof window === 'undefined' ? null : window)
  const pathname = win?.location?.pathname ?? ''
  const segments = pathname.split('/').filter(Boolean)
  const shadowIndex = segments.indexOf('shadow')
  if (shadowIndex <= 0 || segments[shadowIndex + 1] !== 'server') return ''
  return `/${segments.slice(0, shadowIndex).join('/')}`
}

export function shadowSpaceAppMountedPath(path: string, windowRef?: Window | null) {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${shadowSpaceAppMountedPathPrefix(windowRef)}${normalized}`
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
// Space App API + Shadow REST paths for auth, durable data, media snapshots, and Buddy dispatch.
type BridgeResponseType =
  | 'shadow.space-app.capabilities.response'
  | 'shadow.space-app.copilot.open.response'
  | 'shadow.space-app.channel.open.response'
  | 'shadow.space-app.workspace.open.response'
  | 'shadow.space-app.buddy.create.response'
  | 'shadow.space-app.oauth.authorize.response'
  | 'shadow.space-app.share.response'
  | 'shadow.space-app.launch.refresh.response'

type ReactNativeBridgeWindow = Window & {
  __shadowBridgeLaunchTokens?: Record<string, string>
  ReactNativeWebView?: {
    postMessage(message: string): void
  }
}

export class ShadowSpaceAppBrowserClient {
  readonly bridge: ShadowBridge
  private readonly commandBasePath: string
  private readonly sessionPath: string
  private readonly inboxesPath: string
  private readonly buddyGrantPath: string
  private readonly fetchFn: ShadowSpaceAppBrowserClientOptions['fetch']
  private readonly win: Window | null
  private launchTokenValue: string | null
  private launchEventStreamUrlValue: string | null
  private launchExpiresInValue: number | undefined
  private sessionLaunchToken: string | null = null
  private sessionCsrfToken: string | null = null
  private sessionExchangePromise: Promise<boolean> | null = null
  private launchRefreshPromise: Promise<ShadowBridgeLaunchContext | null> | null = null
  private readonly launchContextHandlers = new Set<
    (context: ShadowBridgeLaunchContext) => void | Promise<void>
  >()
  private readonly unsubscribeLaunchUpdate: () => void

  constructor(options: ShadowSpaceAppBrowserClientOptions = {}) {
    this.bridge = new ShadowBridge(options)
    const windowRef = options.windowRef ?? (typeof window === 'undefined' ? null : window)
    this.commandBasePath =
      options.commandBasePath ?? shadowSpaceAppMountedPath('/api/commands', windowRef)
    this.sessionPath =
      options.sessionPath ?? shadowSpaceAppMountedPath('/api/shadow/session', windowRef)
    this.inboxesPath = options.inboxesPath ?? shadowSpaceAppMountedPath('/api/inboxes', windowRef)
    this.buddyGrantPath =
      options.buddyGrantPath ??
      shadowSpaceAppMountedPath('/api/shadow/buddy-grants/ensure', windowRef)
    this.fetchFn = options.fetch
    this.win = windowRef
    this.launchTokenValue = this.bridge.launchToken()
    this.launchEventStreamUrlValue = shadowSpaceAppMountedPath('/api/shadow/events', windowRef)
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

  launchToken() {
    return this.launchTokenValue
  }

  launchEventStreamUrl() {
    return this.launchEventStreamUrlValue
  }

  async prepareEventStream() {
    try {
      const ready = await this.ensureSession({ reason: 'events_missing_session' })
      return ready ? this.launchEventStreamUrl() : null
    } catch {
      return null
    }
  }

  launchContext(): ShadowBridgeLaunchContext {
    return {
      launchToken: this.launchToken(),
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

  async command<TResult = unknown>(commandName: string, input: unknown = {}): Promise<TResult> {
    await this.ensureSession({ reason: 'command_missing_session' })
    const path = commandPath(this.commandBasePath, commandName)
    const init: RequestInit = {
      method: 'POST',
      headers: this.sessionHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ input: withoutUndefined(input) }),
      credentials: 'include',
    }
    let response = await this.fetch(path, init)
    if (response.status === 401 && (await this.recoverSession('command_unauthorized'))) {
      response = await this.fetch(path, {
        ...init,
        headers: this.sessionHeaders({ 'Content-Type': 'application/json' }),
      })
    }
    return readShadowSpaceAppCommandResponse<TResult>(response)
  }

  async commandForm<TResult = unknown>(commandName: string, formData: FormData): Promise<TResult> {
    await this.ensureSession({ reason: 'command_missing_session' })
    const path = commandPath(this.commandBasePath, commandName)
    const init: RequestInit = {
      method: 'POST',
      headers: this.sessionHeaders(),
      body: formData,
      credentials: 'include',
    }
    let response = await this.fetch(path, init)
    if (response.status === 401 && (await this.recoverSession('command_unauthorized'))) {
      response = await this.fetch(path, {
        ...init,
        headers: this.sessionHeaders(),
      })
    }
    return readShadowSpaceAppCommandResponse<TResult>(response)
  }

  async refreshLaunch(input: ShadowBridgeRefreshLaunchInput = {}) {
    if (!this.bridge.isAvailable()) return null
    if (this.launchRefreshPromise) return this.launchRefreshPromise
    const request = (async () => {
      try {
        const context = await this.bridge.refreshLaunch(input, { timeoutMs: 8_000 })
        if (context?.launchToken) {
          this.applyLaunchUpdate({
            launchToken: context.launchToken,
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
    })().finally(() => {
      this.launchRefreshPromise = null
    })
    this.launchRefreshPromise = request
    return request
  }

  async fetchWithSession(
    input: RequestInfo | URL,
    init: RequestInit = {},
    options: ShadowSpaceAppFetchWithSessionOptions = {},
  ) {
    if (options.refresh) {
      const refreshInput = options.refresh === true ? { reason: 'fetch' } : options.refresh
      await this.refreshLaunch(refreshInput)
    }
    await this.ensureSession({ reason: 'fetch_missing_session' })
    let response = await this.fetch(input, this.withSession(init))
    if (response.status !== 401 || !(await this.recoverSession('fetch_unauthorized'))) {
      return response
    }
    return this.fetch(input, this.withSession(init))
  }

  async listBuddyInboxes<TInbox = ShadowBuddyInboxSummary>(
    options: ShadowSpaceAppListBuddyInboxesOptions = {},
  ): Promise<{ inboxes: TInbox[] }> {
    try {
      if (options.refresh) await this.refreshLaunch({ reason: 'inboxes_refresh' })
      await this.ensureSession({ reason: 'inboxes_missing_session' })
      let response = await this.fetch(this.inboxesPath, this.withSession({ method: 'GET' }))
      if (response.status === 401 && (await this.recoverSession('inboxes_unauthorized'))) {
        response = await this.fetch(this.inboxesPath, this.withSession({ method: 'GET' }))
      }
      if (!response.ok) throw new Error(`Buddy inboxes failed (${response.status})`)
      return (await response.json()) as { inboxes: TInbox[] }
    } catch (error) {
      if (options.emptyOnError) return { inboxes: [] }
      throw error
    }
  }

  async ensureBuddyTaskGrant(input: ShadowSpaceAppEnsureBuddyTaskGrantInput) {
    const buddyAgentId = input.agentId?.trim()
    if (!buddyAgentId) return { granted: false, skipped: true }
    await this.ensureSession({ reason: 'buddy_grant_missing_session' })
    const request = () =>
      this.fetch(
        this.buddyGrantPath,
        this.withSession({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            buddyAgentId,
            permissions: input.permissions,
            reason: input.reason,
          }),
          signal: AbortSignal.timeout(input.timeoutMs ?? 6_000),
        }),
      )
    let response = await request()
    if (response.status === 401 && (await this.recoverSession('buddy_grant_unauthorized'))) {
      response = await request()
    }
    if (!response.ok) throw new Error(`Buddy grant failed (${response.status})`)
    return response.json()
  }

  openBuddyCreator(
    input: ShadowBridgeOpenBuddyCreatorInput = {},
    options: { timeoutMs?: number } = {},
  ) {
    if (!this.bridge.isAvailable()) return Promise.resolve({ opened: false, agent: null })
    return this.bridge.openBuddyCreator(input, options)
  }

  openCopilot(delivery: ShadowSpaceAppInboxDelivery, options: { timeoutMs?: number } = {}) {
    return this.bridge.openCopilot(delivery, options)
  }

  openChannel(input: ShadowBridgeOpenChannelInput, options: { timeoutMs?: number } = {}) {
    return this.bridge.openChannel(input, options)
  }

  openWorkspaceResource(
    input: ShadowBridgeOpenWorkspaceResourceInput,
    options: { timeoutMs?: number } = {},
  ) {
    return this.bridge.openWorkspaceResource(input, options)
  }

  async authorizeOAuth(
    input: ShadowBridgeAuthorizeOAuthInput | string,
    options: ShadowSpaceAppAuthorizeOAuthOptions = {},
  ): Promise<ShadowBridgeAuthorizeOAuthResult> {
    const authorizeUrl = typeof input === 'string' ? input : input.authorizeUrl
    if (!this.bridge.isAvailable()) {
      if (options.fallback === 'redirect') return this.redirectToAuthorizeUrl(authorizeUrl)
      return { opened: false, status: 'unavailable' }
    }
    try {
      return await this.bridge.authorizeOAuth(input, {
        // Authorization may include a first-time consent decision in the host.
        // Keep the browser client aligned with the bridge's interactive timeout
        // instead of treating a normal approval pause as a failed request.
        timeoutMs: options.timeoutMs ?? 10 * 60 * 1000,
      })
    } catch (error) {
      if (options.fallback === 'redirect') return this.redirectToAuthorizeUrl(authorizeUrl)
      return {
        opened: false,
        status:
          error instanceof Error && error.message.includes('timed out') ? 'timeout' : 'unavailable',
        error: error instanceof Error ? error.message : 'OAuth authorization failed',
      }
    }
  }

  routeChanged(path: string) {
    return this.bridge.routeChanged(path)
  }

  onRouteNavigate(handler: ShadowBridgeRouteNavigateHandler) {
    return this.bridge.onRouteNavigate(handler)
  }

  shareSpaceApp(input: ShadowBridgeShareSpaceAppInput = {}, options: { timeoutMs?: number } = {}) {
    if (!this.bridge.isAvailable()) return Promise.resolve({ opened: false })
    return this.bridge.shareSpaceApp(input, options)
  }

  inboxDeliveries(payload: unknown): ShadowSpaceAppInboxDelivery[] {
    return getShadowSpaceAppInboxDeliveries(payload)
  }

  inboxErrors(payload: unknown): ShadowSpaceAppInboxDeliveryError[] {
    return getShadowSpaceAppInboxErrors(payload)
  }

  channelMessageDeliveries(payload: unknown): ShadowSpaceAppChannelMessageDelivery[] {
    return getShadowSpaceAppChannelMessageDeliveries(payload)
  }

  channelMessageErrors(payload: unknown): ShadowSpaceAppChannelMessageDeliveryError[] {
    return getShadowSpaceAppChannelMessageErrors(payload)
  }

  private fetch(input: RequestInfo | URL, init?: RequestInit) {
    if (this.fetchFn) return this.fetchFn(input, init)
    return globalThis.fetch(input, init)
  }

  private redirectToAuthorizeUrl(authorizeUrl: string): ShadowBridgeAuthorizeOAuthResult {
    if (!this.win) return { opened: false, status: 'unavailable' }
    this.win.location.assign(authorizeUrl)
    return { opened: true, status: 'redirected', redirectUrl: authorizeUrl }
  }

  dispose() {
    this.unsubscribeLaunchUpdate()
    this.launchContextHandlers.clear()
    this.bridge.dispose()
  }

  private applyLaunchUpdate(context: ShadowBridgeLaunchUpdateInput) {
    if (context.launchToken !== this.launchTokenValue) {
      this.sessionLaunchToken = null
      this.sessionCsrfToken = null
    }
    this.launchTokenValue = context.launchToken
    this.launchExpiresInValue =
      typeof context.expiresIn === 'number' ? context.expiresIn : undefined
  }

  private sessionHeaders(headersInit?: HeadersInit) {
    const headers = new Headers(headersInit)
    if (this.sessionCsrfToken) headers.set('X-Shadow-Space-App-CSRF', this.sessionCsrfToken)
    return headers
  }

  private withSession(init: RequestInit): RequestInit {
    const headers = new Headers(init.headers)
    if (this.sessionCsrfToken) headers.set('X-Shadow-Space-App-CSRF', this.sessionCsrfToken)
    return { ...init, headers, credentials: 'include' }
  }

  private async ensureSession(input: ShadowBridgeRefreshLaunchInput = {}) {
    if (!this.bridge.isAvailable()) return false
    if (!this.launchToken()) await this.refreshLaunch(input)
    const launchToken = this.launchToken()
    if (!launchToken) return false
    if (this.sessionLaunchToken === launchToken && this.sessionCsrfToken) return true
    if (this.sessionExchangePromise) return this.sessionExchangePromise
    const exchange = (async () => {
      const response = await this.fetch(this.sessionPath, {
        method: 'POST',
        headers: { Authorization: `Bearer ${launchToken}` },
        credentials: 'include',
      })
      if (!response.ok) return false
      const payload = (await response.json().catch(() => null)) as {
        ok?: unknown
        csrfToken?: unknown
      } | null
      if (payload?.ok !== true || typeof payload.csrfToken !== 'string') return false
      this.sessionLaunchToken = launchToken
      this.sessionCsrfToken = payload.csrfToken
      return true
    })().finally(() => {
      this.sessionExchangePromise = null
    })
    this.sessionExchangePromise = exchange
    return exchange
  }

  private async recoverSession(reason: string) {
    this.sessionLaunchToken = null
    this.sessionCsrfToken = null
    await this.refreshLaunch({ reason })
    return this.ensureSession({ reason })
  }
}

export function createShadowSpaceAppClient(options: ShadowSpaceAppBrowserClientOptions = {}) {
  return new ShadowSpaceAppBrowserClient(options)
}

export const createShadowSpaceAppBrowserClient = createShadowSpaceAppClient

export class ShadowBridge {
  static readonly capabilitiesRequestType = 'shadow.space-app.capabilities.request'
  static readonly capabilitiesResponseType = 'shadow.space-app.capabilities.response'
  static readonly openCopilotRequestType = 'shadow.space-app.copilot.open.request'
  static readonly openCopilotResponseType = 'shadow.space-app.copilot.open.response'
  static readonly openChannelRequestType = 'shadow.space-app.channel.open.request'
  static readonly openChannelResponseType = 'shadow.space-app.channel.open.response'
  static readonly openWorkspaceResourceRequestType = 'shadow.space-app.workspace.open.request'
  static readonly openWorkspaceResourceResponseType = 'shadow.space-app.workspace.open.response'
  static readonly openBuddyCreatorRequestType = 'shadow.space-app.buddy.create.request'
  static readonly openBuddyCreatorResponseType = 'shadow.space-app.buddy.create.response'
  static readonly authorizeOAuthRequestType = 'shadow.space-app.oauth.authorize.request'
  static readonly authorizeOAuthResponseType = 'shadow.space-app.oauth.authorize.response'
  static readonly routeNavigateType = 'shadow.space-app.navigate'
  static readonly routeNavigateAckType = 'shadow.space-app.navigate.ack'
  static readonly routeChangedType = 'shadow.space-app.route.changed'
  static readonly shareSpaceAppRequestType = 'shadow.space-app.share.request'
  static readonly shareSpaceAppResponseType = 'shadow.space-app.share.response'
  static readonly refreshLaunchRequestType = 'shadow.space-app.launch.refresh.request'
  static readonly refreshLaunchResponseType = 'shadow.space-app.launch.refresh.response'
  static readonly launchUpdatedEventType = 'shadow.space-app.launch.updated'

  private appKey?: string
  private readonly targetOrigin: string
  private readonly timeoutMs: number
  private readonly win: ReactNativeBridgeWindow | null
  private launchTokenValue: string | null = null
  private readonly pending = new Map<
    string,
    {
      responseType: BridgeResponseType
      resolve: (value: unknown) => void
      reject: (error: Error) => void
      timeoutId: number
    }
  >()
  private readonly onMessage = (event: MessageEvent) => {
    if (!this.isTrustedHostMessage(event)) return
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
    this.win?.clearTimeout(entry.timeoutId)
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
    this.targetOrigin = options.targetOrigin ?? this.resolveHostOrigin()
    this.timeoutMs = options.timeoutMs ?? 60000
    this.launchTokenValue = this.resolveLaunchToken()
    this.win?.addEventListener('message', this.onMessage)
  }

  dispose() {
    this.win?.removeEventListener('message', this.onMessage)
    for (const entry of this.pending.values()) {
      this.win?.clearTimeout(entry.timeoutId)
      entry.reject(new Error('ShadowBridge disposed'))
    }
    this.pending.clear()
  }

  isAvailable() {
    if (!this.win) return false
    return this.win.parent !== this.win || !!this.win.ReactNativeWebView
  }

  launchToken() {
    if (!this.win) return null
    return this.launchTokenValue ?? this.resolveLaunchToken()
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
    deliveryOrInput: ShadowSpaceAppInboxDelivery | ShadowBridgeOpenCopilotInput,
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

  openChannel(input: ShadowBridgeOpenChannelInput, options: { timeoutMs?: number } = {}) {
    return this.request<{ opened: boolean }>(
      ShadowBridge.openChannelRequestType,
      ShadowBridge.openChannelResponseType,
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
      if (!this.isTrustedHostMessage(event)) return
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
      if (!this.isTrustedHostMessage(event)) return
      let data = event.data
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data || '{}')
        } catch {
          return
        }
      }
      if (!data || typeof data !== 'object') return
      const envelope = data as {
        appKey?: unknown
        expiresIn?: unknown
        launchToken?: unknown
        launch?: unknown
        result?: unknown
        type?: unknown
      }
      if (envelope.type !== ShadowBridge.launchUpdatedEventType) return
      const record = isRecord(envelope.result)
        ? envelope.result
        : isRecord(envelope.launch)
          ? envelope.launch
          : envelope
      const appKey =
        typeof envelope.appKey === 'string'
          ? envelope.appKey
          : typeof record.appKey === 'string'
            ? record.appKey
            : undefined
      if (this.appKey && appKey && appKey !== this.appKey) {
        return
      }
      if (typeof record.launchToken !== 'string' || !record.launchToken) return
      void Promise.resolve(
        handler({
          launchToken: record.launchToken,
          ...(typeof record.expiresIn === 'number' ? { expiresIn: record.expiresIn } : {}),
        }),
      ).catch(() => undefined)
    }
    win.addEventListener('message', listener)
    return () => win.removeEventListener('message', listener)
  }

  shareSpaceApp(input: ShadowBridgeShareSpaceAppInput = {}, options: { timeoutMs?: number } = {}) {
    return this.request<ShadowBridgeShareSpaceAppResult>(
      ShadowBridge.shareSpaceAppRequestType,
      ShadowBridge.shareSpaceAppResponseType,
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
    const requestId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? `req_${crypto.randomUUID()}`
        : `req_${Date.now().toString(36)}_${this.pending.size.toString(36)}`
    return new Promise((resolve, reject) => {
      const timeoutId = this.win!.setTimeout(() => {
        if (!this.pending.has(requestId)) return
        this.pending.delete(requestId)
        reject(new Error(`${requestType} timed out after ${timeoutMs}ms`))
      }, timeoutMs)
      this.pending.set(requestId, {
        responseType,
        resolve: resolve as (value: unknown) => void,
        reject,
        timeoutId,
      })
      try {
        this.postMessage({
          type: requestType,
          requestId,
          ...(this.appKey ? { appKey: this.appKey } : {}),
          ...payload,
        })
      } catch (error) {
        this.pending.delete(requestId)
        this.win?.clearTimeout(timeoutId)
        reject(error instanceof Error ? error : new Error('Bridge request failed to send'))
      }
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

  private rememberLaunchToken(token: string) {
    if (!token) return
    const hint = decodeShadowSpaceAppLaunchTokenHint(token)
    if (!this.appKey && hint?.appKey) this.appKey = hint.appKey
    this.launchTokenValue = token
    if (this.appKey) {
      const memoryTokens = (this.win!.__shadowBridgeLaunchTokens ??= {})
      memoryTokens[this.appKey] = token
    }
  }

  private resolveLaunchToken() {
    if (!this.win) return null
    const memoryToken = this.appKey ? this.win.__shadowBridgeLaunchTokens?.[this.appKey] : null
    if (memoryToken) return memoryToken
    return null
  }

  private applyLaunchContext(value: unknown) {
    if (!isRecord(value) || typeof value.launchToken !== 'string') return false
    this.rememberLaunchToken(value.launchToken)
    return true
  }

  private resolveLaunchAppKey() {
    return undefined
  }

  private resolveHostOrigin() {
    if (!this.win?.document?.referrer) return '*'
    try {
      return new URL(this.win.document.referrer).origin
    } catch {
      return '*'
    }
  }

  private isTrustedHostMessage(event: MessageEvent) {
    if (!this.win) return false
    if (this.win.parent !== this.win && event.source !== this.win.parent) return false
    return this.targetOrigin === '*' || event.origin === this.targetOrigin
  }
}
