import type {
  WalletDao,
  WalletTransactionAudience,
  WalletTransactionDirection,
} from '../dao/wallet.dao'
import type { LedgerService } from './ledger.service'

function clampPageSize(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 50
  return Math.min(Math.floor(value), 100)
}

function normalizeOffset(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0
  return Math.floor(value)
}

/**
 * WalletService — read/query facade for virtual currency.
 *
 * Balance mutations must go through LedgerService. These methods are kept as
 * compatibility wrappers for existing call sites while centralizing the actual
 * wallet update + transaction writes in one service.
 */
export class WalletService {
  constructor(
    private deps: {
      walletDao: WalletDao
      ledgerService: LedgerService
    },
  ) {}

  async getOrCreateWallet(userId: string) {
    return this.deps.walletDao.getOrCreate(userId)
  }

  async getWallet(userId: string) {
    return this.deps.walletDao.getOrCreate(userId)
  }

  async topUp(userId: string, amount: number, note?: string) {
    const balance = await this.deps.ledgerService.credit({
      userId,
      amount,
      type: 'topup',
      note: note ?? '充值虾币',
    })
    const wallet = await this.deps.walletDao.findByUserId(userId)
    return wallet ? { ...wallet, balance } : null
  }

  async getTransactions(
    userId: string,
    limit = 50,
    offset = 0,
    opts?: {
      audience?: WalletTransactionAudience
      direction?: WalletTransactionDirection
    },
  ) {
    const wallet = await this.deps.walletDao.getOrCreate(userId)
    const audience = opts?.audience ?? 'ledger'
    const direction = opts?.direction ?? 'all'
    const transactions = await this.deps.walletDao.getTransactions(
      wallet.id,
      clampPageSize(limit),
      normalizeOffset(offset),
      { audience, direction },
    )
    if (audience !== 'consumer') return transactions

    const orderIds = Array.from(
      new Set(
        transactions
          .filter((tx) => tx.referenceType === 'order' && tx.referenceId)
          .map((tx) => tx.referenceId as string),
      ),
    )
    const orderSummaries = await this.deps.walletDao.getOrderSummaries(orderIds)
    const orderSummaryById = new Map<string, (typeof orderSummaries)[number]>()
    for (const summary of orderSummaries) {
      if (!orderSummaryById.has(summary.id)) {
        orderSummaryById.set(summary.id, summary)
      }
    }

    return transactions.map((tx) => {
      const order =
        tx.referenceType === 'order' && tx.referenceId ? orderSummaryById.get(tx.referenceId) : null
      return {
        ...tx,
        display:
          order != null
            ? {
                title: order.productName ?? order.orderNo,
                subtitle: order.shopName ?? null,
              }
            : null,
        order:
          order != null
            ? {
                id: order.id,
                entitlementId: order.entitlementId,
                orderNo: order.orderNo,
                status: order.status,
                totalAmount: order.totalAmount,
                currency: order.currency,
                productName: order.productName,
                shop: order.shopId
                  ? {
                      id: order.shopId,
                      name: order.shopName,
                      scopeKind: order.shopScopeKind,
                      ownerUserId: order.shopOwnerUserId,
                      serverId: order.shopServerId,
                      serverSlug: order.shopServerSlug,
                    }
                  : null,
              }
            : null,
        counterparty:
          order != null && order.buyerId
            ? {
                userId: order.buyerId,
                username: order.buyerUsername,
                displayName: order.buyerDisplayName,
                avatarUrl: order.buyerAvatarUrl,
              }
            : null,
      }
    })
  }

  async getTransactionCount(
    userId: string,
    opts?: {
      audience?: WalletTransactionAudience
      direction?: WalletTransactionDirection
    },
  ) {
    const wallet = await this.deps.walletDao.getOrCreate(userId)
    return this.deps.walletDao.countTransactions(wallet.id, {
      audience: opts?.audience ?? 'ledger',
      direction: opts?.direction ?? 'all',
    })
  }

  async debit(
    userId: string,
    amount: number,
    referenceId: string,
    referenceType: string,
    note: string,
  ) {
    return this.deps.ledgerService.debit({
      userId,
      amount,
      type: 'purchase',
      referenceId,
      referenceType,
      note,
    })
  }

  async refund(
    userId: string,
    amount: number,
    referenceId: string,
    referenceType: string,
    note: string,
  ) {
    return this.deps.ledgerService.credit({
      userId,
      amount,
      type: 'refund',
      referenceId,
      referenceType,
      note,
    })
  }

  async settleReservedMicros(
    userId: string,
    amountMicros: number,
    reservedAmount: number,
    source: string,
    referenceId: string,
    referenceType: string,
    note: string,
  ) {
    return this.deps.ledgerService.settleReservedMicros(
      userId,
      amountMicros,
      reservedAmount,
      source,
      referenceId,
      referenceType,
      note,
    )
  }

  async settle(
    userId: string,
    amount: number,
    referenceId: string,
    referenceType: string,
    note: string,
  ) {
    return this.deps.ledgerService.credit({
      userId,
      amount,
      type: 'settlement',
      referenceId,
      referenceType,
      note,
    })
  }
}
