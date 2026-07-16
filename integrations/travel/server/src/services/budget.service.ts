import type { BudgetDao } from '../dao/budget.dao.js'
import type { TripDao } from '../dao/trip.dao.js'
import type { TravelProviderGateway } from '../gateways/travel-provider.gateway.js'
import { notFound } from '../lib/errors.js'
import { buildExpensesCsv } from '../lib/export.js'
import { createId } from '../lib/id.js'
import { nowIso } from '../lib/time.js'
import type { Expense, ExpenseShare, SettlementRecord } from '../types.js'
import type {
  BudgetAnalyticsInput,
  ConvertExpensesInput,
  CreateExpenseInput,
  CreateSettlementRecordInput,
  SetExpenseMembersInput,
  SettlementRecordStatusInput,
  ToggleExpensePaidInput,
  UpdateExpenseInput,
} from '../validators/travel.schema.js'

function equalShares(amount: number, memberIds: string[]) {
  if (memberIds.length === 0) return []
  const cents = Math.round(amount * 100)
  const base = Math.floor(cents / memberIds.length)
  let remainder = cents - base * memberIds.length
  return memberIds.map<ExpenseShare>((memberId) => {
    const extra = remainder > 0 ? 1 : 0
    remainder -= extra
    return { memberId, amount: (base + extra) / 100 }
  })
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100
}

export class BudgetService {
  constructor(
    private readonly budgetDao: BudgetDao,
    private readonly tripDao?: TripDao,
    private readonly providerGateway?: TravelProviderGateway,
  ) {}

  listExpenses(tripId: string) {
    return this.budgetDao.listExpenses(tripId)
  }

