import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import type { CardMeta, RuleCardMeta } from '@shadowob/flash-types'
import {
  composeCardDraftsFromMaterial,
  normalizeCardDraft,
  normalizeCardForTransport,
} from '@shadowob/flash-types'
import type {
  FlashActorRef,
  FlashArena,
  FlashBoard,
  FlashBoardSnapshot,
  FlashCard,
  FlashCardKind,
  FlashCardPriority,
  FlashCommandEvent,
  FlashCommandName,
  FlashMutationResult,
  FlashPatchEvent,
  FlashRealtimeEvent,
  FlashSelection,
  FlashUploadedAsset,
  FlashUploadInput,
  FlashViewport,
} from '@shadowob/flash-types/space-app'
import {
  type ArenasActivateInput,
  type ArenasCreateInput,
  type AssetsUploadInput,
  type BoardEventsInput,
  type BoardGetInput,
  type BoardViewportUpdateInput,
  type CardsCommandInput,
  type CardsComposeInput,
  type CardsCreateInput,
  type CardsDeleteInput,
  type CardsGetInput,
  type CardsLayoutUpdateInput,
  type CardsUpdateInput,
  type RoomsAttachInput,
  type SelectionGetInput,
  type SelectionUpdateInput,
} from '@shadowob/flash-types/space-app'
import type { ShadowSpaceAppActorRef, ShadowSpaceAppCommandContext } from '@shadowob/sdk'
import {
  FlashArenaDao,
  FlashBoardDao,
  FlashCardDao,
  FlashCommandEventDao,
  type FlashDaoBundle,
  FlashMutationReceiptDao,
  FlashSelectionDao,
} from '../dao/flash.dao.js'
import type {
  flashArenas,
  flashBoards,
  flashCards,
  flashCommandEvents,
  flashMutationReceipts,
  flashSelections,
} from '../db/schema.js'
import type { FlashRealtimeService } from './realtime.service.js'
import {
  type FlashScriptCapabilities,
  type FlashScriptCardUpdate,
  FlashScriptEngine,
  type FlashScriptResult,
} from './script-engine.js'

type BoardRow = typeof flashBoards.$inferSelect
type CardRow = typeof flashCards.$inferSelect
type ArenaRow = typeof flashArenas.$inferSelect
type EventRow = typeof flashCommandEvents.$inferSelect
type MutationReceiptRow = typeof flashMutationReceipts.$inferSelect
type SelectionRow = typeof flashSelections.$inferSelect

interface CommandDispatch {
  result: unknown
  patches: FlashPatchEvent[]
}

interface MutationReservation {
  clientMutationId: string | null
  baseCursor: number | null
  reserved: boolean
}

type MutationBeginResult = MutationReservation | FlashMutationResult

export interface FlashCommandScope {
  context: ShadowSpaceAppCommandContext
  actor: ShadowSpaceAppActorRef
}

function nowMs(date: Date) {
  return date.getTime()
}

function id(prefix: string) {
  return `${prefix}_${randomUUID()}`
}

function uploadDir() {
  return process.env.FLASH_UPLOAD_DIR ?? join(process.cwd(), 'data', 'uploads')
}

function uploadPublicPath(filename: string) {
  return `/uploads/${filename}`
}

function safeUploadExtension(filename: string, contentType: string) {
  const ext = extname(filename).toLowerCase()
  if (/^\.[a-z0-9]{1,12}$/u.test(ext)) return ext
  if (contentType === 'image/png') return '.png'
  if (contentType === 'image/jpeg') return '.jpg'
  if (contentType === 'image/webp') return '.webp'
  if (contentType === 'image/gif') return '.gif'
  return '.bin'
}

function asError(status: number, message: string) {
  return Object.assign(new Error(message), { status })
}

function asNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asString(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function actorRef(scope: FlashCommandScope): FlashActorRef {
  return {
    ...scope.actor,
    profile: scope.context.actor.profile ?? null,
  }
}

function actorResourceOwner(scope: FlashCommandScope) {
  return scope.context.actor.ownerId ?? scope.context.actor.userId ?? scope.actor.userId ?? 'local'
}

function selectionActorId(scope: FlashCommandScope) {
  return scope.actor.id
}

function boardOwnerTitle(scope: FlashCommandScope) {
  const actor = scope.context.actor
  if (actor.kind === 'agent' && actor.ownerId && actor.ownerId !== actor.userId) {
    return "Owner's Flash Board"
  }
  return `${actorRef(scope).displayName}'s Flash Board`
}

function mapBoard(row: BoardRow): FlashBoard {
  return {
    id: row.id,
    serverId: row.serverId,
    ownerUserId: row.ownerUserId,
    title: row.title,
    viewport: row.viewport ?? null,
    createdAt: nowMs(row.createdAt),
    updatedAt: nowMs(row.updatedAt),
  }
}

function normalizeFlashCard(card: FlashCard): FlashCard {
  const normalized = normalizeCardForTransport(card)
  return {
    ...card,
    kind: normalized.kind,
    summary: normalized.summary,
    content: normalized.content,
    meta: normalized.meta,
    tags: normalized.tags,
    priority: normalized.priority,
  }
}

function mapCard(row: CardRow): FlashCard {
  return normalizeFlashCard({
    id: row.id,
    kind: row.kind,
    title: row.title,
    summary: row.summary ?? undefined,
    content: row.content ?? undefined,
    thumbnail: row.thumbnail ?? undefined,
    sourceId: row.sourceId,
    linkedCardIds: row.linkedCardIds ?? [],
    meta: (row.meta ?? {}) as CardMeta,
    tags: row.tags ?? [],
    priority: row.priority,
    autoGenerated: row.autoGenerated,
    rating: row.rating,
    filePath: row.filePath ?? undefined,
    fileMime: row.fileMime ?? undefined,
    deckIds: row.deckIds ?? [],
    revision: row.revision ?? 0,
    createdAt: nowMs(row.createdAt),
    updatedAt: nowMs(row.updatedAt),
    layout: {
      x: row.x,
      y: row.y,
      angle: row.angle,
      flipped: row.flipped,
      hidden: row.hidden,
      locked: row.locked,
    },
    createdBy: row.createdBy ?? null,
  })
}

function mapArena(row: ArenaRow): FlashArena {
  return {
    id: row.id,
    boardId: row.boardId,
    kind: row.kind,
    label: row.label,
    x: row.x,
    y: row.y,
    radius: row.radius,
    color: row.color,
    cardIds: row.cardIds ?? [],
    script: row.script,
    revision: row.revision ?? 0,
    createdAt: nowMs(row.createdAt),
    updatedAt: nowMs(row.updatedAt),
  }
}

function normalizePatch(patch: FlashPatchEvent): FlashPatchEvent {
  if (patch.type === 'card.created' || patch.type === 'card.updated') {
    return { ...patch, card: normalizeFlashCard(patch.card) }
  }
  if (patch.type === 'cards.updated') {
    return { ...patch, cards: patch.cards.map(normalizeFlashCard) }
  }
  return patch
}

function mapEvent(row: EventRow): FlashCommandEvent {
  return {
    id: row.id,
    seq: row.boardSeq ?? row.seq,
    globalSeq: row.seq,
    boardId: row.boardId,
    cardId: row.cardId,
    commandName: row.commandName,
    command: row.command,
    result: row.result,
    patches: (row.patches ?? []).map((patch) => normalizePatch(patch as FlashPatchEvent)),
    actor: row.actor ?? null,
    clientMutationId: row.clientMutationId ?? null,
    baseCursor: row.baseCursor ?? null,
    causalLag: row.causalLag ?? 0,
    createdAt: nowMs(row.createdAt),
  }
}

function mapSelection(row: SelectionRow): FlashSelection {
  return {
    boardId: row.boardId,
    actorId: row.actorId,
    actor: row.actor ?? null,
    selectedCardIds: row.selectedCardIds ?? [],
    anchorCardId: row.anchorCardId ?? null,
    revision: row.revision,
    updatedAt: nowMs(row.updatedAt),
  }
}

function nearby(cards: CardRow[], target: CardRow, radius: number) {
  return cards
    .filter((card) => card.id !== target.id)
    .map((card) => ({
      id: card.id,
      title: card.title,
      distance: Math.hypot(card.x - target.x, card.y - target.y),
    }))
    .filter((item) => item.distance <= radius)
    .sort((a, b) => a.distance - b.distance)
}

function dispatch(result: unknown, patches: FlashPatchEvent[] = []): CommandDispatch {
  return { result, patches }
}

function updatedCardPatch(card: CardRow | null): FlashPatchEvent[] {
  return card ? [{ type: 'card.updated', card: mapCard(card) }] : []
}

function commandInputForEvent(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input
  const {
    upload: _upload,
    clientMutationId: _clientMutationId,
    baseCursor: _baseCursor,
    ...rest
  } = input as Record<string, unknown>
  return rest
}

function commandObjectForEvent(input: unknown): Record<string, unknown> {
  const value = commandInputForEvent(input)
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function previewText(value: unknown, max = 800): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined
  const text = value.trim().replace(/\s+/g, ' ')
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}

function composeCommandInputForEvent(input: CardsComposeInput): Record<string, unknown> {
  const command = commandObjectForEvent(input)
  const material = previewText(input.material)
  const instructions = previewText(input.instructions, 400)
  delete command.material
  delete command.instructions
  delete command.drafts
  return {
    ...command,
    materialPreview: material,
    materialLength: typeof input.material === 'string' ? input.material.length : 0,
    instructionsPreview: instructions,
    draftCount: Array.isArray(input.drafts) ? input.drafts.length : 0,
  }
}

const CARD_UPDATE_ENVELOPE_KEYS = new Set([
  'boardId',
  'cardId',
  'clientMutationId',
  'baseCursor',
  'clientRevision',
])
const CARD_LAYOUT_UPDATE_KEYS = new Set(['x', 'y', 'angle', 'flipped', 'hidden', 'locked'])
const CARD_SEMANTIC_UPDATE_KEYS = new Set([
  'kind',
  'title',
  'summary',
  'content',
  'thumbnail',
  'sourceId',
  'linkedCardIds',
  'meta',
  'tags',
  'priority',
  'autoGenerated',
  'rating',
  'filePath',
  'fileMime',
  'deckIds',
  'upload',
])

function presentInputKeys(input: unknown): string[] {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return []
  return Object.entries(input as Record<string, unknown>)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key)
}

