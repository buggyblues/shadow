import type { TravelDataStore } from '../db/database.js'
import type { Expense, SettlementRecord } from '../types.js'

export class BudgetDao {
  constructor(private readonly db: TravelDataStore) {}

  listExpenses(tripId: string) {
    return this.db.read((state) =>
      state.expenses
        .filter((expense) => expense.tripId === tripId)
        .sort((a, b) => (b.date ?? b.createdAt).localeCompare(a.date ?? a.createdAt)),
    )
  }

  createExpense(expense: Expense) {
    return this.db.write((state) => {
      state.expenses.push(expense)
      return expense
    })
  }

  findExpense(expenseId: string) {
    return this.db.read(
      (state) => state.expenses.find((expense) => expense.id === expenseId) ?? null,
    )
  }

  updateExpense(expenseId: string, updater: (expense: Expense) => Expense) {
    return this.db.write((state) => {
      const index = state.expenses.findIndex((expense) => expense.id === expenseId)
      if (index < 0) return null
      const current = state.expenses[index]
      if (!current) return null
      const next = updater(current)
      state.expenses[index] = next
      return next
    })
  }

  deleteExpense(expenseId: string) {
    return this.db.write((state) => {
      const expense = state.expenses.find((item) => item.id === expenseId) ?? null
      state.expenses = state.expenses.filter((item) => item.id !== expenseId)
      state.assignments = state.assignments.filter(
        (assignment) => assignment.expenseId !== expenseId,
      )
      for (const reservation of state.reservations) {
        if (reservation.expenseId === expenseId) reservation.expenseId = undefined
      }
      return expense
    })
  }

  reorderExpenses(tripId: string, orderedIds: string[]) {
    return this.db.write((state) => {
      const idSet = new Set(orderedIds)
      const existing = state.expenses.filter(
        (expense) => expense.tripId === tripId && idSet.has(expense.id),
      )
      if (existing.length !== orderedIds.length) return null
      const byId = new Map(existing.map((expense) => [expense.id, expense]))
      for (const [index, expenseId] of orderedIds.entries()) {
        const expense = byId.get(expenseId)
        if (!expense) return null
        expense.sequence = (index + 1) * 100
        expense.updatedAt = new Date().toISOString()
      }
      return existing
    })
  }

  listSettlementRecords(tripId: string) {
    return this.db.read((state) =>
      state.settlementRecords
        .filter((record) => record.tripId === tripId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    )
  }

  findSettlementRecord(recordId: string) {
    return this.db.read(
      (state) => state.settlementRecords.find((record) => record.id === recordId) ?? null,
    )
  }

  createSettlementRecord(record: SettlementRecord) {
    return this.db.write((state) => {
      state.settlementRecords.push(record)
      return record
    })
  }

  updateSettlementRecord(
    recordId: string,
    updater: (record: SettlementRecord) => SettlementRecord,
  ) {
    return this.db.write((state) => {
      const index = state.settlementRecords.findIndex((record) => record.id === recordId)
      if (index < 0) return null
      const current = state.settlementRecords[index]
      if (!current) return null
      const next = updater(current)
      state.settlementRecords[index] = next
      return next
    })
  }
}
