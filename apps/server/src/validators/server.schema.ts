import { z } from 'zod'

export const createServerSchema = z.object({
  name: z
    .string()
    .min(1, 'Server name is required')
    .max(100, 'Server name must be at most 100 characters'),
  description: z.string().max(500).optional(),
  slug: z.string().max(100).optional(),
  iconUrl: z.string().optional(),
  bannerUrl: z.string().optional(),
  isPublic: z.boolean().optional(),
})

export const updateServerSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  slug: z.string().min(1).max(100).nullable().optional(),
  iconUrl: z.string().nullable().optional(),
  bannerUrl: z.string().nullable().optional(),
  wallpaperType: z.enum(['image', 'html']).nullable().optional(),
  wallpaperUrl: z.null().optional(),
  wallpaperWorkspaceFileId: z.string().uuid().nullable().optional(),
  wallpaperInteractive: z.boolean().optional(),
  isPublic: z.boolean().optional(),
})

const desktopCoordinateSchema = z.number().finite().min(0).max(10000)
const desktopHexColorSchema = z.string().regex(/^#[\da-f]{6}$/i)
const desktopWidgetRotationSchema = z.number().finite().min(-45).max(45)
const desktopWidgetZIndexSchema = z.number().int().min(0).max(1000)
const desktopItemBaseSchema = z.object({
  id: z.string().min(1).max(128),
  x: desktopCoordinateSchema,
  y: desktopCoordinateSchema,
  hidden: z.boolean().optional(),
})

export const serverDesktopLayoutItemSchema = z.discriminatedUnion('kind', [
  desktopItemBaseSchema
    .extend({
      kind: z.literal('workspace-node'),
      workspaceNodeId: z.string().uuid(),
      source: z.enum(['workspace-root', 'pinned']).optional(),
    })
    .strict(),
  desktopItemBaseSchema
    .extend({
      kind: z.literal('builtin-app'),
      builtinKey: z.string().min(1).max(64),
      title: z.string().min(1).max(120),
    })
    .strict(),
  desktopItemBaseSchema
    .extend({
      kind: z.literal('server-app'),
      appKey: z.string().min(1).max(120),
      appId: z.string().uuid().optional(),
      title: z.string().min(1).max(120),
      iconUrl: z.string().max(2048).nullable().optional(),
    })
    .strict(),
  desktopItemBaseSchema
    .extend({
      kind: z.literal('buddy-inbox'),
      agentId: z.string().uuid(),
      channelId: z.string().uuid().nullable().optional(),
      title: z.string().min(1).max(120).optional(),
    })
    .strict(),
])

export const serverDesktopWidgetSchema = z.discriminatedUnion('kind', [
  z
    .object({
      id: z.string().min(1).max(128),
      kind: z.literal('sticky-note'),
      x: desktopCoordinateSchema,
      y: desktopCoordinateSchema,
      zIndex: desktopWidgetZIndexSchema.optional(),
      widthCells: z.number().int().min(2).max(12),
      heightCells: z.number().int().min(2).max(12),
      rotation: desktopWidgetRotationSchema.optional(),
      content: z.string().max(8000),
      updatedAt: z.string().datetime().optional(),
    })
    .strict(),
  z
    .object({
      id: z.string().min(1).max(128),
      kind: z.literal('chat-input'),
      x: desktopCoordinateSchema,
      y: desktopCoordinateSchema,
      zIndex: desktopWidgetZIndexSchema.optional(),
      widthCells: z.number().int().min(6).max(16),
      heightCells: z.number().int().min(2).max(8),
      rotation: desktopWidgetRotationSchema.optional(),
      defaultAgentId: z.string().uuid().nullable().optional(),
      inboxViewMode: z.enum(['chat', 'tasks']),
      placeholder: z.string().max(240).optional(),
      completionItems: z.array(z.string().min(1).max(200)).max(12).optional(),
      updatedAt: z.string().datetime().optional(),
    })
    .strict(),
  z
    .object({
      id: z.string().min(1).max(128),
      kind: z.literal('typewriter'),
      x: desktopCoordinateSchema,
      y: desktopCoordinateSchema,
      zIndex: desktopWidgetZIndexSchema.optional(),
      widthCells: z.number().int().min(4).max(16),
      heightCells: z.number().int().min(2).max(12),
      rotation: desktopWidgetRotationSchema.optional(),
      content: z.string().max(4000),
      speedMs: z.number().int().min(15).max(240),
      pauseMs: z.number().int().min(500).max(8000),
      loop: z.boolean(),
      cursor: z.boolean(),
      fontFamily: z.enum(['system', 'serif', 'mono', 'handwriting']),
      fontSize: z.number().int().min(12).max(96),
      color: desktopHexColorSchema,
      textShadow: z.enum(['none', 'soft', 'glow', 'strong']),
      textStrokeWidth: z.number().int().min(0).max(8),
      textStrokeColor: desktopHexColorSchema,
      updatedAt: z.string().datetime().optional(),
    })
    .strict(),
  z
    .object({
      id: z.string().min(1).max(128),
      kind: z.literal('video-player'),
      provider: z.enum(['bilibili', 'youtube']),
      x: desktopCoordinateSchema,
      y: desktopCoordinateSchema,
      zIndex: desktopWidgetZIndexSchema.optional(),
      widthCells: z.number().int().min(4).max(16),
      heightCells: z.number().int().min(4).max(12),
      rotation: desktopWidgetRotationSchema.optional(),
      source: z.string().min(1).max(2048),
      title: z.string().max(120).optional(),
      coverUrl: z.string().max(2048).nullable().optional(),
      autoplay: z.boolean().optional(),
      muted: z.boolean().optional(),
      danmaku: z.boolean().optional(),
      showCover: z.boolean().optional(),
      updatedAt: z.string().datetime().optional(),
    })
    .strict(),
  z
    .object({
      id: z.string().min(1).max(128),
      kind: z.literal('photo'),
      sourceType: z.enum(['url', 'workspace-file']),
      source: z.string().min(1).max(2048),
      x: desktopCoordinateSchema,
      y: desktopCoordinateSchema,
      zIndex: desktopWidgetZIndexSchema.optional(),
      widthCells: z.number().int().min(4).max(8),
      aspectRatio: z.number().finite().min(0.1).max(10),
      rotation: desktopWidgetRotationSchema,
      title: z.string().max(120).optional(),
      workspaceFileName: z.string().max(255).nullable().optional(),
      updatedAt: z.string().datetime().optional(),
    })
    .strict(),
  z
    .object({
      id: z.string().min(1).max(128),
      kind: z.literal('web-embed'),
      sourceType: z.enum(['url', 'workspace-file']),
      source: z.string().min(1).max(2048),
      x: desktopCoordinateSchema,
      y: desktopCoordinateSchema,
      zIndex: desktopWidgetZIndexSchema.optional(),
      widthCells: z.number().int().min(4).max(16),
      heightCells: z.number().int().min(4).max(12),
      rotation: desktopWidgetRotationSchema.optional(),
      title: z.string().max(120).optional(),
      workspaceFileName: z.string().max(255).nullable().optional(),
      updatedAt: z.string().datetime().optional(),
    })
    .strict(),
])

export const serverDesktopLayoutSchema = z
  .object({
    version: z.literal(2),
    items: z.array(serverDesktopLayoutItemSchema).max(200),
    widgets: z.array(serverDesktopWidgetSchema).max(50),
  })
  .strict()

export const updateServerDesktopLayoutSchema = serverDesktopLayoutSchema

export const joinServerSchema = z.object({
  inviteCode: z.string().length(8, 'Invite code must be 8 characters'),
})

export const updateMemberSchema = z.object({
  role: z.enum(['owner', 'admin', 'member']).optional(),
  nickname: z.string().max(64).nullable().optional(),
})

export type CreateServerInput = z.infer<typeof createServerSchema>
export type UpdateServerInput = z.infer<typeof updateServerSchema>
export type ServerDesktopLayoutInput = z.infer<typeof serverDesktopLayoutSchema>
export type JoinServerInput = z.infer<typeof joinServerSchema>
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>