  async createExpense(tripId: string, input: CreateExpenseInput) {
    const timestamp = nowIso()
    const fx = await this.resolveExpenseFx(tripId, input)
    const sequence =
      input.sequence ?? ((await this.budgetDao.listExpenses(tripId)).length + 1) * 100
    const shares =
      input.shares.length > 0 || input.splitMode !== 'equal'
        ? input.shares
        : equalShares(input.amount, input.participantMemberIds)

    const expense: Expense = {
      id: createId('expense'),
      tripId,
      title: input.title,
      category: input.category,
      amount: input.amount,
      currency: input.currency,
      paidByMemberId: input.paidByMemberId,
      participantMemberIds: input.participantMemberIds,
      splitMode: input.splitMode,
      shares,
      paidMemberIds: input.paidMemberIds,
      reservationId: input.reservationId,
      placeId: input.placeId,
      date: input.date,
      notes: input.notes,
      originalAmount: fx.originalAmount,
      originalCurrency: fx.originalCurrency,
      exchangeRate: fx.exchangeRate,
      exchangeRateDate: fx.exchangeRateDate,
      status: input.status,
      sequence,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    return this.budgetDao.createExpense(expense)
  }

  async updateExpense(tripId: string, expenseId: string, input: UpdateExpenseInput) {
    const current = await this.budgetDao.findExpense(expenseId)
    if (!current || current.tripId !== tripId) throw notFound('Expense')
    const updated = await this.budgetDao.updateExpense(expenseId, (expense) => ({
      ...expense,
      ...input,
      shares:
        input.shares ??
        (input.participantMemberIds || input.amount
          ? this.recalculateShares({ ...expense, ...input })
          : expense.shares),
      updatedAt: nowIso(),
    }))
    if (!updated) throw notFound('Expense')
    return updated
  }

  async setExpenseMembers(tripId: string, expenseId: string, input: SetExpenseMembersInput) {
    const current = await this.budgetDao.findExpense(expenseId)
    if (!current || current.tripId !== tripId) throw notFound('Expense')
    const updated = await this.budgetDao.updateExpense(expenseId, (expense) => ({
      ...expense,
      participantMemberIds: input.participantMemberIds,
      splitMode: input.splitMode,
      shares:
        input.shares.length > 0 || input.splitMode !== 'equal'
          ? input.shares
          : equalShares(expense.amount, input.participantMemberIds),
      updatedAt: nowIso(),
    }))
    if (!updated) throw notFound('Expense')
    return updated
  }

  async toggleExpensePaid(tripId: string, expenseId: string, input: ToggleExpensePaidInput) {
    const current = await this.budgetDao.findExpense(expenseId)
    if (!current || current.tripId !== tripId) throw notFound('Expense')
    const shouldMarkPaid = input.paid ?? !current.paidMemberIds.includes(input.memberId)
    const updated = await this.budgetDao.updateExpense(expenseId, (expense) => ({
      ...expense,
      paidMemberIds: shouldMarkPaid
        ? [...new Set([...expense.paidMemberIds, input.memberId])]
        : expense.paidMemberIds.filter((memberId) => memberId !== input.memberId),
      updatedAt: nowIso(),
    }))
    if (!updated) throw notFound('Expense')
    return updated
  }

  async deleteExpense(tripId: string, expenseId: string) {
    const current = await this.budgetDao.findExpense(expenseId)
    if (!current || current.tripId !== tripId) throw notFound('Expense')
    const deleted = await this.budgetDao.deleteExpense(expenseId)
    if (!deleted) throw notFound('Expense')
    return deleted
  }

  async reorderExpenses(tripId: string, orderedIds: string[]) {
    const reordered = await this.budgetDao.reorderExpenses(tripId, orderedIds)
    if (!reordered) throw notFound('Expense')
    return this.budgetDao.listExpenses(tripId)
  }

  summarize(expenses: Expense[]) {
    const byCurrency = new Map<string, number>()
    for (const expense of expenses) {
      if (expense.status === 'waived') continue
      byCurrency.set(expense.currency, (byCurrency.get(expense.currency) ?? 0) + expense.amount)
    }
    return [...byCurrency.entries()].map(([currency, amount]) => ({
      currency,
      amount: Math.round(amount * 100) / 100,
    }))
  }

  exportCsv(expenses: Expense[]) {
    return buildExpensesCsv(expenses)
  }

  settle(expenses: Expense[]) {
    const byCurrency = new Map<string, Map<string, number>>()
    const addBalance = (currency: string, memberId: string, amount: number) => {
      const balances = byCurrency.get(currency) ?? new Map<string, number>()
      balances.set(memberId, Math.round(((balances.get(memberId) ?? 0) + amount) * 100) / 100)
      byCurrency.set(currency, balances)
    }

    for (const expense of expenses) {
      if (expense.status === 'waived') continue
      if (expense.paidByMemberId)
        addBalance(expense.currency, expense.paidByMemberId, expense.amount)
      const shares = expense.shares.length
        ? expense.shares
        : equalShares(expense.amount, expense.participantMemberIds)
      for (const share of shares) addBalance(expense.currency, share.memberId, -share.amount)
    }

    return [...byCurrency.entries()].map(([currency, balances]) => {
      const creditors = [...balances.entries()]
        .filter(([, amount]) => amount > 0.009)
        .map(([memberId, amount]) => ({ memberId, amount }))
      const debtors = [...balances.entries()]
        .filter(([, amount]) => amount < -0.009)
        .map(([memberId, amount]) => ({ memberId, amount: -amount }))
      const transfers: Array<{ fromMemberId: string; toMemberId: string; amount: number }> = []

      let debtorIndex = 0
      let creditorIndex = 0
      while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
        const debtor = debtors[debtorIndex]
        const creditor = creditors[creditorIndex]
        if (!debtor || !creditor) break
        const amount = Math.round(Math.min(debtor.amount, creditor.amount) * 100) / 100
        if (amount > 0) {
          transfers.push({
            fromMemberId: debtor.memberId,
            toMemberId: creditor.memberId,
            amount,
          })
        }
        debtor.amount = Math.round((debtor.amount - amount) * 100) / 100
        creditor.amount = Math.round((creditor.amount - amount) * 100) / 100
        if (debtor.amount <= 0.009) debtorIndex += 1
        if (creditor.amount <= 0.009) creditorIndex += 1
      }

      return {
        currency,
        balances: [...balances.entries()].map(([memberId, amount]) => ({ memberId, amount })),
        transfers,
      }
    })
  }

