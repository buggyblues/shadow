import type { Mocked } from 'vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WalletDao } from '../dao/wallet.dao'
import type { LedgerService } from './ledger.service'
import { WalletService } from './wallet.service'

describe('WalletService', () => {
  const mockWallet = {
    id: 'wallet-1',
    userId: 'user-1',
    balance: 1000,
    frozenAmount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const mockWalletDao: Mocked<WalletDao> = {
    getOrCreate: vi.fn().mockResolvedValue(mockWallet),
    findByUserId: vi.fn().mockResolvedValue(mockWallet),
    getTransactions: vi.fn().mockResolvedValue([]),
    countTransactions: vi.fn().mockResolvedValue(0),
    getOrderSummaries: vi.fn().mockResolvedValue([]),
  } as unknown as Mocked<WalletDao>

  const mockLedgerService: Mocked<LedgerService> = {
    credit: vi.fn(),
    debit: vi.fn(),
    settleReservedMicros: vi.fn(),
  } as unknown as Mocked<LedgerService>

  let service: WalletService

  beforeEach(() => {
    vi.clearAllMocks()
    mockWalletDao.getOrCreate.mockResolvedValue(mockWallet)
    mockWalletDao.findByUserId.mockResolvedValue(mockWallet)
    service = new WalletService({
      walletDao: mockWalletDao,
      ledgerService: mockLedgerService,
    })
  })

  it('delegates topUp to LedgerService credit', async () => {
    mockLedgerService.credit.mockResolvedValue(1500)
    const result = await service.topUp('user-1', 500, 'Test top-up')

    expect(mockLedgerService.credit).toHaveBeenCalledWith({
      userId: 'user-1',
      amount: 500,
      type: 'topup',
      note: 'Test top-up',
    })
    expect(result).toEqual({ ...mockWallet, balance: 1500 })
  })

  it('delegates debit to LedgerService debit', async () => {
    mockLedgerService.debit.mockResolvedValue(500)
    const result = await service.debit('user-1', 500, 'order-1', 'order', 'Purchase')

    expect(mockLedgerService.debit).toHaveBeenCalledWith({
      userId: 'user-1',
      amount: 500,
      type: 'purchase',
      referenceId: 'order-1',
      referenceType: 'order',
      note: 'Purchase',
    })
    expect(result).toBe(500)
  })

  it('delegates refund to LedgerService credit', async () => {
    mockLedgerService.credit.mockResolvedValue(1200)
    const result = await service.refund('user-1', 200, 'order-1', 'order', 'Refund')

    expect(mockLedgerService.credit).toHaveBeenCalledWith({
      userId: 'user-1',
      amount: 200,
      type: 'refund',
      referenceId: 'order-1',
      referenceType: 'order',
      note: 'Refund',
    })
    expect(result).toBe(1200)
  })

  it('delegates settle to LedgerService credit', async () => {
    mockLedgerService.credit.mockResolvedValue(2000)
    const result = await service.settle('user-1', 1000, 'contract-1', 'rental', 'Settlement')

    expect(mockLedgerService.credit).toHaveBeenCalledWith({
      userId: 'user-1',
      amount: 1000,
      type: 'settlement',
      referenceId: 'contract-1',
      referenceType: 'rental',
      note: 'Settlement',
    })
    expect(result).toBe(2000)
  })

  it('delegates wallet reads to WalletDao', async () => {
    await service.getOrCreateWallet('user-1')
    await service.getTransactions('user-1', 20, 10)

    expect(mockWalletDao.getOrCreate).toHaveBeenCalledWith('user-1')
    expect(mockWalletDao.getTransactions).toHaveBeenCalledWith(mockWallet.id, 20, 10, {
      audience: 'ledger',
      direction: 'all',
    })
  })

  it('uses consumer wallet audience for filtered transaction reads and counts', async () => {
    await service.getTransactions('user-1', 20, 10, { audience: 'consumer', direction: 'income' })
    await service.getTransactionCount('user-1', { audience: 'consumer', direction: 'income' })

    expect(mockWalletDao.getTransactions).toHaveBeenCalledWith(mockWallet.id, 20, 10, {
      audience: 'consumer',
      direction: 'income',
    })
    expect(mockWalletDao.countTransactions).toHaveBeenCalledWith(mockWallet.id, {
      audience: 'consumer',
      direction: 'income',
    })
  })
})
