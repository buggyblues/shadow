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
  SelectionGetInput,
  SelectionUpdateInput,
} from '@shadowob/flash-types/server-app'
import { SHADOW_SERVER_APP_COMMAND_COMPLETED_EVENT, ShadowBridge } from '@shadowob/sdk/bridge'

type CommandPayload<T> = { ok?: boolean; result?: T; error?: string } & T
const bridge = new ShadowBridge({ appKey: 'shadow-flash' })

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

function canUseBridge() {
  return bridge.isAvailable()
}

function isLocalDevMode() {
  return new URLSearchParams(location.search).get('flash_dev') === '1' || import.meta.env.DEV
}

function shadowLaunchToken() {
  return new URLSearchParams(location.search).get('shadow_launch')
}

export function flashAccessMode() {
  if (canUseBridge()) return 'shadow'
  if (isLocalDevMode()) return 'local-dev'
  return 'unauthorized'
}

export async function getOAuthSession(): Promise<FlashOAuthSession> {
  const returnTo = `${location.pathname}${location.search}${location.hash}`
  const params = new URLSearchParams({ return_to: returnTo, popup: '1' })
  const res = await fetch(`/api/oauth/session?${params.toString()}`)
  if (!res.ok) throw new Error('OAuth session check failed')
  return (await res.json()) as FlashOAuthSession
}

export async function command<T>(commandName: string, input: unknown): Promise<T> {
  if (canUseBridge()) {
    return bridge.command(commandName, input) as Promise<T>
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
  return bridge.unwrapCommandPayload<T>(payload)
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

export function getSelection(input: SelectionGetInput) {
  return command<{ selections: unknown[] }>('selection.get', input)
}

export function updateSelection(input: SelectionUpdateInput) {
  return command<FlashMutationResult>('selection.update', input)
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
  const params = new URLSearchParams()
  const launchToken = shadowLaunchToken()
  if (launchToken) params.set('shadow_launch', launchToken)
  if (!isLocalDevMode() && !launchToken) return () => undefined
  const queryString = params.toString()
  const query = queryString ? `?${queryString}` : ''
  const source = new EventSource(`/api/boards/${encodeURIComponent(boardId)}/events${query}`)
  source.addEventListener('flash.events.appended', (event) => {
    onEvent(JSON.parse((event as MessageEvent).data) as FlashRealtimeEvent)
  })
  source.addEventListener('flash.board.updated', (event) => {
    onEvent(JSON.parse((event as MessageEvent).data) as FlashRealtimeEvent)
  })
  source.addEventListener('flash.command.executed', (event) => {
    onEvent(JSON.parse((event as MessageEvent).data) as FlashRealtimeEvent)
  })
  source.addEventListener('flash.selection.updated', (event) => {
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
  const unsubscribers: Array<() => void> = []

  if (boardId) {
    unsubscribers.push(
      subscribeBoard(boardId, (event) => {
        const payload = event.payload as Partial<FlashBoardEventsResult> | undefined
        if (event.type === 'flash.events.appended' && payload?.events) {
          onEvent({ type: 'flash.events', events: payload.events, cursor: payload.cursor ?? 0 })
        }
      }),
    )
  }

  if (eventStream) {
    const source = new EventSource(eventStream)
    source.addEventListener(SHADOW_SERVER_APP_COMMAND_COMPLETED_EVENT, (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data || '{}') as { command?: string }
        onEvent({ type: 'shadow.command.completed', command: payload.command ?? null })
      } catch {
        onEvent({ type: 'shadow.command.completed', command: null })
      }
    })
    unsubscribers.push(() => source.close())
  }

  if (unsubscribers.length === 0) return () => undefined
  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe()
  }
}
