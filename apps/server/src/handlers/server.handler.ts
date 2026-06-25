import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppContainer } from '../container'
import { authMiddleware } from '../middleware/auth.middleware'
import { createActorContext } from '../security/actor-context'
import {
  createServerSchema,
  joinServerSchema,
  type UpdateServerInput,
  updateMemberSchema,
  updateServerDesktopLayoutSchema,
  updateServerSchema,
} from '../validators/server.schema'

const reviewJoinRequestSchema = z.object({
  status: z.enum(['approved', 'rejected']),
})

type ServerWallpaperType = 'image' | 'html'

const WALLPAPER_IMAGE_EXTENSIONS = new Set(['.avif', '.gif', '.jpeg', '.jpg', '.png', '.webp'])
const WALLPAPER_HTML_EXTENSIONS = new Set(['.htm', '.html'])

function normalizeServerWallpaperType(
  value: string | null | undefined,
): ServerWallpaperType | null {
  return value === 'image' || value === 'html' ? value : null
}

function inferWallpaperType(input: {
  mime?: string | null
  ext?: string | null
  name?: string | null
}): ServerWallpaperType | null {
  const mime = input.mime?.toLowerCase() ?? ''
  const extFromName = input.name?.includes('.')
    ? `.${input.name.split('.').pop()}`.toLowerCase()
    : ''
  const ext = (input.ext ?? extFromName).toLowerCase()

  if (mime.startsWith('image/') || WALLPAPER_IMAGE_EXTENSIONS.has(ext)) return 'image'
  if (mime.includes('html') || WALLPAPER_HTML_EXTENSIONS.has(ext)) return 'html'
  return null
}

function invalidWallpaperInput(message: string): never {
  throw Object.assign(new Error(message), { status: 400 })
}

function isUploadedWallpaperContentRef(value: string) {
  return /^\/[^/]+\/uploads\/.+/.test(value)
}

async function resolveDisplayMediaUrl(
  mediaService: {
    resolveMediaUrl: (
      mediaUrl: string | null | undefined,
      fallbackContentType?: string,
      options?: { variant?: 'avatar' | 'preview' | 'banner' },
    ) => string | null
  },
  mediaUrl: string | null | undefined,
  options?: { variant?: 'avatar' | 'preview' | 'banner' },
): Promise<string | null> {
  return mediaService.resolveMediaUrl(mediaUrl, 'image/png', options)
}

async function resolveSignedWallpaperUrl(
  mediaService: {
    normalizeMediaUrl: (mediaUrl: string | null | undefined) => string | null
    resolveMediaUrl: (
      mediaUrl: string | null | undefined,
      fallbackContentType?: string,
      options?: { variant?: 'avatar' | 'preview' | 'banner' },
    ) => string | null
    createSignedUrl: (input: {
      contentRef: string
      contentType: string
      disposition: 'inline' | 'attachment'
      filename?: string
      variant?: 'avatar' | 'preview' | 'banner'
      activeInlinePolicy?: 'wallpaper'
    }) => { url: string; expiresAt: string }
  },
  input: { wallpaperType?: string | null; wallpaperUrl?: string | null },
): Promise<string | null> {
  const wallpaperType = normalizeServerWallpaperType(input.wallpaperType)
  const normalized = mediaService.normalizeMediaUrl(input.wallpaperUrl)
  if (!wallpaperType || !normalized) return null

  if (wallpaperType === 'html') {
    try {
      return mediaService.createSignedUrl({
        contentRef: normalized,
        contentType: 'text/html',
        disposition: 'inline',
        activeInlinePolicy: 'wallpaper',
      }).url
    } catch {
      return null
    }
  }

  return mediaService.resolveMediaUrl(normalized, 'image/png', { variant: 'preview' })
}

async function decorateServerMedia<
  T extends {
    iconUrl: string | null | undefined
    bannerUrl: string | null | undefined
    wallpaperType?: string | null
    wallpaperUrl?: string | null
    wallpaperInteractive?: boolean | null
  },
>(
  mediaService: Parameters<typeof resolveSignedWallpaperUrl>[0],
  server: T,
): Promise<
  T & {
    wallpaperType: ServerWallpaperType | null
    wallpaperUrl: string | null
    wallpaperInteractive: boolean
  }
