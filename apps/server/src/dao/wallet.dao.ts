import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import type { Database } from '../db'
import {
  entitlements,
  orderItems,
  orders,
  servers,
  shops,
  users,
  wallets,
  walletTransactions,
} from '../db/schema'

export type WalletTransactionAudience = 'ledger' | 'consumer'
export type WalletTransactionDirection = 'all' | 'income' | 'expense'

function walletTransactionWhere(input: {
  walletId: string
  audience: WalletTransactionAudience
  direction: WalletTransactionDirection
}) {
  const filters = [eq(walletTransactions.walletId, input.walletId)]
  if (input.audience === 'consumer') {
    filters.push(
      sql`(${walletTransactions.referenceType} is null or ${walletTransactions.referenceType} <> 'model_proxy')`,
    )
  }
  if (input.direction === 'income') {
    filters.push(sql`${walletTransactions.amount} > 0`)
  } else if (input.direction === 'expense') {
    filters.push(sql`${walletTransactions.amount} < 0`)
  }
  return and(...filters)
}

export class WalletDao {
  constructor(private deps: { db: Database }) {}
  private get db() {
    return this.deps.db
  }

  async findByUserId(userId: string) {
    const r = await this.db
      .select()
      .from(wallets)
      .where(eq(wallets.userId, userId))
      .orderBy(desc(wallets.balance), desc(wallets.updatedAt))
      .limit(1)
    return r[0] ?? null
  }

  async getOrCreate(userId: string) {
    let wallet = await this.findByUserId(userId)
    if (!wallet) {
      const r = await this.db.insert(wallets).values({ userId }).returning()
      wallet = r[0] ?? null
    }
    return wallet!
  }

  async getTransactions(
    walletId: string,
    limit = 50,
    offset = 0,
    opts?: {
      audience?: WalletTransactionAudience
      direction?: WalletTransactionDirection
    },
  ) {
    const audience = opts?.audience ?? 'ledger'
    const direction = opts?.direction ?? 'all'
    return this.db
      .select()
      .from(walletTransactions)
      .where(walletTransactionWhere({ walletId, audience, direction }))
      .orderBy(desc(walletTransactions.createdAt))
      .limit(limit)
      .offset(offset)
  }

  async countTransactions(
    walletId: string,
    opts?: {
      audience?: WalletTransactionAudience
      direction?: WalletTransactionDirection
    },
  ) {
    const audience = opts?.audience ?? 'ledger'
    const direction = opts?.direction ?? 'all'
    const r = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(walletTransactions)
      .where(walletTransactionWhere({ walletId, audience, direction }))
    return r[0]?.count ?? 0
  }

  async getOrderSummaries(orderIds: string[]) {
    if (orderIds.length === 0) return []
    return this.db
      .select({
        id: orders.id,
        orderNo: orders.orderNo,
        status: orders.status,
        entitlementId: entitlements.id,
        totalAmount: orders.totalAmount,
        currency: orders.currency,
        shopId: shops.id,
        shopName: shops.name,
        shopScopeKind: shops.scopeKind,
        shopOwnerUserId: shops.ownerUserId,
        shopServerId: shops.serverId,
        shopServerSlug: servers.slug,
        buyerId: users.id,
        buyerUsername: users.username,
        buyerDisplayName: users.displayName,
        buyerAvatarUrl: users.avatarUrl,
        productName: orderItems.productName,
      })
      .from(orders)
      .leftJoin(orderItems, eq(orderItems.orderId, orders.id))
      .leftJoin(entitlements, eq(entitlements.orderId, orders.id))
      .leftJoin(shops, eq(shops.id, orders.shopId))
      .leftJoin(servers, eq(servers.id, shops.serverId))
      .leftJoin(users, eq(users.id, orders.buyerId))
      .where(inArray(orders.id, orderIds))
  }
}
