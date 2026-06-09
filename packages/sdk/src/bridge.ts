import {
  getShadowServerAppChannelMessageDeliveries,
  getShadowServerAppChannelMessageErrors,
  getShadowServerAppInboxDeliveries,
  getShadowServerAppInboxErrors,
  type ShadowServerAppChannelMessageDelivery,
  type ShadowServerAppChannelMessageDeliveryError,
  type ShadowServerAppInboxDelivery,
  type ShadowServerAppInboxDeliveryError,
  unwrapShadowServerAppCommandPayload,
} from './server-app'

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
  SHADOW_SERVER_APP_COMMAND_COMPLETED_EVENT,
  SHADOW_SERVER_APP_COMMAND_EVENTS,
  SHADOW_SERVER_APP_COMMAND_FAILED_EVENT,
  shadowServerAppInboxTaskEndpoint,
} from './server-app'

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
  }
}

export interface ShadowBridgeOpenBuddyCreatorInput {
  landing?: {
    title?: string
    description?: string
    source?: string
  }
}

export const SHADOW_BRIDGE_CAPABILITIES = [
  'copilot.open',
  'workspace.open',
  'buddy.create.open',
  'route.navigate',
] as const

export type ShadowBridgeCapability = (typeof SHADOW_BRIDGE_CAPABILITIES)[number]

export interface ShadowBridgeOptions {
  appKey: string
  targetOrigin?: string
  timeoutMs?: number
  windowRef?: Window
}

// Bridge is an embedded-host UX enhancement. Independent integrations must keep
// App API + Shadow REST paths for auth, durable data, media snapshots, and Buddy dispatch.
type BridgeResponseType =
  | 'shadow.app.capabilities.response'
  | 'shadow.app.copilot.open.response'
  | 'shadow.app.workspace.open.response'
  | 'shadow.app.buddy.create.response'

type ReactNativeBridgeWindow = Window & {
  __shadowBridgeLaunchContexts?: Record<string, true>
  ReactNativeWebView?: {
    postMessage(message: string): void
  }
}

export class ShadowBridge {
  static readonly capabilitiesRequestType = 'shadow.app.capabilities.request'
  static readonly capabilitiesResponseType = 'shadow.app.capabilities.response'
  static readonly openCopilotRequestType = 'shadow.app.copilot.open.request'
  static readonly openCopilotResponseType = 'shadow.app.copilot.open.response'
  static readonly openWorkspaceResourceRequestType = 'shadow.app.workspace.open.request'
  static readonly openWorkspaceResourceResponseType = 'shadow.app.workspace.open.response'
  static readonly openBuddyCreatorRequestType = 'shadow.app.buddy.create.request'
  static readonly openBuddyCreatorResponseType = 'shadow.app.buddy.create.response'

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

  private readonly appKey: string
  private readonly targetOrigin: string
  private readonly timeoutMs: number
  private readonly win: ReactNativeBridgeWindow | null
  private readonly hasLaunchContext: boolean
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
    }
    if (typeof record.requestId !== 'string' || typeof record.type !== 'string') return
    const entry = this.pending.get(record.requestId)
    if (!entry || record.type !== entry.responseType) return
    this.pending.delete(record.requestId)
    if (record.ok) entry.resolve(record.result)
    else
      entry.reject(
        new Error(typeof record.error === 'string' ? record.error : 'Bridge request failed'),
      )
  }

  constructor(options: ShadowBridgeOptions) {
    this.appKey = options.appKey
    this.targetOrigin = options.targetOrigin ?? '*'
    this.timeoutMs = options.timeoutMs ?? 60000
    this.win = options.windowRef ?? (typeof window === 'undefined' ? null : window)
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
    return this.hasLaunchContext && (this.win.parent !== this.win || !!this.win.ReactNativeWebView)
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
        appKey: this.appKey,
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

  private resolveLaunchContext() {
    if (!this.win) return false
    const storageKey = `shadow.bridge.launch:${this.appKey}`
    const memoryContexts = (this.win.__shadowBridgeLaunchContexts ??= {})
    const hasLaunchToken = new URLSearchParams(this.win.location.search).has('shadow_launch')
    if (hasLaunchToken) {
      memoryContexts[this.appKey] = true
      try {
        this.win.sessionStorage?.setItem(storageKey, '1')
      } catch {
        // Some embedded contexts restrict sessionStorage; the launch URL is enough for this instance.
      }
      return true
    }
    if (memoryContexts[this.appKey]) return true
    try {
      return this.win.sessionStorage?.getItem(storageKey) === '1'
    } catch {
      return false
    }
  }
}
