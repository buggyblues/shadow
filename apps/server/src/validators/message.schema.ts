import { LIMITS } from '@shadowob/shared'
import { z } from 'zod'

const idLikeSchema = z.string().min(1)
const mentionKindSchema = z.enum(['user', 'buddy', 'channel', 'server', 'here', 'everyone'])

export const messageMentionSchema = z.object({
  kind: mentionKindSchema,
  targetId: idLikeSchema,
  token: z.string().min(1).max(160),
  label: z.string().min(1).max(160),
  range: z
    .object({
      start: z.number().int().min(0),
      end: z.number().int().min(0),
    })
    .optional(),
  serverId: z.string().uuid().optional(),
  serverSlug: z.string().max(100).nullable().optional(),
  serverName: z.string().max(100).nullable().optional(),
  channelId: z.string().uuid().optional(),
  channelName: z.string().max(100).nullable().optional(),
  userId: z.string().uuid().optional(),
  username: z.string().max(32).nullable().optional(),
  displayName: z.string().max(64).nullable().optional(),
  avatarUrl: z.string().nullable().optional(),
  isBot: z.boolean().optional(),
  isPrivate: z.boolean().optional(),
})

export const messageMentionsSchema = z.array(messageMentionSchema).max(20)

/** Agent chain metadata for tracking Buddy-to-Buddy conversations */
const agentChainSchema = z.object({
  agentId: idLikeSchema,
  depth: z.number().int().min(0),
  participants: z.array(idLikeSchema),
  startedAt: z.number().optional(),
  rootMessageId: idLikeSchema.optional(),
})

/** Message metadata schema */
const interactiveButtonItemSchema = z.object({
  id: idLikeSchema,
  label: z.string().min(1).max(80),
  style: z.enum(['primary', 'secondary', 'destructive']).optional(),
  value: z.string().max(2048).optional(),
})

const interactiveSelectItemSchema = z.object({
  id: idLikeSchema,
  label: z.string().min(1).max(80),
  value: z.string().max(2048),
})

const interactiveFormFieldSchema = z.object({
  id: idLikeSchema,
  /** Field rendering kind. */
  kind: z.enum(['text', 'textarea', 'number', 'checkbox', 'select']),
  label: z.string().min(1).max(120),
  placeholder: z.string().max(200).optional(),
  /** Initial value, must be string-encodable (booleans serialize to 'true'/'false'). */
  defaultValue: z.string().max(2048).optional(),
  required: z.boolean().optional(),
  /** For kind='select' — the dropdown options. */
  options: z.array(interactiveSelectItemSchema).max(20).optional(),
  /** For kind='text'/'textarea'/'number' — max chars. */
  maxLength: z.number().int().min(1).max(8000).optional(),
  /** For kind='number' — numeric range. */
  min: z.number().optional(),
  max: z.number().optional(),
})

const interactiveBlockSchema = z.object({
  id: idLikeSchema,
  kind: z.enum(['buttons', 'select', 'form', 'approval']),
  prompt: z.string().max(2000).optional(),
  buttons: z.array(interactiveButtonItemSchema).max(8).optional(),
  options: z.array(interactiveSelectItemSchema).max(20).optional(),
  /** kind='form' fields. Submitted as a single payload. */
  fields: z.array(interactiveFormFieldSchema).max(12).optional(),
  /** kind='form' submit-button label — default 'Submit'. */
  submitLabel: z.string().max(40).optional(),
  /** Message content sent to the agent when a form is submitted. */
  responsePrompt: z.string().max(2000).optional(),
  /**
   * kind='approval' — short-circuit: presents ✓ Approve / ✗ Reject buttons
   * with an optional comment field. Renderer handles the layout.
   */
  approvalCommentLabel: z.string().max(120).optional(),
  oneShot: z.boolean().optional(),
})

const interactiveResponseSchema = z.object({
  blockId: idLikeSchema,
  sourceMessageId: z.string().uuid(),
  actionId: idLikeSchema,
  value: z.string().max(2048),
  /** kind='form' / 'approval' — submitted field values keyed by field.id. */
  values: z.record(z.string(), z.string().max(8000)).optional(),
})

const commerceProductCardSchema = z.object({
  id: idLikeSchema.optional(),
  kind: z.literal('product'),
  shopId: z.string().uuid().optional(),
  shopScope: z
    .object({
      kind: z.enum(['server', 'user']),
      id: z.string().uuid(),
    })
    .optional(),
  productId: z.string().uuid(),
  skuId: z.string().uuid().optional(),
  snapshot: z.record(z.unknown()).optional(),
  purchase: z.record(z.unknown()).optional(),
})