> {
  const wallpaperType = normalizeServerWallpaperType(server.wallpaperType)
  return {
    ...server,
    iconUrl: await resolveDisplayMediaUrl(mediaService, server.iconUrl, { variant: 'avatar' }),
    bannerUrl: await resolveDisplayMediaUrl(mediaService, server.bannerUrl, {
      variant: 'banner',
    }),
    wallpaperType,
    wallpaperUrl: await resolveSignedWallpaperUrl(mediaService, server),
    wallpaperInteractive: wallpaperType === 'html' && Boolean(server.wallpaperInteractive),
  }
}

export function createServerHandler(container: AppContainer) {
  const serverHandler = new Hono()

  const resolveServerId = async (idOrSlug: string) => {
    const serverService = container.resolve('serverService')
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug)
    if (isUuid) return idOrSlug
    const bySlug = await serverService.getBySlug(idOrSlug)
    return bySlug.id
  }

  async function getServerAccessStatus(idOrSlug: string, userId: string) {
    const serverDao = container.resolve('serverDao')
    const mediaService = container.resolve('mediaService')
    const serverJoinRequestDao = container.resolve('serverJoinRequestDao')
    const serverId = await resolveServerId(idOrSlug)
    const server = await serverDao.findById(serverId)
    if (!server) throw Object.assign(new Error('Server not found'), { status: 404 })
    const member = await serverDao.getMember(server.id, userId)
    const canManage = member?.role === 'owner' || member?.role === 'admin'
    const joinRequest =
      !member && !server.isPublic
        ? await serverJoinRequestDao.findByServerAndUser(server.id, userId)
        : null
    const decoratedServer = await decorateServerWithMedia(mediaService, server)

    return {
      server: {
        id: decoratedServer.id,
        name: decoratedServer.name,
        slug: decoratedServer.slug,
        iconUrl: decoratedServer.iconUrl,
        bannerUrl: decoratedServer.bannerUrl,
        wallpaperType: decoratedServer.wallpaperType,
        wallpaperUrl: decoratedServer.wallpaperUrl,
        wallpaperWorkspaceFileId: decoratedServer.wallpaperWorkspaceFileId,
        wallpaperInteractive: decoratedServer.wallpaperInteractive,
        wallpaperUpdatedAt: decoratedServer.wallpaperUpdatedAt,
        description: decoratedServer.description,
        isPublic: decoratedServer.isPublic,
        ownerId: decoratedServer.ownerId,
      },
      isMember: Boolean(member),
      canManage,
      canAccess: Boolean(member || server.isPublic),
      requiresApproval: Boolean(!member && !server.isPublic),
      joinRequestStatus: joinRequest?.status ?? null,
      joinRequestId: joinRequest?.id ?? null,
    }
  }

  async function notifyServerJoinRequestReviewers(input: {
    serverId: string
    serverName: string
    requestId: string
    requesterId: string
  }) {
    const serverDao = container.resolve('serverDao')
    const userDao = container.resolve('userDao')
    const notificationTriggerService = container.resolve('notificationTriggerService')
    const requester = await userDao.findById(input.requesterId)
    const requesterName = requester?.displayName ?? requester?.username ?? 'Someone'
    const members = await serverDao.getMembers(input.serverId)
    const reviewerIds = members
      .filter((member) => member.role === 'owner' || member.role === 'admin')
      .map((member) => member.userId)

    await notificationTriggerService.triggerServerAccessRequest({
      reviewerIds,
      requesterId: input.requesterId,
      requesterName,
      requestId: input.requestId,
      serverId: input.serverId,
      serverName: input.serverName,
    })
  }

  async function notifyServerJoinRequestDecision(input: {
    serverId: string
    serverName: string
    userId: string
    reviewerId: string
    approved: boolean
  }) {
    const notificationTriggerService = container.resolve('notificationTriggerService')
    await notificationTriggerService.triggerServerAccessDecision({
      userId: input.userId,
      reviewerId: input.reviewerId,
      approved: input.approved,
      serverId: input.serverId,
      serverName: input.serverName,
    })
    try {
      const io = container.resolve('io')
      if (input.approved) {
        io.to(`user:${input.userId}`).emit('server:joined', { serverId: input.serverId })
      }
    } catch {
      /* non-critical */
    }
  }

  async function resolveAvailableServerWallpaper<
    T extends {
      id: string
      wallpaperType?: string | null
      wallpaperUrl?: string | null
      wallpaperWorkspaceFileId?: string | null
      wallpaperInteractive?: boolean | null
    },
  >(server: T) {
    if (!server.wallpaperWorkspaceFileId) return null

    const workspaceService = container.resolve('workspaceService')
    const workspace = await workspaceService.getByServerId(server.id)
    if (!workspace) return null

    const node = await workspaceService.getNode(server.wallpaperWorkspaceFileId)
    if (!node || node.workspaceId !== workspace.id || node.kind !== 'file' || !node.contentRef) {
      return null
    }

    const inferredType = inferWallpaperType(node)
    if (!inferredType) return null

    const mediaService = container.resolve('mediaService')
    const contentRef = mediaService.normalizeMediaUrl(node.contentRef)
    if (!contentRef || !isUploadedWallpaperContentRef(contentRef)) return null

    return {
      wallpaperType: inferredType,
      wallpaperUrl: contentRef,
      wallpaperWorkspaceFileId: node.id,
      wallpaperInteractive: inferredType === 'html' && Boolean(server.wallpaperInteractive),
    }
  }

  async function decorateServerWithMedia<
    T extends {
      id: string
      iconUrl: string | null | undefined
      bannerUrl: string | null | undefined
      wallpaperType?: string | null
      wallpaperUrl?: string | null
      wallpaperWorkspaceFileId?: string | null
      wallpaperInteractive?: boolean | null
    },
  >(mediaService: Parameters<typeof decorateServerMedia>[0], server: T) {
    const wallpaper = await resolveAvailableServerWallpaper(server)
    return decorateServerMedia(mediaService, {
      ...server,
      wallpaperType: wallpaper?.wallpaperType ?? null,
      wallpaperUrl: wallpaper?.wallpaperUrl ?? null,
      wallpaperWorkspaceFileId: wallpaper?.wallpaperWorkspaceFileId ?? null,
      wallpaperInteractive: wallpaper?.wallpaperInteractive ?? false,
    })
  }

  async function resolveServerWallpaperUpdate(
    serverId: string,
    input: UpdateServerInput,
    mediaService: {
      normalizeMediaUrl: (mediaUrl: string | null | undefined) => string | null
    },
  ) {
    const hasWallpaperInput =
      input.wallpaperType !== undefined ||
      input.wallpaperUrl !== undefined ||
      input.wallpaperWorkspaceFileId !== undefined ||
      input.wallpaperInteractive !== undefined

    if (!hasWallpaperInput) return {}

    const onlyInteractiveInput =
      input.wallpaperInteractive !== undefined &&
      input.wallpaperType === undefined &&
      input.wallpaperUrl === undefined &&
      input.wallpaperWorkspaceFileId === undefined

    if (onlyInteractiveInput) {
      const serverDao = container.resolve('serverDao')
      const server = await serverDao.findById(serverId)
      const currentWallpaper = server ? await resolveAvailableServerWallpaper(server) : null
      if (input.wallpaperInteractive && currentWallpaper?.wallpaperType !== 'html') {
        invalidWallpaperInput('Interactive wallpaper requires an HTML wallpaper')
      }
      return { wallpaperInteractive: Boolean(input.wallpaperInteractive) }
    }

    if (
      input.wallpaperType === null ||
      input.wallpaperUrl === null ||
      input.wallpaperWorkspaceFileId === null
    ) {
      return {
        wallpaperType: null,
        wallpaperUrl: null,
        wallpaperWorkspaceFileId: null,
        wallpaperInteractive: false,
      }
    }

    if (input.wallpaperWorkspaceFileId) {
      const workspaceService = container.resolve('workspaceService')
      const workspace = await workspaceService.getOrCreateForServer(serverId)
      const node = await workspaceService.getNode(input.wallpaperWorkspaceFileId)
      if (!node || node.workspaceId !== workspace.id || node.kind !== 'file' || !node.contentRef) {
        invalidWallpaperInput('Invalid wallpaper workspace file')
      }

      const inferredType = inferWallpaperType(node)
      if (!inferredType) {
        invalidWallpaperInput('Wallpaper file must be an image or HTML file')
      }
      if (input.wallpaperType && input.wallpaperType !== inferredType) {
        invalidWallpaperInput('Wallpaper type does not match the workspace file')
      }

      const contentRef = mediaService.normalizeMediaUrl(node.contentRef)
      if (!contentRef || !isUploadedWallpaperContentRef(contentRef)) {
        invalidWallpaperInput('Wallpaper file must use server media storage')
      }

      return {
        wallpaperType: inferredType,
        wallpaperUrl: contentRef,
        wallpaperWorkspaceFileId: node.id,
        wallpaperInteractive: inferredType === 'html' && Boolean(input.wallpaperInteractive),
      }
    }

    invalidWallpaperInput('Wallpaper source must be a workspace file')
  }

  // Public endpoint: GET /api/servers/discover - browse public servers
  serverHandler.get('/discover', async (c) => {
    const serverService = container.resolve('serverService')
    const mediaService = container.resolve('mediaService')
    const limit = Number(c.req.query('limit') ?? '50')
    const offset = Number(c.req.query('offset') ?? '0')
    const servers = await serverService.discoverPublic(limit, offset)
    const signedServers = await Promise.all(
      servers.map(async (server) => decorateServerWithMedia(mediaService, server)),
    )
    return c.json(signedServers)
  })

  // Public endpoint: GET /api/servers/invite/:code - get server info by invite code
  serverHandler.get('/invite/:code', async (c) => {
    const serverService = container.resolve('serverService')
    const mediaService = container.resolve('mediaService')
    const code = c.req.param('code')
    try {
      const server = await serverService.getByInviteCode(code)
      const iconUrl = await resolveDisplayMediaUrl(mediaService, server.iconUrl, {
        variant: 'avatar',
      })
      return c.json({
        id: server.id,
        name: server.name,
        iconUrl,
      })
    } catch {
      return c.json({ ok: false, error: 'Invalid invite code' }, 404)
    }
  })

  // All other server routes require authentication
  serverHandler.use('*', authMiddleware)

  // POST /api/servers
  serverHandler.post('/', zValidator('json', createServerSchema), async (c) => {
    const serverService = container.resolve('serverService')
    const membershipService = container.resolve('membershipService')
    const mediaService = container.resolve('mediaService')
    const input = c.req.valid('json')
    const user = c.get('user')
    await membershipService.requireMember(user.userId, 'server:create')
    const server = await serverService.create(
      {
        ...input,
        iconUrl: input.iconUrl
          ? (mediaService.normalizeMediaUrl(input.iconUrl) ?? undefined)
          : input.iconUrl,
        bannerUrl: input.bannerUrl
          ? (mediaService.normalizeMediaUrl(input.bannerUrl) ?? undefined)
          : input.bannerUrl,
      },
      user.userId,
    )
    return c.json(server ? await decorateServerWithMedia(mediaService, server) : server, 201)
  })

  // GET /api/servers
  serverHandler.get('/', async (c) => {
    const serverService = container.resolve('serverService')
    const mediaService = container.resolve('mediaService')
    const user = c.get('user')
    const servers = await serverService.getUserServers(user.userId)
    const signedServers = await Promise.all(
      servers.map(async (entry) => ({
        ...entry,
        server: await decorateServerWithMedia(mediaService, entry.server),
      })),
    )
    return c.json(signedServers)
  })

  // GET /api/servers/:id/access — server visibility gate status for private server links
  serverHandler.get('/:id/access', async (c) => {
    const id = c.req.param('id')
    const user = c.get('user')
    const access = await getServerAccessStatus(id, user.userId)
    return c.json(access)
  })

  // GET /api/servers/:id/desktop-layout — shared OS desktop layout for a server
  serverHandler.get('/:id/desktop-layout', async (c) => {
    const serverDao = container.resolve('serverDao')
    const id = c.req.param('id')
    const user = c.get('user')
    const resolvedId = await resolveServerId(id)
    const server = await serverDao.findById(resolvedId)
    if (!server) return c.json({ ok: false, error: 'Server not found' }, 404)

    const member = await serverDao.getMember(server.id, user.userId)
    if (!member && !server.isPublic) {
      return c.json({ ok: false, error: 'Not a member of this server' }, 403)
    }

    return c.json(server.desktopLayout ?? { version: 1, items: [], widgets: [] })
  })

  // PATCH /api/servers/:id/desktop-layout — owner/admin managed shared OS desktop layout
  serverHandler.patch(
    '/:id/desktop-layout',
    zValidator('json', updateServerDesktopLayoutSchema),
    async (c) => {
      const serverService = container.resolve('serverService')
      const id = c.req.param('id')
      const resolvedId = await resolveServerId(id)
      const input = c.req.valid('json')
      const server = await serverService.updateDesktopLayout(resolvedId, input, c.get('actor'))
      if (!server) return c.json({ ok: false, error: 'Server not found' }, 404)
      return c.json(server.desktopLayout ?? input)
    },
  )

  // GET /api/servers/:id
  // GET /api/servers/:id (supports UUID or slug)
  serverHandler.get('/:id', async (c) => {
    const serverService = container.resolve('serverService')
    const mediaService = container.resolve('mediaService')
    const serverDao = container.resolve('serverDao')
    const id = c.req.param('id')
    // Try UUID first, then slug
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    const server = isUuid ? await serverService.getById(id) : await serverService.getBySlug(id)
    const user = c.get('user')
    const member = await serverDao.getMember(server.id, user.userId)
    if (!member && !server.isPublic) {
      return c.json({ ok: false, error: 'Not a member of this server' }, 403)
    }
    if (!member) {
      const decoratedServer = await decorateServerWithMedia(mediaService, server)
      return c.json({
        id: decoratedServer.id,
        name: decoratedServer.name,
        slug: decoratedServer.slug,
        iconUrl: decoratedServer.iconUrl,
        bannerUrl: decoratedServer.bannerUrl,
        wallpaperType: decoratedServer.wallpaperType,
        wallpaperUrl: decoratedServer.wallpaperUrl,
        wallpaperWorkspaceFileId: decoratedServer.wallpaperWorkspaceFileId,
        wallpaperInteractive: decoratedServer.wallpaperInteractive,
        wallpaperUpdatedAt: decoratedServer.wallpaperUpdatedAt,
        description: decoratedServer.description,
        isPublic: decoratedServer.isPublic,
      })
    }
    return c.json(await decorateServerWithMedia(mediaService, server))
  })

  // PATCH /api/servers/:id (supports UUID or slug)
  serverHandler.patch('/:id', zValidator('json', updateServerSchema), async (c) => {
    const serverService = container.resolve('serverService')
    const mediaService = container.resolve('mediaService')
    const id = c.req.param('id')
    const resolvedId = await resolveServerId(id)
    const input = c.req.valid('json')
    const wallpaperUpdate = await resolveServerWallpaperUpdate(resolvedId, input, mediaService)
    const updateInput = {
      ...input,
      ...(input.iconUrl !== undefined
        ? { iconUrl: mediaService.normalizeMediaUrl(input.iconUrl) }
        : {}),
      ...(input.bannerUrl !== undefined
        ? { bannerUrl: mediaService.normalizeMediaUrl(input.bannerUrl) }
        : {}),
      ...wallpaperUpdate,
    }
    const server = await serverService.update(resolvedId, updateInput, c.get('actor'))
    if (!server) return c.json({ ok: false, error: 'Server not found' }, 404)
    return c.json(await decorateServerWithMedia(mediaService, server))
  })

  // DELETE /api/servers/:id (supports UUID or slug)
  serverHandler.delete('/:id', async (c) => {
    const serverService = container.resolve('serverService')
    const id = c.req.param('id')
    const resolvedId = await resolveServerId(id)
    await serverService.delete(resolvedId, c.get('actor'))
    return c.json({ ok: true })
  })

  // POST /api/servers/:id/join
  serverHandler.post('/:id/join', zValidator('json', joinServerSchema), async (c) => {
    const serverService = container.resolve('serverService')
    const mediaService = container.resolve('mediaService')
    const { inviteCode } = c.req.valid('json')
    const user = c.get('user')
    try {
      const server = await serverService.join(inviteCode, user.userId)

      // Emit member:joined only to the first channel to avoid duplicate system messages
      try {
        const io = container.resolve('io')
        const channelDao = container.resolve('channelDao')
        const userDao = container.resolve('userDao')
        const fullUser = await userDao.findById(user.userId)
        const channels = await channelDao.findByServerId(server.id)
        const payload = {
          serverId: server.id,
          userId: user.userId,
          username: fullUser?.username ?? 'unknown',
          displayName: fullUser?.displayName ?? fullUser?.username ?? 'unknown',
          avatarUrl: await resolveDisplayMediaUrl(mediaService, fullUser?.avatarUrl, {
            variant: 'avatar',
          }),
          isBot: fullUser?.isBot ?? false,
        }
        if (channels.length > 0) {
          const firstChannel = channels[0]!
          io.to(`channel:${firstChannel.id}`).emit('member:joined', {
            ...payload,
            channelId: firstChannel.id,
          })
        }

        // Send notification to server owner about the new member
        if (server.ownerId && server.ownerId !== user.userId) {
          try {
            const notificationTriggerService = container.resolve('notificationTriggerService')
            const displayName = fullUser?.displayName ?? fullUser?.username ?? 'unknown'
            await notificationTriggerService.triggerServerMemberJoined({
              ownerId: server.ownerId,
              actorId: user.userId,
              actorName: displayName,
              serverId: server.id,
              serverName: server.name,
            })
          } catch {
            /* non-critical */
          }
        }
      } catch {
        /* non-critical */
      }

      return c.json(server)
    } catch (error) {
      const status = (error as { status?: number }).status
      if (status === 409) {
        // Already a member — return the server info so client can navigate
        const server = await serverService.getByInviteCode(inviteCode)
        return c.json(server, 409)
      }
      throw error
    }
  })

  // POST /api/servers/:id/join-requests — request approval to enter a private server
  serverHandler.post('/:id/join-requests', async (c) => {
    const id = c.req.param('id')
    const user = c.get('user')
    const access = await getServerAccessStatus(id, user.userId)

    if (access.isMember) return c.json({ ok: true, status: 'approved' })

    const serverUseCase = container.resolve('serverUseCase')
    const result = await serverUseCase.requestServerAccess({
      ctx: createActorContext(c.get('actor'), { route: c.req.path }),
      serverId: access.server.id,
      isPublic: access.server.isPublic,
    })

    if (result.status === 'approved') {
      return c.json({ ok: true, status: 'approved' }, 201)
    }

    // Private server — join request created (notification needed if not already pending)
    const isNewRequest = access.joinRequestStatus !== 'pending'
    if (isNewRequest) {
      try {
        await notifyServerJoinRequestReviewers({
          serverId: access.server.id,
          serverName: access.server.name,
          requestId: result.requestId!,
          requesterId: user.userId,
        })
      } catch {
        /* non-critical */
      }
    }

    return c.json({ ok: true, status: 'pending', requestId: result.requestId }, 202)
  })

  // PATCH /api/servers/join-requests/:requestId — approve/reject a private-server request
  serverHandler.patch(
    '/join-requests/:requestId',
    zValidator('json', reviewJoinRequestSchema),
    async (c) => {
      const requestId = c.req.param('requestId')
      const reviewerId = c.get('user').userId
      const { status } = c.req.valid('json')

      const serverUseCase = container.resolve('serverUseCase')
      const result = await serverUseCase.reviewServerJoinRequest({
        ctx: createActorContext(c.get('actor'), { route: c.req.path }),
        requestId,
        status,
      })

      try {
        await notifyServerJoinRequestDecision({
          serverId: result.server.id,
          serverName: result.server.name,
          userId: result.userId,
          reviewerId,
          approved: result.approved,
        })
        await container
          .resolve('notificationService')
          .markReferenceAsRead(reviewerId, 'server_join_request', requestId)
      } catch {
        /* non-critical */
      }

      return c.json({ ok: true, request: result.request })
    },
  )

  // POST /api/servers/:id/leave
  serverHandler.post('/:id/leave', async (c) => {
    const serverService = container.resolve('serverService')
    const mediaService = container.resolve('mediaService')
    const id = c.req.param('id')
    const user = c.get('user')

    // Get user info before leaving for the event payload
    let leavePayload: {
      serverId: string
      userId: string
      username: string
      displayName: string
      avatarUrl: string | null
      isBot: boolean
    } | null = null
    try {
      const userDao = container.resolve('userDao')
      const fullUser = await userDao.findById(user.userId)
      leavePayload = {
        serverId: id,
        userId: user.userId,
        username: fullUser?.username ?? 'unknown',
        displayName: fullUser?.displayName ?? fullUser?.username ?? 'unknown',
        avatarUrl: await resolveDisplayMediaUrl(mediaService, fullUser?.avatarUrl, {
          variant: 'avatar',
        }),
        isBot: fullUser?.isBot ?? false,
      }
    } catch {
      /* non-critical */
    }

    await serverService.leave(id, user.userId)

    // Emit member:left to all channel rooms
    if (leavePayload) {
      try {
        const io = container.resolve('io')
        const channelDao = container.resolve('channelDao')
        const channels = await channelDao.findByServerId(id)
        for (const ch of channels) {
          io.to(`channel:${ch.id}`).emit('member:left', leavePayload)
        }
      } catch {
        /* non-critical */
      }
    }

    return c.json({ ok: true })
  })

  // GET /api/servers/:id/members
  serverHandler.get('/:id/members', async (c) => {
    const serverService = container.resolve('serverService')
    const mediaService = container.resolve('mediaService')
    const idOrSlug = c.req.param('id')
    const serverId = await resolveServerId(idOrSlug)
    const permissionService = container.resolve('permissionService')
    await permissionService.requireMember(serverId, c.get('user').userId)
    const members = await serverService.getMembers(serverId)
    const signedMembers = await Promise.all(
      members.map(async (member) => ({
        ...member,
        avatar: await resolveDisplayMediaUrl(mediaService, member.avatar, { variant: 'avatar' }),
        creator: member.creator
          ? {
              ...member.creator,
              avatarUrl: await resolveDisplayMediaUrl(mediaService, member.creator.avatarUrl, {
                variant: 'avatar',
              }),
            }
          : null,
        user: member.user
          ? {
              ...member.user,
              avatarUrl: await resolveDisplayMediaUrl(mediaService, member.user.avatarUrl, {
                variant: 'avatar',
              }),
            }
          : null,
      })),
    )
    return c.json(signedMembers)
  })

  // PATCH /api/servers/:id/members/:userId
  serverHandler.patch('/:id/members/:userId', zValidator('json', updateMemberSchema), async (c) => {
    const serverService = container.resolve('serverService')
    const id = c.req.param('id')
    const targetUserId = c.req.param('userId')
    const input = c.req.valid('json')
    const user = c.get('user')
    const member = await serverService.updateMember(id, targetUserId, c.get('actor'), input)
    return c.json(member)
  })

  // DELETE /api/servers/:id/members/:userId
  serverHandler.delete('/:id/members/:userId', async (c) => {
    const serverService = container.resolve('serverService')
    const mediaService = container.resolve('mediaService')
    const id = c.req.param('id')
    const targetUserId = c.req.param('userId')
    const user = c.get('user')

    // Get target user info before kicking for the event payload
    let kickPayload: {
      serverId: string
      userId: string
      username: string
      displayName: string
      avatarUrl: string | null
      isBot: boolean
    } | null = null
    try {
      const userDao = container.resolve('userDao')
      const fullUser = await userDao.findById(targetUserId)
      kickPayload = {
        serverId: id,
        userId: targetUserId,
        username: fullUser?.username ?? 'unknown',
        displayName: fullUser?.displayName ?? fullUser?.username ?? 'unknown',
        avatarUrl: await resolveDisplayMediaUrl(mediaService, fullUser?.avatarUrl, {
          variant: 'avatar',
        }),
        isBot: fullUser?.isBot ?? false,
      }
    } catch {
      /* non-critical */
    }

    await serverService.kickMember(id, targetUserId, c.get('actor'))

    // Emit member:left to all channel rooms
    if (kickPayload) {
      try {
        const io = container.resolve('io')
        const channelDao = container.resolve('channelDao')
        const channels = await channelDao.findByServerId(id)
        for (const ch of channels) {
          io.to(`channel:${ch.id}`).emit('member:left', kickPayload)
        }
      } catch {
        /* non-critical */
      }
    }

    return c.json({ ok: true })
  })

  // POST /api/servers/:id/invite/regenerate
  serverHandler.post('/:id/invite/regenerate', async (c) => {
    const serverService = container.resolve('serverService')
    const id = c.req.param('id')
    const user = c.get('user')
    const server = await serverService.regenerateInvite(id, c.get('actor'))
    if (!server) return c.json({ ok: false, error: 'Server not found' }, 404)
    return c.json({ inviteCode: server.inviteCode })
  })

  // POST /api/servers/:id/invite-member — invite a user (friend/buddy) to join the server
  serverHandler.post('/:id/invite-member', async (c) => {
    const serverService = container.resolve('serverService')
    const id = c.req.param('id')
    const user = c.get('user')
    const body = await c.req.json<{ userId: string }>()
    const targetUserId = body.userId
    if (!targetUserId) {
      return c.json({ ok: false, error: 'userId is required' }, 400)
    }

    const serverId = await resolveServerId(id)

    // Check if inviter is a member
    const members = await serverService.getMembers(serverId)
    const isMember = members.some((m: { userId: string }) => m.userId === user.userId)
    if (!isMember) {
      return c.json({ ok: false, error: 'You are not a member of this server' }, 403)
    }

    // Check if target is already a member
    const alreadyMember = members.some((m: { userId: string }) => m.userId === targetUserId)
    if (alreadyMember) {
      return c.json({ ok: false, error: 'User is already a member' }, 409)
    }

    // Get server info for notification
    const server = await serverService.getById(serverId)

    // Send notification to the target user
    try {
      const notificationTriggerService = container.resolve('notificationTriggerService')
      const userDao = container.resolve('userDao')
      const inviter = await userDao.findById(user.userId)
      const inviterName = inviter?.displayName ?? inviter?.username ?? 'Someone'
      await notificationTriggerService.triggerServerInvite({
        userId: targetUserId,
        actorId: user.userId,
        actorName: inviterName,
        serverId,
        serverName: server.name,
        inviteCode: server.inviteCode,
      })
    } catch {
      return c.json({ ok: false, error: 'Failed to send invitation' }, 500)
    }

    return c.json({ ok: true })
  })

  // POST /api/servers/:id/agents — add agent(s) to server as members
  serverHandler.post('/:id/agents', async (c) => {
    const mediaService = container.resolve('mediaService')
    const idOrSlug = c.req.param('id')
    const id = await resolveServerId(idOrSlug)
    const user = c.get('user')
    const body = await c.req.json<{ agentIds: string[] }>()

    if (!Array.isArray(body.agentIds) || body.agentIds.length === 0) {
      return c.json({ ok: false, error: 'agentIds is required' }, 400)
    }

    const serverUseCase = container.resolve('serverUseCase')
    const { added, failed } = await serverUseCase.addAgentsToServer({
      ctx: createActorContext(c.get('actor'), { route: c.req.path }),
      serverId: id,
      agentIds: body.agentIds,
      requesterUserId: user.userId,
    })

    // Emit member:joined to server members for each added agent (non-critical)
    for (const { agentId, userId: buddyUserId } of added) {
      try {
        const result = await container
          .resolve('buddyInboxService')
          .ensure(id, agentId, c.get('actor'))
        if (result.created) {
          container
            .resolve('io')
            .to(`user:${user.userId}`)
            .emit('channel:created', {
              ...result.channel,
              serverId: id,
            })
        }
      } catch (err) {
        failed.push({
          agentId,
          error: err instanceof Error ? err.message : 'Failed to initialize Buddy Inbox',
        })
      }

      try {
        const io = container.resolve('io')
        const userDao = container.resolve('userDao')
        const serverDao = container.resolve('serverDao')
        const botUser = await userDao.findById(buddyUserId)
        const serverMembers = await serverDao.getMembers(id)
        const payload = {
          serverId: id,
          userId: buddyUserId,
          username: botUser?.username ?? 'unknown',
          displayName: botUser?.displayName ?? botUser?.username ?? 'unknown',
          avatarUrl: await resolveDisplayMediaUrl(mediaService, botUser?.avatarUrl, {
            variant: 'avatar',
          }),
          isBot: true,
        }
        // Notify all non-bot server members about the new bot
        for (const m of serverMembers) {
          if (!m.user?.isBot) {
            io.to(`user:${m.userId}`).emit('member:joined', payload)
          }
        }
        // Notify the bot directly so its monitor can connect
        io.to(`user:${buddyUserId}`).emit('server:joined', {
          serverId: id,
          agentId,
        })
      } catch {
        /* non-critical */
      }
    }

    return c.json({ added: added.map((a) => a.agentId), failed })
  })

  return serverHandler
}
