import {
  getShadowServerAppInboxDeliveries,
  getShadowServerAppInboxErrors,
  type ShadowServerAppInboxDelivery,
  type ShadowServerAppInboxDeliveryError,
  type ShadowServerAppInboxTarget,
  type ShadowServerAppInboxTaskOutbox,
  unwrapShadowServerAppCommandPayload,
} from './server-app'

export type {
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
  getShadowServerAppTaskCardId,
  SHADOW_SERVER_APP_COMMAND_COMPLETED_EVENT,
  SHADOW_SERVER_APP_COMMAND_EVENTS,
  SHADOW_SERVER_APP_COMMAND_FAILED_EVENT,
  shadowServerAppInboxTaskEndpoint,
} from './server-app'

export type ShadowBridgeCommandSpec<TInput = unknown, TResult = unknown> = {
  input: TInput
  result: TResult
}

export type ShadowBridgeCommandMap = Record<string, ShadowBridgeCommandSpec>

type BridgeCommandInput<TCommand> =
  TCommand extends ShadowBridgeCommandSpec<infer TInput, unknown> ? TInput : unknown

type BridgeCommandResult<TCommand> =
  TCommand extends ShadowBridgeCommandSpec<unknown, infer TResult> ? TResult : unknown

export interface ShadowBridgeBuddyInbox {
  agent: {
    id: string
    ownerId?: string | null
    status?: string | null
    user?: {
      id?: string | null
      username?: string | null
      displayName?: string | null
      avatarUrl?: string | null
      isBot?: boolean | null
    } | null
  }
  channel?: {
    id?: string | null
    name?: string | null
  } | null
  canManage?: boolean
}

export interface ShadowBridgeEnqueueInboxTaskInput {
  target: ShadowServerAppInboxTarget
  task: ShadowServerAppInboxTaskOutbox
}

export interface ShadowBridgeOptions {
  appKey: string
  targetOrigin?: string
  timeoutMs?: number
  windowRef?: Window
}

type BridgeResponseType =
  | 'shadow.app.command.response'
  | 'shadow.app.inboxes.response'
  | 'shadow.app.inbox.enqueue.response'

type ReactNativeBridgeWindow = Window & {
  ReactNativeWebView?: {
    postMessage(message: string): void
  }
}

export class ShadowBridge<TCommands extends ShadowBridgeCommandMap = ShadowBridgeCommandMap> {
  static readonly commandRequestType = 'shadow.app.command.request'
  static readonly commandResponseType = 'shadow.app.command.response'
  static readonly inboxesRequestType = 'shadow.app.inboxes.request'
  static readonly inboxesResponseType = 'shadow.app.inboxes.response'
  static readonly enqueueInboxTaskRequestType = 'shadow.app.inbox.enqueue.request'
  static readonly enqueueInboxTaskResponseType = 'shadow.app.inbox.enqueue.response'

  static inboxDeliveries(payload: unknown): ShadowServerAppInboxDelivery[] {
    return getShadowServerAppInboxDeliveries(payload)
  }

  static inboxErrors(payload: unknown): ShadowServerAppInboxDeliveryError[] {
    return getShadowServerAppInboxErrors(payload)
  }

  static unwrapCommandPayload<TResult = unknown>(payload: unknown): TResult {
    return unwrapShadowServerAppCommandPayload<TResult>(payload)
  }

  private readonly appKey: string
  private readonly targetOrigin: string
  private readonly timeoutMs: number
  private readonly win: ReactNativeBridgeWindow | null
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
    const hasLaunchToken = new URLSearchParams(this.win.location.search).has('shadow_launch')
    return hasLaunchToken && (this.win.parent !== this.win || !!this.win.ReactNativeWebView)
  }

  command<TCommandName extends Extract<keyof TCommands, string>>(
    commandName: TCommandName,
    input: BridgeCommandInput<TCommands[TCommandName]>,
    options: {
      channelId?: string
      timeoutMs?: number
      task?: { messageId: string; cardId: string; claimId?: string }
    } = {},
  ): Promise<BridgeCommandResult<TCommands[TCommandName]>> {
    return this.request<unknown>(
      ShadowBridge.commandRequestType,
      ShadowBridge.commandResponseType,
      {
        commandName,
        input,
        ...(options.channelId ? { channelId: options.channelId } : {}),
        ...(options.task ? { task: options.task } : {}),
      },
      options.timeoutMs,
    ).then((payload) =>
      unwrapShadowServerAppCommandPayload<BridgeCommandResult<TCommands[TCommandName]>>(payload),
    )
  }

  inboxes(options: { timeoutMs?: number } = {}) {
    return this.request<{ inboxes: ShadowBridgeBuddyInbox[] }>(
      ShadowBridge.inboxesRequestType,
      ShadowBridge.inboxesResponseType,
      {},
      options.timeoutMs ?? 15000,
    )
  }

  enqueueInboxTask(input: ShadowBridgeEnqueueInboxTaskInput, options: { timeoutMs?: number } = {}) {
    return this.request<ShadowServerAppInboxDelivery>(
      ShadowBridge.enqueueInboxTaskRequestType,
      ShadowBridge.enqueueInboxTaskResponseType,
      input,
      options.timeoutMs,
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
    this.postMessage({
      type: requestType,
      requestId,
      appKey: this.appKey,
      ...payload,
    })
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, {
        responseType,
        resolve: resolve as (value: unknown) => void,
        reject,
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
}
