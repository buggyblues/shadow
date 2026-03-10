import type { WalletDao } from '../dao/wallet.dao'

/**
 * WalletService — manages virtual currency (虾币 / Shrimp Coins).
 * Handles balance queries, top-up, debit/credit, and transaction history.
 * Decoupled from orders — called by OrderService for payment.
 */
export class WalletService {
  constructor(private deps: { walletDao: WalletDao }) {}

  async getOrCreateWallet(userId: string) {
    return this.deps.walletDao.getOrCreate(userId)
  }

  async getWallet(userId: string) {
    return this.deps.walletDao.getOrCreate(userId)
  }

  async topUp(userId: string, amount: number, note?: string) {
    const wallet = await this.deps.walletDao.getOrCreate(userId)
    const newBalance = wallet.balance + amount
    await this.deps.walletDao.credit(wallet.id, amount)
    await this.deps.walletDao.addTransaction({
      walletId: wallet.id,
      type: 'topup',
      amount,
      balanceAfter: newBalance,
      note: note ?? '充值虾币',
    })
    return this.deps.walletDao.findByUserId(userId)
  }

  async getTransactions(userId: string, limit = 50, offset = 0) {
    const wallet = await this.deps.walletDao.getOrCreate(userId)
    return this.deps.walletDao.getTransactions(wallet.id, limit, offset)
  }

  async getTransactionCount(userId: string) {
    const wallet = await this.deps.walletDao.getOrCreate(userId)
    return this.deps.walletDao.countTransactions(wallet.id)
  }

  /**
   * Debit user's wallet for a purchase.
   * Returns the new balance or throws if insufficient funds.
   */
  async debit(userId: string, amount: number, referenceId: string, referenceType: string, note: string) {
    const wallet = await this.deps.walletDao.getOrCreate(userId)
    if (wallet.balance < amount) {
      throw Object.assign(new Error('Insufficient balance'), { status: 400 })
    }
    const newBalance = wallet.balance - amount
    await this.deps.walletDao.debit(wallet.id, amount)
    await this.deps.walletDao.addTransaction({
      walletId: wallet.id,
      type: 'purchase',
      amount: -amount,
      balanceAfter: newBalance,
      referenceId,
      referenceType,
      note,
    })
    return newBalance
  }

  /**
   * Refund to user's wallet.
   */
  async refund(userId: string, amount: number, referenceId: string, referenceType: string, note: string) {
    const wallet = await this.deps.walletDao.getOrCreate(userId)
    const newBalance = wallet.balance + amount
    await this.deps.walletDao.credit(wallet.id, amount)
    await this.deps.walletDao.addTransaction({
      walletId: wallet.id,
      type: 'refund',
      amount,
      balanceAfter: newBalance,
      referenceId,
      referenceType,
      note,
    })
    return newBalance
  }
}
