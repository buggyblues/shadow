import type { ShadowWidgetViewNode } from '@shadowob/shared'
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

const mobileColorSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(
    /^(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\))$/,
    'Use hex, rgb(), rgba(), hsl(), or hsla() colors',
  )

const mobileNavigationSchema = z
  .object({
    mode: z.enum(['compat', 'immersive']).default('compat').optional(),
    capsule: z
      .object({
        backgroundColor: mobileColorSchema.optional(),
        foregroundColor: mobileColorSchema.optional(),
        borderColor: mobileColorSchema.optional(),
      })
      .optional(),
  })
  .optional()

const mobileManifestSchema = z
  .object({
    navigation: mobileNavigationSchema,
  })
  .optional()

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

const marketplaceMetadataSchema = z
  .object({
    tagline: z.string().max(160).optional(),
    summary: z.string().max(4000).optional(),
    categories: z.array(z.string().min(1).max(64)).max(8).optional(),
    supportedLanguages: z.array(z.string().min(2).max(48)).max(24).optional(),
    coverImageUrl: httpUrlSchema.optional(),
    gallery: z
      .array(
        z.object({
          url: httpUrlSchema,
          type: z.enum(['image', 'video']).default('image').optional(),
          alt: z.string().max(240).optional(),
        }),
      )
      .max(12)
      .optional(),
    links: z
      .array(
        z.object({
          label: z.string().min(1).max(80),
          url: httpUrlSchema,
          type: z
            .enum(['website', 'support', 'docs', 'terms', 'privacy', 'dashboard', 'premium'])
            .optional(),
        }),
      )
      .max(12)
      .optional(),
    publisher: z
      .object({
        name: z.string().min(1).max(120).optional(),
        websiteUrl: httpUrlSchema.optional(),
      })
      .optional(),
  })
  .optional()

const marketplaceI18nMetadataSchema = z
  .object({
    tagline: z.string().max(160).optional(),
    summary: z.string().max(4000).optional(),
    categories: z.array(z.string().min(1).max(64)).max(8).optional(),
    supportedLanguages: z.array(z.string().min(2).max(48)).max(24).optional(),
    gallery: z
      .array(
        z.object({
          alt: z.string().max(240).optional(),
        }),
      )
      .max(12)
      .optional(),
    links: z
      .array(
        z.object({
          label: z.string().min(1).max(80).optional(),
        }),
      )
      .max(12)
      .optional(),
    publisher: z
      .object({
        name: z.string().min(1).max(120).optional(),
      })
      .optional(),
  })
  .optional()

const manifestI18nSchema = z.record(
  z.string().min(2).max(32),
  z.object({
    name: z.string().min(1).max(128).optional(),
    description: z.string().max(2000).optional(),
    marketplace: marketplaceI18nMetadataSchema,
    help: manifestHelpSchema,
    notifications: z
      .record(
        z.string().min(1).max(80),
        z.object({
          title: z.string().min(1).max(120).optional(),
          description: z.string().max(500).optional(),
        }),
      )
      .optional(),
  }),
)

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

const spaceAppCommandIngressSchema = z.object({
  path: z.string().min(1).max(300).startsWith('/'),
  auth: z.literal('shadow-command-jwt').default('shadow-command-jwt').optional(),
})

