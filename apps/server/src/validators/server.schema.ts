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
])

export const serverDesktopWidgetSchema = z.discriminatedUnion('kind', [
  z
    .object({
      id: z.string().min(1).max(128),
      kind: z.literal('sticky-note'),
      x: desktopCoordinateSchema,
      y: desktopCoordinateSchema,
      widthCells: z.number().int().min(1).max(6),
      heightCells: z.number().int().min(1).max(6),
      content: z.string().max(8000),
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
      widthCells: z.number().int().min(2).max(8),
      heightCells: z.number().int().min(2).max(6),
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
      kind: z.literal('web-embed'),
      sourceType: z.enum(['url', 'workspace-file']),
      source: z.string().min(1).max(2048),
      x: desktopCoordinateSchema,
      y: desktopCoordinateSchema,
      widthCells: z.number().int().min(2).max(8),
      heightCells: z.number().int().min(2).max(6),
      title: z.string().max(120).optional(),
      workspaceFileName: z.string().max(255).nullable().optional(),
      updatedAt: z.string().datetime().optional(),
    })
    .strict(),
])

export const serverDesktopLayoutSchema = z
  .object({
    version: z.literal(1),
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
