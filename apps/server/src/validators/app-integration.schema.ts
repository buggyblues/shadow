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

const approvalModeSchema = z.enum(['none', 'first_time', 'every_time', 'policy'])

const commandHelpSchema = z
  .object({
    summary: z.string().max(1200).optional(),
    usage: z.string().max(2000).optional(),
    details: z.string().max(6000).optional(),
    examples: z
      .array(
        z.object({
          title: z.string().max(160).optional(),
          command: z.string().max(1000).optional(),
          input: z.unknown().optional(),
        }),
      )
      .max(20)
      .optional(),
    schemaRef: z.string().max(200).optional(),
  })
  .optional()

const manifestHelpSchema = z
  .object({
    overview: z.string().max(4000).optional(),
    usage: z.string().max(4000).optional(),
    details: z.string().max(10000).optional(),
    commandIndex: z.string().max(4000).optional(),
  })
  .optional()

const realtimeSpecSchema = z
  .object({
    transports: z
      .array(z.enum(['sse', 'websocket']))
      .max(4)
      .optional(),
    subscribe: z
      .object({
        events: z.array(z.string().min(1).max(160)).max(100).optional(),
        help: z.string().max(4000).optional(),
      })
      .optional(),
    publish: z
      .object({
        command: z.string().min(1).max(120).optional(),
        events: z.array(z.string().min(1).max(160)).max(100).optional(),
        help: z.string().max(4000).optional(),
      })
      .optional(),
    stateSync: z
      .object({
        model: z.enum(['snapshot-patch', 'frame-sync', 'lockstep']).optional(),
        authority: z.enum(['server', 'client']).optional(),
        tickRate: z.number().int().positive().max(120).optional(),
        help: z.string().max(4000).optional(),
      })
      .optional(),
  })
  .optional()

export const serverAppCommandSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-zA-Z0-9_.:-]+$/),
  title: z.string().max(160).optional(),
  description: z.string().max(1000).optional(),
  help: commandHelpSchema,
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
  approvalMode: approvalModeSchema.default('none').optional(),
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
  updatedAt: z.string().datetime().optional(),
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
  access: z
    .object({
      defaultPermissions: z.array(z.string().min(1).max(160)).max(200).optional(),
      defaultApprovalMode: approvalModeSchema.default('none').optional(),
    })
    .optional(),
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
  help: manifestHelpSchema,
  realtime: realtimeSpecSchema,
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
  approvalMode: approvalModeSchema.default('none').optional(),
  expiresAt: z.string().datetime().optional(),
})

export const updateServerAppAccessPolicySchema = z.object({
  defaultPermissions: z.array(z.string().min(1).max(160)).max(200),
  defaultApprovalMode: approvalModeSchema.default('none').optional(),
})

export const approveServerAppCommandSchema = z.object({
  commandName: z.string().min(1).max(120),
  buddyAgentId: z.string().uuid().optional(),
  remember: z.boolean().default(true).optional(),
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
export type UpdateServerAppAccessPolicyInput = z.infer<typeof updateServerAppAccessPolicySchema>
export type ApproveServerAppCommandInput = z.infer<typeof approveServerAppCommandSchema>
export type CallServerAppCommandInput = z.infer<typeof callServerAppCommandSchema>
