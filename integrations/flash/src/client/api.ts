import type {
  ArenasActivateInput,
  ArenasCreateInput,
  BoardViewportUpdateInput,
  CardsCommandInput,
  CardsCreateInput,
  CardsUpdateInput,
  FlashBoardEventsResult,
  FlashBoardSnapshot,
  FlashCommandEvent,
  FlashMutationResult,
  FlashRealtimeEvent,
  RoomsAttachInput,
} from '@shadowob/flash-types/server-app'

type CommandPayload<T> = { ok?: boolean; result?: T; error?: string } & T

export interface FlashOAuthSession {
  configured: boolean
  authenticated: boolean
  profile: {
    id: string
    username?: string | null
    displayName?: string | null
    avatarUrl?: string | null
  } | null
  authorizeUrl: string | null
}

const pending = new Map<
  string,
  {
    resolve: (value: unknown) => void
    reject: (error: Error) => void
  }
>()

function canUseBridge() {
  return (
    new URLSearchParams(location.search).has('shadow_launch') &&
    (window.parent !== window || window.ReactNativeWebView)
  )
}

function isLocalDevMode() {
  return new URLSearchParams(location.search).get('flash_dev') === '1' || import.meta.env.DEV
}

export function flashAccessMode() {
  if (canUseBridge()) return 'shadow'
  if (isLocalDevMode()) return 'local-dev'
  return 'unauthorized'
}

export async function getOAuthSession(): Promise<FlashOAuthSession> {
  const returnTo = `${location.pathname}${location.search}${location.hash}`
  const res = await fetch(`/api/oauth/session?return_to=${encodeURIComponent(returnTo)}`)
  if (!res.ok) throw new Error('OAuth session check failed')
  return (await res.json()) as FlashOAuthSession
}

function postBridge(message: unknown) {
  if (window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(JSON.stringify(message))
    return
  }
  window.parent.postMessage(message, '*')
}

window.addEventListener('message', (event) => {
  let data = event.data
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data || '{}')
    } catch {
      return
    }
  }
  if (!data || data.type !== 'shadow.app.command.response') return
  const entry = pending.get(data.requestId)
  if (!entry) return
  pending.delete(data.requestId)
  if (data.ok) entry.resolve(data.result)
  else entry.reject(new Error(data.error || 'Command failed'))
})

function unwrapCommandPayload<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && !Array.isArray(payload) && 'ok' in payload) {
    const envelope = payload as { ok?: boolean; result?: unknown; error?: string }
    if (envelope.ok === false) throw new Error(envelope.error || 'Command failed')
    if ('result' in envelope) return envelope.result as T
  }
  return payload as T
}

export async function command<T>(commandName: string, input: unknown): Promise<T> {
  if (canUseBridge()) {
    const requestId = `req_${Math.random().toString(36).slice(2)}`
    postBridge({
      type: 'shadow.app.command.request',
      requestId,
      appKey: 'shadow-flash',
      commandName,
      input,
    })
    return new Promise((resolve, reject) => {
      pending.set(requestId, { resolve: resolve as (value: unknown) => void, reject })
      window.setTimeout(() => {
        if (!pending.has(requestId)) return
        pending.delete(requestId)
        reject(new Error('Command timed out'))
      }, 60000)
    }).then((payload) => unwrapCommandPayload<T>(payload))
  }

  if (!isLocalDevMode()) {
    throw new Error('Shadow authorization required')
  }

  const res = await fetch(`/api/local/commands/${encodeURIComponent(commandName)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input }),
  })
  const payload = (await res.json()) as CommandPayload<T>
  if (!res.ok || payload.ok === false) throw new Error(payload.error || 'Command failed')
  return unwrapCommandPayload<T>(payload)
}

export function getBoard(input: { boardId?: string } = {}) {
  return command<{ snapshot: FlashBoardSnapshot }>('boards.get', input)
}

export function getBoardEvents(input: { boardId?: string; after?: number; limit?: number }) {
  return command<FlashBoardEventsResult>('boards.events', input)
}

export function updateBoardViewport(input: BoardViewportUpdateInput) {
  return command<FlashMutationResult>('boards.viewport.update', input)
}

export function createCard(input: CardsCreateInput) {
  return command<FlashMutationResult>('cards.create', input)
}

export function updateCard(input: CardsUpdateInput) {
  return command<FlashMutationResult>('cards.update', input)
}

export function executeCardCommand(input: CardsCommandInput) {
  return command<FlashMutationResult>('cards.command', input)
}

export function createArena(input: ArenasCreateInput) {
  return command<FlashMutationResult>('arenas.create', input)
}

export function activateArena(input: ArenasActivateInput) {
  return command<FlashMutationResult>('arenas.activate', input)
}

export function attachRoom(input: RoomsAttachInput) {
  return command<{ attached: unknown; snapshot: FlashBoardSnapshot }>('rooms.attach', input)
}

export function subscribeBoard(boardId: string, onEvent: (event: FlashRealtimeEvent) => void) {
  if (!isLocalDevMode()) return () => undefined
  const source = new EventSource(`/api/boards/${encodeURIComponent(boardId)}/events`)
  source.addEventListener('flash.board.updated', (event) => {
    onEvent(JSON.parse((event as MessageEvent).data) as FlashRealtimeEvent)
  })
  source.addEventListener('flash.command.executed', (event) => {
    onEvent(JSON.parse((event as MessageEvent).data) as FlashRealtimeEvent)
  })
  return () => source.close()
}

export type ShadowEventStreamEvent =
  | { type: 'shadow.command.completed'; command?: string | null }
  | { type: 'flash.events'; events: FlashCommandEvent[]; cursor: number }

export function subscribeAppEvents(
  boardId: string | undefined,
  onEvent: (event: ShadowEventStreamEvent) => void,
) {
  const params = new URLSearchParams(location.search)
  const eventStream = params.get('shadow_event_stream')
  if (eventStream) {
    const source = new EventSource(eventStream)
    source.addEventListener('server_app.command.completed', (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data || '{}') as { command?: string }
        onEvent({ type: 'shadow.command.completed', command: payload.command ?? null })
      } catch {
        onEvent({ type: 'shadow.command.completed', command: null })
      }
    })
    return () => source.close()
  }

  if (!boardId || !isLocalDevMode()) return () => undefined
  return subscribeBoard(boardId, (event) => {
    const payload = event.payload as Partial<FlashBoardEventsResult> | undefined
    if (event.type === 'flash.events.appended' && payload?.events) {
      onEvent({ type: 'flash.events', events: payload.events, cursor: payload.cursor ?? 0 })
    }
  })
}

declare global {
  interface Window {
    ReactNativeWebView?: {
      postMessage: (message: string) => void
    }
  }
}
