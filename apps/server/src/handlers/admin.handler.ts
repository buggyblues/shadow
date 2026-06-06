import { randomBytes } from 'node:crypto'
import { zValidator } from '@hono/zod-validator'
import { and, eq, gte, inArray, isNotNull, lt, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppContainer } from '../container'
import type { ServerDao } from '../dao/server.dao'
import {
  channels,
  cloudTemplates,
  inviteCodes,
  messages,
  serverAppBuddyGrants,
  serverAppIntegrations,
  servers as serversTable,
  users,
} from '../db/schema'
import { resolveCloudTemplatesDir } from '../lib/cloud-templates'
import { authMiddleware } from '../middleware/auth.middleware'
import { createActorContext } from '../security/actor-context'
import { createServerAppCatalogEntrySchema } from '../validators/app-integration.schema'
import { updateServerSchema } from '../validators/server.schema'

function generateCode(length = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = randomBytes(length)
  let code = ''
  for (let i = 0; i < length; i++) {
    code += chars.charAt(bytes[i]! % chars.length)
  }
  return code
}

export function createAdminHandler(container: AppContainer) {
  const adminHandler = new Hono()
  const isDevTopupEnabled = () =>
    ['1', 'true', 'yes', 'on'].includes((process.env.ENABLE_DEV_TOPUP ?? '').toLowerCase())

  adminHandler.use('*', authMiddleware)

  // Admin-only middleware: check isAdmin on the authenticated user
  adminHandler.use('*', async (c, next) => {
    const user = c.get('user') as { userId: string }
    const adminUseCase = container.resolve('adminUseCase')
    const result = await adminUseCase.getUserById({
      ctx: createActorContext(c.get('actor')),
      userId: user.userId,
    })
    if (!result || !(result as { isAdmin?: boolean }).isAdmin) {
      return c.json({ ok: false, error: 'Forbidden: admin access required' }, 403)
    }
    await next()
  })

  // ── Dev/Demo Wallet Grant ─────────────────────────
  // SECURITY: Replaces the previously-public /wallet/topup endpoints.
  // Requires:
  //   - admin role (handled by middleware above)
  //   - ENABLE_DEV_TOPUP=1 environment flag (NEVER set in production)
  // Use only for local dev, demos, and manual support adjustments.
  adminHandler.post(
    '/wallet/grant',
    zValidator(
      'json',
      z.object({
        userId: z.string().uuid().optional(),
        amount: z.number().int().min(1).max(1_000_000),
        note: z.string().max(200).optional(),
      }),
    ),
    async (c) => {
      if (!isDevTopupEnabled()) {
        return c.json(
          {
            ok: false,
            error:
              'Wallet grant is disabled. Set ENABLE_DEV_TOPUP=1 (non-production environments only).',
          },
          403,
        )
      }
      const actor = c.get('user') as { userId: string }
      const { userId, amount, note } = c.req.valid('json')
      const targetUserId = userId ?? actor.userId
      const walletService = container.resolve('walletService')
      const wallet = await walletService.topUp(
        targetUserId,
        amount,
        note ?? `[admin grant] by=${actor.userId}`,
      )
      return c.json({ ok: true, balance: wallet?.balance ?? 0, targetUserId })
    },
  )

  // ── Stats ─────────────────────────────────────────
  adminHandler.get('/stats', async (c) => {
    const userDao = container.resolve('userDao')
    const serverDao = container.resolve('serverDao')
    const inviteCodeDao = container.resolve('inviteCodeDao')
    const db = container.resolve('db')

    const now = new Date()
    const daysQuery = Number.parseInt(c.req.query('days') ?? '14', 10)
    const trendWindowDays = Number.isFinite(daysQuery) ? Math.max(7, Math.min(60, daysQuery)) : 14
    const endExclusive = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
    )
    const startInclusive = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - trendWindowDays + 1),
    )
    const toDate = (value: Date) => value.toISOString().slice(0, 10)

    const [allUsers, allServers, totalCodes, usedCodes, msgCountResult, chCountResult] =
      await Promise.all([
        userDao.findAll(9999, 0),
        serverDao.findAll(9999, 0),
        inviteCodeDao.count(),
        inviteCodeDao.countUsed(),
        db.select({ count: sql<number>`count(*)` }).from(messages),
        db.select({ count: sql<number>`count(*)` }).from(channels),
      ])

    const [userGrowthRows, messageActivityRows, inviteUsedRows] = await Promise.all([
      db
        .select({
          date: sql<string>`${users.createdAt}::date`.as('date'),
          newUsers: sql<number>`count(*)::int`,
        })
        .from(users)
        .where(and(gte(users.createdAt, startInclusive), lt(users.createdAt, endExclusive)))
        .groupBy(sql`${users.createdAt}::date`)
        .orderBy(sql`${users.createdAt}::date`),
      db
        .select({
          date: sql<string>`${messages.createdAt}::date`.as('date'),
          messageCount: sql<number>`count(*)::int`,
          activeUsers: sql<number>`count(distinct ${messages.authorId})::int`,
        })
        .from(messages)
        .where(and(gte(messages.createdAt, startInclusive), lt(messages.createdAt, endExclusive)))
        .groupBy(sql`${messages.createdAt}::date`)
        .orderBy(sql`${messages.createdAt}::date`),
      db
        .select({
          date: sql<string>`${inviteCodes.usedAt}::date`.as('date'),
          usedInviteCodes: sql<number>`count(*)::int`,
        })
        .from(inviteCodes)
        .where(
          and(
            isNotNull(inviteCodes.usedAt),
            gte(inviteCodes.usedAt, startInclusive),
            lt(inviteCodes.usedAt, endExclusive),
          ),
        )
        .groupBy(sql`${inviteCodes.usedAt}::date`)
        .orderBy(sql`${inviteCodes.usedAt}::date`),
    ])

    const onlineUsers = allUsers.filter((u: { status?: string }) => u.status === 'online').length
    const trendMap = new Map<
      string,
      {
        date: string
        newUsers: number
        messages: number
        activeUsers: number
        usedInviteCodes: number
      }
    >()

    for (let i = 0; i < trendWindowDays; i++) {
      const pointDate = new Date(startInclusive)
      pointDate.setUTCDate(pointDate.getUTCDate() + i)
      trendMap.set(toDate(pointDate), {
        date: toDate(pointDate),
        newUsers: 0,
        messages: 0,
        activeUsers: 0,
        usedInviteCodes: 0,
      })
    }

    for (const row of userGrowthRows) {
      const key = row.date
      const item = trendMap.get(key)
      if (item) item.newUsers = Number(row.newUsers ?? 0)
    }

    for (const row of messageActivityRows) {
      const key = row.date
      const item = trendMap.get(key)
      if (item) {
        item.messages = Number(row.messageCount ?? 0)
        item.activeUsers = Number(row.activeUsers ?? 0)
      }
    }

    for (const row of inviteUsedRows) {
      const key = row.date
      const item = trendMap.get(key)
      if (item) item.usedInviteCodes = Number(row.usedInviteCodes ?? 0)
    }

    const trend = [...trendMap.values()].sort((a, b) => a.date.localeCompare(b.date))

    return c.json({
      totalUsers: allUsers.length,
      onlineUsers,
      totalServers: allServers.length,
      totalMessages: Number(msgCountResult[0]?.count ?? 0),
      totalChannels: Number(chCountResult[0]?.count ?? 0),
      totalInviteCodes: totalCodes,
      usedInviteCodes: usedCodes,
      trends: {
        periodDays: trendWindowDays,
        points: trend,
      },
    })
  })

  // ── Invite Codes ──────────────────────────────────
  adminHandler.get('/invite-codes', async (c) => {
    const adminUseCase = container.resolve('adminUseCase')
    const limit = Number(c.req.query('limit') ?? '50')
    const offset = Number(c.req.query('offset') ?? '0')
    const codes = await adminUseCase.getInviteCodes({
      ctx: createActorContext(c.get('actor')),
      limit,
      offset,
    })
    return c.json(codes)
  })

  adminHandler.post(
    '/invite-codes',
    zValidator(
      'json',
      z.object({
        count: z.number().min(1).max(100).default(1),
        note: z.string().max(200).optional(),
      }),
    ),
    async (c) => {
      const adminUseCase = container.resolve('adminUseCase')
      const { count, note } = c.req.valid('json')
      const codes = await adminUseCase.createInviteCodes({
        ctx: createActorContext(c.get('actor')),
        count,
        note,
      })
      return c.json(codes, 201)
    },
  )

  adminHandler.delete('/invite-codes/:id', async (c) => {
    const adminUseCase = container.resolve('adminUseCase')
    const id = c.req.param('id')
    await adminUseCase.deleteInviteCode({
      ctx: createActorContext(c.get('actor')),
      id,
    })
    return c.json({ ok: true })
  })

  adminHandler.patch('/invite-codes/:id/deactivate', async (c) => {
    const adminUseCase = container.resolve('adminUseCase')
    const id = c.req.param('id')
    const code = await adminUseCase.deactivateInviteCode({
      ctx: createActorContext(c.get('actor')),
      id,
    })
    return c.json(code)
  })

  // ── Users ─────────────────────────────────────────
  adminHandler.get('/users', async (c) => {
    const adminUseCase = container.resolve('adminUseCase')
    const limit = Number(c.req.query('limit') ?? '50')
    const offset = Number(c.req.query('offset') ?? '0')
    const users = await adminUseCase.getUsers({
      ctx: createActorContext(c.get('actor')),
      limit,
      offset,
    })
    return c.json(
      users.map((u: Record<string, unknown>) => ({
        id: u.id,
        email: u.email,
        username: u.username,
        displayName: u.displayName,
        avatarUrl: u.avatarUrl,
        status: u.status,
        isBot: u.isBot,
        createdAt: u.createdAt,
      })),
    )
  })

  adminHandler.patch(
    '/users/:id',
    zValidator(
      'json',
      z.object({
        displayName: z.string().optional(),
        status: z.enum(['online', 'idle', 'dnd', 'offline']).optional(),
      }),
    ),
    async (c) => {
      const adminUseCase = container.resolve('adminUseCase')
      const id = c.req.param('id')
      const input = c.req.valid('json')
      const user = await adminUseCase.updateUser({
        ctx: createActorContext(c.get('actor')),
        userId: id,
        data: input,
      })
      return c.json(user)
    },
  )

  adminHandler.delete('/users/:id', async (c) => {
    const adminUseCase = container.resolve('adminUseCase')
    const id = c.req.param('id')
    await adminUseCase.deleteUser({
      ctx: createActorContext(c.get('actor')),
      userId: id,
    })
    return c.json({ ok: true })
  })

  // ── Servers ───────────────────────────────────────
  adminHandler.get('/servers', async (c) => {
    const adminUseCase = container.resolve('adminUseCase')
    const limit = Number(c.req.query('limit') ?? '50')
    const offset = Number(c.req.query('offset') ?? '0')
    const servers = await adminUseCase.getServers({
      ctx: createActorContext(c.get('actor')),
      limit,
      offset,
    })
    return c.json(servers)
  })

  // Server detail — get a single server by ID
  adminHandler.get('/servers/:id', async (c) => {
    const adminUseCase = container.resolve('adminUseCase')
    const id = c.req.param('id')
    const result = await adminUseCase.getServer({
      ctx: createActorContext(c.get('actor')),
      serverId: id,
    })
    if (!result.ok) return c.json({ ok: false, error: result.error }, 404)
    return c.json(result.server)
  })

  // Channels for a specific server
  adminHandler.get('/servers/:id/channels', async (c) => {
    const adminUseCase = container.resolve('adminUseCase')
    const serverId = c.req.param('id')
    const chs = await adminUseCase.getServerChannels({
      ctx: createActorContext(c.get('actor')),
      serverId,
    })
    return c.json(chs)
  })

  // Messages for a specific channel (admin)
  adminHandler.get('/servers/:serverId/channels/:channelId/messages', async (c) => {
    const adminUseCase = container.resolve('adminUseCase')
    const channelId = c.req.param('channelId')
    const limit = Number(c.req.query('limit') ?? '50')
    const cursor = c.req.query('cursor')
    const msgs = await adminUseCase.getChannelMessages({
      ctx: createActorContext(c.get('actor')),
      channelId,
      limit,
      cursor,
    })
    return c.json(msgs)
  })

  // Update server settings (admin)
  adminHandler.patch('/servers/:id', zValidator('json', updateServerSchema), async (c) => {
    const adminUseCase = container.resolve('adminUseCase')
    const id = c.req.param('id')
    const input = c.req.valid('json')
    const result = await adminUseCase.updateServer({
      ctx: createActorContext(c.get('actor')),
      serverId: id,
      data: input as Parameters<ServerDao['update']>[1],
    })
    if (!result.ok) return c.json({ ok: false, error: result.error }, 404)
    return c.json(result.server)
  })

  adminHandler.delete('/servers/:id', async (c) => {
    const adminUseCase = container.resolve('adminUseCase')
    const id = c.req.param('id')
    await adminUseCase.deleteServer({
      ctx: createActorContext(c.get('actor')),
      serverId: id,
    })
    return c.json({ ok: true })
  })

  // ── Server App Integrations ───────────────────────
  // Actor: user admin
  // Resource: server_app_integration
  // Action: read/manage
  // Data class: server-private
  adminHandler.get('/server-apps', async (c) => {
    const db = container.resolve('db')
    const limitQuery = Number(c.req.query('limit') ?? '100')
    const offsetQuery = Number(c.req.query('offset') ?? '0')
    const limit = Number.isFinite(limitQuery) ? Math.max(1, Math.min(200, limitQuery)) : 100
    const offset = Number.isFinite(offsetQuery) ? Math.max(0, offsetQuery) : 0

    const rows = await db
      .select({
        app: serverAppIntegrations,
        server: {
          id: serversTable.id,
          name: serversTable.name,
          slug: serversTable.slug,
        },
      })
      .from(serverAppIntegrations)
      .innerJoin(serversTable, eq(serverAppIntegrations.serverId, serversTable.id))
      .orderBy(serverAppIntegrations.createdAt)
      .limit(limit)
      .offset(offset)

    const appIds = rows.map((row) => row.app.id)
    const grantCounts =
      appIds.length > 0
        ? await db
            .select({
              serverAppId: serverAppBuddyGrants.serverAppId,
              count: sql<number>`count(*)::int`,
            })
            .from(serverAppBuddyGrants)
            .where(inArray(serverAppBuddyGrants.serverAppId, appIds))
            .groupBy(serverAppBuddyGrants.serverAppId)
        : []
    const grantCountMap = new Map(grantCounts.map((row) => [row.serverAppId, Number(row.count)]))
    const catalogEntries = await container.resolve('appIntegrationService').listAdminCatalog()
    const catalogByAppKey = new Map(catalogEntries.map((entry) => [entry.appKey, entry]))

    return c.json(
      rows.map((row) => {
        const catalogEntry = catalogByAppKey.get(row.app.appKey)
        const marketplace = row.app.manifest.marketplace
        return {
          id: row.app.id,
          serverId: row.app.serverId,
          serverName: row.server.name,
          serverSlug: row.server.slug,
          appKey: row.app.appKey,
          name: row.app.name,
          description: row.app.description,
          iconUrl: row.app.iconUrl,
          manifestUrl: row.app.manifestUrl,
          manifest: row.app.manifest,
          iframeEntry: row.app.iframeEntry,
          apiBaseUrl: row.app.apiBaseUrl,
          status: row.app.status,
          commandCount: row.app.manifest.commands.length,
          skillCount: row.app.manifest.skills?.length ?? 0,
          grantCount: grantCountMap.get(row.app.id) ?? 0,
          inCatalog: Boolean(catalogEntry),
          catalogEntryId: catalogEntry?.id ?? null,
          catalogStatus: catalogEntry?.status ?? null,
          categories: marketplace?.categories ?? [],
          supportedLanguages: marketplace?.supportedLanguages ?? [],
          coverImageUrl:
            marketplace?.coverImageUrl ?? marketplace?.gallery?.[0]?.url ?? row.app.iconUrl,
          createdAt: row.app.createdAt,
          updatedAt: row.app.updatedAt,
        }
      }),
    )
  })

  adminHandler.delete('/server-apps/:id', async (c) => {
    const appIntegrationDao = container.resolve('appIntegrationDao')
    await appIntegrationDao.deleteById(c.req.param('id'))
    return c.json({ ok: true })
  })

  // Actor: user admin
  // Resource: server_app_integration
  // Action: manage
  // Data class: server-private manifest metadata
  adminHandler.post('/server-apps/:id/refresh', async (c) => {
    const appIntegrationService = container.resolve('appIntegrationService')
    const app = await appIntegrationService.refreshInstalledAppForAdmin(c.req.param('id'))
    return c.json(app)
  })

  // Actor: user admin
  // Resource: server_app_catalog
  // Action: manage
  // Data class: server-private manifest promoted to public marketplace metadata
  adminHandler.post('/server-apps/:id/catalog', async (c) => {
    const appIntegrationService = container.resolve('appIntegrationService')
    const sourceServerAppId = c.req.param('id')
    if (!sourceServerAppId) {
      return c.json({ error: 'server app id is required' }, 400)
    }
    const entry = await appIntegrationService.upsertCatalogEntry(c.get('actor'), {
      sourceServerAppId,
      status: 'active',
    })
    return c.json(entry, 201)
  })

  adminHandler.get('/server-app-catalog', async (c) => {
    const appIntegrationService = container.resolve('appIntegrationService')
    const locale = c.req.query('locale') ?? c.req.header('accept-language')?.split(',')[0]
    const entries = await appIntegrationService.listAdminCatalog({ locale })
    return c.json(entries)
  })

  adminHandler.post(
    '/server-app-catalog',
    zValidator('json', createServerAppCatalogEntrySchema),
    async (c) => {
      const appIntegrationService = container.resolve('appIntegrationService')
      const entry = await appIntegrationService.upsertCatalogEntry(
        c.get('actor'),
        c.req.valid('json'),
      )
      return c.json(entry, 201)
    },
  )

  adminHandler.delete('/server-app-catalog/:id', async (c) => {
    const appIntegrationService = container.resolve('appIntegrationService')
    const result = await appIntegrationService.deleteCatalogEntry(c.req.param('id'))
    return c.json(result)
  })

  // Actor: user admin
  // Resource: server_app_catalog
  // Action: manage
  // Data class: public marketplace metadata refreshed from App manifest
  adminHandler.post('/server-app-catalog/:id/refresh', async (c) => {
    const appIntegrationService = container.resolve('appIntegrationService')
    const entry = await appIntegrationService.refreshCatalogEntryForAdmin(c.req.param('id'))
    return c.json(entry)
  })

  // ── Messages ──────────────────────────────────────
  adminHandler.delete('/messages/:id', async (c) => {
    const adminUseCase = container.resolve('adminUseCase')
    const id = c.req.param('id')
    await adminUseCase.deleteMessage({
      ctx: createActorContext(c.get('actor')),
      messageId: id,
    })
    return c.json({ ok: true })
  })

  // ── Channels ──────────────────────────────────────
  adminHandler.get('/channels', async (c) => {
    const adminUseCase = container.resolve('adminUseCase')
    const serverId = c.req.query('serverId')
    const channels = await adminUseCase.getChannels({
      ctx: createActorContext(c.get('actor')),
      serverId: serverId ?? undefined,
    })
    return c.json(channels)
  })

  adminHandler.delete('/channels/:id', async (c) => {
    const adminUseCase = container.resolve('adminUseCase')
    const id = c.req.param('id')
    await adminUseCase.deleteChannel({
      ctx: createActorContext(c.get('actor')),
      channelId: id,
    })
    return c.json({ ok: true })
  })

  // ── Agents ────────────────────────────────────────
  adminHandler.get('/agents', async (c) => {
    const agentService = container.resolve('agentService')
    const allAgents = await agentService.getAll()
    // Enrich with bot user and owner info
    const enriched = await Promise.all(
      allAgents.map(async (agent: { id: string; ownerId: string }) => {
        const full = await agentService.getById(agent.id)
        const adminUseCase = container.resolve('adminUseCase')
        const owner = await adminUseCase.getUserById({
          ctx: createActorContext(c.get('actor')),
          userId: agent.ownerId,
        })
        return {
          ...full,
          owner: owner
            ? { id: owner.id, username: owner.username, displayName: owner.displayName }
            : null,
        }
      }),
    )
    return c.json(enriched.filter(Boolean))
  })

  adminHandler.delete('/agents/:id', async (c) => {
    const agentService = container.resolve('agentService')
    const id = c.req.param('id')
    await agentService.delete(id)
    return c.json({ ok: true })
  })

  // ── Password Change Logs ───────────────────────────
  adminHandler.get('/password-logs', async (c) => {
    const adminUseCase = container.resolve('adminUseCase')
    const limit = Number(c.req.query('limit') ?? '50')
    const offset = Number(c.req.query('offset') ?? '0')
    const userId = c.req.query('userId')

    const logs = await adminUseCase.getPasswordLogs({
      ctx: createActorContext(c.get('actor')),
      limit,
      offset,
      userId: userId ?? undefined,
    })

    // Enrich with user info
    const enriched = await Promise.all(
      logs.map(async (log: { userId: string }) => {
        const user = await adminUseCase.getUserById({
          ctx: createActorContext(c.get('actor')),
          userId: log.userId,
        })
        return {
          ...log,
          user: user
            ? {
                id: user.id,
                email: user.email,
                username: user.username,
                displayName: user.displayName,
              }
            : null,
        }
      }),
    )

    return c.json(enriched)
  })

  adminHandler.get('/password-logs/count', async (c) => {
    const adminUseCase = container.resolve('adminUseCase')
    const userId = c.req.query('userId')
    const result = await adminUseCase.getPasswordLogCount({
      ctx: createActorContext(c.get('actor')),
      userId: userId ?? undefined,
    })
    return c.json(result)
  })

  // ── Cloud Template Review ─────────────────────────────────────────────────

  adminHandler.get('/cloud-templates', async (c) => {
    const status = c.req.query('status') // 'pending' | 'approved' | 'rejected' | undefined (all)
    const limit = Math.min(Number(c.req.query('limit')) || 50, 200)
    const offset = Math.max(Number(c.req.query('offset')) || 0, 0)
    const db = container.resolve('db')
    const rows = await db
      .select()
      .from(cloudTemplates)
      .where(
        status
          ? eq(cloudTemplates.reviewStatus, status as 'pending' | 'approved' | 'rejected')
          : undefined,
      )
      .orderBy(cloudTemplates.createdAt)
      .limit(limit)
      .offset(offset)
    return c.json(rows)
  })

  adminHandler.post(
    '/cloud-templates/refresh-official',
    zValidator(
      'json',
      z
        .object({
          prune: z.boolean().default(true),
        })
        .default({ prune: true }),
    ),
    async (c) => {
      const input = c.req.valid('json')
      const cloudService = container.resolve('cloudService')
      const result = await cloudService.refreshOfficialTemplates(resolveCloudTemplatesDir(), {
        prune: input.prune,
      })
      return c.json({ ok: true, ...result })
    },
  )

  adminHandler.post(
    '/cloud-templates',
    zValidator(
      'json',
      z.object({
        slug: z.string().min(1).max(255),
        name: z.string().min(1).max(255),
        description: z.string().optional(),
        source: z.enum(['official', 'community']).default('official'),
        reviewStatus: z.enum(['draft', 'pending', 'approved', 'rejected']).default('approved'),
        tags: z.array(z.string()).default([]),
        category: z.string().optional(),
        baseCost: z.number().int().min(0).optional(),
        content: z.record(z.unknown()).default({}),
      }),
    ),
    async (c) => {
      const input = c.req.valid('json')
      const db = container.resolve('db')
      const { cloudTemplates: tbl } = await import('../db/schema')
      const [created] = await db
        .insert(tbl)
        .values({
          slug: input.slug,
          name: input.name,
          description: input.description ?? null,
          source: input.source,
          reviewStatus: input.reviewStatus,
          tags: input.tags,
          category: input.category ?? null,
          baseCost: input.baseCost ?? null,
          content: input.content,
        })
        .returning()
      return c.json(created, 201)
    },
  )

  adminHandler.patch(
    '/cloud-templates/:id',
    zValidator(
      'json',
      z.object({
        slug: z.string().min(1).max(255).optional(),
        name: z.string().min(1).max(255).optional(),
        description: z.string().nullable().optional(),
        source: z.enum(['official', 'community']).optional(),
        reviewStatus: z.enum(['draft', 'pending', 'approved', 'rejected']).optional(),
        reviewNote: z.string().nullable().optional(),
        tags: z.array(z.string()).optional(),
        category: z.string().nullable().optional(),
        baseCost: z.number().int().min(0).nullable().optional(),
        content: z.record(z.unknown()).optional(),
      }),
    ),
    async (c) => {
      const id = c.req.param('id')
      const input = c.req.valid('json')
      const db = container.resolve('db')
      const { cloudTemplates: tbl } = await import('../db/schema')
      const [updated] = await db
        .update(tbl)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(tbl.id, id))
        .returning()
      if (!updated) return c.json({ ok: false, error: 'Template not found' }, 404)
      return c.json(updated)
    },
  )

  adminHandler.delete('/cloud-templates/:id', async (c) => {
    const id = c.req.param('id')
    const db = container.resolve('db')
    const { cloudTemplates: tbl } = await import('../db/schema')
    const [deleted] = await db.delete(tbl).where(eq(tbl.id, id)).returning()
    if (!deleted) return c.json({ ok: false, error: 'Template not found' }, 404)
    return c.json({ ok: true })
  })

  adminHandler.post('/cloud-templates/:id/approve', async (c) => {
    const id = c.req.param('id')
    const db = container.resolve('db')
    const [updated] = await db
      .update(cloudTemplates)
      .set({ reviewStatus: 'approved', reviewNote: null, updatedAt: new Date() })
      .where(eq(cloudTemplates.id, id))
      .returning()
    if (!updated) return c.json({ ok: false, error: 'Template not found' }, 404)
    return c.json(updated)
  })

  adminHandler.post(
    '/cloud-templates/:id/reject',
    zValidator(
      'json',
      z.object({
        note: z.string().min(1).max(500).optional(),
      }),
    ),
    async (c) => {
      const id = c.req.param('id')
      const { note } = c.req.valid('json')
      const db = container.resolve('db')
      const [updated] = await db
        .update(cloudTemplates)
        .set({
          reviewStatus: 'rejected',
          reviewNote: note ?? null,
          updatedAt: new Date(),
        })
        .where(eq(cloudTemplates.id, id))
        .returning()
      if (!updated) return c.json({ ok: false, error: 'Template not found' }, 404)
      return c.json(updated)
    },
  )

  return adminHandler
}
