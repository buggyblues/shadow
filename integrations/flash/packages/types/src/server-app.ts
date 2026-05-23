import { z } from 'zod'
import type { CardKind, CardMeta, CardPriority } from './card.js'
import type { Card } from './models.js'

export const COMMAND_NAMES = [
  'move',
  'flip',
  'rotate',
  'orbit',
  'trash',
  'link',
  'toggle',
  'highlight',
  'focus',
  'lock',
  'play',
  'pause',
  'act',
  'add',
  'scan',
  'arena',
  'move-to',
  'activate',
  'help',
  'stack',
] as const

export type FlashCommandName = (typeof COMMAND_NAMES)[number]
export type FlashCardKind = CardKind
export type FlashCardPriority = CardPriority

export const CARD_KIND_VALUES = [
  'quote',
  'summary',
  'argument',
  'data',
  'table',
  'image',
  'code',
  'chart',
  'idea',
  'text',
  'audio',
  'video',
  'keypoint',
  'definition',
  'example',
  'reference',
  'inspiration',
  'timeline',
  'comparison',
  'process',
  'gif',
  'qrcode',
  'person',
  'terminal',
  'lottie',
  'webpage',
  'countdown',
  'threed',
  'live2d',
  'link',
  'file',
  'math',
  'todo',
  'position',
  'timestamp',
  'color',
  'event',
  'voice',
  'comment',
  'story',
  'social',
  'poker',
  'tarot',
  'flash',
] as const satisfies readonly CardKind[]

export interface FlashActorProfile {
  id: string
  username?: string | null
  displayName?: string | null
  avatarUrl?: string | null
}

export interface FlashActorRef {
  kind: string
  id: string
  userId: string | null
  buddyAgentId: string | null
  ownerId: string | null
  displayName: string
  avatarUrl: string | null
  profile?: FlashActorProfile | null
}

export interface FlashCardLayout {
  x: number
  y: number
  angle: number
  flipped: boolean
  hidden: boolean
  locked: boolean
}

export interface FlashViewport {
  offsetX: number
  offsetY: number
  zoom: number
  updatedAt?: number
}

export type FlashCard = Card & {
  layout: FlashCardLayout
  createdBy: FlashActorRef | null
}

export interface FlashBoard {
  id: string
  serverId: string
  ownerUserId: string
  title: string
  viewport: FlashViewport | null
  createdAt: number
  updatedAt: number
}

export interface FlashArena {
  id: string
  boardId: string
  kind: 'magic-circle' | 'grid' | 'custom'
  label: string
  x: number
  y: number
  radius: number
  color: string
  cardIds: string[]
  script?: string | null
  createdAt: number
  updatedAt: number
}

export interface FlashCommandEvent {
  id: string
  seq: number
  boardId: string
  commandName: FlashCommandName | string
  cardId: string | null
  command: unknown
  result: unknown
  patches: FlashPatchEvent[]
  actor: FlashActorRef | null
  createdAt: number
}

export interface FlashBoardSnapshot {
  actor: FlashActorRef
  board: FlashBoard
  cards: FlashCard[]
  arenas: FlashArena[]
  selections: FlashSelection[]
  events: FlashCommandEvent[]
  cursor: number
}

export type FlashPatchEvent =
  | { type: 'card.created'; card: FlashCard }
  | { type: 'card.updated'; card: FlashCard }
  | { type: 'card.deleted'; cardId: string }
  | { type: 'cards.updated'; cards: FlashCard[] }
  | { type: 'arena.created'; arena: FlashArena }
  | { type: 'arena.updated'; arena: FlashArena }
  | { type: 'arena.deleted'; arenaId: string }
  | { type: 'board.viewport.updated'; viewport: FlashViewport }
  | { type: 'selection.updated'; selection: FlashSelection }

export interface FlashRealtimeEvent {
  type:
    | 'flash.events.appended'
    | 'flash.board.updated'
    | 'flash.command.executed'
    | 'flash.selection.updated'
  boardId: string
  at: number
  payload?: unknown
}

export interface FlashBoardEventsResult {
  events: FlashCommandEvent[]
  cursor: number
}

