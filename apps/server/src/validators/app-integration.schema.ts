import { z } from 'zod'

const appKeySchema = z
  .string()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9][a-z0-9._-]*[a-z0-9]$/i, 'Use letters, numbers, dots, dashes, or underscores')

const httpUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  }, 'URL must use http or https')

const originSchema = z.string().refine((value) => {
  try {
    const url = new URL(value)
    const normalized = value.endsWith('/') ? value.slice(0, -1) : value
    return (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      url.origin === normalized &&
      url.pathname === '/' &&
      !url.search &&
      !url.hash
    )
  } catch {
    return false
  }
}, 'Origin must be a valid http(s) origin')

export const serverAppCommandSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-zA-Z0-9_.:-]+$/),
  title: z.string().max(160).optional(),
  description: z.string().max(1000).optional(),
  path: z.string().min(1).max(300).startsWith('/'),
  method: z.literal('POST').default('POST').optional(),
  input: z.enum(['json', 'multipart']).default('json').optional(),
  inputSchema: z.record(z.unknown()).optional(),
  permission: z.string().min(1).max(160),
  action: z.enum(['read', 'write', 'manage', 'delete', 'generate']),
  dataClass: z.enum([
    'public',
    'server-private',
    'channel-private',
    'financial',
    'secret',
    'cloud-secret',
  ]),
  approvalMode: z.enum(['none', 'first_time', 'every_time', 'policy']).default('none').optional(),
  binary: z
    .object({
      supported: z.boolean().optional(),
      field: z.string().min(1).max(80).optional(),
      maxBytes: z
        .number()
        .int()
        .positive()
        .max(100 * 1024 * 1024)
        .optional(),
      contentTypes: z.array(z.string().min(1).max(120)).max(32).optional(),
    })
    .optional(),
})

export const serverAppManifestSchema = z.object({
  schemaVersion: z.literal('shadow.app/1'),
  appKey: appKeySchema,
  name: z.string().min(1).max(128),
  description: z.string().max(2000).optional(),
  version: z.string().max(64).optional(),
  iconUrl: httpUrlSchema,
  iframe: z
    .object({
      entry: httpUrlSchema,
      allowedOrigins: z.array(originSchema).min(1).max(20),
    })
    .optional(),
  api: z.object({
    baseUrl: httpUrlSchema,
    auth: z
      .object({
        type: z.literal('oauth2-bearer').default('oauth2-bearer'),
      })
      .optional(),
  }),
  commands: z.array(serverAppCommandSchema).min(1).max(100),
  skills: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        description: z.string().min(1).max(1200),
        commandHints: z.array(z.string().min(1).max(160)).max(40).optional(),
      }),
    )
    .max(20)
    .optional(),
  events: z.array(z.string().min(1).max(160)).max(100).optional(),
  binary: z
    .object({
      supported: z.boolean(),
      maxBytes: z
        .number()
        .int()
        .positive()
        .max(100 * 1024 * 1024)
        .optional(),
      contentTypes: z.array(z.string().min(1).max(120)).max(32).optional(),
    })
    .optional(),
})

export const installServerAppSchema = z
  .object({
    manifestUrl: httpUrlSchema.optional(),
    manifest: serverAppManifestSchema.optional(),
  })
  .refine((value) => Boolean(value.manifestUrl || value.manifest), {
    message: 'manifestUrl or manifest is required',
  })

export const discoverServerAppSchema = z
  .object({
    manifestUrl: httpUrlSchema.optional(),
    manifest: serverAppManifestSchema.optional(),
  })
  .refine((value) => Boolean(value.manifestUrl || value.manifest), {
    message: 'manifestUrl or manifest is required',
  })

export const createServerAppCatalogEntrySchema = z
  .object({
    manifestUrl: httpUrlSchema.optional(),
    manifest: serverAppManifestSchema.optional(),
    status: z.enum(['active', 'disabled']).default('active').optional(),
  })
  .refine((value) => Boolean(value.manifestUrl || value.manifest), {
    message: 'manifestUrl or manifest is required',
  })

export const installServerAppFromCatalogSchema = z.object({}).optional().default({})

export const grantServerAppBuddySchema = z.object({
  buddyAgentId: z.string().uuid(),
  permissions: z.array(z.string().min(1).max(160)).min(1).max(200),
  resourceRules: z.record(z.unknown()).optional(),
  approvalMode: z.enum(['none', 'first_time', 'every_time', 'policy']).default('none').optional(),
  expiresAt: z.string().datetime().optional(),
})

export const callServerAppCommandSchema = z.object({
  input: z.unknown().optional(),
  channelId: z.string().uuid().optional(),
})

export type ServerAppManifestInput = z.infer<typeof serverAppManifestSchema>
export type DiscoverServerAppInput = z.infer<typeof discoverServerAppSchema>
export type InstallServerAppInput = z.infer<typeof installServerAppSchema>
export type CreateServerAppCatalogEntryInput = z.infer<typeof createServerAppCatalogEntrySchema>
export type InstallServerAppFromCatalogInput = z.infer<typeof installServerAppFromCatalogSchema>
export type GrantServerAppBuddyInput = z.infer<typeof grantServerAppBuddySchema>
export type CallServerAppCommandInput = z.infer<typeof callServerAppCommandSchema>
