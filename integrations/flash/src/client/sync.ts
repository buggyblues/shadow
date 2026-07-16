import type {
  CardLayoutUpdateInput,
  FlashArena,
  FlashBoardSnapshot,
  FlashCard,
  FlashCommandEvent,
  FlashMutationResult,
  FlashPatchEvent,
  FlashSelection,
} from '@shadowob/flash-types/space-app'
import {
  getBoardEvents,
  normalizeBoardEventsResult,
  normalizeBoardSnapshot,
  normalizeFlashCommandEvents,
  normalizeMutationResult,
  subscribeBoard,
  updateCardLayouts,
} from './api'

export interface FlashBoardSyncView {
  cards: FlashCard[]
  arenas: FlashArena[]
  selections: FlashSelection[]
  events: FlashCommandEvent[]
  cursor: number
  viewport: FlashBoardSnapshot['board']['viewport']
  pendingMutations: string[]
  bufferedEvents: number
}

interface PredictionLock {
  mutationId: string
  expiresAt: number
}

export interface FlashMutationEnvelope {
  clientMutationId: string
  baseCursor: number
}

export interface FlashBoardSyncOptions {
  eventHistoryLimit?: number
  predictionHoldMs?: number
  gapCatchupDelayMs?: number
  onState?: (state: FlashBoardSyncView) => void
  onEvent?: (event: FlashCommandEvent) => void
  onGap?: (expectedSeq: number, receivedSeq: number) => void
  onError?: (error: unknown) => void
  onConflict?: (error: unknown) => void
}