export interface FlashMutationResult extends FlashBoardEventsResult {
  result: unknown
}

export interface FlashSelection {
  boardId: string
  actorId: string
  actor: FlashActorRef | null
  selectedCardIds: string[]
  anchorCardId: string | null
  revision: number
  updatedAt: number
}

export interface FlashUploadInput {
  field?: string
  filename: string
  contentType: string
  size: number
  dataBase64: string
}

export interface FlashUploadedAsset {
  url: string
  path: string
  filename: string
  contentType: string
  size: number
}

export const ActorProfileSchema = z.object({
  id: z.string(),
  username: z.string().nullable().optional(),
  displayName: z.string().nullable().optional(),
  avatarUrl: z.string().nullable().optional(),
})

export const ActorRefSchema = z.object({
  kind: z.string(),
  id: z.string(),
  userId: z.string().nullable(),
  buddyAgentId: z.string().nullable(),
  ownerId: z.string().nullable(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  profile: ActorProfileSchema.nullable().optional(),
})

const TagsSchema = z.array(z.string().min(1).max(40)).max(12)
const StringArraySchema = z.array(z.string().min(1).max(120)).max(80)
const MetaSchema = z.record(z.unknown())
const CardKindSchema = z.enum(CARD_KIND_VALUES)
const UploadSchema = z
  .object({
    field: z.string().min(1).max(80).optional(),
    filename: z.string().min(1).max(240),
    contentType: z.string().min(1).max(160),
    size: z
      .number()
      .int()
      .positive()
      .max(10 * 1024 * 1024),
    dataBase64: z.string().min(1),
  })
  .strict()

export const BoardGetInputSchema = z
  .object({
    boardId: z.string().min(1).optional(),
  })
  .strict()

export const BoardEventsInputSchema = z
  .object({
    boardId: z.string().min(1).optional(),
    after: z.number().int().nonnegative().optional(),
    limit: z.number().int().positive().max(200).optional(),
  })
  .strict()

export const BoardViewportSchema = z
  .object({
    offsetX: z.number().finite(),
    offsetY: z.number().finite(),
    zoom: z.number().finite().positive().min(0.1).max(4),
  })
  .strict()

export const BoardViewportUpdateInputSchema = z
  .object({
    boardId: z.string().min(1).optional(),
    viewport: BoardViewportSchema,
  })
  .strict()

export const CardsGetInputSchema = z
  .object({
    boardId: z.string().min(1).optional(),
    cardId: z.string().min(1),
  })
  .strict()

export const CardsCreateInputSchema = z
  .object({
    boardId: z.string().min(1).optional(),
    title: z.string().min(1).max(160),
    kind: CardKindSchema.optional(),
    summary: z.string().max(1000).optional(),
    content: z.string().max(12000).optional(),
    thumbnail: z.string().max(2000).optional(),
    sourceId: z.string().max(200).nullable().optional(),
    linkedCardIds: StringArraySchema.optional(),
    meta: MetaSchema.optional(),
    tags: TagsSchema.optional(),
    priority: z.enum(['high', 'medium', 'low']).optional(),
    autoGenerated: z.boolean().optional(),
    rating: z.number().int().min(0).max(5).optional(),
    filePath: z.string().max(2000).optional(),
    fileMime: z.string().max(120).optional(),
    deckIds: StringArraySchema.optional(),
    x: z.number().finite().optional(),
    y: z.number().finite().optional(),
    angle: z.number().finite().optional(),
    flipped: z.boolean().optional(),
    hidden: z.boolean().optional(),
    locked: z.boolean().optional(),
    upload: UploadSchema.optional(),
  })
  .strict()

export const CardsUpdateInputSchema = z
  .object({
    boardId: z.string().min(1).optional(),
    cardId: z.string().min(1),
    clientRevision: z.number().int().nonnegative().optional(),
    kind: CardKindSchema.optional(),
    title: z.string().min(1).max(160).optional(),
    summary: z.string().max(1000).optional(),
    content: z.string().max(12000).optional(),
    thumbnail: z.string().max(2000).optional(),
    sourceId: z.string().max(200).nullable().optional(),
    linkedCardIds: StringArraySchema.optional(),
    meta: MetaSchema.optional(),
    tags: TagsSchema.optional(),
    priority: z.enum(['high', 'medium', 'low']).optional(),
    autoGenerated: z.boolean().optional(),
    rating: z.number().int().min(0).max(5).optional(),
    filePath: z.string().max(2000).optional(),
    fileMime: z.string().max(120).optional(),
    deckIds: StringArraySchema.optional(),
    x: z.number().finite().optional(),
    y: z.number().finite().optional(),
    angle: z.number().finite().optional(),
    flipped: z.boolean().optional(),
    hidden: z.boolean().optional(),
    locked: z.boolean().optional(),
    upload: UploadSchema.optional(),
  })
  .strict()

export const CardsDeleteInputSchema = z
  .object({
    boardId: z.string().min(1).optional(),
    cardId: z.string().min(1),
  })
  .strict()

export const FlashCommandSchema = z
  .object({
    name: z.enum(COMMAND_NAMES),
    cardId: z.string(),
    params: z.record(z.unknown()).default({}),
    timestamp: z.number().optional(),
  })
  .strict()

export const CardsCommandInputSchema = z
  .object({
    boardId: z.string().min(1).optional(),
    command: FlashCommandSchema,
  })
  .strict()

export const RoomsAttachInputSchema = z
  .object({
    boardId: z.string().min(1).optional(),
    cardId: z.string().min(1),
    radius: z.number().finite().positive().max(2000).optional(),
  })
  .strict()

export const ArenasCreateInputSchema = z
  .object({
    boardId: z.string().min(1).optional(),
    kind: z.enum(['magic-circle', 'grid', 'custom']).default('magic-circle'),
    label: z.string().max(120).optional(),
    x: z.number().finite().optional(),
    y: z.number().finite().optional(),
    radius: z.number().finite().positive().max(1200).optional(),
    color: z.string().max(40).optional(),
  })
  .strict()

export const ArenasActivateInputSchema = z
  .object({
    boardId: z.string().min(1).optional(),
    arenaId: z.string().min(1),
  })
  .strict()

export const AssetsUploadInputSchema = z
  .object({
    boardId: z.string().min(1).optional(),
    upload: UploadSchema,
  })
  .strict()

export const SelectionGetInputSchema = z
  .object({
    boardId: z.string().min(1).optional(),
    actorId: z.string().min(1).max(160).optional(),
  })
  .strict()

export const SelectionUpdateInputSchema = z
  .object({
    boardId: z.string().min(1).optional(),
    selectedCardIds: StringArraySchema,
    anchorCardId: z.string().min(1).max(120).nullable().optional(),
    revision: z.number().int().nonnegative().optional(),
  })
  .strict()

export type BoardGetInput = z.infer<typeof BoardGetInputSchema>
export type BoardEventsInput = z.infer<typeof BoardEventsInputSchema>
export type BoardViewportUpdateInput = z.infer<typeof BoardViewportUpdateInputSchema>
export type CardsGetInput = z.infer<typeof CardsGetInputSchema>
export type CardsCreateInput = z.infer<typeof CardsCreateInputSchema>
export type CardsUpdateInput = z.infer<typeof CardsUpdateInputSchema>
export type CardsDeleteInput = z.infer<typeof CardsDeleteInputSchema>
export type CardsCommandInput = z.infer<typeof CardsCommandInputSchema>
export type RoomsAttachInput = z.infer<typeof RoomsAttachInputSchema>
export type ArenasCreateInput = z.infer<typeof ArenasCreateInputSchema>
export type ArenasActivateInput = z.infer<typeof ArenasActivateInputSchema>
export type AssetsUploadInput = z.infer<typeof AssetsUploadInputSchema>
export type SelectionGetInput = z.infer<typeof SelectionGetInputSchema>
export type SelectionUpdateInput = z.infer<typeof SelectionUpdateInputSchema>

export function cardMetaWithLayout(card: FlashCard): CardMeta {
  return {
    ...(card.meta as Record<string, unknown>),
    layout: card.layout,
    flash: {
      createdBy: card.createdBy,
    },
  } as CardMeta
}
