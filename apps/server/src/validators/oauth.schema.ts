import { LIMITS } from '@shadowob/shared'
import { z } from 'zod'
import { oauthLinkCardSchema } from './message.schema'

// --- OAuth App Management ---

export const createOAuthAppSchema = z.object({
  name: z.string().min(1).max(128),
  description: z.string().max(1024).optional(),
  redirectUris: z.array(z.string().url()).min(1).max(10),
  homepageUrl: z.string().url().optional(),
  logoUrl: z.string().url().optional(),
  publicClient: z.boolean().optional().default(false),
})

export const updateOAuthAppSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  description: z.string().max(1024).optional(),
  redirectUris: z.array(z.string().url()).min(1).max(10).optional(),
  homepageUrl: z.string().url().optional(),
  logoUrl: z.string().url().optional(),
  publicClient: z.boolean().optional(),
})

// --- OAuth Authorization ---

export const authorizeQuerySchema = z.object({
  response_type: z.literal('code'),
  client_id: z.string().min(1),
  redirect_uri: z.string().url(),
  scope: z.string().optional().default('user:read'),
  state: z.string().optional(),
  code_challenge: z.string().min(43).max(128).optional(),
  code_challenge_method: z.literal('S256').optional(),
})

export const authorizeApproveSchema = z.object({
  clientId: z.string().min(1),
  redirectUri: z.string().url(),
  scope: z.string(),
  state: z.string().optional(),
  codeChallenge: z.string().min(43).max(128).optional(),
  codeChallengeMethod: z.literal('S256').optional(),
})

// --- OAuth Token Exchange ---

export const tokenExchangeSchema = z.discriminatedUnion('grant_type', [
  z.object({
    grant_type: z.literal('authorization_code'),
    code: z.string().min(1),
    client_id: z.string().min(1),
    client_secret: z.string().min(1).optional(),
    redirect_uri: z.string().url(),
    code_verifier: z.string().min(43).max(128).optional(),
  }),
  z.object({
    grant_type: z.literal('refresh_token'),
    refresh_token: z.string().min(1),
    client_id: z.string().min(1),
    client_secret: z.string().min(1).optional(),
  }),
])

// --- OAuth Revoke ---

export const revokeConsentSchema = z.object({
  appId: z.string().uuid(),
})

// --- OAuth Resource API ---

export const oauthMessageMetadataSchema = z
  .object({
    cards: z.array(oauthLinkCardSchema).max(3).optional(),
  })
  .strict()

export const oauthSendMessageSchema = z.object({
  content: z.string().min(1).max(LIMITS.MESSAGE_CONTENT_MAX),
  metadata: oauthMessageMetadataSchema.optional(),
})

export const oauthBuddySendMessageSchema = oauthSendMessageSchema.extend({
  channelId: z.string().uuid(),
})

export type CreateOAuthAppInput = z.infer<typeof createOAuthAppSchema>
export type UpdateOAuthAppInput = z.infer<typeof updateOAuthAppSchema>
export type AuthorizeQuery = z.infer<typeof authorizeQuerySchema>
export type AuthorizeApproveInput = z.infer<typeof authorizeApproveSchema>
export type TokenExchangeInput = z.infer<typeof tokenExchangeSchema>
export type OAuthSendMessageInput = z.infer<typeof oauthSendMessageSchema>
export type OAuthBuddySendMessageInput = z.infer<typeof oauthBuddySendMessageSchema>
