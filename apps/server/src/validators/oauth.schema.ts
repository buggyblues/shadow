import { z } from 'zod'

// --- OAuth App Management ---

export const createOAuthAppSchema = z.object({
  name: z.string().min(1).max(128),
  description: z.string().max(1024).optional(),
  redirectUris: z.array(z.string().url()).min(1).max(10),
  homepageUrl: z.string().url().optional(),
  logoUrl: z.string().url().optional(),
})

export const updateOAuthAppSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  description: z.string().max(1024).optional(),
  redirectUris: z.array(z.string().url()).min(1).max(10).optional(),
  homepageUrl: z.string().url().optional(),
  logoUrl: z.string().url().optional(),
})

// --- OAuth Authorization ---

export const authorizeQuerySchema = z.object({
  response_type: z.literal('code'),
  client_id: z.string().min(1),
  redirect_uri: z.string().url(),
  scope: z.string().optional().default('user:read'),
  state: z.string().optional(),
})

export const authorizeApproveSchema = z.object({
  clientId: z.string().min(1),
  redirectUri: z.string().url(),
  scope: z.string(),
  state: z.string().optional(),
})

// --- OAuth Token Exchange ---

export const tokenExchangeSchema = z.discriminatedUnion('grant_type', [
  z.object({
    grant_type: z.literal('authorization_code'),
    code: z.string().min(1),
    client_id: z.string().min(1),
    client_secret: z.string().min(1),
    redirect_uri: z.string().url(),
  }),
  z.object({
    grant_type: z.literal('refresh_token'),
    refresh_token: z.string().min(1),
    client_id: z.string().min(1),
    client_secret: z.string().min(1),
  }),
])

// --- OAuth Revoke ---

export const revokeConsentSchema = z.object({
  appId: z.string().uuid(),
})

export type CreateOAuthAppInput = z.infer<typeof createOAuthAppSchema>
export type UpdateOAuthAppInput = z.infer<typeof updateOAuthAppSchema>
export type AuthorizeQuery = z.infer<typeof authorizeQuerySchema>
export type AuthorizeApproveInput = z.infer<typeof authorizeApproveSchema>
export type TokenExchangeInput = z.infer<typeof tokenExchangeSchema>