  listSettlementRecords(tripId: string) {
    return this.budgetDao.listSettlementRecords(tripId)
  }

  async createSettlementRecords(
    tripId: string,
    input: CreateSettlementRecordInput,
    createdByMemberId?: string,
  ) {
    const expenses = await this.listExpenses(tripId)
    const settlements = this.settle(expenses).filter(
      (settlement) => !input.currency || settlement.currency === input.currency,
    )
    const timestamp = nowIso()
    const records: SettlementRecord[] = []
    for (const settlement of settlements) {
      records.push(
        await this.budgetDao.createSettlementRecord({
          id: createId('settlement'),
          tripId,
          currency: settlement.currency,
          balances: settlement.balances,
          transfers: settlement.transfers,
          status: 'draft',
          notes: input.notes,
          createdByMemberId,
          createdAt: timestamp,
          updatedAt: timestamp,
          paidTransferIds: [],
        }),
      )
    }
    return records
  }

  async confirmSettlementRecord(
    tripId: string,
    recordId: string,
    input: SettlementRecordStatusInput,
  ) {
    const current = await this.budgetDao.findSettlementRecord(recordId)
    if (!current || current.tripId !== tripId) throw notFound('Settlement record')
    const timestamp = nowIso()
    const updated = await this.budgetDao.updateSettlementRecord(recordId, (record) => ({
      ...record,
      status: 'confirmed',
      notes: input.notes ?? record.notes,
      confirmedAt: timestamp,
      cancelledAt: undefined,
      updatedAt: timestamp,
    }))
    if (!updated) throw notFound('Settlement record')
    return updated
  }

  async cancelSettlementRecord(
    tripId: string,
    recordId: string,
    input: SettlementRecordStatusInput,
  ) {
    const current = await this.budgetDao.findSettlementRecord(recordId)
    if (!current || current.tripId !== tripId) throw notFound('Settlement record')
    const timestamp = nowIso()
    const updated = await this.budgetDao.updateSettlementRecord(recordId, (record) => ({
      ...record,
      status: 'cancelled',
      notes: input.notes ?? record.notes,
      cancelledAt: timestamp,
      updatedAt: timestamp,
    }))
    if (!updated) throw notFound('Settlement record')
    return updated
  }

  async setSettlementTransferPaid(
    tripId: string,
    recordId: string,
    input: { paid: boolean; transferId: string },
  ) {
    const current = await this.budgetDao.findSettlementRecord(recordId)
    if (!current || current.tripId !== tripId) throw notFound('Settlement record')
    if (!current.transfers.some((_, index) => `${recordId}:${index}` === input.transferId)) {
      throw notFound('Settlement transfer')
    }
    const paidTransferIds = input.paid
      ? [...new Set([...current.paidTransferIds, input.transferId])]
      : current.paidTransferIds.filter((id) => id !== input.transferId)
    const updated = await this.budgetDao.updateSettlementRecord(recordId, (record) => ({
      ...record,
      paidTransferIds,
      status: paidTransferIds.length === record.transfers.length ? 'confirmed' : 'draft',
      confirmedAt: paidTransferIds.length === record.transfers.length ? nowIso() : undefined,
      updatedAt: nowIso(),
    }))
    if (!updated) throw notFound('Settlement record')
    return updated
  }