const widgetValueSchema = z.union([
  z.object({ literal: z.string().max(1000) }).strict(),
  z
    .object({
      path: z
        .string()
        .min(1)
        .max(160)
        .regex(/^(?:\$\.?)?[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*$/),
    })
    .strict(),
  z.object({ stringKey: z.string().min(1).max(120) }).strict(),
])

const widgetGapSchema = z.enum(['none', 'sm', 'md', 'lg'])
const widgetToneSchema = z.enum(['default', 'muted', 'accent', 'positive', 'warning', 'danger'])
const widgetViewNodeSchema: z.ZodType<ShadowWidgetViewNode> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z
      .object({
        type: z.literal('stack'),
        gap: widgetGapSchema.optional(),
        align: z.enum(['start', 'center', 'end', 'stretch']).optional(),
        children: z.array(widgetViewNodeSchema).max(40),
      })
      .strict(),
    z
      .object({
        type: z.literal('row'),
        gap: widgetGapSchema.optional(),
        align: z.enum(['start', 'center', 'end', 'stretch']).optional(),
        children: z.array(widgetViewNodeSchema).max(40),
      })
      .strict(),
    z
      .object({
        type: z.literal('grid'),
        minColumnWidth: z.number().int().min(80).max(800).optional(),
        gap: widgetGapSchema.optional(),
        children: z.array(widgetViewNodeSchema).max(40),
      })
      .strict(),
    z
      .object({
        type: z.literal('text'),
        value: widgetValueSchema,
        variant: z.enum(['title', 'body', 'label', 'caption', 'value']).optional(),
        tone: widgetToneSchema.optional(),
      })
      .strict(),
    z
      .object({
        type: z.literal('metric'),
        label: widgetValueSchema,
        value: widgetValueSchema,
        detail: widgetValueSchema.optional(),
        tone: widgetToneSchema.optional(),
      })
      .strict(),
    z
      .object({
        type: z.literal('badge'),
        value: widgetValueSchema,
        tone: widgetToneSchema.optional(),
      })
      .strict(),
    z.object({ type: z.literal('divider') }).strict(),
    z.object({ type: z.literal('spacer') }).strict(),
  ]),
)

const widgetSizeSchema = z
  .object({
    widthCells: z.number().int().min(2).max(16),
    heightCells: z.number().int().min(2).max(12),
  })
  .strict()

const widgetDefinitionSchema = z
  .object({
    key: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-z][a-z0-9._-]*$/),
    title: z.string().min(1).max(120),
    description: z.string().max(500).optional(),
    category: z
      .enum([
        'productivity',
        'communication',
        'media',
        'finance',
        'information',
        'lifestyle',
        'developer',
        'web',
        'other',
      ])
      .optional(),
    surfaces: z
      .array(z.enum(['desktop', 'mobile']))
      .min(1)
      .max(2)
      .optional(),
    strings: z.record(z.string().min(1).max(120), z.string().max(1000)).optional(),
    i18n: z
      .record(z.string().min(2).max(32), z.record(z.string().min(1).max(120), z.string().max(1000)))
      .optional(),
    size: z
      .object({
        default: widgetSizeSchema,
        min: widgetSizeSchema.optional(),
        max: widgetSizeSchema.optional(),
      })
      .strict(),
    options: z
      .array(
        z
          .object({
            key: z
              .string()
              .min(1)
              .max(80)
              .regex(/^[a-z][a-z0-9._-]*$/),
            type: z.literal('select'),
            label: z.string().min(1).max(120),
            defaultValue: z.string().min(1).max(120),
            choices: z
              .array(
                z
                  .object({
                    value: z.string().min(1).max(120),
                    label: z.string().min(1).max(120),
                  })
                  .strict(),
              )
              .min(1)
              .max(30),
          })
          .strict(),
      )
      .max(8)
      .optional(),
    data: z
      .object({
        command: z.string().min(1).max(120),
        refreshIntervalSeconds: z.number().int().min(15).max(3600).optional(),
      })
      .strict(),
    view: widgetViewNodeSchema,
  })
  .strict()

export const spaceAppCommandSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-zA-Z0-9_.:-]+$/),
  title: z.string().max(160).optional(),
  description: z.string().max(1000).optional(),
  help: commandHelpSchema,
  ingress: spaceAppCommandIngressSchema,
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

