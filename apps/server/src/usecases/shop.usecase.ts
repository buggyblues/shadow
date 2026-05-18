import type { Server as SocketIOServer } from 'socket.io'
import type { AgentDao } from '../dao/agent.dao'
import type { ChannelDao } from '../dao/channel.dao'
import type { ChannelMemberDao } from '../dao/channel-member.dao'
import { apiError } from '../lib/api-error'
import type { AccessService } from '../security/access.service'
import type { AuditLogService } from '../services/audit-log.service'
import type { CartService } from '../services/cart.service'
import type { ChannelService } from '../services/channel.service'
import type { MessageService } from '../services/message.service'
import type { OrderService } from '../services/order.service'
import type { ServerService } from '../services/server.service'
import type { ShopService } from '../services/shop.service'
import type { SecureUseCaseInput } from './_security-usecase'
import { auditUseCase } from './_security-usecase'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class ShopUseCase {
  constructor(
    private deps: {
      accessService: AccessService
      auditLogService: AuditLogService
      serverService: ServerService
      shopService: ShopService
      orderService: OrderService
      cartService: CartService
      channelService: ChannelService
      messageService: MessageService
      channelDao: ChannelDao
      channelMemberDao: ChannelMemberDao
      agentDao: AgentDao
      io: SocketIOServer
    },
  ) {}

  private async resolveServerId(identifier: string): Promise<string> {
    if (UUID_RE.test(identifier)) return identifier
    const server = await this.deps.serverService.getBySlug(identifier)
    return server.id
  }

  private async getOrCreateServerShop(serverId: string) {
    const server = await this.deps.serverService.getById(serverId)
    return this.deps.shopService.getOrCreateShop(server.id, server.name)
  }

  /* ───────── Shop ───────── */

  async getServerShop(input: SecureUseCaseInput & { identifier: string }) {
    const serverId = await this.resolveServerId(input.identifier)
    return this.getOrCreateServerShop(serverId)
  }

  async updateServerShop(
    input: SecureUseCaseInput & {
      identifier: string
      data: Partial<{
        name: string
        description: string | null
        logoUrl: string | null
        bannerUrl: string | null
        settings: Record<string, unknown>
      }>
    },
  ) {
    return auditUseCase(this.deps, input, {
      action: 'shop.update',
      run: async () => {
        const serverId = await this.resolveServerId(input.identifier)
        await this.deps.accessService.requireServerAdmin(input.ctx.actor, serverId)
        const shop = await this.deps.shopService.getShopByServerId(serverId)
        if (!shop) throw apiError('SHOP_NOT_FOUND', 404)
        return this.deps.shopService.updateShop(shop.id, input.data)
      },
    })
  }

  /* ───────── Categories ───────── */

  async getCategories(input: SecureUseCaseInput & { identifier: string }) {
    const serverId = await this.resolveServerId(input.identifier)
    const shop = await this.deps.shopService.getShopByServerId(serverId)
    if (!shop) return []
    return this.deps.shopService.getCategories(shop.id)
  }

  async createCategory(
    input: SecureUseCaseInput & {
      identifier: string
      data: {
        name: string
        slug: string
        parentId?: string
        position?: number
        iconUrl?: string
      }
    },
  ) {
    return auditUseCase(this.deps, input, {
      action: 'category.create',
      run: async () => {
        const serverId = await this.resolveServerId(input.identifier)
        await this.deps.accessService.requireServerAdmin(input.ctx.actor, serverId)
        const shop = await this.getOrCreateServerShop(serverId)
        return this.deps.shopService.createCategory(shop.id, input.data)
      },
    })
  }

  async updateCategory(
    input: SecureUseCaseInput & {
      identifier: string
      categoryId: string
      data: Partial<{
        name: string
        slug: string
        parentId: string | null
        position: number
        iconUrl: string | null
      }>
    },
  ) {
    return auditUseCase(this.deps, input, {
      action: 'category.update',
      run: async () => {
        const serverId = await this.resolveServerId(input.identifier)
        await this.deps.accessService.requireServerAdmin(input.ctx.actor, serverId)
        const shop = await this.getOrCreateServerShop(serverId)
        const category = await this.deps.shopService.updateCategoryInShop(
          shop.id,
          input.categoryId,
          input.data,
        )
        if (!category) throw apiError('CATEGORY_NOT_FOUND', 404)
        return category
      },
    })
  }

  async deleteCategory(
    input: SecureUseCaseInput & {
      identifier: string
      categoryId: string
    },
  ) {
    return auditUseCase(this.deps, input, {
      action: 'category.delete',
      run: async () => {
        const serverId = await this.resolveServerId(input.identifier)
        await this.deps.accessService.requireServerAdmin(input.ctx.actor, serverId)
        const shop = await this.getOrCreateServerShop(serverId)
        await this.deps.shopService.deleteCategoryInShop(shop.id, input.categoryId)
        return { ok: true }
      },
    })
  }

  /* ───────── Cart ───────── */

  async getCart(input: SecureUseCaseInput & { identifier: string; userId: string }) {
    const serverId = await this.resolveServerId(input.identifier)
    const shop = await this.deps.shopService.getShopByServerId(serverId)
    if (!shop) return []
    return this.deps.cartService.getCart(input.userId, shop.id)
  }

  async addToCart(
    input: SecureUseCaseInput & {
      identifier: string
      userId: string
      productId: string
      skuId?: string
      quantity: number
    },
  ) {
    return auditUseCase(this.deps, input, {
      action: 'cart.add',
      run: async () => {
        const serverId = await this.resolveServerId(input.identifier)
        const shop = await this.getOrCreateServerShop(serverId)
        return this.deps.cartService.addToCart(
          input.userId,
          shop.id,
          input.productId,
          input.skuId,
          input.quantity,
        )
      },
    })
  }

  /* ───────── Orders ───────── */

  async createOrder(
    input: SecureUseCaseInput & {
      identifier: string
      userId: string
      items: Array<{ productId: string; skuId?: string; quantity: number }>
      buyerNote?: string
      idempotencyKey: string
    },
  ) {
    return auditUseCase(this.deps, input, {
      action: 'order.create',
      run: async () => {
        const serverId = await this.resolveServerId(input.identifier)
        const shop = await this.getOrCreateServerShop(serverId)
        return this.deps.orderService.createOrder(
          input.userId,
          shop.id,
          input.items,
          input.buyerNote,
          input.idempotencyKey,
          input.ctx.actor,
        )
      },
    })
  }

  async getMyOrders(
    input: SecureUseCaseInput & {
      userId: string
      status?: string
      limit?: number
      offset?: number
    },
  ) {
    return this.deps.orderService.getMyOrders(input.userId, {
      status: input.status,
      limit: input.limit,
      offset: input.offset,
    })
  }

  async getServerOrders(
    input: SecureUseCaseInput & {
      identifier: string
      status?: string
      limit?: number
      offset?: number
    },
  ) {
    return auditUseCase(this.deps, input, {
      action: 'order.listShop',
      run: async () => {
        const serverId = await this.resolveServerId(input.identifier)
        await this.deps.accessService.requireServerAdmin(input.ctx.actor, serverId)
        const shop = await this.deps.shopService.getShopByServerId(serverId)
        if (!shop) return []
        return this.deps.orderService.getShopOrders(shop.id, {
          status: input.status,
          limit: input.limit,
          offset: input.offset,
        })
      },
    })
  }

  async getServerOrderDetail(
    input: SecureUseCaseInput & {
      identifier: string
      orderId: string
      userId: string
    },
  ) {
    const serverId = await this.resolveServerId(input.identifier)
    const shop = await this.deps.shopService.getShopByServerId(serverId)
    if (!shop) throw apiError('SHOP_NOT_FOUND', 404)

    const order = await this.deps.orderService.getOrderDetail(input.orderId)
    const isAdmin = await this.deps.accessService
      .requireServerAdmin(input.ctx.actor, serverId)
      .then(() => true)
      .catch(() => false)
    if (order.shopId !== shop.id || (order.buyerId !== input.userId && !isAdmin)) {
      throw apiError('ORDER_NOT_FOUND', 404)
    }
    return order
  }

  async updateServerOrderStatus(
    input: SecureUseCaseInput & {
      identifier: string
      orderId: string
      status: 'processing' | 'shipped' | 'delivered' | 'completed' | 'cancelled' | 'refunded'
      extra?: { trackingNo?: string; sellerNote?: string }
    },
  ) {
    return auditUseCase(this.deps, input, {
      action: 'order.updateStatus',
      run: async () => {
        const serverId = await this.resolveServerId(input.identifier)
        await this.deps.accessService.requireServerAdmin(input.ctx.actor, serverId)
        const shop = await this.getOrCreateServerShop(serverId)
        return this.deps.orderService.updateOrderStatusInShop(
          shop.id,
          input.orderId,
          input.status,
          input.extra,
        )
      },
    })
  }

  async cancelOrder(
    input: SecureUseCaseInput & {
      orderId: string
      userId: string
    },
  ) {
    return auditUseCase(this.deps, input, {
      action: 'order.cancel',
      run: async () => {
        return this.deps.orderService.cancelOrder(input.orderId, input.userId)
      },
    })
  }

  async completeOrder(
    input: SecureUseCaseInput & {
      identifier: string
      orderId: string
      userId: string
    },
  ) {
    return auditUseCase(this.deps, input, {
      action: 'order.complete',
      run: async () => {
        const serverId = await this.resolveServerId(input.identifier)
        const shop = await this.deps.shopService.getShopByServerId(serverId)
        if (!shop) throw apiError('SHOP_NOT_FOUND', 404)
        return this.deps.orderService.completeOrderInShop(shop.id, input.orderId, input.userId)
      },
    })
  }

  /* ───────── Support Ticket ───────── */

  async createSupportTicket(
    input: SecureUseCaseInput & {
      identifier: string
      userId: string
      message: string
      productId?: string
      images?: string[]
    },
  ) {
    return auditUseCase(this.deps, input, {
      action: 'support.ticket.create',
      run: async () => {
        const serverId = await this.resolveServerId(input.identifier)
        const shop = await this.getOrCreateServerShop(serverId)

        const members = await this.deps.serverService.getMembers(serverId)
        if (!members.some((member) => member.userId === input.userId)) {
          throw apiError('SERVER_MEMBERSHIP_REQUIRED', 403)
        }
        const server = await this.deps.serverService.getById(serverId)
        const ownerId = server?.ownerId || members.find((m) => m.role === 'owner')?.userId || null

        const existing = await this.deps.channelService.getByServerId(serverId)
        const channelName = `shop-support-${input.userId.slice(0, 8)}`
        let channel = existing.find((ch) => ch.name === channelName)
        if (!channel) {
          const creatorUserId = ownerId ?? members.find((m) => m.role === 'admin')?.userId
          if (!creatorUserId) throw apiError('SHOP_OWNER_NOT_FOUND', 422)
          channel = await this.deps.channelService.create(
            serverId,
            { name: channelName, type: 'text', topic: 'Shop customer support ticket' },
            creatorUserId,
          )
        }

        const ch = channel!

        const settings = (shop.settings || {}) as Record<string, unknown>
        const configuredBuddyId =
          typeof settings.supportBuddyUserId === 'string' ? settings.supportBuddyUserId : null
        const buddyId =
          configuredBuddyId && members.some((m) => m.userId === configuredBuddyId)
            ? configuredBuddyId
            : null
        const adminIds = members
          .filter((m) => m.role === 'owner' || m.role === 'admin')
          .map((m) => m.userId)
          .filter((id) => id !== ownerId)
        const allowOrder = [
          ...(ownerId ? [ownerId] : []),
          ...adminIds,
          ...(buddyId ? [buddyId] : []),
          input.userId,
        ]
        const allow = new Set<string>(allowOrder)

        for (const m of members) {
          if (!allow.has(m.userId)) {
            try {
              await this.deps.channelMemberDao.remove(ch.id, m.userId)
            } catch {
              // ignore if already removed / missing table
            }
          }
        }
        for (const uid of allowOrder) {
          await this.deps.channelMemberDao.add(ch.id, uid)
        }

        try {
          for (const uid of allowOrder) {
            this.deps.io.to(`channel:${ch.id}`).emit('channel:member-added', {
              channelId: ch.id,
              userId: uid,
            })
          }
        } catch {
          /* non-critical in test or ws-unavailable env */
        }

        const prefix = input.productId ? `商品(${input.productId})` : '通用咨询'
        const mentionLine = [ownerId, buddyId]
          .filter((id): id is string => !!id)
          .map((id) => {
            const m = members.find((mem) => mem.userId === id)
            return m?.user?.username ? `@${m.user.username}` : null
          })
          .filter((s): s is string => !!s)
          .join(' ')
        const content = [
          `[商城客服] ${prefix}`,
          mentionLine ? `请协助处理：${mentionLine}` : '',
          input.message,
        ]
          .filter(Boolean)
          .join('\n')

        const attachments = (input.images || []).map((url, idx) => ({
          filename: `support-image-${idx + 1}.png`,
          url,
          contentType: 'image/png',
          size: 0,
        }))

        await this.deps.messageService.send(ch.id, input.userId, {
          content,
          attachments: attachments.length > 0 ? attachments : undefined,
        })

        const buddyAgent = buddyId ? await this.deps.agentDao.findByUserId(buddyId) : null
        const buddyStatus = buddyAgent?.status ?? null
        const buddyReady = !!buddyAgent && buddyAgent.status === 'running'

        return {
          ok: true,
          channelId: ch.id,
          channelName: ch.name,
          ownerUserId: ownerId,
          buddyUserId: buddyId,
          buddyStatus,
          buddyReady,
        }
      },
    })
  }

  /* ───────── Channel / Agent lookups (for product-picker) ───────── */

  async findChannelById(input: SecureUseCaseInput & { channelId: string }) {
    return auditUseCase(this.deps, input, {
      action: 'channel.findById',
      run: async () => {
        return this.deps.channelDao.findById(input.channelId)
      },
    })
  }

  async findAgentsByUserIds(input: SecureUseCaseInput & { userIds: string[] }) {
    return auditUseCase(this.deps, input, {
      action: 'agent.findByUserIds',
      run: async () => {
        if (input.userIds.length === 0) return []
        return this.deps.agentDao.findByUserIds(input.userIds)
      },
    })
  }
}
