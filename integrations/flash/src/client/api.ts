import type {
  ArenasActivateInput,
  ArenasCreateInput,
  BoardViewportUpdateInput,
  CardsCommandInput,
  CardsComposeInput,
  CardsCreateInput,
  CardsLayoutUpdateInput,
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

type CommandPayload<T> = {
  ok?: boolean
  result?: T
  error?: string
  issues?: unknown
} & T

type UnknownRecord = Record<string, unknown>

export interface FlashCommandError extends Error {
  status?: number
  payload?: unknown
  commandName?: string
}

const bridge = new ShadowBridge({ appKey: 'shadow-flash' })

const durableCommandNames = new Set([
  'assets.upload',
  'boards.viewport.update',
  'cards.compose',
  'cards.create',
  'cards.update',
  'cards.layout.update',
  'cards.delete',
  'cards.command',
  'selection.update',
  'arenas.create',
  'arenas.activate',
])

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

function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function maybeNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function maybeString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function commandError(commandName: string, error: unknown, status?: number, payload?: unknown) {
  const sourceMessage = error instanceof Error ? error.message : String(error || 'Command failed')
  const message = `Flash command ${commandName} failed${status ? ` (${status})` : ''}: ${sourceMessage}`
  const wrapped = new Error(message) as FlashCommandError
  wrapped.status = status ?? (error as { status?: number } | undefined)?.status
  wrapped.payload = payload ?? (error as { payload?: unknown } | undefined)?.payload
  wrapped.commandName = commandName
  if (error instanceof Error && error.stack) wrapped.stack = error.stack
  return wrapped
}

function unwrapProtocolEnvelope(value: unknown): unknown {
  const record = isRecord(value) ? value : null
  if (!record) return value
  if (record.ok === true && 'result' in record && !('events' in record) && !('cursor' in record)) {
    return unwrapProtocolEnvelope(record.result)
  }
  if (record.ok === false) return value
  return value
}

function eventSeq(record: UnknownRecord): number | null {
  const seq = maybeNumber(record.seq)
  if (seq !== null) return Math.max(0, Math.floor(seq))
  const boardSeq = maybeNumber(record.boardSeq)
  if (boardSeq !== null) return Math.max(0, Math.floor(boardSeq))
  return null
}

function eventCreatedAt(value: unknown): number {
  const numeric = maybeNumber(value)
  if (numeric !== null) return numeric
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return Date.now()
}

export function normalizeFlashCommandEvents(value: unknown): FlashCommandEvent[] {
  if (!Array.isArray(value)) return []
  const events: FlashCommandEvent[] = []
  for (const item of value) {
    if (!isRecord(item)) continue
    const seq = eventSeq(item)
    if (seq === null) continue
    const globalSeq = maybeNumber(item.globalSeq ?? item.global_seq)
    const boardId = maybeString(item.boardId ?? item.board_id) ?? ''
    const id = maybeString(item.id) ?? `${boardId || 'board'}:${seq}`
    const commandName = maybeString(item.commandName ?? item.command_name) ?? 'unknown'
    const cardId = maybeString(item.cardId ?? item.card_id)
    const clientMutationId = maybeString(item.clientMutationId ?? item.client_mutation_id)
    const baseCursor = maybeNumber(item.baseCursor ?? item.base_cursor)
    const causalLag = maybeNumber(item.causalLag ?? item.causal_lag)
    events.push({
      ...(item as Partial<FlashCommandEvent>),
      id,
      seq,
      ...(globalSeq !== null ? { globalSeq: Math.floor(globalSeq) } : {}),
      boardId,
      commandName,
      cardId,
      command: 'command' in item ? item.command : null,
      result: 'result' in item ? item.result : null,
      patches: Array.isArray(item.patches) ? (item.patches as FlashCommandEvent['patches']) : [],
      actor: isRecord(item.actor) ? (item.actor as FlashCommandEvent['actor']) : null,
      clientMutationId,
      baseCursor: baseCursor === null ? null : Math.max(0, Math.floor(baseCursor)),
      ...(causalLag !== null ? { causalLag: Math.floor(causalLag) } : {}),
      createdAt: eventCreatedAt(item.createdAt ?? item.created_at),
    })
  }
  return events
}

function eventArrayFrom(value: unknown): unknown {
  const unwrapped = unwrapProtocolEnvelope(value)
  if (Array.isArray(unwrapped)) return unwrapped
  const record = isRecord(unwrapped) ? unwrapped : null
  if (!record) return []
  if (Array.isArray(record.events)) return record.events
  const payload = isRecord(record.payload) ? record.payload : null
  if (Array.isArray(payload?.events)) return payload.events
  const result = isRecord(record.result) ? record.result : null
  if (Array.isArray(result?.events)) return result.events
  return []
}

function cursorFrom(value: unknown, events: FlashCommandEvent[], fallbackCursor = 0): number {
  const unwrapped = unwrapProtocolEnvelope(value)
  const record = isRecord(unwrapped) ? unwrapped : null
  const payload = isRecord(record?.payload) ? record.payload : null
  const result = isRecord(record?.result) ? record.result : null
  const candidates = [record?.cursor, payload?.cursor, result?.cursor]
  for (const candidate of candidates) {
    const numeric = maybeNumber(candidate)
    if (numeric !== null) return Math.max(0, Math.floor(numeric))
  }
  return events.reduce((cursor, event) => Math.max(cursor, event.seq), fallbackCursor)
}

function highWaterCursorFrom(value: unknown): number | undefined {
  const unwrapped = unwrapProtocolEnvelope(value)
  const record = isRecord(unwrapped) ? unwrapped : null
  const payload = isRecord(record?.payload) ? record.payload : null
  const result = isRecord(record?.result) ? record.result : null
  for (const candidate of [
    record?.highWaterCursor,
    payload?.highWaterCursor,
    result?.highWaterCursor,
  ]) {
    const numeric = maybeNumber(candidate)
    if (numeric !== null) return Math.max(0, Math.floor(numeric))
  }
  return undefined
}

function hasMoreFrom(value: unknown): boolean | undefined {
  const unwrapped = unwrapProtocolEnvelope(value)
  const record = isRecord(unwrapped) ? unwrapped : null
  const payload = isRecord(record?.payload) ? record.payload : null
  const result = isRecord(record?.result) ? record.result : null
  for (const candidate of [record?.hasMore, payload?.hasMore, result?.hasMore]) {
    if (typeof candidate === 'boolean') return candidate
  }
  return undefined
}

export function normalizeBoardEventsResult(
  value: unknown,
  fallbackCursor = 0,
): FlashBoardEventsResult {
  const events = normalizeFlashCommandEvents(eventArrayFrom(value))
  const cursor = cursorFrom(value, events, fallbackCursor)
  const highWaterCursor = highWaterCursorFrom(value)
  const hasMore = hasMoreFrom(value)
  return {
    events,
    cursor,
    ...(highWaterCursor !== undefined ? { highWaterCursor } : {}),
    ...(hasMore !== undefined ? { hasMore } : {}),
  }
}

export function normalizeMutationResult(value: unknown, fallbackCursor = 0): FlashMutationResult {
  const unwrapped = unwrapProtocolEnvelope(value)
  const eventsResult = normalizeBoardEventsResult(unwrapped, fallbackCursor)
  const record = isRecord(unwrapped) ? unwrapped : null
  return {
    ...eventsResult,
    result: record && 'result' in record ? record.result : null,
    hasMore: eventsResult.hasMore ?? false,
  }
}

export function normalizeBoardSnapshot(value: unknown): FlashBoardSnapshot {
  const snapshot = unwrapProtocolEnvelope(value)
  const record = isRecord(snapshot) ? snapshot : {}
  const events = normalizeFlashCommandEvents(record.events)
  const cursor = maybeNumber(record.cursor)
  return {
    actor: (record.actor ?? null) as FlashBoardSnapshot['actor'],
    board: (record.board ?? null) as FlashBoardSnapshot['board'],
    cards: Array.isArray(record.cards) ? (record.cards as FlashBoardSnapshot['cards']) : [],
    arenas: Array.isArray(record.arenas) ? (record.arenas as FlashBoardSnapshot['arenas']) : [],
    selections: Array.isArray(record.selections)
      ? (record.selections as FlashBoardSnapshot['selections'])
      : [],
    events,
    cursor: cursor !== null ? Math.max(0, Math.floor(cursor)) : cursorFrom(snapshot, events, 0),
  }
}

export function normalizeBoardGetResult(value: unknown): {
  snapshot: FlashBoardSnapshot
} {
  const unwrapped = unwrapProtocolEnvelope(value)
  const record = isRecord(unwrapped) ? unwrapped : null
  return {
    snapshot: normalizeBoardSnapshot(record && 'snapshot' in record ? record.snapshot : unwrapped),
  }
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
    try {
      return (await bridge.command(commandName, input)) as T
    } catch (error) {
      throw commandError(commandName, error)
    }
  }

  if (!isLocalDevMode()) {
    throw commandError(commandName, new Error('Shadow authorization required'))
  }

  const res = await fetch(`/api/local/commands/${encodeURIComponent(commandName)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input }),
  })
  const payload = (await res.json().catch(() => ({}))) as CommandPayload<T>
  if (!res.ok || payload.ok === false) {
    throw commandError(
      commandName,
      new Error(payload.error || `Command failed`),
      res.status,
      payload,
    )
  }
  return (payload.result !== undefined ? payload.result : payload) as T
}

export async function getBoard(input: { boardId?: string } = {}) {
  return normalizeBoardGetResult(await command<unknown>('boards.get', input))
}

export async function getBoardEvents(input: { boardId?: string; after?: number; limit?: number }) {
  return normalizeBoardEventsResult(
    await command<unknown>('boards.events', input),
    input.after ?? 0,
  )
}

export async function updateBoardViewport(input: BoardViewportUpdateInput) {
  return normalizeMutationResult(await command<unknown>('boards.viewport.update', input))
}

export async function composeCards(input: CardsComposeInput) {
  return normalizeMutationResult(await command<unknown>('cards.compose', input))
}

export async function createCard(input: CardsCreateInput) {
  return normalizeMutationResult(await command<unknown>('cards.create', input))
}

export async function updateCard(input: CardsUpdateInput) {
  return normalizeMutationResult(await command<unknown>('cards.update', input))
}

export async function updateCardLayouts(input: CardsLayoutUpdateInput) {
  return normalizeMutationResult(await command<unknown>('cards.layout.update', input))
}

export async function executeCardCommand(input: CardsCommandInput) {
  return normalizeMutationResult(await command<unknown>('cards.command', input))
}

export async function getSelection(input: SelectionGetInput) {
  const result = await command<unknown>('selection.get', input)
  const unwrapped = unwrapProtocolEnvelope(result)
  const record = isRecord(unwrapped) ? unwrapped : {}
  return {
    selections: Array.isArray(record.selections) ? record.selections : [],
  }
}

export async function updateSelection(input: SelectionUpdateInput) {
  return normalizeMutationResult(await command<unknown>('selection.update', input))
}

export async function createArena(input: ArenasCreateInput) {
  return normalizeMutationResult(await command<unknown>('arenas.create', input))
}

export async function activateArena(input: ArenasActivateInput) {
  return normalizeMutationResult(await command<unknown>('arenas.activate', input))
}

export async function attachRoom(input: RoomsAttachInput) {
  const result = await command<unknown>('rooms.attach', input)
  const unwrapped = unwrapProtocolEnvelope(result)
  const record = isRecord(unwrapped) ? unwrapped : {}
  return {
    attached: record.attached,
    snapshot: normalizeBoardSnapshot(record.snapshot),
  }
}

export interface SubscribeBoardOptions {
  /** Initial durable event cursor. Prefer getAfter for reconnects. */
  after?: number
  /** Called every reconnect so EventSource resumes from the latest locally applied cursor. */
  getAfter?: () => number
  /** Reconnect EventSource manually so the after cursor can be refreshed. Defaults to true. */
  reconnect?: boolean
  /** Base reconnect delay. A small jitter is applied by the browser event loop. */
  retryMs?: number
  onOpen?: () => void
  onError?: (error: unknown) => void
}

function parseRealtimeEvent(event: Event): FlashRealtimeEvent | null {
  try {
    return JSON.parse((event as MessageEvent).data || '{}') as FlashRealtimeEvent
  } catch {
    return null
  }
}

export function subscribeBoard(
  boardId: string,
  onEvent: (event: FlashRealtimeEvent) => void,
  options: SubscribeBoardOptions = {},
) {
  const launchToken = shadowLaunchToken()
  if (!isLocalDevMode() && !launchToken) return () => undefined

  const reconnect = options.reconnect !== false
  const retryMs = Math.max(250, options.retryMs ?? 1200)
  const eventTypes = [
    'flash.events.appended',
    'flash.board.updated',
    'flash.command.executed',
    'flash.selection.updated',
  ] as const
  let source: EventSource | null = null
  let closed = false
  let reconnectTimer: number | null = null

  const buildUrl = () => {
    const params = new URLSearchParams()
    if (launchToken) params.set('shadow_launch', launchToken)
    const after = options.getAfter ? options.getAfter() : options.after
    if (after && after > 0) params.set('after', String(Math.floor(after)))
    const queryString = params.toString()
    const query = queryString ? `?${queryString}` : ''
    return `/api/boards/${encodeURIComponent(boardId)}/events${query}`
  }

  const closeCurrent = () => {
    if (source) {
      source.close()
      source = null
    }
  }

  const scheduleReconnect = () => {
    if (closed || !reconnect || reconnectTimer !== null) return
    closeCurrent()
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null
      connect()
    }, retryMs)
  }

  const connect = () => {
    if (closed) return
    closeCurrent()
    const nextSource = new EventSource(buildUrl())
    source = nextSource
    nextSource.addEventListener('open', () => options.onOpen?.())
    for (const type of eventTypes) {
      nextSource.addEventListener(type, (event) => {
        const parsed = parseRealtimeEvent(event)
        if (parsed) onEvent(parsed)
      })
    }
    nextSource.addEventListener('error', (event) => {
      options.onError?.(event)
      scheduleReconnect()
    })
  }

  connect()

  return () => {
    closed = true
    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    closeCurrent()
  }
}

export type ShadowEventStreamEvent =
  | { type: 'shadow.command.completed'; command?: string | null }
  | { type: 'flash.events'; events: FlashCommandEvent[]; cursor: number }

export interface SubscribeAppEventsOptions {
  /**
   * When a board-local durable stream is active, Flash mutation completion events are redundant.
   * Suppressing them prevents legacy callers from issuing a full boards.get refresh after every
   * card drag or selection click. Set to false for older UIs that have not adopted flash.events.
   */
  suppressDurableCommandCompleted?: boolean
}

export function subscribeAppEvents(
  boardId: string | undefined,
  onEvent: (event: ShadowEventStreamEvent) => void,
  options: SubscribeAppEventsOptions = {},
) {
  const params = new URLSearchParams(location.search)
  const eventStream = params.get('shadow_event_stream')
  const unsubscribers: Array<() => void> = []
  const suppressDurableCommandCompleted =
    !!boardId && options.suppressDurableCommandCompleted !== false

  if (boardId) {
    unsubscribers.push(
      subscribeBoard(boardId, (event) => {
        if (event.type !== 'flash.events.appended') return
        const payload = normalizeBoardEventsResult(event.payload)
        if (payload.events.length === 0 && payload.cursor <= 0) return
        onEvent({
          type: 'flash.events',
          events: payload.events,
          cursor: payload.cursor,
        })
      }),
    )
  }

  if (eventStream) {
    const source = new EventSource(eventStream)
    source.addEventListener(SHADOW_SERVER_APP_COMMAND_COMPLETED_EVENT, (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data || '{}') as {
          command?: string
        }
        const commandName = payload.command ?? null
        if (
          suppressDurableCommandCompleted &&
          commandName &&
          durableCommandNames.has(commandName)
        ) {
          return
        }
        onEvent({
          type: 'shadow.command.completed',
          command: commandName,
        })
      } catch {
        if (!suppressDurableCommandCompleted) {
          onEvent({ type: 'shadow.command.completed', command: null })
        }
      }
    })
    unsubscribers.push(() => source.close())
  }

  if (unsubscribers.length === 0) return () => undefined
  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe()
  }
}