function isLayoutOnlyCardUpdate(input: unknown): boolean {
  const dataKeys = presentInputKeys(input).filter((key) => !CARD_UPDATE_ENVELOPE_KEYS.has(key))
  return dataKeys.length > 0 && dataKeys.every((key) => CARD_LAYOUT_UPDATE_KEYS.has(key))
}

function finiteLayoutValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function compactLayoutUpdate(input: {
  x?: number
  y?: number
  angle?: number
  flipped?: boolean
  hidden?: boolean
  locked?: boolean
}): {
  x?: number
  y?: number
  angle?: number
  flipped?: boolean
  hidden?: boolean
  locked?: boolean
} {
  return {
    x: finiteLayoutValue(input.x),
    y: finiteLayoutValue(input.y),
    angle: finiteLayoutValue(input.angle),
    flipped: typeof input.flipped === 'boolean' ? input.flipped : undefined,
    hidden: typeof input.hidden === 'boolean' ? input.hidden : undefined,
    locked: typeof input.locked === 'boolean' ? input.locked : undefined,
  }
}

function hasLayoutFields(input: ReturnType<typeof compactLayoutUpdate>): boolean {
  return Object.values(input).some((value) => value !== undefined)
}

function dedupeLayoutUpdates(
  input: CardsLayoutUpdateInput['updates'],
): CardsLayoutUpdateInput['updates'] {
  const byId = new Map<string, CardsLayoutUpdateInput['updates'][number]>()
  for (const update of input) {
    const previous = byId.get(update.cardId)
    byId.set(update.cardId, previous ? { ...previous, ...update } : update)
  }
  return [...byId.values()]
}

function mutationMeta(input: unknown): {
  clientMutationId: string | null
  baseCursor: number | null
} {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { clientMutationId: null, baseCursor: null }
  }
  const value = input as { clientMutationId?: unknown; baseCursor?: unknown }
  const clientMutationId =
    typeof value.clientMutationId === 'string' && value.clientMutationId.trim()
      ? value.clientMutationId.trim()
      : null
  const baseCursor =
    typeof value.baseCursor === 'number' && Number.isFinite(value.baseCursor)
      ? Math.max(0, Math.floor(value.baseCursor))
      : null
  return { clientMutationId, baseCursor }
}

function mutationResultFromEvent(row: EventRow): FlashMutationResult {
  const event = mapEvent(row)
  return {
    result: event.result,
    events: [event],
    cursor: event.seq,
    hasMore: false,
  }
}

function mutationResultFromReceipt(row: MutationReceiptRow): FlashMutationResult | null {
  if (!row.result || typeof row.result !== 'object' || Array.isArray(row.result)) return null
  const value = row.result as Partial<FlashMutationResult>
  if (!Array.isArray(value.events) || typeof value.cursor !== 'number') return null
  return {
    result: value.result,
    events: value.events,
    cursor: value.cursor,
    hasMore: value.hasMore,
  }
}