export function createClientMutationId(prefix = 'flash'): string {
  const cryptoLike = globalThis.crypto
  if (cryptoLike?.randomUUID) return `${prefix}_${cryptoLike.randomUUID()}`
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`
}

function upsertById<T extends { id: string }>(map: Map<string, T>, value: T): void {
  map.set(value.id, value)
}

function suppressLayout(remote: FlashCard, local: FlashCard | undefined): FlashCard {
  if (!local) return remote
  return { ...remote, layout: local.layout }
}

function monotonicNow(): number {
  return typeof globalThis.performance?.now === 'function'
    ? globalThis.performance.now()
    : Date.now()
}

function sortedEvents(events: unknown): FlashCommandEvent[] {
  return normalizeFlashCommandEvents(events).sort(
    (a, b) => a.seq - b.seq || a.id.localeCompare(b.id),
  )
}

function safePatches(event: FlashCommandEvent): FlashPatchEvent[] {
  return Array.isArray(event.patches) ? event.patches : []
}

function patchCards(patch: FlashPatchEvent): FlashCard[] {
  return 'cards' in patch && Array.isArray(patch.cards) ? patch.cards : []
}

function isConflictError(error: unknown): boolean {
  const status =
    typeof (error as { status?: unknown })?.status === 'number'
      ? (error as { status: number }).status
      : null
  if (status === 409) return true
  const message = error instanceof Error ? error.message : String(error)
  return /409|conflict|revision|base_cursor_stale|mutation_in_flight/u.test(message)
}

export function applyPatch(
  state: FlashBoardSyncState,
  patch: FlashPatchEvent,
  event?: FlashCommandEvent,
): void {
  if (!patch || typeof patch !== 'object') return
  switch (patch.type) {
    case 'card.created': {
      const card = (patch as { card?: FlashCard }).card
      if (card?.id) upsertById(state.cardsById, card)
      break
    }
    case 'card.updated': {
      const remoteCard = (patch as { card?: FlashCard }).card
      if (!remoteCard?.id) break
      const local = state.cardsById.get(remoteCard.id)
      const card = state.shouldPreserveLocalLayout(remoteCard.id, event)
        ? suppressLayout(remoteCard, local)
        : remoteCard
      upsertById(state.cardsById, card)
      break
    }
    case 'cards.updated':
      for (const remoteCard of patchCards(patch)) {
        if (!remoteCard?.id) continue
        const local = state.cardsById.get(remoteCard.id)
        const card = state.shouldPreserveLocalLayout(remoteCard.id, event)
          ? suppressLayout(remoteCard, local)
          : remoteCard
        upsertById(state.cardsById, card)
      }
      break
    case 'card.deleted': {
      const cardId = (patch as { cardId?: unknown }).cardId
      if (typeof cardId !== 'string') break
      state.cardsById.delete(cardId)
      state.predictionLocks.delete(cardId)
      break
    }
    case 'arena.created':
    case 'arena.updated': {
      const arena = (patch as { arena?: FlashArena }).arena
      if (arena?.id) upsertById(state.arenasById, arena)
      break
    }
    case 'arena.deleted': {
      const arenaId = (patch as { arenaId?: unknown }).arenaId
      if (typeof arenaId === 'string') state.arenasById.delete(arenaId)
      break
    }
    case 'selection.updated': {
      const selection = (patch as { selection?: FlashSelection }).selection
      if (selection?.actorId) state.selectionsByActorId.set(selection.actorId, selection)
      break
    }
    case 'board.viewport.updated':
      state.viewport =
        (patch as { viewport?: FlashBoardSnapshot['board']['viewport'] }).viewport ?? null
      break
  }
}

export class FlashBoardSyncState {
  readonly cardsById = new Map<string, FlashCard>()
  readonly arenasById = new Map<string, FlashArena>()
  readonly selectionsByActorId = new Map<string, FlashSelection>()
  readonly events: FlashCommandEvent[] = []
  readonly predictionLocks = new Map<string, PredictionLock>()
  readonly pendingMutationIds = new Set<string>()
  readonly eventBuffer = new Map<number, FlashCommandEvent>()
  readonly seenEventIds = new Set<string>()
  viewport: FlashBoardSnapshot['board']['viewport'] = null
  cursor = 0

  constructor(
    snapshot?: FlashBoardSnapshot,
    private readonly eventHistoryLimit = 80,
    private readonly predictionHoldMs = 1500,
  ) {
    if (snapshot) this.applySnapshot(snapshot)
  }

  applySnapshot(snapshot: FlashBoardSnapshot): void {
    const safeSnapshot = normalizeBoardSnapshot(snapshot)
    this.cardsById.clear()
    this.arenasById.clear()
    this.selectionsByActorId.clear()
    this.eventBuffer.clear()
    this.seenEventIds.clear()
    safeSnapshot.cards.forEach((card) => this.cardsById.set(card.id, card))
    safeSnapshot.arenas.forEach((arena) => this.arenasById.set(arena.id, arena))
    safeSnapshot.selections.forEach((selection) =>
      this.selectionsByActorId.set(selection.actorId, selection),
    )
    const events = sortedEvents(safeSnapshot.events).slice(-this.eventHistoryLimit)
    this.events.splice(0, this.events.length, ...events)
    for (const event of events) this.seenEventIds.add(event.id)
    this.viewport = safeSnapshot.board?.viewport ?? null
    this.cursor = safeSnapshot.cursor
  }

  applyEvent(event: FlashCommandEvent): FlashCommandEvent[] {
    if (event.seq <= this.cursor || this.seenEventIds.has(event.id)) return []
    this.purgeExpiredPredictionLocks()
    const expected = this.cursor + 1
    if (event.seq > expected) {
      const existing = this.eventBuffer.get(event.seq)
      if (!existing || existing.id !== event.id) this.eventBuffer.set(event.seq, event)
      return []
    }
    return this.applyContiguous(event)
  }

  beginLocalMutation(cardIds: Iterable<string>, mutationId = createClientMutationId()): string {
    const expiresAt = monotonicNow() + this.predictionHoldMs
    this.pendingMutationIds.add(mutationId)
    for (const cardId of cardIds) this.predictionLocks.set(cardId, { mutationId, expiresAt })
    return mutationId
  }

  updateLocalCardLayout(
    cardId: string,
    layout: Partial<FlashCard['layout']>,
    mutationId?: string,
  ): void {
    const card = this.cardsById.get(cardId)
    if (!card) return
    this.cardsById.set(cardId, {
      ...card,
      layout: { ...card.layout, ...layout },
    })
    if (mutationId) this.beginLocalMutation([cardId], mutationId)
  }

  settleMutation(mutationId: string): void {
    this.pendingMutationIds.delete(mutationId)
    for (const [cardId, lock] of this.predictionLocks) {
      if (lock.mutationId === mutationId) this.predictionLocks.delete(cardId)
    }
  }

  failMutation(mutationId: string): void {
    this.settleMutation(mutationId)
  }

  shouldPreserveLocalLayout(cardId: string, event?: FlashCommandEvent): boolean {
    const lock = this.predictionLocks.get(cardId)
    if (!lock) return false
    if (event?.clientMutationId && event.clientMutationId === lock.mutationId) return false
    if (lock.expiresAt <= monotonicNow()) {
      this.predictionLocks.delete(cardId)
      return false
    }
    return true
  }

  purgeExpiredPredictionLocks(): void {
    const now = monotonicNow()
    for (const [cardId, lock] of this.predictionLocks) {
      if (lock.expiresAt <= now) this.predictionLocks.delete(cardId)
    }
  }

  hasBufferedGap(): boolean {
    if (this.eventBuffer.size === 0) return false
    return Math.min(...this.eventBuffer.keys()) > this.cursor + 1
  }

  nextBufferedSeq(): number | null {
    if (this.eventBuffer.size === 0) return null
    return Math.min(...this.eventBuffer.keys())
  }

  view(): FlashBoardSyncView {
    return {
      cards: [...this.cardsById.values()],
      arenas: [...this.arenasById.values()],
      selections: [...this.selectionsByActorId.values()],
      events: [...this.events],
      cursor: this.cursor,
      viewport: this.viewport,
      pendingMutations: [...this.pendingMutationIds],
      bufferedEvents: this.eventBuffer.size,
    }
  }

  private applyContiguous(first: FlashCommandEvent): FlashCommandEvent[] {
    const applied: FlashCommandEvent[] = []
    let event: FlashCommandEvent | undefined = first
    while (event) {
      this.eventBuffer.delete(event.seq)
      for (const patch of safePatches(event)) applyPatch(this, patch, event)
      this.cursor = Math.max(this.cursor, event.seq)
      this.events.push(event)
      this.seenEventIds.add(event.id)
      if (this.events.length > this.eventHistoryLimit) {
        const removed = this.events.splice(0, this.events.length - this.eventHistoryLimit)
        for (const item of removed) this.seenEventIds.delete(item.id)
      }
      if (event.clientMutationId) this.settleMutation(event.clientMutationId)
      applied.push(event)
      event = this.eventBuffer.get(this.cursor + 1)
    }
    return applied
  }
}

export class FlashBoardSync {
  readonly state: FlashBoardSyncState
  private unsubscribe: (() => void) | null = null
  private catchupInFlight: Promise<void> | null = null
  private gapCatchupTimer: number | null = null
  private removeBrowserListeners: (() => void) | null = null

  constructor(
    private readonly boardId: string,
    snapshot?: FlashBoardSnapshot,
    private readonly options: FlashBoardSyncOptions = {},
  ) {
    this.state = new FlashBoardSyncState(
      snapshot,
      options.eventHistoryLimit,
      options.predictionHoldMs,
    )
  }

  start(): void {
    this.stop()
    this.unsubscribe = subscribeBoard(this.boardId, (event) => this.applyRealtimeEvent(event), {
      after: this.state.cursor,
      getAfter: () => this.state.cursor,
      onOpen: () => void this.catchUp(),
      onError: (error) => this.options.onError?.(error),
    })
    this.installBrowserCatchupHooks()
    void this.catchUp()
  }

  stop(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
    this.removeBrowserListeners?.()
    this.removeBrowserListeners = null
    if (this.gapCatchupTimer !== null) {
      clearTimeout(this.gapCatchupTimer)
      this.gapCatchupTimer = null
    }
  }

  beginLocalMutation(cardIds: Iterable<string>, mutationId = createClientMutationId()): string {
    return this.state.beginLocalMutation(cardIds, mutationId)
  }

  mutationEnvelope(mutationId = createClientMutationId()): FlashMutationEnvelope {
    return { clientMutationId: mutationId, baseCursor: this.state.cursor }
  }

  async submitMutation<T extends FlashMutationResult>(
    cardIds: Iterable<string>,
    run: (envelope: FlashMutationEnvelope) => Promise<T>,
    mutationId = createClientMutationId(),
  ): Promise<T> {
    this.state.beginLocalMutation(cardIds, mutationId)
    try {
      const result = await run({
        clientMutationId: mutationId,
        baseCursor: this.state.cursor,
      })
      this.commitMutationResult(result)
      return result
    } catch (err) {
      this.state.failMutation(mutationId)
      if (isConflictError(err)) this.options.onConflict?.(err)
      await this.catchUp().catch((catchupErr) => this.options.onError?.(catchupErr))
      throw err
    } finally {
      this.emitState()
    }
  }

  async submitLayoutUpdates(
    updates: CardLayoutUpdateInput[],
    mutationId = createClientMutationId('flash_layout'),
  ): Promise<FlashMutationResult> {
    const cardIds = updates.map((item) => item.cardId)
    for (const item of updates) {
      this.state.updateLocalCardLayout(
        item.cardId,
        {
          x: item.x,
          y: item.y,
          angle: item.angle,
          flipped: item.flipped,
          hidden: item.hidden,
          locked: item.locked,
        },
        mutationId,
      )
    }
    this.emitState()
    return this.submitMutation(
      cardIds,
      (envelope) =>
        updateCardLayouts({
          ...envelope,
          boardId: this.boardId,
          conflictPolicy: 'merge-layout',
          updates,
        }),
      mutationId,
    )
  }

  commitMutationResult(result: FlashMutationResult | unknown): void {
    const normalized = normalizeMutationResult(result, this.state.cursor)
    let changed = false
    for (const event of sortedEvents(normalized.events)) {
      const applied = this.applyEvent(event)
      changed = applied.length > 0 || changed
    }
    if (normalized.cursor > this.state.cursor || normalized.events.length === 0) {
      this.scheduleGapCatchup()
    }
    if (changed) this.emitState()
  }

  async catchUp(): Promise<void> {
    if (this.catchupInFlight) return this.catchupInFlight
    this.catchupInFlight = this.catchUpInner().finally(() => {
      this.catchupInFlight = null
    })
    return this.catchupInFlight
  }

  private async catchUpInner(): Promise<void> {
    for (;;) {
      const result = normalizeBoardEventsResult(
        await getBoardEvents({
          boardId: this.boardId,
          after: this.state.cursor,
          limit: 200,
        }),
        this.state.cursor,
      )
      let changed = false
      for (const event of sortedEvents(result.events)) {
        const applied = this.applyEvent(event)
        changed = applied.length > 0 || changed
      }
      if (changed) this.emitState()
      if (!result.hasMore || result.cursor <= this.state.cursor) break
    }

    if (this.state.hasBufferedGap()) {
      const receivedSeq = this.state.nextBufferedSeq()
      if (receivedSeq !== null) this.options.onGap?.(this.state.cursor + 1, receivedSeq)
    } else if (this.state.eventBuffer.size > 0) {
      let changed = false
      for (const event of sortedEvents([...this.state.eventBuffer.values()])) {
        const applied = this.applyEvent(event)
        changed = applied.length > 0 || changed
      }
      if (changed) this.emitState()
    }
  }

  private applyRealtimeEvent(event: { type: string; payload?: unknown }): void {
    if (event.type !== 'flash.events.appended') return
    const payload = normalizeBoardEventsResult(event.payload, this.state.cursor)
    if (payload.events.length === 0) {
      if (payload.cursor > this.state.cursor) this.scheduleGapCatchup()
      return
    }
    let changed = false
    for (const item of sortedEvents(payload.events)) {
      const expected = this.state.cursor + 1
      if (item.seq > expected) this.options.onGap?.(expected, item.seq)
      const applied = this.applyEvent(item)
      changed = applied.length > 0 || changed
    }
    if (payload.cursor && payload.cursor > this.state.cursor) this.scheduleGapCatchup()
    if (changed) this.emitState()
  }

  private applyEvent(event: FlashCommandEvent): FlashCommandEvent[] {
    const applied = this.state.applyEvent(event)
    for (const item of applied) this.options.onEvent?.(item)
    return applied
  }

  private scheduleGapCatchup(): void {
    if (this.gapCatchupTimer !== null) return
    const delay = this.options.gapCatchupDelayMs ?? 40
    this.gapCatchupTimer = setTimeout(() => {
      this.gapCatchupTimer = null
      void this.catchUp().catch((err) => this.options.onError?.(err))
    }, delay) as unknown as number
  }

  private installBrowserCatchupHooks(): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') return
    const onOnline = () => void this.catchUp().catch((err) => this.options.onError?.(err))
    const onVisibility = () => {
      if (document.visibilityState === 'visible') onOnline()
    }
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisibility)
    this.removeBrowserListeners = () => {
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }

  private emitState(): void {
    this.options.onState?.(this.state.view())
  }
}
