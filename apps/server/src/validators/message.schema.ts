import { LIMITS } from '@shadowob/shared'
import { z } from 'zod'

const idLikeSchema = z.string().min(1)

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

const metadataSchema = z
  .object({
    agentChain: agentChainSchema.optional(),
    interactive: interactiveBlockSchema.optional(),
    interactiveResponse: interactiveResponseSchema.optional(),
  })
  .passthrough() // Allow additional custom metadata

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