const commerceOfferCardSchema = commerceProductCardSchema
  .omit({
    kind: true,
    productId: true,
  })
  .extend({
    kind: z.literal('offer'),
    offerId: z.string().uuid(),
    productId: z.string().uuid().optional(),
  })

const paidFileCardSchema = z.object({
  id: idLikeSchema.optional(),
  kind: z.literal('paid_file'),
  fileId: z.string().uuid(),
  entitlementId: z.string().uuid().nullable().optional(),
  deliverableId: z.string().uuid().optional(),
  snapshot: z.record(z.unknown()).optional(),
  action: z.record(z.unknown()).optional(),
})

const commerceFulfillmentSchema = z.object({
  jobId: z.string().uuid(),
  deliverableId: z.string().uuid(),
})

const playLaunchSchema = z.union([
  z.boolean(),
  z.object({
    kind: z.enum(['public_channel', 'private_room', 'cloud_deploy']).optional(),
    playId: z.string().max(120).nullable().optional(),
    deploymentId: z.string().uuid().optional(),
    templateSlug: z.string().max(160).optional(),
  }),
])

export const metadataSchema = z.object({
  agentChain: agentChainSchema.optional(),
  interactive: interactiveBlockSchema.optional(),
  interactiveResponse: interactiveResponseSchema.optional(),
  mentions: messageMentionsSchema.optional(),
  commerceOfferId: z.string().uuid().optional(),
  commerceCards: z
    .array(z.union([commerceOfferCardSchema, commerceProductCardSchema]))
    .max(3)
    .optional(),
  paidFileCards: z.array(paidFileCardSchema).max(3).optional(),
  commerceFulfillment: commerceFulfillmentSchema.optional(),
  playLaunch: playLaunchSchema.optional(),
  custom: z.record(z.unknown()).optional(),
})

export const sendMessageSchema = z.object({
  content: z
    .string()
    .min(1, 'Message content is required')
    .max(
      LIMITS.MESSAGE_CONTENT_MAX,
      `Message must be at most ${LIMITS.MESSAGE_CONTENT_MAX} characters`,
    ),
  threadId: z.string().uuid().optional(),
  replyToId: z.string().uuid().optional(),
  attachments: z
    .array(
      z.object({
        filename: z.string(),
        url: z.string(),
        contentType: z.string(),
        size: z.number(),
      }),
    )
    .optional(),
  mentions: messageMentionsSchema.optional(),
  metadata: metadataSchema.optional(),
})

export const updateMessageSchema = z.object({
  content: z
    .string()
    .min(1, 'Message content is required')
    .max(
      LIMITS.MESSAGE_CONTENT_MAX,
      `Message must be at most ${LIMITS.MESSAGE_CONTENT_MAX} characters`,
    ),
})

export const createThreadSchema = z.object({
  name: z.string().min(1).max(100),
  parentMessageId: z.string().uuid(),
})

export const updateThreadSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  isArchived: z.boolean().optional(),
})

export const reactionSchema = z.object({
  emoji: z.string().min(1).max(32),
})

export type SendMessageInput = z.infer<typeof sendMessageSchema>
export type MessageMentionInput = z.infer<typeof messageMentionSchema>
export type UpdateMessageInput = z.infer<typeof updateMessageSchema>
export type CreateThreadInput = z.infer<typeof createThreadSchema>
export type UpdateThreadInput = z.infer<typeof updateThreadSchema>
export type ReactionInput = z.infer<typeof reactionSchema>

/**
 * Body for POST /api/messages/:id/interactive — record a user's interaction
 * with an interactive block on a previous message. The server posts a
 * follow-up message into the same channel whose `metadata.interactiveResponse`
 * carries the action; the agent receives it through normal chat flow.
 */
export const interactiveActionSchema = z.object({
  /** id of the InteractiveBlock as defined on the source message */
  blockId: idLikeSchema,
  /** id of the action chosen (button.id or option.id) */
  actionId: idLikeSchema,
  /** value associated with the action; defaults server-side to actionId */
  value: z.string().max(2048).optional(),
  /** optional human-readable label of the chosen action (used in echo body) */
  label: z.string().max(80).optional(),
  /** Form field values keyed by field.id (kind='form'/'approval'). */
  values: z.record(z.string(), z.string().max(8000)).optional(),
})

export type InteractiveActionInput = z.infer<typeof interactiveActionSchema>