export const spaceAppManifestSchema = z.object({
  schemaVersion: z.literal('shadow.space-app/1'),
  appKey: appKeySchema,
  name: z.string().min(1).max(128),
  description: z.string().max(2000).optional(),
  version: z.string().max(64).optional(),
  updatedAt: z.string().datetime().optional(),
  iconUrl: httpUrlSchema,
  marketplace: marketplaceMetadataSchema,
  i18n: manifestI18nSchema.optional(),
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
  commands: z.array(spaceAppCommandSchema).min(1).max(100),
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
  notifications: z
    .array(
      z.object({
        key: z.string().regex(/^[a-z][a-z0-9._-]{0,79}$/),
        title: z.string().min(1).max(120),
        description: z.string().max(500).optional(),
        defaultEnabled: z.boolean().optional(),
        defaultChannels: z
          .array(z.enum(['in_app', 'mobile_push', 'web_push', 'email']))
          .min(1)
          .max(4)
          .optional(),
      }),
    )
    .max(40)
    .optional(),
  widgets: z.array(widgetDefinitionSchema).max(20).optional(),
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
  mobile: mobileManifestSchema,
})

export const installSpaceAppSchema = z
  .object({
    manifestUrl: httpUrlSchema.optional(),
    manifest: spaceAppManifestSchema.optional(),
  })
  .refine((value) => Boolean(value.manifestUrl || value.manifest), {
    message: 'manifestUrl or manifest is required',
  })

export const discoverSpaceAppSchema = z
  .object({
    manifestUrl: httpUrlSchema.optional(),
    manifest: spaceAppManifestSchema.optional(),
  })
  .refine((value) => Boolean(value.manifestUrl || value.manifest), {
    message: 'manifestUrl or manifest is required',
  })

export const createSpaceAppCatalogEntrySchema = z
  .object({
    manifestUrl: httpUrlSchema.optional(),
    manifest: spaceAppManifestSchema.optional(),
    sourceSpaceAppId: z.string().uuid().optional(),
    status: z.enum(['active', 'disabled']).default('active').optional(),
  })
  .refine((value) => Boolean(value.manifestUrl || value.manifest || value.sourceSpaceAppId), {
    message: 'manifestUrl, manifest, or sourceSpaceAppId is required',
  })

export const installSpaceAppFromCatalogSchema = z.object({}).optional().default({})

export const grantSpaceAppBuddySchema = z.object({
  buddyAgentId: z.string().uuid(),
  permissions: z.array(z.string().min(1).max(160)).min(1).max(200),
  resourceRules: z.record(z.unknown()).optional(),
  approvalMode: approvalModeSchema.default('none').optional(),
  expiresAt: z.string().datetime().optional(),
  mergePermissions: z.boolean().optional(),
})

export const updateSpaceAppAccessPolicySchema = z.object({
  defaultPermissions: z.array(z.string().min(1).max(160)).max(200),
  defaultApprovalMode: approvalModeSchema.default('none').optional(),
})

export const approveSpaceAppCommandSchema = z.object({
  commandName: z.string().min(1).max(120),
  buddyAgentId: z.string().uuid().optional(),
  remember: z.boolean().default(true).optional(),
})

const spaceAppTaskContextSchema = z.object({
  messageId: z.string().uuid(),
  cardId: z.string().uuid(),
  claimId: z.string().uuid().optional(),
})

function optionalNullable<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((value) => (value === null ? undefined : value), schema.optional())
}

export const callSpaceAppCommandSchema = z.object({
  input: z.unknown().optional(),
  channelId: optionalNullable(z.string().uuid()),
  task: optionalNullable(spaceAppTaskContextSchema),
})

export type SpaceAppManifestInput = z.infer<typeof spaceAppManifestSchema>
export type DiscoverSpaceAppInput = z.infer<typeof discoverSpaceAppSchema>
export type InstallSpaceAppInput = z.infer<typeof installSpaceAppSchema>
export type CreateSpaceAppCatalogEntryInput = z.infer<typeof createSpaceAppCatalogEntrySchema>
export type InstallSpaceAppFromCatalogInput = z.infer<typeof installSpaceAppFromCatalogSchema>
export type GrantSpaceAppBuddyInput = z.infer<typeof grantSpaceAppBuddySchema>
export type UpdateSpaceAppAccessPolicyInput = z.infer<typeof updateSpaceAppAccessPolicySchema>
export type ApproveSpaceAppCommandInput = z.infer<typeof approveSpaceAppCommandSchema>
export type CallSpaceAppCommandInput = z.infer<typeof callSpaceAppCommandSchema>