function isMutationResult(value: MutationBeginResult): value is FlashMutationResult {
  return Array.isArray((value as FlashMutationResult).events)
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function ruleMeta(card: CardRow): RuleCardMeta {
  return (card.meta ?? {}) as RuleCardMeta
}

function rulePriority(card: CardRow): number {
  const priority = ruleMeta(card).priority
  return typeof priority === 'number' && Number.isFinite(priority) ? priority : 100
}

function eligibleArenaRuleCards(cards: CardRow[], arena: ArenaRow) {
  return cards
    .filter((card) => {
      if (card.kind !== 'rule') return false
      const meta = ruleMeta(card)
      if (meta.enabled === false) return false
      if ((meta.trigger ?? 'manual') !== 'onArenaActivate') return false
      const arenaIds = Array.isArray(meta.arenaIds) ? meta.arenaIds : []
      return arenaIds.length === 0 || arenaIds.includes(arena.id) || arena.cardIds.includes(card.id)
    })
    .sort((a, b) => rulePriority(a) - rulePriority(b) || a.id.localeCompare(b.id))
}

function scriptCapabilitiesFromRule(meta: RuleCardMeta): FlashScriptCapabilities {
  const raw = Array.isArray(meta.capabilities) ? new Set(meta.capabilities) : null
  if (!raw) {
    return {
      cardLayout: true,
      cardMeta: false,
      cardVisibility: true,
      arenaLayout: false,
      arenaMembership: true,
      arenaScript: false,
      logs: true,
    }
  }
  return {
    cardLayout: raw.has('cards.layout'),
    cardMeta: raw.has('cards.meta'),
    cardVisibility: raw.has('cards.visibility'),
    arenaLayout: raw.has('arena.layout'),
    arenaMembership: raw.has('arena.membership'),
    arenaScript: raw.has('arena.script'),
    logs: true,
  }
}

function ruleAllowedCardIds(
  meta: RuleCardMeta,
  allCards: CardRow[],
  activeIds: string[],
): string[] {
  if (meta.scope === 'board') return allCards.map((card) => card.id)
  return activeIds
}

function hasScriptChanges(result: FlashScriptResult): boolean {
  return Boolean((result.cards && result.cards.length > 0) || result.arena)
}

function mergeScriptResult(
  target: FlashScriptResult,
  source: FlashScriptResult,
): FlashScriptResult {
  if (source.cards?.length) target.cards = [...(target.cards ?? []), ...source.cards]
  if (source.arena) target.arena = { ...(target.arena ?? {}), ...source.arena }
  if (source.log?.length) target.log = [...(target.log ?? []), ...source.log]
  return target
}

function dedupeCardUpdates(updates: FlashScriptCardUpdate[]): FlashScriptCardUpdate[] {
  const byId = new Map<string, FlashScriptCardUpdate>()
  for (const update of updates) {
    byId.set(update.id, {
      ...(byId.get(update.id) ?? { id: update.id }),
      ...update,
    })
  }
  return [...byId.values()]
}

export class FlashService {
  constructor(
    private readonly deps: {
      boards: FlashBoardDao
      cards: FlashCardDao
      arenas: FlashArenaDao
      events: FlashCommandEventDao
      receipts: FlashMutationReceiptDao
      selections: FlashSelectionDao
      realtime: FlashRealtimeService
      scripts: FlashScriptEngine
    },
  ) {}

  private withDaoBundle(daos: FlashDaoBundle) {
    return new FlashService({
      ...this.deps,
      boards: daos.boards,
      cards: daos.cards,
      arenas: daos.arenas,
      events: daos.events,
      receipts: daos.receipts,
      selections: daos.selections,
    })
  }

  async getBoard(input: BoardGetInput, scope: FlashCommandScope) {
    const board = await this.resolveBoard(input.boardId, scope)
    return { snapshot: await this.snapshot(board, scope) }
  }

  async listBoardEvents(input: BoardEventsInput, scope: FlashCommandScope) {
    const board = await this.resolveBoard(input.boardId, scope)
    const limit = input.limit ?? 200
    const rows = await this.deps.events.listAfter(board.id, input.after ?? 0, limit)
    const events = rows.map(mapEvent)
    const cursor = this.cursorFromEvents(events, input.after ?? 0)
    const highWaterCursor = await this.deps.events.latestCursor(board.id)
    return {
      events,
      cursor,
      highWaterCursor,
      hasMore: rows.length >= limit || highWaterCursor > cursor,
    }
  }

  private async storeUpload(upload: FlashUploadInput): Promise<FlashUploadedAsset> {
    if (!upload.contentType.startsWith('image/')) throw asError(415, 'unsupported_upload_type')
    const bytes = Buffer.from(upload.dataBase64, 'base64')
    if (bytes.byteLength !== upload.size) throw asError(400, 'upload_size_mismatch')
    const filename = `${id('asset')}${safeUploadExtension(upload.filename, upload.contentType)}`
    await mkdir(uploadDir(), { recursive: true })
    await writeFile(join(uploadDir(), filename), bytes)
    return {
      url: uploadPublicPath(filename),
      path: uploadPublicPath(filename),
      filename: basename(upload.filename),
      contentType: upload.contentType,
      size: bytes.byteLength,
    }
  }

  private async applyUploadToCardInput<T extends CardsCreateInput | CardsUpdateInput>(
    input: T,
  ): Promise<T & { storedAsset?: FlashUploadedAsset }> {
    if (!input.upload) return input
    const asset = await this.storeUpload(input.upload)
    const meta = {
      ...(input.meta ?? {}),
      src: asset.url,
      image: {
        ...((input.meta?.image as Record<string, unknown> | undefined) ?? {}),
        src: asset.url,
      },
      upload: {
        filename: asset.filename,
        contentType: asset.contentType,
        size: asset.size,
      },
    }
    return {
      ...input,
      kind: input.kind ?? 'image',
      thumbnail: input.thumbnail ?? asset.url,
      filePath: input.filePath ?? asset.path,
      fileMime: input.fileMime ?? asset.contentType,
      meta,
      storedAsset: asset,
    }
  }

  async updateBoardViewport(input: BoardViewportUpdateInput, scope: FlashCommandScope) {
    const board = await this.resolveBoard(input.boardId, scope)
    return this.runMutation(board, scope, input, async (mutation, tx) => {
      const viewport: FlashViewport = {
        offsetX: input.viewport.offsetX,
        offsetY: input.viewport.offsetY,
        zoom: input.viewport.zoom,
        updatedAt: Date.now(),
      }
      await tx.deps.boards.updateViewport(board.id, viewport)
      return tx.recordMutation(
        board,
        scope,
        'boards.viewport.update',
        null,
        input,
        { viewport },
        [{ type: 'board.viewport.updated', viewport }],
        mutation,
      )
    })
  }

  async getCard(input: CardsGetInput, scope: FlashCommandScope) {
    const board = await this.resolveBoard(input.boardId, scope)
    const card = await this.deps.cards.findById(board.id, input.cardId)
    if (!card) throw asError(404, 'card_not_found')
    return { card: mapCard(card), snapshot: await this.snapshot(board, scope) }
  }

  async composeCards(input: CardsComposeInput, scope: FlashCommandScope) {
    const board = await this.resolveBoard(input.boardId, scope)
    return this.runMutation(board, scope, input, async (mutation, tx) => {
      const composition = composeCardDraftsFromMaterial(input)
      const placement = input.placement ?? {}
      const columns = Math.max(1, Math.min(placement.columns ?? 4, 12))
      const startX = placement.x ?? 320
      const startY = placement.y ?? 260
      const gapX = placement.gapX ?? 230
      const gapY = placement.gapY ?? 310
      const jitter = placement.angleJitter ?? 0.035
      const created: CardRow[] = []

      for (let index = 0; index < composition.drafts.length; index++) {
        const draft = composition.drafts[index]!
        const col = index % columns
        const row = Math.floor(index / columns)
        const angle = jitter ? ((index % 5) - 2) * jitter : 0
        const card = await tx.createCardRow(board, scope, {
          title: draft.title,
          kind: draft.kind,
          summary: draft.summary,
          content: draft.content,
          tags: draft.tags,
          x: startX + col * gapX,
          y: startY + row * gapY,
          angle,
          thumbnail: draft.thumbnail,
          sourceId: draft.sourceId ?? null,
          linkedCardIds: draft.linkedCardIds,
          meta: draft.meta,
          priority: draft.priority,
          autoGenerated: true,
          rating: draft.rating,
          filePath: draft.filePath,
          fileMime: draft.fileMime,
          deckIds: draft.deckIds,
          flipped: false,
          hidden: false,
          locked: false,
        })
        created.push(card)
      }

      const cards = created.map(mapCard)
      return tx.recordMutation(
        board,
        scope,
        'cards.compose',
        cards.length === 1 ? cards[0]!.id : null,
        composeCommandInputForEvent(input),
        {
          cards,
          plan: composition.plan,
          intent: composition.intent,
          semanticVersion: composition.semanticVersion,
        },
        cards.map((card) => ({ type: 'card.created', card }) as FlashPatchEvent),
        mutation,
      )
    })
  }

  async createCard(input: CardsCreateInput, scope: FlashCommandScope) {
    const board = await this.resolveBoard(input.boardId, scope)
    return this.runMutation(board, scope, input, async (mutation, tx) => {
      const normalized = await tx.applyUploadToCardInput(input)
      const semantic = normalizeCardDraft(
        { ...normalized, autoGenerated: normalized.autoGenerated ?? false },
        {
          inferKind: normalized.kind === undefined,
          reason: 'cards.create semantic normalization',
        },
      )
      const card = await tx.createCardRow(board, scope, {
        title: semantic.title,
        kind: semantic.kind,
        summary: semantic.summary,
        content: semantic.content,
        tags: semantic.tags,
        x: normalized.x ?? 260,
        y: normalized.y ?? 240,
        angle: normalized.angle ?? 0,
        thumbnail: normalized.thumbnail ?? semantic.thumbnail,
        sourceId: semantic.sourceId ?? null,
        linkedCardIds: semantic.linkedCardIds,
        meta: semantic.meta,
        priority: semantic.priority,
        autoGenerated: semantic.autoGenerated,
        rating: semantic.rating,
        filePath: normalized.filePath ?? semantic.filePath,
        fileMime: normalized.fileMime ?? semantic.fileMime,
        deckIds: semantic.deckIds,
        flipped: normalized.flipped ?? false,
        hidden: normalized.hidden ?? false,
        locked: normalized.locked ?? false,
      })
      const mapped = mapCard(card)
      return tx.recordMutation(
        board,
        scope,
        'cards.create',
        card.id,
        commandInputForEvent(input),
        {
          card: mapped,
          asset: normalized.storedAsset ?? null,
          semanticVersion:
            semantic.meta.flash && typeof semantic.meta.flash === 'object'
              ? (semantic.meta.flash as Record<string, unknown>).semanticVersion
              : undefined,
        },
        [{ type: 'card.created', card: mapped }],
        mutation,
      )
    })
  }

  async updateCard(input: CardsUpdateInput, scope: FlashCommandScope) {
    const board = await this.resolveBoard(input.boardId, scope)
    return this.runMutation(board, scope, input, async (mutation, tx) => {
      const normalized = await tx.applyUploadToCardInput(input)
      const existing = await tx.deps.cards.findById(board.id, input.cardId)
      if (!existing) throw asError(404, 'card_not_found')

      const semanticTouched = presentInputKeys(input).some((key) =>
        CARD_SEMANTIC_UPDATE_KEYS.has(key),
      )
      const semantic = semanticTouched
        ? normalizeCardDraft(
            {
              kind: (normalized.kind ?? existing.kind) as FlashCardKind,
              title: normalized.title ?? existing.title,
              summary: normalized.summary ?? existing.summary ?? undefined,
              content: normalized.content ?? existing.content ?? undefined,
              thumbnail: normalized.thumbnail ?? existing.thumbnail ?? undefined,
              sourceId: normalized.sourceId ?? existing.sourceId ?? null,
              linkedCardIds: normalized.linkedCardIds ?? existing.linkedCardIds ?? [],
              meta: normalized.meta ?? ((existing.meta ?? {}) as Record<string, unknown>),
              tags: normalized.tags ?? existing.tags ?? [],
              priority: normalized.priority ?? existing.priority,
              autoGenerated: normalized.autoGenerated ?? existing.autoGenerated,
              rating: normalized.rating ?? existing.rating,
              filePath: normalized.filePath ?? existing.filePath ?? undefined,
              fileMime: normalized.fileMime ?? existing.fileMime ?? undefined,
              deckIds: normalized.deckIds ?? existing.deckIds ?? [],
            },
            {
              inferKind: false,
              reason: 'cards.update semantic normalization',
            },
          )
        : null

      const shouldRefreshMeta = Boolean(
        semantic &&
          (normalized.kind !== undefined ||
            normalized.content !== undefined ||
            normalized.summary !== undefined ||
            normalized.meta !== undefined ||
            normalized.upload !== undefined),
      )

      const update = {
        title: normalized.title !== undefined ? (semantic?.title ?? normalized.title) : undefined,
        kind: normalized.kind !== undefined ? (semantic?.kind ?? normalized.kind) : undefined,
        summary:
          normalized.summary !== undefined || shouldRefreshMeta
            ? (semantic?.summary ?? normalized.summary)
            : undefined,
        content: normalized.content,
        thumbnail: normalized.thumbnail,
        sourceId: normalized.sourceId,
        linkedCardIds: normalized.linkedCardIds,
        meta: shouldRefreshMeta ? semantic?.meta : undefined,
        tags: normalized.tags !== undefined ? (semantic?.tags ?? normalized.tags) : undefined,
        priority:
          normalized.priority !== undefined
            ? (semantic?.priority ?? normalized.priority)
            : undefined,
        autoGenerated: normalized.autoGenerated,
        rating: normalized.rating,
        filePath: normalized.filePath,
        fileMime: normalized.fileMime,
        deckIds: normalized.deckIds,
        x: normalized.x,
        y: normalized.y,
        angle: normalized.angle,
        flipped: normalized.flipped,
        hidden: normalized.hidden,
        locked: normalized.locked,
      }
      const layoutOnly = isLayoutOnlyCardUpdate(input)
      const card =
        normalized.clientRevision === undefined
          ? await tx.deps.cards.update(board.id, input.cardId, update)
          : await tx.deps.cards.updateIfRevision(
              board.id,
              input.cardId,
              update,
              normalized.clientRevision,
            )
      if (!card) {
        if (normalized.clientRevision !== undefined) {
          if (layoutOnly && process.env.FLASH_REJECT_STALE_LAYOUT !== 'true') {
            const rebased = await tx.deps.cards.update(board.id, input.cardId, update)
            if (!rebased) throw asError(404, 'card_not_found')
            const mapped = mapCard(rebased)
            return tx.recordMutation(
              board,
              scope,
              'cards.update',
              rebased.id,
              {
                ...commandObjectForEvent(input),
                conflictPolicy: 'merge-layout',
                rebasedFromRevision: existing.revision ?? 0,
              },
              {
                card: mapped,
                asset: normalized.storedAsset ?? null,
                conflictResolved: 'layout_rebased',
                clientRevision: normalized.clientRevision,
                serverRevision: existing.revision ?? 0,
              },
              [{ type: 'card.updated', card: mapped }],
              mutation,
            )
          }
          throw asError(409, 'card_revision_conflict')
        }
        throw asError(404, 'card_not_found')
      }
      const mapped = mapCard(card)
      return tx.recordMutation(
        board,
        scope,
        'cards.update',
        card.id,
        commandInputForEvent(input),
        {
          card: mapped,
          asset: normalized.storedAsset ?? null,
          semanticNormalized: shouldRefreshMeta,
        },
        [{ type: 'card.updated', card: mapped }],
        mutation,
      )
    })
  }

  async updateCardLayouts(input: CardsLayoutUpdateInput, scope: FlashCommandScope) {
    const board = await this.resolveBoard(input.boardId, scope)
    return this.runMutation(board, scope, input, async (mutation, tx) => {
      const updates = dedupeLayoutUpdates(input.updates)
        .map((item) => ({ ...item, layout: compactLayoutUpdate(item) }))
        .filter((item) => hasLayoutFields(item.layout))
      if (updates.length === 0) throw asError(400, 'empty_layout_update')

      const changed: CardRow[] = []
      const missing: string[] = []
      const conflicts: Array<{ cardId: string; clientRevision: number; serverRevision: number }> =
        []
      const rejectConflicts = input.conflictPolicy === 'reject'

      for (const item of updates) {
        const existing = await tx.deps.cards.findById(board.id, item.cardId)
        if (!existing) {
          missing.push(item.cardId)
          continue
        }
        if (item.clientRevision !== undefined && existing.revision !== item.clientRevision) {
          conflicts.push({
            cardId: item.cardId,
            clientRevision: item.clientRevision,
            serverRevision: existing.revision ?? 0,
          })
          if (rejectConflicts) continue
        }
        const row = await tx.deps.cards.update(board.id, item.cardId, item.layout)
        if (row) changed.push(row)
      }

      if (rejectConflicts && conflicts.length > 0) throw asError(409, 'card_revision_conflict')
      if (changed.length === 0 && missing.length > 0) throw asError(404, 'card_not_found')

      const mapped = changed.map(mapCard)
      return tx.recordMutation(
        board,
        scope,
        'cards.layout.update',
        mapped.length === 1 ? mapped[0]!.id : null,
        {
          ...commandObjectForEvent(input),
          conflictPolicy: input.conflictPolicy ?? 'merge-layout',
          conflicts,
          missing,
        },
        { cards: mapped, conflicts, missing },
        [{ type: 'cards.updated', cards: mapped }],
        mutation,
      )
    })
  }

  async deleteCard(input: CardsDeleteInput, scope: FlashCommandScope) {
    const board = await this.resolveBoard(input.boardId, scope)
    return this.runMutation(board, scope, input, async (mutation, tx) => {
      const card = await tx.deps.cards.delete(board.id, input.cardId)
      if (!card) throw asError(404, 'card_not_found')
      const mapped = mapCard(card)
      return tx.recordMutation(
        board,
        scope,
        'cards.delete',
        card.id,
        commandInputForEvent(input),
        { deleted: mapped },
        [{ type: 'card.deleted', cardId: card.id }],
        mutation,
      )
    })
  }

  async uploadAsset(input: AssetsUploadInput, scope: FlashCommandScope) {
    const board = await this.resolveBoard(input.boardId, scope)
    return this.runMutation(board, scope, input, async (mutation, tx) => {
      const asset = await tx.storeUpload(input.upload)
      return tx.recordMutation(
        board,
        scope,
        'assets.upload',
        null,
        {
          upload: {
            filename: input.upload.filename,
            contentType: input.upload.contentType,
          },
        },
        { asset },
        [],
        mutation,
      )
    })
  }

  async getSelection(input: SelectionGetInput, scope: FlashCommandScope) {
    const board = await this.resolveBoard(input.boardId, scope)
    const rows = input.actorId
      ? [await this.deps.selections.findByActor(board.id, input.actorId)].filter(Boolean)
      : await this.deps.selections.listByBoard(board.id)
    return { selections: rows.map((row) => mapSelection(row!)) }
  }

  async updateSelection(input: SelectionUpdateInput, scope: FlashCommandScope) {
    const board = await this.resolveBoard(input.boardId, scope)
    return this.runMutation(board, scope, input, async (mutation, tx) => {
      const existingCardIds = new Set(
        (await tx.deps.cards.listByBoard(board.id)).map((card) => card.id),
      )
      const selectedCardIds = input.selectedCardIds.filter((cardId) => existingCardIds.has(cardId))
      const selection = await tx.deps.selections.upsert({
        boardId: board.id,
        actorId: selectionActorId(scope),
        actor: actorRef(scope),
        selectedCardIds,
        anchorCardId:
          input.anchorCardId && selectedCardIds.includes(input.anchorCardId)
            ? input.anchorCardId
            : null,
        revision: input.revision ?? Date.now(),
      })
      const mapped = mapSelection(selection)
      return tx.recordMutation(
        board,
        scope,
        'selection.update',
        mapped.anchorCardId,
        commandInputForEvent(input),
        { selection: mapped },
        [{ type: 'selection.updated', selection: mapped }],
        mutation,
      )
    })
  }

  async attachRoom(input: RoomsAttachInput, scope: FlashCommandScope) {
    const board = await this.resolveBoard(input.boardId, scope)
    const cards = await this.deps.cards.listByBoard(board.id)
    const card = cards.find((item) => item.id === input.cardId)
    if (!card) throw asError(404, 'card_not_found')
    const near = nearby(cards, card, input.radius ?? 360)
    return {
      attached: {
        actor: actorRef(scope),
        card: mapCard(card),
        nearby: near,
        commandHints: [
          {
            command: 'cards.command',
            input: {
              command: {
                name: 'scan',
                cardId: card.id,
                params: { radius: input.radius ?? 360 },
              },
            },
          },
          {
            command: 'cards.command',
            input: {
              command: {
                name: 'arena',
                cardId: '__arena__',
                params: { kind: 'magic-circle', x: card.x, y: card.y },
              },
            },
          },
        ],
      },
      snapshot: await this.snapshot(board, scope),
    }
  }

  async createArena(input: ArenasCreateInput, scope: FlashCommandScope) {
    const board = await this.resolveBoard(input.boardId, scope)
    return this.runMutation(board, scope, input, async (mutation, tx) => {
      const arena = await tx.deps.arenas.create({
        id: id('arena'),
        boardId: board.id,
        kind: input.kind ?? 'magic-circle',
        label: input.label ?? (input.kind === 'grid' ? 'Grid Arena' : 'Magic Circle'),
        x: input.x ?? 520,
        y: input.y ?? 360,
        radius: input.radius ?? 280,
        color: input.color ?? '#7c3aed',
        cardIds: [],
        script: input.script,
      })
      const mapped = mapArena(arena)
      return tx.recordMutation(
        board,
        scope,
        'arenas.create',
        null,
        commandInputForEvent(input),
        { arena: mapped },
        [{ type: 'arena.created', arena: mapped }],
        mutation,
      )
    })
  }

  async activateArena(input: ArenasActivateInput, scope: FlashCommandScope) {
    const board = await this.resolveBoard(input.boardId, scope)
    return this.runMutation(board, scope, input, async (mutation, tx) => {
      if (input.clientRevision !== undefined) {
        const arena = await tx.deps.arenas.findById(board.id, input.arenaId)
        if (!arena) throw asError(404, 'arena_not_found')
        if (arena.revision !== input.clientRevision) throw asError(409, 'arena_revision_conflict')
      }
      const result = await tx.activateArenaById(board, input.arenaId)
      return tx.recordMutation(
        board,
        scope,
        'arenas.activate',
        null,
        commandInputForEvent(input),
        result,
        [
          { type: 'arena.updated', arena: result.arena },
          { type: 'cards.updated', cards: result.affected },
        ],
        mutation,
      )
    })
  }

  async executeCommand(input: CardsCommandInput, scope: FlashCommandScope) {
    const board = await this.resolveBoard(input.boardId, scope)
    return this.runMutation(board, scope, input, async (mutation, tx) => {
      const dispatched = await tx.dispatchPersistentCommand(board, input.command, scope)
      return tx.recordMutation(
        board,
        scope,
        input.command.name,
        input.command.cardId || null,
        input.command,
        dispatched.result,
        dispatched.patches,
        mutation,
      )
    })
  }

  private async createCardRow(
    board: BoardRow,
    scope: FlashCommandScope,
    input: {
      title: string
      kind: FlashCardKind
      summary?: string
      content?: string
      tags?: string[]
      x: number
      y: number
      angle?: number
      thumbnail?: string
      sourceId?: string | null
      linkedCardIds?: string[]
      meta?: Record<string, unknown>
      priority?: FlashCardPriority
      autoGenerated: boolean
      rating?: number
      filePath?: string
      fileMime?: string
      deckIds?: string[]
      flipped?: boolean
      hidden?: boolean
      locked?: boolean
    },
  ) {
    return this.deps.cards.create({
      id: id('card'),
      boardId: board.id,
      kind: input.kind,
      title: input.title,
      summary: input.summary,
      content: input.content,
      thumbnail: input.thumbnail,
      sourceId: input.sourceId ?? null,
      linkedCardIds: input.linkedCardIds ?? [],
      meta: input.meta ?? { body: input.content ?? input.summary ?? '' },
      tags: input.tags ?? [],
      priority: input.priority ?? 'medium',
      autoGenerated: input.autoGenerated,
      rating: input.rating ?? 0,
      filePath: input.filePath,
      fileMime: input.fileMime,
      deckIds: input.deckIds ?? [],
      x: input.x,
      y: input.y,
      angle: input.angle ?? 0,
      flipped: input.flipped,
      hidden: input.hidden,
      locked: input.locked,
      createdBy: actorRef(scope),
    })
  }

  private async resolveBoard(boardId: string | undefined, scope: FlashCommandScope) {
    const ownerUserId = actorResourceOwner(scope)
    let board = boardId ? await this.deps.boards.findById(boardId) : null
    if (board && board.serverId === scope.context.serverId && board.ownerUserId === ownerUserId) {
      return board
    }
    if (board) throw asError(403, 'board_not_accessible')

    if (!board) {
      board = await this.deps.boards.findByOwner(scope.context.serverId, ownerUserId)
    }
    if (!board) {
      board = await this.deps.boards.create({
        id: id('board'),
        serverId: scope.context.serverId,
        ownerUserId,
        title: boardOwnerTitle(scope),
      })
    }
    return board
  }

  private async snapshot(board: BoardRow, scope: FlashCommandScope): Promise<FlashBoardSnapshot> {
    const [cards, arenas, selections, events] = await Promise.all([
      this.deps.cards.listByBoard(board.id),
      this.deps.arenas.listByBoard(board.id),
      this.deps.selections.listByBoard(board.id),
      this.deps.events.listByBoard(board.id),
    ])
    const mappedEvents = events.map(mapEvent)
    return {
      actor: actorRef(scope),
      board: mapBoard(board),
      cards: cards.map(mapCard),
      arenas: arenas.map(mapArena),
      selections: selections.map(mapSelection),
      events: mappedEvents,
      cursor: this.cursorFromEvents(mappedEvents, 0),
    }
  }

  private cursorFromEvents(events: Array<{ seq: number }>, fallback: number) {
    return events.reduce((cursor, event) => Math.max(cursor, event.seq), fallback)
  }

  private async beginMutation(
    board: BoardRow,
    scope: FlashCommandScope,
    input: unknown,
  ): Promise<MutationBeginResult> {
    const meta = mutationMeta(input)
    if (!meta.clientMutationId) return { ...meta, reserved: false }

    const existingEvent = await this.deps.events.findByClientMutationId(
      board.id,
      meta.clientMutationId,
    )
    if (existingEvent) return mutationResultFromEvent(existingEvent)

    const receipt = await this.deps.receipts.begin({
      boardId: board.id,
      clientMutationId: meta.clientMutationId,
      actor: actorRef(scope),
    })

    if (receipt.state === 'completed') {
      const stored = mutationResultFromReceipt(receipt.row)
      if (stored) return stored
      const event = await this.deps.events.findByClientMutationId(board.id, meta.clientMutationId)
      if (event) return mutationResultFromEvent(event)
      throw asError(409, 'mutation_receipt_missing_event')
    }
    if (receipt.state === 'pending') throw asError(409, 'mutation_in_flight')

    return { ...meta, reserved: true }
  }

  private async abortMutation(board: BoardRow, mutation: MutationReservation, err: unknown) {
    if (!mutation.reserved || !mutation.clientMutationId) return
    await this.deps.receipts
      .fail(board.id, mutation.clientMutationId, errorMessage(err))
      .catch(() => undefined)
  }

  private async runMutation(
    board: BoardRow,
    scope: FlashCommandScope,
    input: unknown,
    fn: (mutation: MutationReservation, service: FlashService) => Promise<FlashMutationResult>,
  ): Promise<FlashMutationResult> {
    return this.deps.events.transaction(async (daos) => {
      await daos.events.lockBoardForMutation(board.id)
      const service = this.withDaoBundle(daos)
      const mutation = await service.beginMutation(board, scope, input)
      if (isMutationResult(mutation)) return mutation
      try {
        await service.assertCausalCursor(board, mutation)
        return await fn(mutation, service)
      } catch (err) {
        await service.abortMutation(board, mutation, err)
        throw err
      }
    })
  }

  private async assertCausalCursor(board: BoardRow, mutation: MutationReservation) {
    if (mutation.baseCursor === null) return
    const latest = await this.deps.events.latestCursor(board.id)
    const strict = process.env.FLASH_ENFORCE_BASE_CURSOR === 'true'
    if (strict && latest > mutation.baseCursor) {
      throw asError(409, 'base_cursor_stale')
    }
  }

  private async recordMutation(
    board: BoardRow,
    scope: FlashCommandScope,
    commandName: string,
    cardId: string | null,
    command: unknown,
    result: unknown,
    patches: FlashPatchEvent[],
    meta: MutationReservation = { clientMutationId: null, baseCursor: null, reserved: false },
  ): Promise<FlashMutationResult> {
    let row: EventRow
    try {
      row = await this.deps.events.create({
        id: id('evt'),
        boardId: board.id,
        cardId,
        commandName,
        command,
        result,
        patches,
        clientMutationId: meta.clientMutationId ?? null,
        baseCursor: meta.baseCursor ?? null,
        actor: actorRef(scope),
      })
    } catch (err) {
      if (meta.clientMutationId) {
        const existing = await this.deps.events.findByClientMutationId(
          board.id,
          meta.clientMutationId,
        )
        if (existing) return mutationResultFromEvent(existing)
      }
      await this.abortMutation(board, meta, err)
      throw err
    }

    const event = mapEvent(row)
    await this.deps.boards.touch(board.id)
    const mutationResult: FlashMutationResult = {
      result,
      events: [event],
      cursor: event.seq,
      hasMore: false,
    }

    if (meta.clientMutationId && meta.reserved) {
      await this.deps.receipts.complete(board.id, meta.clientMutationId, event.id, mutationResult)
    }

    await this.publishRealtime({
      type: 'flash.events.appended',
      boardId: board.id,
      at: Date.now(),
      payload: {
        events: [event],
        cursor: event.seq,
      },
    })
    for (const patch of patches) {
      if (patch.type !== 'selection.updated') continue
      await this.publishRealtime({
        type: 'flash.selection.updated',
        boardId: board.id,
        at: Date.now(),
        payload: patch.selection,
      })
    }
    return mutationResult
  }

  private async publishRealtime(event: FlashRealtimeEvent) {
    try {
      await this.deps.realtime.publish(event)
    } catch (err) {
      console.warn('Flash realtime publish failed', err)
    }
  }

  private async dispatchPersistentCommand(
    board: BoardRow,
    command: CardsCommandInput['command'],
    scope: FlashCommandScope,
  ): Promise<CommandDispatch> {
    const cards = await this.deps.cards.listByBoard(board.id)
    const params = command.params ?? {}
    const target = cards.find((card) => card.id === command.cardId)

    if (command.name === 'help') {
      return dispatch({
        success: true,
        data: {
          commands: [
            '/add title=Idea kind=image',
            '/scan <card> radius=360',
            '/arena magic-circle x=520 y=360',
            '/arena custom script="return api.circle(activeCardIds, arena.x, arena.y, 220)"',
            '/move-to <card> <arenaId>',
            '/activate <arenaId>',
            'shadowob space-app call flash cards.create --file ./image.png',
            'shadowob space-app call flash selection.get',
          ],
        },
      })
    }

    if (command.name === 'add') {
      const card = await this.deps.cards.create({
        id: id('card'),
        boardId: board.id,
        kind: asString(params.kind, 'inspiration') as FlashCardKind,
        title: asString(params.title, 'New card'),
        summary: typeof params.summary === 'string' ? params.summary : undefined,
        content: typeof params.content === 'string' ? params.content : undefined,
        sourceId: null,
        linkedCardIds: [],
        meta: {
          body: typeof params.content === 'string' ? params.content : '',
        },
        tags: [],
        priority: 'medium',
        autoGenerated: false,
        rating: 0,
        deckIds: [],
        x: asNumber(params.x, 260),
        y: asNumber(params.y, 240),
        angle: 0,
        createdBy: actorRef(scope),
      })
      const mapped = mapCard(card)
      return dispatch({ success: true, data: { card: mapped } }, [
        { type: 'card.created', card: mapped },
      ])
    }

    if (command.name === 'arena') {
      const arena = await this.deps.arenas.create({
        id: id('arena'),
        boardId: board.id,
        kind: asString(params.kind, 'magic-circle') as FlashArena['kind'],
        label: asString(params.label, 'Magic Circle'),
        x: asNumber(params.x, 520),
        y: asNumber(params.y, 360),
        radius: asNumber(params.radius, 280),
        color: asString(params.color, '#7c3aed'),
        cardIds: [],
        script: typeof params.script === 'string' ? params.script : undefined,
      })
      const mapped = mapArena(arena)
      return dispatch({ success: true, data: { arena: mapped, arenaId: arena.id } }, [
        { type: 'arena.created', arena: mapped },
      ])
    }

    if (command.name === 'activate') {
      const arenaId = asString(params.arenaId, command.cardId)
      const data = await this.activateArenaById(board, arenaId)
      return dispatch({ success: true, data }, [
        { type: 'arena.updated', arena: data.arena },
        { type: 'cards.updated', cards: data.affected },
      ])
    }

    if (command.name === 'stack') {
      const ids = Array.isArray(params.cardIds)
        ? params.cardIds.filter((item): item is string => typeof item === 'string')
        : cards.slice(0, 8).map((card) => card.id)
      const first = cards.find((card) => ids.includes(card.id)) ?? cards[0]
      if (!first) return dispatch({ success: false, error: 'card_not_found' })
      const dx = asNumber(params.dx, 18)
      const dy = asNumber(params.dy, 8)
      const changed = await this.deps.cards.updateLayouts(
        board.id,
        ids.map((item, index) => ({
          id: item,
          x: first.x + index * dx,
          y: first.y + index * dy,
          angle: first.angle + index * 0.015,
        })),
      )
      return dispatch({ success: true, data: { cardIds: ids } }, [
        { type: 'cards.updated', cards: changed.map(mapCard) },
      ])
    }

    if (!target) return dispatch({ success: false, error: 'card_not_found' })

    if (command.name === 'move') {
      const x =
        params.x === undefined ? target.x + asNumber(params.dx, 0) : asNumber(params.x, target.x)
      const y =
        params.y === undefined ? target.y + asNumber(params.dy, 0) : asNumber(params.y, target.y)
      const card = await this.deps.cards.update(board.id, target.id, { x, y })
      return dispatch(
        { success: true, data: { card: card ? mapCard(card) : null } },
        updatedCardPatch(card),
      )
    }

    if (command.name === 'rotate') {
      const angle =
        params.angle === undefined
          ? target.angle + asNumber(params.delta, 15) * (Math.PI / 180)
          : asNumber(params.angle, target.angle)
      const card = await this.deps.cards.update(board.id, target.id, { angle })
      return dispatch(
        { success: true, data: { card: card ? mapCard(card) : null } },
        updatedCardPatch(card),
      )
    }

    if (command.name === 'flip') {
      const face = typeof params.face === 'string' ? params.face : 'toggle'
      const flipped = face === 'back' ? true : face === 'front' ? false : !target.flipped
      const card = await this.deps.cards.update(board.id, target.id, {
        flipped,
      })
      return dispatch(
        { success: true, data: { card: card ? mapCard(card) : null } },
        updatedCardPatch(card),
      )
    }

    if (command.name === 'trash') {
      const deleted = await this.deps.cards.delete(board.id, target.id)
      return dispatch({ success: true, data: { deletedCardId: deleted?.id ?? target.id } }, [
        { type: 'card.deleted', cardId: deleted?.id ?? target.id },
      ])
    }

    if (command.name === 'link') {
      const targetId = asString(params.targetId, '')
      const exists = cards.some((card) => card.id === targetId)
      if (!exists) return dispatch({ success: false, error: 'target_card_not_found' })
      const linked = target.linkedCardIds.includes(targetId)
        ? target.linkedCardIds.filter((item) => item !== targetId)
        : [...target.linkedCardIds, targetId]
      const card = await this.deps.cards.update(board.id, target.id, {
        linkedCardIds: linked,
      })
      return dispatch(
        { success: true, data: { card: card ? mapCard(card) : null } },
        updatedCardPatch(card),
      )
    }

    if (command.name === 'toggle') {
      const hidden = typeof params.visible === 'boolean' ? !params.visible : !target.hidden
      const card = await this.deps.cards.update(board.id, target.id, {
        hidden,
      })
      return dispatch(
        { success: true, data: { card: card ? mapCard(card) : null } },
        updatedCardPatch(card),
      )
    }

    if (command.name === 'lock') {
      const locked = typeof params.locked === 'boolean' ? params.locked : !target.locked
      const card = await this.deps.cards.update(board.id, target.id, {
        locked,
      })
      return dispatch(
        { success: true, data: { card: card ? mapCard(card) : null } },
        updatedCardPatch(card),
      )
    }

    if (command.name === 'scan') {
      return dispatch({
        success: true,
        data: { nearby: nearby(cards, target, asNumber(params.radius, 360)) },
      })
    }

    if (command.name === 'move-to') {
      const arenaId = asString(params.arenaId, '')
      const arena = await this.deps.arenas.findById(board.id, arenaId)
      if (!arena) return dispatch({ success: false, error: 'arena_not_found' })
      const cardIds = arena.cardIds.includes(target.id)
        ? arena.cardIds
        : [...arena.cardIds, target.id]
      const nextArena = await this.deps.arenas.updateCards(board.id, arena.id, cardIds)
      const card = await this.deps.cards.update(board.id, target.id, {
        x: arena.x + (cardIds.length % 3) * 28,
        y: arena.y + Math.floor(cardIds.length / 3) * 24,
      })
      const patches: FlashPatchEvent[] = []
      if (nextArena) patches.push({ type: 'arena.updated', arena: mapArena(nextArena) })
      patches.push(...updatedCardPatch(card))
      return dispatch(
        {
          success: true,
          data: { arenaId: arena.id, card: card ? mapCard(card) : null },
        },
        patches,
      )
    }

    return dispatch({
      success: true,
      data: {
        persisted: false,
        message: `${command.name} is a client-side visual command and was recorded.`,
      },
    })
  }

  private async runArenaScriptedActivation(
    board: BoardRow,
    arena: ArenaRow,
    allCards: CardRow[],
    activeIds: string[],
  ) {
    const rules = eligibleArenaRuleCards(allCards, arena)
    const hasArenaScript = typeof arena.script === 'string' && arena.script.trim().length > 0
    if (!hasArenaScript && rules.length === 0) return null

    const baseState = {
      trigger: 'onArenaActivate',
      arena: mapArena(arena),
      cards: allCards.map(mapCard),
      activeCardIds: activeIds,
    }
    const merged: FlashScriptResult = {}
    const scriptNow = Date.now()
    const activeScope = activeIds.filter((cardId) => allCards.some((card) => card.id === cardId))

    try {
      if (hasArenaScript) {
        mergeScriptResult(
          merged,
          await this.deps.scripts.executeArenaScript(arena.script, baseState, {
            timeoutMs: 48,
            capabilities: this.deps.scripts.arenaScriptCapabilities(),
            allowedCardIds: activeScope,
            seed: `${board.id}:${arena.id}:arena:${activeScope.join(',')}`,
            now: scriptNow,
          }),
        )
      }
      for (const rule of rules) {
        const meta = ruleMeta(rule)
        mergeScriptResult(
          merged,
          await this.deps.scripts.executeArenaScript(
            meta.script,
            {
              ...baseState,
              rule: {
                id: rule.id,
                title: rule.title,
                priority: rulePriority(rule),
                config: meta.config ?? {},
                card: mapCard(rule),
              },
            },
            {
              timeoutMs: 36,
              capabilities: scriptCapabilitiesFromRule(meta),
              allowedCardIds: ruleAllowedCardIds(meta, allCards, activeScope),
              seed: `${board.id}:${arena.id}:rule:${rule.id}:${activeScope.join(',')}`,
              now: scriptNow,
            },
          ),
        )
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw asError(400, `flash_script_error:${message}`)
    }

    if (!hasScriptChanges(merged)) return null

    const validIds = new Set(allCards.map((card) => card.id))
    const cardUpdates = dedupeCardUpdates(merged.cards ?? []).filter((update) =>
      validIds.has(update.id),
    )
    const changed =
      cardUpdates.length > 0 ? await this.deps.cards.updateLayouts(board.id, cardUpdates) : []

    const arenaUpdate: Partial<typeof flashArenas.$inferInsert> = {}
    if (merged.arena) {
      if (merged.arena.cardIds)
        arenaUpdate.cardIds = merged.arena.cardIds.filter((id) => validIds.has(id))
      if (merged.arena.x !== undefined) arenaUpdate.x = merged.arena.x
      if (merged.arena.y !== undefined) arenaUpdate.y = merged.arena.y
      if (merged.arena.radius !== undefined) arenaUpdate.radius = merged.arena.radius
      if (merged.arena.color !== undefined) arenaUpdate.color = merged.arena.color
      if (merged.arena.label !== undefined) arenaUpdate.label = merged.arena.label
      if (merged.arena.script !== undefined) arenaUpdate.script = merged.arena.script
    }
    if (!arenaUpdate.cardIds && activeIds.length > 0 && cardUpdates.length > 0) {
      arenaUpdate.cardIds = activeIds.filter((cardId) => validIds.has(cardId))
    }

    const updatedArena =
      Object.keys(arenaUpdate).length > 0
        ? await this.deps.arenas.update(board.id, arena.id, arenaUpdate)
        : null

    return {
      arenaId: arena.id,
      arena: mapArena(updatedArena ?? arena),
      affected: changed.map(mapCard),
    }
  }

  private async activateArenaById(board: BoardRow, arenaId: string) {
    const arena = await this.deps.arenas.findById(board.id, arenaId)
    if (!arena) throw asError(404, 'arena_not_found')
    const allCards = await this.deps.cards.listByBoard(board.id)
    const activeIds =
      arena.cardIds.length > 0
        ? arena.cardIds
        : allCards
            .filter((card) => Math.hypot(card.x - arena.x, card.y - arena.y) <= arena.radius)
            .slice(0, 12)
            .map((card) => card.id)
    const scripted = await this.runArenaScriptedActivation(board, arena, allCards, activeIds)
    if (scripted) return scripted
    if (activeIds.length === 0) return { arenaId: arena.id, arena: mapArena(arena), affected: [] }

    const updates =
      arena.kind === 'grid'
        ? activeIds.map((cardId, index) => {
            const cols = Math.max(1, Math.ceil(Math.sqrt(activeIds.length)))
            return {
              id: cardId,
              x: arena.x - ((cols - 1) * 180) / 2 + (index % cols) * 180,
              y: arena.y - 90 + Math.floor(index / cols) * 150,
              angle: 0,
            }
          })
        : activeIds.map((cardId, index) => {
            const theta = (Math.PI * 2 * index) / activeIds.length - Math.PI / 2
            return {
              id: cardId,
              x: arena.x + Math.cos(theta) * arena.radius * 0.74,
              y: arena.y + Math.sin(theta) * arena.radius * 0.74,
              angle: theta + Math.PI / 2,
            }
          })
    const changed = await this.deps.cards.updateLayouts(board.id, updates)
    const updatedArena = await this.deps.arenas.updateCards(board.id, arena.id, activeIds)
    return {
      arenaId: arena.id,
      arena: mapArena(updatedArena ?? arena),
      affected: changed.map(mapCard),
    }
  }
}