  convertTotals(expenses: Expense[], input: ConvertExpensesInput) {
    const totals = this.summarize(expenses)
    const converted = totals.map((total) => {
      if (total.currency === input.targetCurrency) {
        return { ...total, rate: 1, convertedAmount: total.amount }
      }
      const rate = input.rates[total.currency]
      return {
        ...total,
        rate,
        convertedAmount: rate ? Math.round(total.amount * rate * 100) / 100 : null,
      }
    })
    const missingRates = converted
      .filter((total) => total.currency !== input.targetCurrency && !total.rate)
      .map((total) => total.currency)
    const total = converted.reduce(
      (sum, item) => sum + (typeof item.convertedAmount === 'number' ? item.convertedAmount : 0),
      0,
    )
    return {
      targetCurrency: input.targetCurrency,
      date: input.date,
      totals,
      converted,
      missingRates,
      total: Math.round(total * 100) / 100,
    }
  }

  async convertTotalsWithProvider(expenses: Expense[], input: ConvertExpensesInput) {
    if (Object.keys(input.rates).length > 0 || !this.providerGateway) {
      return this.convertTotals(expenses, input)
    }
    const currencies = [...new Set(expenses.map((expense) => expense.currency))]
    const rates: Record<string, number> = {}
    for (const currency of currencies) {
      if (currency === input.targetCurrency) continue
      const frozen = expenses.find(
        (expense) =>
          expense.currency === currency &&
          expense.originalCurrency === currency &&
          expense.exchangeRate &&
          expense.exchangeRateDate === input.date,
      )?.exchangeRate
      if (frozen) {
        rates[currency] = frozen
        continue
      }
      const rate = await this.providerGateway
        .exchangeRate({ from: currency, to: input.targetCurrency, date: input.date })
        .catch(() => null)
      if (rate?.rate) rates[currency] = rate.rate
    }
    return this.convertTotals(expenses, { ...input, rates })
  }

  async analytics(expenses: Expense[], input: BudgetAnalyticsInput) {
    const includedExpenses = input.includeWaived
      ? expenses
      : expenses.filter((expense) => expense.status !== 'waived')
    const members = new Set<string>()
    for (const expense of includedExpenses) {
      if (expense.paidByMemberId) members.add(expense.paidByMemberId)
      for (const memberId of expense.participantMemberIds) members.add(memberId)
      for (const share of expense.shares) members.add(share.memberId)
    }

    const byCategory = new Map<
      string,
      { category: string; currency: string; amount: number; count: number }
    >()
    const byDay = new Map<
      string,
      { date: string; currency: string; amount: number; count: number }
    >()
    const byMember = new Map<
      string,
      { memberId: string; currency: string; paid: number; share: number; balance: number }
    >()
    const addMemberTotal = (
      memberId: string,
      currency: string,
      paidDelta: number,
      shareDelta: number,
    ) => {
      const key = `${memberId}:${currency}`
      const current = byMember.get(key) ?? {
        memberId,
        currency,
        paid: 0,
        share: 0,
        balance: 0,
      }
      current.paid = roundMoney(current.paid + paidDelta)
      current.share = roundMoney(current.share + shareDelta)
      current.balance = roundMoney(current.paid - current.share)
      byMember.set(key, current)
    }

    for (const expense of includedExpenses) {
      const categoryKey = `${expense.category}:${expense.currency}`
      const category = byCategory.get(categoryKey) ?? {
        category: expense.category,
        currency: expense.currency,
        amount: 0,
        count: 0,
      }
      category.amount = roundMoney(category.amount + expense.amount)
      category.count += 1
      byCategory.set(categoryKey, category)

      const date = expense.date ?? 'undated'
      const dayKey = `${date}:${expense.currency}`
      const day = byDay.get(dayKey) ?? {
        date,
        currency: expense.currency,
        amount: 0,
        count: 0,
      }
      day.amount = roundMoney(day.amount + expense.amount)
      day.count += 1
      byDay.set(dayKey, day)

      if (expense.paidByMemberId)
        addMemberTotal(expense.paidByMemberId, expense.currency, expense.amount, 0)
      const shares = expense.shares.length
        ? expense.shares
        : equalShares(expense.amount, expense.participantMemberIds)
      for (const share of shares) addMemberTotal(share.memberId, expense.currency, 0, share.amount)
    }

    const totals = this.summarize(includedExpenses)
    const settlement = this.settle(includedExpenses)
    const analytics = {
      generatedAt: nowIso(),
      includeWaived: input.includeWaived,
      expenseCount: includedExpenses.length,
      memberCount: members.size,
      totals,
      perPerson: totals.map((total) => ({
        currency: total.currency,
        amount: members.size > 0 ? roundMoney(total.amount / members.size) : total.amount,
      })),
      byCategory: [...byCategory.values()].sort(
        (a, b) => a.category.localeCompare(b.category) || a.currency.localeCompare(b.currency),
      ),
      byDay: [...byDay.values()].sort(
        (a, b) => a.date.localeCompare(b.date) || a.currency.localeCompare(b.currency),
      ),
      byMember: [...byMember.values()].sort(
        (a, b) => a.memberId.localeCompare(b.memberId) || a.currency.localeCompare(b.currency),
      ),
      settlement,
    }

    if (!input.targetCurrency) return analytics

    const converted = await this.convertTotalsWithProvider(includedExpenses, {
      targetCurrency: input.targetCurrency,
      date: input.date,
      rates: {},
    })
    const rateByCurrency = new Map(
      converted.converted
        .filter((item) => typeof item.rate === 'number')
        .map((item) => [item.currency, item.rate as number]),
    )
    rateByCurrency.set(input.targetCurrency, 1)
    const convert = (amount: number, currency: string) => {
      const rate = rateByCurrency.get(currency)
      return typeof rate === 'number' ? roundMoney(amount * rate) : null
    }

    return {
      ...analytics,
      converted: {
        targetCurrency: input.targetCurrency,
        date: input.date,
        missingRates: converted.missingRates,
        total: converted.total,
        perPerson: members.size > 0 ? roundMoney(converted.total / members.size) : converted.total,
        byCategory: analytics.byCategory.map((item) => ({
          category: item.category,
          sourceCurrency: item.currency,
          count: item.count,
          amount: item.amount,
          convertedAmount: convert(item.amount, item.currency),
        })),
        byDay: analytics.byDay.map((item) => ({
          date: item.date,
          sourceCurrency: item.currency,
          count: item.count,
          amount: item.amount,
          convertedAmount: convert(item.amount, item.currency),
        })),
        byMember: analytics.byMember.map((item) => ({
          memberId: item.memberId,
          sourceCurrency: item.currency,
          paid: item.paid,
          share: item.share,
          balance: item.balance,
          convertedPaid: convert(item.paid, item.currency),
          convertedShare: convert(item.share, item.currency),
          convertedBalance: convert(item.balance, item.currency),
        })),
      },
    }
  }

  private async resolveExpenseFx(tripId: string, input: CreateExpenseInput) {
    const fallback = {
      originalAmount: input.originalAmount,
      originalCurrency: input.originalCurrency,
      exchangeRate: input.exchangeRate,
      exchangeRateDate: input.exchangeRateDate,
    }
    if (input.exchangeRate || !this.tripDao || !this.providerGateway) return fallback
    const trip = await this.tripDao.findTrip(tripId)
    if (!trip || trip.currency === input.currency) return fallback
    const rate = await this.providerGateway
      .exchangeRate({ from: input.currency, to: trip.currency, date: input.date })
      .catch(() => null)
    if (!rate?.rate) return fallback
    const rateDate = 'date' in rate ? rate.date : undefined
    return {
      originalAmount: input.originalAmount ?? input.amount,
      originalCurrency: input.originalCurrency ?? input.currency,
      exchangeRate: rate.rate,
      exchangeRateDate: rateDate ?? input.date ?? new Date().toISOString().slice(0, 10),
    }
  }

  private recalculateShares(expense: Expense | (Expense & UpdateExpenseInput)) {
    if (expense.splitMode !== 'equal') return expense.shares
    return equalShares(expense.amount, expense.participantMemberIds)
  }
}
